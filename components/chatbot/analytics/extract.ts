import { parseChartSpec, type ChartSpec } from "./chart-renderer";
import { parseKpiBlock, type KpiEntry } from "./kpi-card";

// ────────────────────────────────────────────────────────────────────────
// Markdown table extraction — finds GFM tables in the assistant content,
// then converts suitable ones into ChartSpecs so the InsightsPanel can
// render real charts even when the LLM only emits a table.
// ────────────────────────────────────────────────────────────────────────

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.length > 1 && t.includes("|", 1);
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return /^\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(t);
}

function parseTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

export function extractTables(src: string): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const lines = src.split("\n");
  let i = 0;
  while (i < lines.length) {
    if (
      i + 1 < lines.length &&
      isTableRow(lines[i]) &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = parseTableRow(lines[i]);
      const colCount = headers.length;
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        const cells = parseTableRow(lines[i]);
        if (cells.length < colCount) {
          while (cells.length < colCount) cells.push("");
        } else if (cells.length > colCount) {
          cells.length = colCount;
        }
        rows.push(cells);
        i++;
      }
      if (rows.length > 0) tables.push({ headers, rows });
      continue;
    }
    i++;
  }
  return tables;
}

// Try to coerce a cell string into a number. Handles "1,247", "$12.5k",
// "98.2%", "3.4M", "-5", etc. Returns null if it's clearly not numeric.
function coerceNumber(raw: string): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Strip currency symbols, commas, parentheses-for-negative
  let s = trimmed.replace(/[,$€£¥₹]/g, "").trim();
  let sign = 1;
  const parenMatch = s.match(/^\((.*)\)$/);
  if (parenMatch) {
    sign = -1;
    s = parenMatch[1];
  }
  // Percentage
  const isPct = s.endsWith("%");
  if (isPct) s = s.slice(0, -1);
  // Unit suffixes
  let mult = 1;
  const unit = s.slice(-1).toLowerCase();
  if (unit === "k") {
    mult = 1_000;
    s = s.slice(0, -1);
  } else if (unit === "m") {
    mult = 1_000_000;
    s = s.slice(0, -1);
  } else if (unit === "b") {
    mult = 1_000_000_000;
    s = s.slice(0, -1);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return sign * n * mult * (isPct ? 1 : 1);
}

// Turn an extracted table into a ChartSpec. The first column is treated as
// the x/category axis; remaining columns are included as series if they're
// >=70% numeric. Returns null if no viable numeric column exists or if the
// table is too small to be worth charting.
export function tableToChartSpec(
  table: ExtractedTable,
  hint?: { titleFallback?: string }
): ChartSpec | null {
  if (!table || table.headers.length < 2 || table.rows.length < 2) return null;

  const [xHeader, ...rest] = table.headers;

  const numericColumns: { header: string; values: number[] }[] = [];
  for (let col = 1; col < table.headers.length; col++) {
    const header = table.headers[col];
    const values: (number | null)[] = table.rows.map((r) =>
      coerceNumber(r[col] ?? "")
    );
    const numericCount = values.filter((v) => v !== null).length;
    if (numericCount / table.rows.length < 0.7) continue;
    numericColumns.push({
      header,
      values: values.map((v) => (v == null ? 0 : v)),
    });
  }

  if (numericColumns.length === 0) return null;

  const data: Array<Record<string, string | number>> = table.rows.map(
    (row, rowIdx) => {
      const obj: Record<string, string | number> = {
        [xHeader]: row[0] ?? "",
      };
      for (const col of numericColumns) {
        obj[col.header] = col.values[rowIdx];
      }
      return obj;
    }
  );

  // Choose chart type heuristically:
  // - 1 numeric column + 5+ rows + first column looks like dates/months → line
  // - 1 numeric column + <=6 rows → donut (share of total reads well)
  // - Otherwise → bar
  const xLooksLikeTime = /date|time|day|week|month|quarter|year|period/i.test(
    xHeader
  );
  let type: ChartSpec["type"] = "bar";
  if (numericColumns.length === 1) {
    if (xLooksLikeTime && table.rows.length >= 4) type = "line";
    else if (table.rows.length <= 6) type = "donut";
  } else if (numericColumns.length >= 2 && xLooksLikeTime) {
    type = "line";
  }

  const title =
    numericColumns.length === 1
      ? `${numericColumns[0].header} by ${xHeader}`
      : hint?.titleFallback ?? `${xHeader} breakdown`;

  if (type === "donut") {
    return {
      type,
      title,
      nameKey: xHeader,
      y: numericColumns[0].header,
      data,
    };
  }

  return {
    type,
    title,
    x: xHeader,
    data,
    series: numericColumns.map((c) => ({ key: c.header, label: c.header })),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Unified extractor — pulls everything chartable / metric-like out of a
// single assistant message: explicit :::kpi blocks, explicit ```chart
// fences, AND auto-generated charts from markdown tables.
// ────────────────────────────────────────────────────────────────────────

export interface ExtractedAnalytics {
  kpis: KpiEntry[];
  charts: Array<{
    spec: ChartSpec;
    source: "chart-fence" | "auto-table";
  }>;
  tables: ExtractedTable[];
}

export function extractAnalytics(content: string): ExtractedAnalytics {
  const kpis: KpiEntry[] = [];
  const charts: ExtractedAnalytics["charts"] = [];

  // :::kpi blocks
  const kpiRe = /:::kpi\n?([\s\S]*?)(?:\n?:::|$)/g;
  let m: RegExpExecArray | null;
  while ((m = kpiRe.exec(content)) !== null) {
    const parsed = parseKpiBlock(m[1] ?? "");
    if (parsed) kpis.push(...parsed);
  }

  // ```chart fences
  const chartRe = /```chart\n?([\s\S]*?)(?:```|$)/g;
  while ((m = chartRe.exec(content)) !== null) {
    const spec = parseChartSpec(m[1] ?? "");
    if (spec) charts.push({ spec, source: "chart-fence" });
  }

  // Markdown tables → auto charts
  const tables = extractTables(content);
  for (const t of tables) {
    const spec = tableToChartSpec(t);
    if (spec) charts.push({ spec, source: "auto-table" });
  }

  return { kpis, charts, tables };
}
