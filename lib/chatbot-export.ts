/**
 * Chatbot export utilities — PDF, Markdown, JSON, and clipboard helpers
 * for exporting conversations and analytics reports.
 *
 * The PDF export is a text-based branded report (no chart images) built from
 * the structured content the assistant already emits: :::kpi blocks, chart
 * fences, and markdown tables. Charts are rendered as title + underlying
 * data table, which prints cleanly and never fails on font / canvas issues.
 */

import type { LocalMessage } from "@/components/chatbot/types";
import {
  extractAnalytics,
  type ExtractedTable,
} from "@/components/chatbot/analytics/extract";
import type { ChartSpec } from "@/components/chatbot/analytics/chart-renderer";
import type { KpiEntry } from "@/components/chatbot/analytics/kpi-card";

export interface ExportContext {
  messages: LocalMessage[];
  conversationTitle: string;
  providerLabel?: string;
  modelLabel?: string;
  /** If true, include only the last assistant message; otherwise whole chat. */
  lastAnswerOnly?: boolean;
}

// ── Filename helpers ──────────────────────────────────────────────────────
function safeFilename(title: string): string {
  const base = (title || "analysis")
    .replace(/[^a-z0-9-_ ]/gi, "")
    .replace(/\s+/g, "-")
    .trim()
    .toLowerCase();
  return base || "analysis";
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Accent colors for KPI cards (match the app palette) ───────────────────
const ACCENT_RGB: Record<string, [number, number, number]> = {
  violet: [139, 92, 246],
  cyan: [6, 182, 212],
  amber: [245, 158, 11],
  emerald: [16, 185, 129],
  pink: [236, 72, 153],
  blue: [59, 130, 246],
};
const DEFAULT_ACCENT: [number, number, number] = [201, 100, 66]; // Claude coral

function kpiAccent(accent?: string): [number, number, number] {
  if (!accent) return DEFAULT_ACCENT;
  return ACCENT_RGB[accent] ?? DEFAULT_ACCENT;
}

// ── Strip markdown primitives so plain-text rendering stays readable ──────
function toPlainText(md: string): string {
  return md
    // Remove KPI blocks (rendered separately as cards)
    .replace(/:::kpi[\s\S]*?:::/g, "")
    // Remove chart fences (rendered separately as titled tables)
    .replace(/```chart[\s\S]*?```/g, "")
    // Strip other fenced code blocks but keep their content
    .replace(/```[a-z]*\n?([\s\S]*?)```/g, "$1")
    // Headings — keep the text, drop #
    .replace(/^#{1,6}\s+/gm, "")
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Inline code
    .replace(/`([^`]+)`/g, "$1")
    // Links — keep label
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Blockquote markers
    .replace(/^>\s?/gm, "")
    // Bullets
    .replace(/^\s*[-*+]\s+/gm, "• ")
    // Numbered lists left as-is
    .trim();
}

// Split content into markdown tables vs prose chunks, preserving order, so
// we can run them through autoTable vs doc.text respectively.
function partitionContent(md: string): Array<
  | { kind: "prose"; text: string }
  | { kind: "table"; table: ExtractedTable }
> {
  const parts: Array<
    { kind: "prose"; text: string } | { kind: "table"; table: ExtractedTable }
  > = [];
  const lines = md.split("\n");
  let buffer: string[] = [];
  const flushProse = () => {
    const text = toPlainText(buffer.join("\n"));
    if (text.trim()) parts.push({ kind: "prose", text });
    buffer = [];
  };

  const isRow = (l: string) =>
    l.trim().startsWith("|") && l.trim().length > 1 && l.trim().includes("|", 1);
  const isSep = (l: string) => /^\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(l.trim());
  const parseRow = (l: string) =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  let i = 0;
  while (i < lines.length) {
    if (i + 1 < lines.length && isRow(lines[i]) && isSep(lines[i + 1])) {
      flushProse();
      const headers = parseRow(lines[i]);
      const colCount = headers.length;
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i])) {
        const cells = parseRow(lines[i]);
        while (cells.length < colCount) cells.push("");
        if (cells.length > colCount) cells.length = colCount;
        rows.push(cells);
        i++;
      }
      parts.push({ kind: "table", table: { headers, rows } });
      continue;
    }
    buffer.push(lines[i]);
    i++;
  }
  flushProse();
  return parts;
}

// Convert a chart spec's data into a printable [headers, rows] table.
function chartToTable(spec: ChartSpec): { headers: string[]; rows: string[][] } {
  if (spec.type === "pie" || spec.type === "donut") {
    const nameKey = spec.nameKey ?? "name";
    const yKey = spec.y ?? "value";
    return {
      headers: [nameKey, yKey],
      rows: spec.data.map((r) => [
        String(r[nameKey] ?? ""),
        String(r[yKey] ?? ""),
      ]),
    };
  }
  const xKey = spec.x ?? Object.keys(spec.data[0] ?? {})[0] ?? "x";
  const seriesKeys =
    spec.series?.map((s) => s.key) ??
    Object.keys(spec.data[0] ?? {}).filter((k) => k !== xKey);
  return {
    headers: [xKey, ...seriesKeys],
    rows: spec.data.map((r) => [
      String(r[xKey] ?? ""),
      ...seriesKeys.map((k) => String(r[k] ?? "")),
    ]),
  };
}

// ── PDF export ────────────────────────────────────────────────────────────
export async function exportReportAsPDF(ctx: ExportContext): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin - 20) {
      doc.addPage();
      y = margin;
    }
  };

  // Header / brand bar
  doc.setFillColor(...DEFAULT_ACCENT);
  doc.rect(0, 0, pageWidth, 6, "F");

  // Title
  y = margin + 10;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const title = ctx.conversationTitle || "Analytics Report";
  doc.text(title, margin, y);
  y += 24;

  // Metadata
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const metaParts: string[] = [];
  metaParts.push(`Generated ${new Date().toLocaleString()}`);
  if (ctx.providerLabel) metaParts.push(ctx.providerLabel);
  if (ctx.modelLabel) metaParts.push(ctx.modelLabel);
  doc.text(metaParts.join("  ·  "), margin, y);
  y += 18;

  // Divider
  doc.setDrawColor(220, 215, 205);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Decide which messages to include
  const includedMessages = ctx.lastAnswerOnly
    ? (() => {
        const lastAssistant = [...ctx.messages]
          .reverse()
          .find((m) => m.role === "assistant" && !m.error);
        const lastUser = [...ctx.messages]
          .reverse()
          .find((m) => m.role === "user");
        return [lastUser, lastAssistant].filter(Boolean) as LocalMessage[];
      })()
    : ctx.messages.filter((m) => !m.error && (m.role === "user" || m.role === "assistant"));

  // Aggregate all analytics across included assistant messages
  const allKpis: KpiEntry[] = [];
  const allCharts: Array<{ spec: ChartSpec }> = [];
  for (const m of includedMessages) {
    if (m.role !== "assistant") continue;
    const a = extractAnalytics(m.content);
    allKpis.push(...a.kpis);
    for (const c of a.charts) allCharts.push({ spec: c.spec });
  }

  // ── KPI section ───────────────────────────────────────────────────────
  if (allKpis.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text("KEY METRICS", margin, y);
    y += 16;

    const cardsPerRow = 2;
    const gap = 12;
    const cardWidth = (contentWidth - gap * (cardsPerRow - 1)) / cardsPerRow;
    const cardHeight = 58;

    for (let i = 0; i < allKpis.length; i++) {
      const k = allKpis[i];
      const col = i % cardsPerRow;
      const row = Math.floor(i / cardsPerRow);
      if (col === 0 && row > 0) y += cardHeight + gap;
      ensureSpace(cardHeight + 10);
      const x = margin + col * (cardWidth + gap);
      const [r, g, b] = kpiAccent(k.accent);

      // Card background
      doc.setFillColor(250, 248, 243);
      doc.setDrawColor(230, 225, 215);
      doc.roundedRect(x, y, cardWidth, cardHeight, 6, 6, "FD");
      // Accent bar
      doc.setFillColor(r, g, b);
      doc.roundedRect(x, y, 3, cardHeight, 1.5, 1.5, "F");

      // Label
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(120, 115, 110);
      doc.text(String(k.label).toUpperCase(), x + 12, y + 14);

      // Value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(30, 25, 20);
      doc.text(String(k.value ?? "—"), x + 12, y + 34);

      // Delta + hint
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      if (k.delta) {
        const trendColor: [number, number, number] =
          k.trend === "up"
            ? [16, 185, 129]
            : k.trend === "down"
              ? [220, 80, 60]
              : [140, 140, 140];
        doc.setTextColor(...trendColor);
        doc.text(String(k.delta), x + 12, y + 48);
      }
      if (k.hint) {
        doc.setTextColor(140, 135, 130);
        const hintX = k.delta ? x + 12 + doc.getTextWidth(String(k.delta)) + 8 : x + 12;
        doc.text(String(k.hint), hintX, y + 48);
      }
    }
    const rows = Math.ceil(allKpis.length / cardsPerRow);
    y += cardHeight + gap * (rows > 1 ? 1 : 0) + 8;
  }

  // ── Charts section — titles + underlying data tables ─────────────────
  if (allCharts.length > 0) {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text("CHARTS & DATA", margin, y);
    y += 14;

    for (const { spec } of allCharts) {
      ensureSpace(60);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(40, 35, 30);
      doc.text(spec.title || "Chart", margin, y);
      y += 12;
      if (spec.description) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(130, 125, 120);
        doc.text(spec.description, margin, y);
        y += 12;
      }
      const { headers, rows } = chartToTable(spec);
      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: y,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: {
          fillColor: DEFAULT_ACCENT,
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [250, 248, 243] },
        tableWidth: contentWidth,
      });
      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } })
        .lastAutoTable?.finalY;
      y = (finalY ?? y) + 18;
    }
  }

  // ── Conversation section ─────────────────────────────────────────────
  if (includedMessages.length > 0) {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(
      ctx.lastAnswerOnly ? "ANALYSIS" : "CONVERSATION",
      margin,
      y
    );
    y += 14;

    for (const m of includedMessages) {
      ensureSpace(40);
      // Role label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      if (m.role === "user") {
        doc.setTextColor(80, 75, 70);
        doc.text("YOU", margin, y);
      } else {
        doc.setTextColor(...DEFAULT_ACCENT);
        doc.text("ASSISTANT", margin, y);
      }
      y += 12;

      // Content — partition into prose + tables, flow each
      const parts = partitionContent(m.content);
      for (const part of parts) {
        if (part.kind === "prose") {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(35, 30, 25);
          const lines = doc.splitTextToSize(part.text, contentWidth);
          for (const line of lines) {
            ensureSpace(14);
            doc.text(line, margin, y);
            y += 13;
          }
          y += 4;
        } else {
          ensureSpace(40);
          autoTable(doc, {
            head: [part.table.headers],
            body: part.table.rows,
            startY: y,
            margin: { left: margin, right: margin },
            styles: { fontSize: 8.5, cellPadding: 4 },
            headStyles: {
              fillColor: [245, 240, 230],
              textColor: [60, 50, 40],
              fontStyle: "bold",
            },
            alternateRowStyles: { fillColor: [252, 250, 246] },
            tableWidth: contentWidth,
          });
          const finalY = (
            doc as unknown as { lastAutoTable?: { finalY: number } }
          ).lastAutoTable?.finalY;
          y = (finalY ?? y) + 10;
        }
      }
      y += 8;
    }
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 155, 150);
    doc.text(
      `${ctx.conversationTitle || "Analytics Report"}  ·  Page ${p} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 18,
      { align: "center" }
    );
  }

  doc.save(`${safeFilename(ctx.conversationTitle)}-${timestampSlug()}.pdf`);
}

// ── Markdown export ───────────────────────────────────────────────────────
export function exportReportAsMarkdown(ctx: ExportContext): void {
  const lines: string[] = [];
  const title = ctx.conversationTitle || "Analysis";
  lines.push(`# ${title}`);
  lines.push("");
  const metaParts: string[] = [`_Exported ${new Date().toLocaleString()}_`];
  if (ctx.providerLabel) metaParts.push(ctx.providerLabel);
  if (ctx.modelLabel) metaParts.push(ctx.modelLabel);
  lines.push(metaParts.join(" · "));
  lines.push("");
  lines.push("---");
  lines.push("");

  const included = ctx.lastAnswerOnly
    ? (() => {
        const lastAssistant = [...ctx.messages]
          .reverse()
          .find((m) => m.role === "assistant" && !m.error);
        return lastAssistant ? [lastAssistant] : [];
      })()
    : ctx.messages.filter(
        (m) => !m.error && (m.role === "user" || m.role === "assistant")
      );

  for (const m of included) {
    if (m.role === "user") {
      lines.push(`## You`);
      lines.push("");
      lines.push(m.content);
    } else {
      lines.push(`## Assistant`);
      lines.push("");
      lines.push(m.content);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  downloadBlob(
    lines.join("\n"),
    `${safeFilename(title)}-${timestampSlug()}.md`,
    "text/markdown;charset=utf-8"
  );
}

// ── JSON export ───────────────────────────────────────────────────────────
export function exportReportAsJSON(ctx: ExportContext): void {
  const title = ctx.conversationTitle || "Analysis";
  const payload = {
    title,
    exportedAt: new Date().toISOString(),
    provider: ctx.providerLabel,
    model: ctx.modelLabel,
    messages: (ctx.lastAnswerOnly
      ? (() => {
          const lastAssistant = [...ctx.messages]
            .reverse()
            .find((m) => m.role === "assistant" && !m.error);
          const lastUser = [...ctx.messages]
            .reverse()
            .find((m) => m.role === "user");
          return [lastUser, lastAssistant].filter(Boolean) as LocalMessage[];
        })()
      : ctx.messages.filter(
          (m) => !m.error && (m.role === "user" || m.role === "assistant")
        )
    ).map((m) => ({
      role: m.role,
      content: m.content,
      providerName: m.providerName,
      model: m.model,
      toolEvents: m.toolEvents,
    })),
  };

  downloadBlob(
    JSON.stringify(payload, null, 2),
    `${safeFilename(title)}-${timestampSlug()}.json`,
    "application/json;charset=utf-8"
  );
}

// ── Clipboard copy ────────────────────────────────────────────────────────
export async function copyReportAsText(ctx: ExportContext): Promise<void> {
  const parts: string[] = [];
  parts.push(`# ${ctx.conversationTitle || "Analysis"}`);
  parts.push("");

  const included = ctx.lastAnswerOnly
    ? (() => {
        const lastAssistant = [...ctx.messages]
          .reverse()
          .find((m) => m.role === "assistant" && !m.error);
        return lastAssistant ? [lastAssistant] : [];
      })()
    : ctx.messages.filter(
        (m) => !m.error && (m.role === "user" || m.role === "assistant")
      );

  for (const m of included) {
    parts.push(m.role === "user" ? "You:" : "Assistant:");
    parts.push(m.content);
    parts.push("");
  }
  await navigator.clipboard.writeText(parts.join("\n"));
}

// ── Print ─────────────────────────────────────────────────────────────────
export function printReport(): void {
  window.print();
}
