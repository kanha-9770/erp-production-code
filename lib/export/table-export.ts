/**
 * Adapter that turns workspace DataTable rows + columns into a downloadable
 * spreadsheet. Reuses the shared exporters in lib/utils/export-utils (xlsx via
 * dynamic import, CSV fallback, browser download) — this file only handles the
 * column → record mapping so callers don't repeat it.
 */

import { exportToCSV, exportToXLSX } from "@/lib/utils/export-utils";

export interface ExportColumn<T> {
  /** Header label written to the first row / used as the record key. */
  header: string;
  /** Plain-text value for a given row. */
  value: (row: T) => string;
}

export interface ExportTableOptions<T> {
  rows: T[];
  columns: ExportColumn<T>[];
  /** Filename WITHOUT extension — the exporter appends .xlsx / .csv. */
  filename: string;
  format: "xlsx" | "csv";
}

/**
 * Build one record per row keyed by the (de-duplicated) column headers, in the
 * given column order, then hand off to the shared exporter.
 */
export async function exportTableRows<T>({
  rows,
  columns,
  filename,
  format,
}: ExportTableOptions<T>): Promise<void> {
  // Ensure header keys are unique — duplicate object keys would silently
  // collapse columns. Suffix repeats with " (2)", " (3)", …
  const seen = new Map<string, number>();
  const keys = columns.map((c) => {
    const base = c.header || "Column";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });

  const data = rows.map((row) => {
    const rec: Record<string, string> = {};
    columns.forEach((c, i) => {
      rec[keys[i]] = c.value(row) ?? "";
    });
    return rec;
  });

  if (format === "csv") {
    exportToCSV({ filename: `${filename}.csv`, data, columns: keys });
  } else {
    await exportToXLSX({ filename, data, columns: keys });
  }
}
