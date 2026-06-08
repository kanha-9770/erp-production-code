/**
 * Pure spreadsheet → preview parsing for the data-migration importer.
 *
 * This is the heavy lifting (XLSX decode + section detection + row
 * normalisation) extracted out of the FileUpload component so it can run inside
 * a Web Worker — keeping the multi-second `XLSX.read` off the main thread so the
 * page never freezes on large files. The SAME function is the main-thread
 * fallback (lazy-imported) when a worker can't be created.
 *
 * IMPORTANT: only the Web Worker and the lazy fallback import this module, so
 * `xlsx` (~300 KB gzipped) stays out of the main page bundle. Components must
 * import only the `ParsedFilePreview` TYPE from here (type-only = erased).
 */

import * as XLSX from "xlsx";

interface ColumnGroup {
  sectionTitle: string;
  columns: string[];
  startIndex: number;
}

export interface ParsedFilePreview {
  headers: string[];
  rows: string[][]; // preview rows (limited for display)
  allRows: string[][]; // ALL rows for the actual import
  totalRows: number;
  columnGroups?: ColumnGroup[];
}

export interface ParseProgress {
  /** Coarse phase label for the UI. */
  phase: "parsing" | "normalizing";
  /** 0–100. */
  percent: number;
}

const PREVIEW_ROWS_LIMIT = 50;

/**
 * Decode a spreadsheet file's raw content into a {@link ParsedFilePreview}.
 *
 * @param content  CSV text (when `isCsv`) or the file's ArrayBuffer.
 * @param isCsv    Whether `content` is a CSV string vs. an XLSX binary.
 * @param onProgress  Optional coarse progress sink (phase + percent).
 */
export function parseSpreadsheet(
  content: string | ArrayBuffer,
  isCsv: boolean,
  onProgress?: (p: ParseProgress) => void,
): ParsedFilePreview {
  onProgress?.({ phase: "parsing", percent: 10 });

  const workbook: XLSX.WorkBook = isCsv
    ? XLSX.read(content as string, { type: "string" })
    : XLSX.read(content as ArrayBuffer, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheet found");

  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as string[][];

  if (jsonData.length < 2) {
    throw new Error("File must contain a header row and at least one data row");
  }

  onProgress?.({ phase: "normalizing", percent: 45 });

  // ── DETECT FORMAT: standard CSV vs 2-row section format ──
  // Standard:  row 0 = headers,  row 1+ = data
  // Section:   row 0 = sections, row 1 = headers, row 2+ = data
  const row0 = jsonData[0];
  const row1 = jsonData[1];
  const row0Empty = row0.filter((c) => !String(c || "").trim()).length;
  const row1Empty = row1.filter((c) => !String(c || "").trim()).length;
  const totalCols = Math.max(row0.length, row1.length);
  const hasSectionRow =
    totalCols > 1 && row0Empty > row1Empty && row0Empty > totalCols * 0.3;

  let columnGroups: ColumnGroup[] = [];
  let finalHeaders: string[] = [];
  let dataStartIndex: number;

  if (hasSectionRow) {
    const sectionRow = row0;
    const headerRow = row1;
    dataStartIndex = 2;

    let currentSection = "General";
    let currentColumns: string[] = [];
    let currentStartIndex = 0;

    for (let col = 0; col < headerRow.length; col++) {
      const sectionCell = String(sectionRow[col] || "").trim();
      const headerCell = String(headerRow[col] || "").trim();

      if (sectionCell) {
        if (currentColumns.length > 0) {
          columnGroups.push({
            sectionTitle: currentSection,
            columns: [...currentColumns],
            startIndex: currentStartIndex,
          });
        }
        currentSection = sectionCell;
        currentColumns = [];
        currentStartIndex = col;
      }

      const safeHeader = headerCell || `Column ${col + 1}`;
      finalHeaders.push(safeHeader);
      currentColumns.push(safeHeader);
    }

    if (currentColumns.length > 0) {
      columnGroups.push({
        sectionTitle: currentSection,
        columns: currentColumns,
        startIndex: currentStartIndex,
      });
    }
  } else {
    dataStartIndex = 1;
    finalHeaders = row0.map((cell, idx) => {
      const val = String(cell || "").trim();
      return val || `Column ${idx + 1}`;
    });
  }

  // ── ROW NORMALIZATION ──
  // One manual pass (instead of slice().map().filter()) so we can report
  // progress to the UI for very tall files.
  const colCount = finalHeaders.length;
  const allDataRows: string[][] = [];
  const dataLen = jsonData.length - dataStartIndex;
  for (let i = dataStartIndex; i < jsonData.length; i++) {
    const raw = jsonData[i];
    const norm = new Array<string>(colCount);
    let nonEmpty = false;
    for (let c = 0; c < colCount; c++) {
      const v = String(raw[c] ?? "");
      norm[c] = v;
      if (!nonEmpty && v.trim() !== "") nonEmpty = true;
    }
    if (nonEmpty) allDataRows.push(norm);

    // Emit progress every ~5k rows (45 → 95%).
    if (onProgress && dataLen > 0 && (i - dataStartIndex) % 5000 === 0) {
      onProgress({ phase: "normalizing", percent: 45 + Math.round(((i - dataStartIndex) / dataLen) * 50) });
    }
  }

  onProgress?.({ phase: "normalizing", percent: 100 });

  return {
    headers: finalHeaders,
    rows: allDataRows.slice(0, PREVIEW_ROWS_LIMIT),
    allRows: allDataRows,
    totalRows: allDataRows.length,
    columnGroups: hasSectionRow ? columnGroups : undefined,
  };
}
