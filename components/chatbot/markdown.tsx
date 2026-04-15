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
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type Block =
  | { kind: "code"; lang: string; content: string }
  | { kind: "text"; content: string };

function splitBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const re = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    if (match.index > last) {
      blocks.push({ kind: "text", content: src.slice(last, match.index) });
    }
    blocks.push({
      kind: "code",
      lang: match[1] ?? "",
      content: match[2] ?? "",
    });
    last = re.lastIndex;
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

// Inline: `code`, **bold**, *italic*, [text](url)
function renderInline(text: string): string {
  let out = escapeHtml(text);
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
    (_m, label, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2 hover:no-underline">${label}</a>`
  );
  return out;
}

interface LineGroup {
  type: "p" | "h1" | "h2" | "h3" | "ul" | "ol" | "quote" | "table";
  lines: string[];
  headers?: string[];
  rows?: string[][];
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
          case "table":
            return (
              <div
                key={idx}
                className="my-2 rounded-md border overflow-hidden bg-background"
              >
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

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="my-2 rounded-md border bg-zinc-950 text-zinc-100 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 text-[11px] text-zinc-400">
        <span className="font-mono">{lang || "code"}</span>
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
      <pre className="px-3 py-2 overflow-x-auto text-[13px] leading-relaxed">
        <code className="font-mono">{content}</code>
      </pre>
    </div>
  );
}

export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = splitBlocks(content);
  return (
    <div className={cn("text-sm", className)}>
      {blocks.map((b, i) =>
        b.kind === "code" ? (
          <CodeBlock key={i} lang={b.lang} content={b.content} />
        ) : (
          <TextBlock key={i} content={b.content} />
        )
      )}
    </div>
  );
}
