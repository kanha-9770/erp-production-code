/**
 * Per-visualization export helpers — charts, KPI grids, and markdown tables.
 *
 * Charts: PNG via SVG → canvas pipeline (no extra deps). We inline computed
 * styles before serialization so Recharts' CSS-var-driven colors (tick text,
 * grid lines) resolve cleanly in the exported image.
 *
 * PDF: single-visualization mini-reports built on jsPDF.
 * CSV: plain-text rows.
 */

import type { ChartSpec } from "@/components/chatbot/analytics/chart-renderer";
import type { KpiEntry } from "@/components/chatbot/analytics/kpi-card";

// ── Shared utilities ──────────────────────────────────────────────────────
function safeFilename(title: string): string {
  const base = (title || "visualization")
    .replace(/[^a-z0-9-_ ]/gi, "")
    .replace(/\s+/g, "-")
    .trim()
    .toLowerCase();
  return base || "visualization";
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(headers: string[], rows: string[][]): string {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
}

// ── SVG → PNG ─────────────────────────────────────────────────────────────
// Properties we need to inline to keep the export looking the same as the DOM.
const STYLE_PROPS: string[] = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "fill-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
];

function inlineComputedStyles(source: SVGElement): SVGElement {
  const clone = source.cloneNode(true) as SVGElement;
  const sourceEls = source.querySelectorAll<SVGElement>("*");
  const cloneEls = clone.querySelectorAll<SVGElement>("*");
  const inlineOne = (srcEl: Element, cloneEl: Element) => {
    const computed = window.getComputedStyle(srcEl);
    for (const prop of STYLE_PROPS) {
      const v = computed.getPropertyValue(prop);
      if (v && v !== "none") {
        (cloneEl as HTMLElement).style.setProperty(prop, v);
      }
    }
  };
  inlineOne(source, clone);
  for (let i = 0; i < sourceEls.length; i++) {
    inlineOne(sourceEls[i], cloneEls[i]);
  }
  return clone;
}

function serializeSvg(svg: SVGElement, width: number, height: number): string {
  const clone = inlineComputedStyles(svg);
  // Make sure the clone has proper size + namespace for standalone rendering
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  return new XMLSerializer().serializeToString(clone);
}

/**
 * Rasterize an SVG element to a PNG blob. Uses 2x scaling for retina quality.
 * Includes a warm background (--background color) for print legibility.
 */
export async function svgToPngBlob(
  svg: SVGElement,
  opts?: { bgColor?: string; scale?: number }
): Promise<Blob> {
  const bg = opts?.bgColor ?? readCssVar("--background", "#FAF9F5");
  const scale = opts?.scale ?? 2;

  const bbox = svg.getBoundingClientRect();
  const width = Math.max(1, bbox.width);
  const height = Math.max(1, bbox.height);

  const xml = serializeSvg(svg, width, height);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("Failed to rasterize chart SVG"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    // Warm background so exported PNG isn't transparent (reads poorly in docs)
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
        "image/png"
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readCssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    if (!v) return fallback;
    // HSL shorthand — wrap with hsl(...)
    if (/^\d/.test(v)) return `hsl(${v})`;
    return v;
  } catch {
    return fallback;
  }
}

// ── Chart exports ─────────────────────────────────────────────────────────
export function chartToRows(spec: ChartSpec): {
  headers: string[];
  rows: string[][];
} {
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

export async function downloadChartPNG(
  chartContainer: HTMLElement,
  spec: ChartSpec
): Promise<void> {
  const svg = chartContainer.querySelector("svg");
  if (!svg) throw new Error("Chart SVG not found");
  const blob = await svgToPngBlob(svg as SVGElement);
  downloadBlob(
    blob,
    `${safeFilename(spec.title ?? "chart")}-${timestampSlug()}.png`
  );
}

export async function downloadChartPDF(
  chartContainer: HTMLElement,
  spec: ChartSpec
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const svg = chartContainer.querySelector("svg");
  let pngDataUrl: string | null = null;
  let pngWidth = 0;
  let pngHeight = 0;
  if (svg) {
    try {
      const blob = await svgToPngBlob(svg as SVGElement);
      pngDataUrl = await blobToDataUrl(blob);
      const bbox = (svg as SVGElement).getBoundingClientRect();
      pngWidth = bbox.width;
      pngHeight = bbox.height;
    } catch {
      pngDataUrl = null;
    }
  }

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentW = pageW - margin * 2;

  // Brand bar
  doc.setFillColor(201, 100, 66);
  doc.rect(0, 0, pageW, 5, "F");

  let y = margin + 6;
  doc.setTextColor(30, 25, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(spec.title ?? "Chart", margin, y);
  y += 16;

  if (spec.description) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 115, 110);
    doc.text(spec.description, margin, y);
    y += 14;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(160, 155, 150);
  doc.text(`Exported ${new Date().toLocaleString()}`, margin, y);
  y += 14;

  // Render chart image
  if (pngDataUrl && pngWidth > 0 && pngHeight > 0) {
    const targetW = Math.min(contentW, 620);
    const targetH = (pngHeight / pngWidth) * targetW;
    const imgY = y;
    doc.addImage(pngDataUrl, "PNG", margin, imgY, targetW, targetH);
    y = imgY + targetH + 20;
  }

  // Data table
  const { headers, rows } = chartToRows(spec);
  if (y + 40 > pageH - margin) {
    doc.addPage();
    y = margin;
  }
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: y,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: {
      fillColor: [201, 100, 66],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [250, 248, 243] },
  });

  doc.save(`${safeFilename(spec.title ?? "chart")}-${timestampSlug()}.pdf`);
}

export function downloadChartCSV(spec: ChartSpec): void {
  const { headers, rows } = chartToRows(spec);
  downloadBlob(
    new Blob([toCSV(headers, rows)], { type: "text/csv;charset=utf-8" }),
    `${safeFilename(spec.title ?? "chart")}-${timestampSlug()}.csv`
  );
}

export async function copyChartData(spec: ChartSpec): Promise<void> {
  const { headers, rows } = chartToRows(spec);
  await navigator.clipboard.writeText(
    [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n")
  );
}

// ── KPI grid exports ──────────────────────────────────────────────────────
export async function downloadKpiGridPDF(
  entries: KpiEntry[],
  titleHint = "Key metrics"
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentW = pageW - margin * 2;

  doc.setFillColor(201, 100, 66);
  doc.rect(0, 0, pageW, 5, "F");

  let y = margin + 8;
  doc.setTextColor(30, 25, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(titleHint, margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(140, 135, 130);
  doc.text(`Exported ${new Date().toLocaleString()}`, margin, y);
  y += 18;

  const cardsPerRow = 2;
  const gap = 12;
  const cardW = (contentW - gap * (cardsPerRow - 1)) / cardsPerRow;
  const cardH = 64;
  const accent: Record<string, [number, number, number]> = {
    violet: [139, 92, 246],
    cyan: [6, 182, 212],
    amber: [245, 158, 11],
    emerald: [16, 185, 129],
    pink: [236, 72, 153],
    blue: [59, 130, 246],
  };

  for (let i = 0; i < entries.length; i++) {
    const k = entries[i];
    const col = i % cardsPerRow;
    const row = Math.floor(i / cardsPerRow);
    if (col === 0 && row > 0) y += cardH + gap;
    const x = margin + col * (cardW + gap);
    const [r, g, b] = accent[k.accent ?? ""] ?? [201, 100, 66];

    doc.setFillColor(250, 248, 243);
    doc.setDrawColor(230, 225, 215);
    doc.roundedRect(x, y, cardW, cardH, 6, 6, "FD");
    doc.setFillColor(r, g, b);
    doc.roundedRect(x, y, 3, cardH, 1.5, 1.5, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 115, 110);
    doc.text(String(k.label).toUpperCase(), x + 12, y + 16);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 25, 20);
    doc.text(String(k.value ?? "—"), x + 12, y + 38);

    if (k.delta) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const trendColor: [number, number, number] =
        k.trend === "up"
          ? [16, 185, 129]
          : k.trend === "down"
            ? [220, 80, 60]
            : [140, 140, 140];
      doc.setTextColor(...trendColor);
      doc.text(String(k.delta), x + 12, y + 54);
    }
    if (k.hint) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(140, 135, 130);
      const hintX = k.delta
        ? x + 12 + doc.getTextWidth(String(k.delta)) + 8
        : x + 12;
      doc.text(String(k.hint), hintX, y + 54);
    }
  }

  doc.save(`${safeFilename(titleHint)}-${timestampSlug()}.pdf`);
}

export function downloadKpiGridCSV(
  entries: KpiEntry[],
  titleHint = "key-metrics"
): void {
  const headers = ["Label", "Value", "Delta", "Trend", "Hint"];
  const rows = entries.map((k) => [
    String(k.label),
    String(k.value ?? ""),
    k.delta ?? "",
    k.trend ?? "",
    k.hint ?? "",
  ]);
  downloadBlob(
    new Blob([toCSV(headers, rows)], { type: "text/csv;charset=utf-8" }),
    `${safeFilename(titleHint)}-${timestampSlug()}.csv`
  );
}

export async function copyKpiGrid(entries: KpiEntry[]): Promise<void> {
  const lines = entries.map(
    (k) =>
      `${k.label}: ${k.value}${k.delta ? ` (${k.delta} ${k.trend ?? ""})` : ""}${k.hint ? ` — ${k.hint}` : ""}`
  );
  await navigator.clipboard.writeText(lines.join("\n"));
}

// ── Table exports ─────────────────────────────────────────────────────────
export function downloadTableCSV(
  headers: string[],
  rows: string[][],
  titleHint = "table"
): void {
  downloadBlob(
    new Blob([toCSV(headers, rows)], { type: "text/csv;charset=utf-8" }),
    `${safeFilename(titleHint)}-${timestampSlug()}.csv`
  );
}

export async function copyTable(
  headers: string[],
  rows: string[][]
): Promise<void> {
  await navigator.clipboard.writeText(
    [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n")
  );
}

export async function downloadTablePDF(
  headers: string[],
  rows: string[][],
  titleHint = "Table"
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  doc.setFillColor(201, 100, 66);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 25, 20);
  doc.text(titleHint, margin, margin + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(140, 135, 130);
  doc.text(`Exported ${new Date().toLocaleString()}`, margin, margin + 22);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: margin + 34,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: {
      fillColor: [201, 100, 66],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [250, 248, 243] },
  });

  doc.save(`${safeFilename(titleHint)}-${timestampSlug()}.pdf`);
}

// ── Utilities ─────────────────────────────────────────────────────────────
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
