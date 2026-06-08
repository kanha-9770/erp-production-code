"use client";

/**
 * FailedRowsEditor — shown after an import when some rows couldn't be written.
 * Each failed row is rendered with its error message and editable cells for the
 * mapped columns, so the user can fix the data in place and retry ONLY those
 * rows (no re-upload, no re-importing the whole file).
 *
 * One-click "Fix all": mechanically-fixable failures (e.g. "Missing item code"
 * on a row whose key column is mapped but blank) are auto-filled with generated
 * unique codes, flashed green, and retried — all from a single click.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, RefreshCw, Download, Loader2, Wand2 } from "lucide-react";

export interface FailedRow {
  rowIndex: number;
  error: string;
  row: Record<string, string>;
}

interface Props {
  rows: FailedRow[];
  /** Mapped source columns to expose for editing (sourceColumn + its field label). */
  columns: { sourceColumn: string; label: string }[];
  onRetry: (editedRows: Record<string, string>[]) => void;
  onDownloadCsv: () => void;
  /** Given a row's error, the source column to auto-fill (or null if not auto-fixable). */
  autoFixColumnForError: (error: string) => string | null;
  /** Generates a fresh unique value (e.g. an item code) for an auto-fixed cell. */
  generateValue: () => string;
  busy: boolean;
}

export function FailedRowsEditor({ rows, columns, onRetry, onDownloadCsv, autoFixColumnForError, generateValue, busy }: Props) {
  // Editable working copies (index-aligned with `rows`). Reset whenever the
  // failed set changes (e.g. after a retry leaves a smaller set behind).
  const [edited, setEdited] = useState<Record<string, string>[]>(() => rows.map((r) => ({ ...r.row })));
  const [flashed, setFlashed] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  useEffect(() => { setEdited(rows.map((r) => ({ ...r.row }))); setFlashed(new Set()); setApplying(false); }, [rows]);

  const setCell = (i: number, col: string, val: string) =>
    setEdited((prev) => prev.map((r, idx) => (idx === i ? { ...r, [col]: val } : r)));

  // Rows we can resolve automatically: a "Missing <key>" error whose mapped key
  // column is currently blank.
  const fixable = useMemo(() => {
    const out: { i: number; col: string }[] = [];
    rows.forEach((r, i) => {
      const col = autoFixColumnForError(r.error);
      if (col && String(edited[i]?.[col] ?? "").trim() === "") out.push({ i, col });
    });
    return out;
  }, [rows, edited, autoFixColumnForError]);

  const handleFixAll = () => {
    if (!fixable.length || applying || busy) return;
    setApplying(true);
    const next = edited.map((r, i) => {
      const f = fixable.find((p) => p.i === i);
      return f ? { ...r, [f.col]: generateValue() } : r;
    });
    setEdited(next);
    setFlashed(new Set(fixable.map((p) => `${p.i}:${p.col}`)));
    // Let the green flash play, then retry the whole set in the same click.
    setTimeout(() => onRetry(next), 850);
  };

  if (!rows.length) return null;
  const disabled = busy || applying;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/50 overflow-hidden text-left">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-amber-200 bg-amber-100/60">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-sm font-semibold">{rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"} to fix</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {fixable.length > 0 ? "Fix all auto-resolves missing codes, or edit any cell." : "Edit the values, then retry."}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDownloadCsv} disabled={disabled}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
          {fixable.length > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={handleFixAll}
              disabled={disabled}
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
              Fix all {fixable.length.toLocaleString()}
            </Button>
          )}
          <Button size="sm" variant={fixable.length > 0 ? "outline" : "default"} className="h-7 text-xs" onClick={() => onRetry(edited)} disabled={disabled}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Retry {rows.length.toLocaleString()}
          </Button>
        </div>
      </div>

      <div className="overflow-auto max-h-[360px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted">
              <th className="px-2 py-1.5 text-left font-medium w-[220px] border-b">Error</th>
              {columns.map((c) => (
                <th key={c.sourceColumn} className="px-2 py-1.5 text-left font-medium whitespace-nowrap border-b min-w-[140px]">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <motion.tr
                key={`${r.rowIndex}-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.4) }}
                className="border-t align-top hover:bg-amber-50"
              >
                <td className="px-2 py-1.5 text-[11px] text-red-600 max-w-[240px] break-words">{r.error}</td>
                {columns.map((c) => {
                  const isFlashed = flashed.has(`${i}:${c.sourceColumn}`);
                  return (
                    <td key={c.sourceColumn} className="px-1 py-1">
                      <motion.div
                        className="rounded"
                        initial={false}
                        animate={isFlashed ? { backgroundColor: ["rgba(16,185,129,0.40)", "rgba(16,185,129,0)"] } : { backgroundColor: "rgba(16,185,129,0)" }}
                        transition={{ duration: 1.1, ease: "easeOut" }}
                      >
                        <Input
                          value={edited[i]?.[c.sourceColumn] ?? ""}
                          onChange={(e) => setCell(i, c.sourceColumn, e.target.value)}
                          className="h-7 text-xs bg-white"
                          disabled={disabled}
                        />
                      </motion.div>
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
