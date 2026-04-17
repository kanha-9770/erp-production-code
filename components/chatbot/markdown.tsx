"use client";

/**
 * Tiny markdown renderer for chat output.
 *
 * Supports: fenced code blocks (```lang), inline code, bold, italic, links,
 * headers, bullet/numbered lists, blockquotes. No external deps.
 * Focus is on being safe (HTML-escaped) and good-enough for LLM output, not
 * CommonMark-perfect.
 */

import { useState, Fragment } from "react";
import {
  Check,
  Copy,
  BarChart3,
  FileDown,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ChartRenderer,
  parseChartSpec,
  type ChartSpec,
} from "./analytics/chart-renderer";
import { KpiGrid, parseKpiBlock, type KpiEntry } from "./analytics/kpi-card";
import MindmapRenderer, {
  parseMindmapSource,
} from "./analytics/mindmap-renderer";
import FlowmapRenderer, {
  parseFlowmapSpec,
  type FlowmapSpec,
} from "./analytics/flowmap-renderer";
import VisualToolbar from "./analytics/visual-toolbar";
import {
  downloadTableCSV,
  downloadTablePDF,
  copyTable,
} from "@/lib/visual-export";

// Strip inline markdown formatting (bold, italic, code, links) from a cell
// string so CSV/PDF exports receive clean text. Keep this narrow — matches
// the `inline(...)` transforms below just enough for data export.
function stripInlineMd(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

type Block =
  | { kind: "code"; lang: string; content: string }
  | { kind: "text"; content: string }
  | { kind: "chart"; raw: string; spec: ChartSpec | null; complete: boolean }
  | { kind: "kpi"; raw: string; entries: KpiEntry[] | null; complete: boolean }
  | { kind: "mindmap"; raw: string; source: string | null; complete: boolean }
  | { kind: "flowmap"; raw: string; spec: FlowmapSpec | null; complete: boolean };

// Matches either a fenced code block (```lang ... ```) or a container block
// (:::type\n...\n:::). Both alternatives fall back to end-of-string so that
// unclosed blocks during streaming still match and can be rendered as
// skeletons instead of leaking raw JSON into the text flow.
const BLOCK_RE =
  /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)(?:```|$)|:::([a-zA-Z][a-zA-Z0-9_-]*)\n?([\s\S]*?)(?:\n?:::|$)/g;

function splitBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((match = BLOCK_RE.exec(src)) !== null) {
    if (match.index > last) {
      blocks.push({ kind: "text", content: src.slice(last, match.index) });
    }
    const whole = match[0] ?? "";
    if (match[1] !== undefined) {
      // Fenced code block. Special langs (`chart`, `mindmap`, `flowmap`)
      // render as live visualizations; everything else is CodeBlock.
      const lang = match[1] ?? "";
      const content = match[2] ?? "";
      const complete = whole.trimEnd().endsWith("```");
      const lc = lang.toLowerCase();
      if (lc === "chart") {
        blocks.push({
          kind: "chart",
          raw: content,
          spec: parseChartSpec(content),
          complete,
        });
      } else if (lc === "mindmap") {
        blocks.push({
          kind: "mindmap",
          raw: content,
          source: parseMindmapSource(content),
          complete,
        });
      } else if (lc === "flowmap") {
        blocks.push({
          kind: "flowmap",
          raw: content,
          spec: parseFlowmapSpec(content),
          complete,
        });
      } else {
        blocks.push({ kind: "code", lang, content });
      }
    } else if (match[3] !== undefined) {
      // Container block (:::type ... :::).
      const type = (match[3] ?? "").toLowerCase();
      const content = match[4] ?? "";
      const complete = whole.trimEnd().endsWith(":::");
      if (type === "kpi") {
        blocks.push({
          kind: "kpi",
          raw: content,
          entries: parseKpiBlock(content),
          complete,
        });
      } else {
        // Unknown container type — keep as text so nothing is lost.
        blocks.push({ kind: "text", content: whole });
      }
    }
    last = BLOCK_RE.lastIndex;
  }
  if (last < src.length) {
    blocks.push({ kind: "text", content: src.slice(last) });
  }
  return blocks;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Allow-list for LLM-emitted HTML. Anything not in this set is stripped
// (the element is removed and its children are promoted into the parent).
const ALLOWED_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
  "caption", "cite", "code", "data", "dd", "del", "details", "dfn", "div",
  "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2", "h3",
  "h4", "h5", "h6", "header", "hr", "i", "img", "ins", "kbd", "li", "main",
  "mark", "nav", "ol", "p", "pre", "q", "s", "samp", "section", "small",
  "span", "strong", "sub", "summary", "sup", "table", "tbody", "td",
  "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
]);

const ALLOWED_ATTRS_BY_TAG: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan", "align"]),
  th: new Set(["colspan", "rowspan", "align", "scope"]),
  table: new Set(["align"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
};
const GLOBAL_ATTRS = new Set(["class", "id", "style"]);

// Block-level tags: when a line starts with one of these, treat the
// following non-blank lines as a raw HTML block (rendered via a sanitized
// dangerouslySetInnerHTML) instead of feeding it through the paragraph/list
// grouper, which would otherwise wrap it in <p> and break the structure.
const BLOCK_HTML_TAGS = new Set([
  "address", "article", "aside", "blockquote", "details", "div", "dl",
  "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
  "main", "nav", "ol", "p", "pre", "section", "table", "ul",
]);

function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // SSR fallback: no DOM available, escape everything.
    return escapeHtml(html);
  }
  const doc = new DOMParser().parseFromString(
    `<div id="__md_root__">${html}</div>`,
    "text/html"
  );
  const root = doc.getElementById("__md_root__");
  if (!root) return escapeHtml(html);

  const walk = (node: Element) => {
    // Iterate a snapshot because we mutate children during the loop.
    const children = Array.from(node.children);
    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // Unwrap: promote children into the parent, drop the element.
        while (child.firstChild) {
          node.insertBefore(child.firstChild, child);
        }
        node.removeChild(child);
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const tagAllowed = ALLOWED_ATTRS_BY_TAG[tag];
        const isAllowed =
          GLOBAL_ATTRS.has(name) || (tagAllowed?.has(name) ?? false);
        if (!isAllowed || name.startsWith("on")) {
          child.removeAttribute(attr.name);
          continue;
        }
        if (
          name === "href" &&
          /^\s*(javascript|vbscript|data):/i.test(attr.value)
        ) {
          child.removeAttribute(attr.name);
        }
        if (name === "src" && /^\s*(javascript|vbscript):/i.test(attr.value)) {
          child.removeAttribute(attr.name);
        }
      }
      if (tag === "a" && child.getAttribute("href")) {
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

// Inline: `code`, **bold**, *italic*, [text](url). Inline HTML tags
// survive via sanitizeHtml so things like <strong>, <br>, <code>, <a>
// render correctly when the LLM emits them mid-sentence.
function renderInline(text: string): string {
  let out = sanitizeHtml(text);
  // inline code first so its content isn't matched by bold/italic
  out = out.replace(
    /`([^`\n]+)`/g,
    (_m, c) =>
      `<code class="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[0.85em] font-mono">${c}</code>`
  );
  out = out.replace(
    /\*\*([^*\n]+)\*\*/g,
    (_m, c) => `<strong class="font-semibold">${c}</strong>`
  );
  out = out.replace(
    /(^|[^*])\*([^*\n]+)\*/g,
    (_m, pre, c) => `${pre}<em class="italic">${c}</em>`
  );
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (match, label, url) => {
      if (!isSafeUrl(url)) return match;
      const safeHref = String(url).replace(/"/g, "&quot;");
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2 hover:no-underline">${label}</a>`;
    }
  );
  return out;
}

function isSafeUrl(url: string): boolean {
  const trimmed = String(url).trim();
  if (!trimmed) return false;
  // Relative, fragment, mail/tel and http(s) are allowed; reject javascript:, vbscript:, data:, file:, etc.
  if (/^(#|\/|\.\/|\.\.\/)/.test(trimmed)) return true;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  // Bare hostnames like "example.com/path"
  return true;
}

interface LineGroup {
  type: "p" | "h1" | "h2" | "h3" | "ul" | "ol" | "quote" | "table" | "html";
  lines: string[];
  headers?: string[];
  rows?: string[][];
}

function lineStartsHtmlBlock(line: string): boolean {
  const m = line.trim().match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)\b/);
  if (!m) return false;
  return BLOCK_HTML_TAGS.has(m[1].toLowerCase());
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.length > 1 && t.includes("|", 1);
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  // | --- | --- | or | :--- | ---: | :---: |
  return /^\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(t);
}

function parseTableRow(line: string): string[] {
  // Strip leading/trailing pipes, then split on pipes.
  // We don't honour escaped pipes (\\|) — overkill for tool output.
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

function groupLines(text: string): LineGroup[] {
  const groups: LineGroup[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Tables must be checked FIRST — a table row looks like a paragraph otherwise.
    if (
      i + 1 < lines.length &&
      isTableRow(lines[i]) &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = parseTableRow(lines[i]);
      const colCount = headers.length;
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        const cells = parseTableRow(lines[i]);
        // Normalize row length to match header count
        if (cells.length < colCount) {
          while (cells.length < colCount) cells.push("");
        } else if (cells.length > colCount) {
          cells.length = colCount;
        }
        rows.push(cells);
        i++;
      }
      groups.push({ type: "table", lines: [], headers, rows });
      continue;
    }

    // Raw HTML block: a line starting with a known block-level tag
    // pulls in consecutive non-blank lines as a single HTML group so
    // <table>, <div>, etc. aren't mangled by the paragraph grouper.
    if (line.trim() !== "" && lineStartsHtmlBlock(line)) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        buf.push(lines[i]);
        i++;
      }
      groups.push({ type: "html", lines: buf });
      continue;
    }

    if (/^###\s+/.test(line)) {
      groups.push({ type: "h3", lines: [line.replace(/^###\s+/, "")] });
      i++;
      continue;
    }
    if (/^##\s+/.test(line)) {
      groups.push({ type: "h2", lines: [line.replace(/^##\s+/, "")] });
      i++;
      continue;
    }
    if (/^#\s+/.test(line)) {
      groups.push({ type: "h1", lines: [line.replace(/^#\s+/, "")] });
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      groups.push({ type: "quote", lines: buf });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      groups.push({ type: "ul", lines: buf });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      groups.push({ type: "ol", lines: buf });
      continue;
    }
    // Paragraph: collect until blank line, heading, list, quote, or table
    if (line.trim() === "") {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,3}\s+|>\s?|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    if (buf.length) groups.push({ type: "p", lines: buf });
  }
  return groups;
}

function TextBlock({ content }: { content: string }) {
  const groups = groupLines(content);
  return (
    <>
      {groups.map((g, idx) => {
        const inline = (line: string) => (
          <span dangerouslySetInnerHTML={{ __html: renderInline(line) }} />
        );
        switch (g.type) {
          case "h1":
            return (
              <h1 key={idx} className="text-xl font-semibold mt-2 mb-1">
                {inline(g.lines[0])}
              </h1>
            );
          case "h2":
            return (
              <h2 key={idx} className="text-lg font-semibold mt-2 mb-1">
                {inline(g.lines[0])}
              </h2>
            );
          case "h3":
            return (
              <h3 key={idx} className="text-base font-semibold mt-1.5 mb-1">
                {inline(g.lines[0])}
              </h3>
            );
          case "quote":
            return (
              <blockquote
                key={idx}
                className="border-l-2 border-primary/40 pl-3 my-1 text-muted-foreground"
              >
                {g.lines.map((l, i) => (
                  <div key={i}>{inline(l)}</div>
                ))}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={idx} className="list-disc pl-5 my-1 space-y-0.5">
                {g.lines.map((l, i) => (
                  <li key={i}>{inline(l)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx} className="list-decimal pl-5 my-1 space-y-0.5">
                {g.lines.map((l, i) => (
                  <li key={i}>{inline(l)}</li>
                ))}
              </ol>
            );
          case "html":
            return (
              <div
                key={idx}
                className="chat-html my-1 [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-2 [&_table]:rounded-md [&_table]:border [&_table]:overflow-hidden [&_thead]:bg-muted/60 [&_th]:text-left [&_th]:font-semibold [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_td]:px-3 [&_td]:py-1.5 [&_td]:border-t [&_td]:border-border/60 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-black/10 [&_code]:dark:bg-white/10 [&_code]:text-[0.85em] [&_code]:font-mono [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-1 [&_p]:my-1 [&_p]:leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(g.lines.join("\n")),
                }}
              />
            );
          case "table": {
            const rawHeaders = (g.headers ?? []).map(stripInlineMd);
            const rawRows = (g.rows ?? []).map((r) => r.map(stripInlineMd));
            const titleHint =
              rawHeaders.length > 0 ? rawHeaders.join("-") : "table";
            const runTable = async (
              fn: () => Promise<void> | void,
              name: string
            ) => {
              try {
                await fn();
                toast.success(`${name} downloaded`);
              } catch (err) {
                toast.error(`${name} failed: ${(err as Error).message}`);
              }
            };
            return (
              <div
                key={idx}
                className="group relative my-2 rounded-md border overflow-hidden bg-background"
              >
                <VisualToolbar
                  label="Download table"
                  className="top-1.5 right-1.5"
                  groups={[
                    {
                      label: "Table",
                      items: [
                        {
                          label: "PDF report",
                          icon: <FileDown className="h-3.5 w-3.5" />,
                          onSelect: () =>
                            runTable(
                              () =>
                                downloadTablePDF(
                                  rawHeaders,
                                  rawRows,
                                  titleHint
                                ),
                              "PDF"
                            ),
                        },
                        {
                          label: "CSV data",
                          icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
                          onSelect: () =>
                            runTable(
                              () =>
                                downloadTableCSV(
                                  rawHeaders,
                                  rawRows,
                                  titleHint
                                ),
                              "CSV"
                            ),
                        },
                      ],
                    },
                    {
                      items: [
                        {
                          label: "Copy as TSV",
                          icon: <Copy className="h-3.5 w-3.5" />,
                          onSelect: async () => {
                            try {
                              await copyTable(rawHeaders, rawRows);
                              toast.success("Table copied");
                            } catch {
                              toast.error("Clipboard blocked");
                            }
                          },
                        },
                      ],
                    },
                  ]}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-muted/60 border-b">
                      <tr>
                        {(g.headers ?? []).map((h, i) => (
                          <th
                            key={i}
                            className="text-left font-semibold px-3 py-2 whitespace-nowrap text-foreground"
                          >
                            {inline(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {(g.rows ?? []).map((row, ri) => (
                        <tr key={ri} className="hover:bg-muted/30">
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className="px-3 py-1.5 align-top text-foreground/90"
                            >
                              {inline(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }
          default:
            return (
              <p key={idx} className="my-1 leading-relaxed">
                {g.lines.map((l, i) => (
                  <Fragment key={i}>
                    {inline(l)}
                    {i < g.lines.length - 1 && <br />}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </>
  );
}

// Languages whose fenced code blocks should render as a live visualization
// by default. Users can still flip to source via the "Code" toggle.
const VISUAL_LANGS = new Set(["html", "svg", "xml"]);

const VISUAL_PREVIEW_CLASS =
  "chat-html [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-2 [&_table]:rounded-md [&_table]:border [&_table]:overflow-hidden [&_thead]:bg-muted/60 [&_th]:text-left [&_th]:font-semibold [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_td]:px-3 [&_td]:py-1.5 [&_td]:border-t [&_td]:border-border/60 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-black/10 [&_code]:dark:bg-white/10 [&_code]:text-[0.85em] [&_code]:font-mono [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_p]:my-1 [&_p]:leading-relaxed [&_svg]:max-w-full [&_svg]:h-auto [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded";

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const normalizedLang = lang.toLowerCase();
  const isVisual = VISUAL_LANGS.has(normalizedLang);
  const [viewMode, setViewMode] = useState<"preview" | "code">(
    isVisual ? "preview" : "code"
  );
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (isVisual && viewMode === "preview") {
    return (
      <div className="my-2 rounded-md border bg-background overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b text-[11px] text-muted-foreground">
          <span className="font-mono">{normalizedLang} · preview</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode("code")}
              className="hover:text-foreground transition-colors"
              title="Show source"
            >
              Code
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              title="Copy"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
        <div
          className={cn("p-3 overflow-x-auto", VISUAL_PREVIEW_CLASS)}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
        />
      </div>
    );
  }

  return (
    <div className="my-2 rounded-md border bg-zinc-950 text-zinc-100 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 text-[11px] text-zinc-400">
        <span className="font-mono">{lang || "code"}</span>
        <div className="flex items-center gap-3">
          {isVisual && (
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className="hover:text-zinc-100 transition-colors"
              title="Render as visualization"
            >
              Preview
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-zinc-100 transition-colors"
            title="Copy"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="px-3 py-2 overflow-x-auto text-[13px] leading-relaxed">
        <code className="font-mono">{content}</code>
      </pre>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="my-3 rounded-xl border border-border/70 bg-gradient-to-br from-background to-muted/20 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-3 px-1">
        <BarChart3 className="h-3.5 w-3.5 text-primary animate-pulse" />
        <div className="h-3 w-32 rounded bg-muted/70 animate-pulse" />
      </div>
      <div className="h-[220px] rounded-lg bg-gradient-to-t from-muted/40 to-muted/10 flex items-end gap-2 p-3">
        {[0.4, 0.7, 0.5, 0.85, 0.6, 0.9, 0.55].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-primary/20 animate-pulse"
            style={{
              height: `${h * 100}%`,
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-border/70 bg-gradient-to-br from-background to-muted/20 p-3 space-y-2 shadow-sm"
        >
          <div
            className="h-2 w-16 rounded bg-muted/70 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
          <div
            className="h-6 w-20 rounded bg-muted/60 animate-pulse"
            style={{ animationDelay: `${i * 100 + 50}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

function ChartBlock({
  raw,
  spec,
  complete,
  pending,
}: {
  raw: string;
  spec: ChartSpec | null;
  complete: boolean;
  pending: boolean;
}) {
  // Streaming: block hasn't finished arriving OR JSON not yet valid → skeleton.
  if (pending && (!complete || !spec)) {
    return <ChartSkeleton />;
  }
  if (!spec) {
    return (
      <div className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-semibold mb-1">
          <BarChart3 className="h-3.5 w-3.5" />
          Invalid chart spec
        </div>
        <div className="text-muted-foreground">
          Chart JSON could not be parsed — falling back to source.
        </div>
        <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
          {raw}
        </pre>
      </div>
    );
  }
  return <ChartRenderer spec={spec} />;
}

function KpiBlock({
  raw,
  entries,
  complete,
  pending,
}: {
  raw: string;
  entries: KpiEntry[] | null;
  complete: boolean;
  pending: boolean;
}) {
  if (pending && (!complete || !entries || entries.length === 0)) {
    return <KpiSkeleton />;
  }
  if (!entries || entries.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <div className="text-amber-700 dark:text-amber-400 font-semibold mb-1">
          Invalid KPI block
        </div>
        <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
          {raw}
        </pre>
      </div>
    );
  }
  return <KpiGrid entries={entries} />;
}

export function Markdown({
  content,
  className,
  pending = false,
}: {
  content: string;
  className?: string;
  pending?: boolean;
}) {
  const blocks = splitBlocks(content);
  return (
    <div className={cn("text-sm", className)}>
      {blocks.map((b, i) => {
        // Key binds both position AND kind so a code→chart transition at the
        // same index remounts the component (avoids bleeding viewMode /
        // expanded state from an obsolete block into a new one).
        const key = `${b.kind}-${i}`;
        if (b.kind === "code") {
          return <CodeBlock key={key} lang={b.lang} content={b.content} />;
        }
        if (b.kind === "chart") {
          return (
            <ChartBlock
              key={key}
              raw={b.raw}
              spec={b.spec}
              complete={b.complete}
              pending={pending}
            />
          );
        }
        if (b.kind === "kpi") {
          return (
            <KpiBlock
              key={key}
              raw={b.raw}
              entries={b.entries}
              complete={b.complete}
              pending={pending}
            />
          );
        }
        if (b.kind === "mindmap") {
          return (
            <MindmapBlock
              key={key}
              raw={b.raw}
              source={b.source}
              complete={b.complete}
              pending={pending}
            />
          );
        }
        if (b.kind === "flowmap") {
          return (
            <FlowmapBlock
              key={key}
              raw={b.raw}
              spec={b.spec}
              complete={b.complete}
              pending={pending}
            />
          );
        }
        return <TextBlock key={key} content={b.content} />;
      })}
    </div>
  );
}

function MindmapBlock({
  raw,
  source,
  complete,
  pending,
}: {
  raw: string;
  source: string | null;
  complete: boolean;
  pending?: boolean;
}) {
  // Show a compact skeleton while the mindmap block is still streaming.
  if (pending && (!complete || !source)) {
    return (
      <div className="my-3 rounded-xl border border-dashed border-border/70 bg-muted/10 px-3 py-6 text-xs text-muted-foreground flex items-center gap-2">
        <BarChart3 className="h-3.5 w-3.5" />
        Building mindmap…
      </div>
    );
  }
  if (!source) {
    return (
      <div className="my-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-3 text-xs">
        <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          Invalid mindmap source
        </div>
        <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
          {raw}
        </pre>
      </div>
    );
  }
  return <MindmapRenderer source={source} />;
}

function FlowmapBlock({
  raw,
  spec,
  complete,
  pending,
}: {
  raw: string;
  spec: FlowmapSpec | null;
  complete: boolean;
  pending?: boolean;
}) {
  if (pending && (!complete || !spec)) {
    return (
      <div className="my-3 rounded-xl border border-dashed border-border/70 bg-muted/10 px-3 py-6 text-xs text-muted-foreground flex items-center gap-2">
        <BarChart3 className="h-3.5 w-3.5" />
        Building flowmap…
      </div>
    );
  }
  if (!spec) {
    return (
      <div className="my-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-3 text-xs">
        <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          Invalid flowmap spec
        </div>
        <div className="text-muted-foreground">
          Flowmap JSON could not be parsed — needs `nodes: [...]` and `edges: [...]`.
        </div>
        <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
          {raw}
        </pre>
      </div>
    );
  }
  return <FlowmapRenderer spec={spec} />;
}
