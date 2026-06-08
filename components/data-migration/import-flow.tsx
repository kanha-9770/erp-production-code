"use client";

/**
 * ImportFlow — the "watch your sheet become a table" view.
 *
 * Shown while an import runs. It turns a progress number into something that
 * feels physical: rows visibly fly out of the source sheet (left) and land in
 * the destination table (right), with live throughput + ETA. It's fed a small
 * rolling window of the most-recently-landed rows (never the whole file), so it
 * stays smooth at 7k+ rows.
 *
 * Path-agnostic: works for both the client-chunked static import and the
 * server-side durable job (which only knows a processed count after a reload —
 * in that case it gracefully shows metrics without the row animation).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileSpreadsheet, Table2, ArrowRight, Zap, Clock, CheckCircle2 } from "lucide-react";

export interface LandedRow {
  /** Stable unique key (the source row index works well). */
  key: string;
  /** Cell values aligned to `columns`. */
  cells: string[];
}

interface ImportFlowProps {
  fileName: string;
  targetLabel: string; // where the data is landing (form / page name)
  columns: { id: string; label: string }[];
  landedRows: LandedRow[]; // most-recent-last; component shows the tail
  processed: number;
  total: number;
  percent: number;
  phase?: string; // "stage" | "import" | …
  startedAt: number | null; // ms epoch when the run began (for rate/ETA)
  done?: boolean;
}

const MAX_VISIBLE_ROWS = 8;
const MAX_VISIBLE_COLS = 5;

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 1) return "<1s";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export function ImportFlow({
  fileName,
  targetLabel,
  columns,
  landedRows,
  processed,
  total,
  percent,
  phase,
  startedAt,
  done,
}: ImportFlowProps) {
  // Tick so rate / ETA update smoothly while running.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [done]);

  const elapsedSec = startedAt ? Math.max(0.001, (Date.now() - startedAt) / 1000) : 0;
  const rate = startedAt && processed > 0 ? processed / elapsedSec : 0;
  const remaining = Math.max(0, total - processed);
  const etaSec = rate > 0 ? remaining / rate : Infinity;

  const visibleCols = useMemo(() => columns.slice(0, MAX_VISIBLE_COLS), [columns]);
  const extraCols = Math.max(0, columns.length - visibleCols.length);
  const visibleRows = useMemo(
    () => landedRows.slice(-MAX_VISIBLE_ROWS),
    [landedRows],
  );

  // Count how many distinct rows have flown across (for the source-side stack).
  const flownRef = useRef(0);
  flownRef.current = processed;

  const phaseLabel =
    done ? "Finalizing"
      : phase === "stage" ? "Uploading rows"
      : "Writing to table";

  return (
    <div className="space-y-5">
      {/* ── Metric strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric
          icon={<Table2 className="h-3.5 w-3.5" />}
          label="Imported"
          value={processed.toLocaleString()}
          sub={`of ${total.toLocaleString()}`}
          accent="text-blue-600"
        />
        <Metric
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Speed"
          value={rate > 0 ? `${Math.round(rate).toLocaleString()}` : "—"}
          sub="rows/sec"
          accent="text-emerald-600"
        />
        <Metric
          icon={<Clock className="h-3.5 w-3.5" />}
          label={done ? "Took" : "ETA"}
          value={done ? fmtDuration(elapsedSec) : fmtDuration(etaSec)}
          sub={done ? "total" : "remaining"}
          accent="text-amber-600"
        />
        <Metric
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Progress"
          value={`${percent}%`}
          sub={phaseLabel}
          accent="text-violet-600"
        />
      </div>

      {/* ── Progress bar ── */}
      <div className="space-y-1.5">
        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-blue-600 to-violet-600"
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 24 }}
          />
        </div>
      </div>

      {/* ── The flow: sheet → table ── */}
      <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[180px_auto_1fr] gap-3 items-stretch">
        {/* Source sheet */}
        <div className="hidden sm:flex flex-col rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Source sheet
          </div>
          <p className="text-[11px] font-medium truncate" title={fileName}>{fileName}</p>
          <div className="relative mt-3 flex-1 min-h-[90px]">
            {/* Stacked-paper illusion that shrinks as rows leave */}
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute inset-x-0 rounded-md border bg-background shadow-sm"
                style={{
                  top: i * 6,
                  height: 64,
                  left: i * 4,
                  right: i * 4,
                  opacity: remaining > 0 ? 1 - i * 0.25 : 0.2,
                  transition: "opacity 0.4s",
                }}
              >
                <div className="p-2 space-y-1.5">
                  <div className="h-1.5 w-3/4 rounded bg-muted" />
                  <div className="h-1.5 w-1/2 rounded bg-muted" />
                  <div className="h-1.5 w-2/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            <span className="font-semibold text-foreground">{remaining.toLocaleString()}</span> rows left
          </p>
        </div>

        {/* Animated conveyor */}
        <div className="hidden sm:flex items-center justify-center px-1">
          <div className="relative w-full h-8 overflow-hidden">
            {!done && remaining > 0 && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute top-1/2 -translate-y-1/2"
                    initial={{ left: "-10%", opacity: 0 }}
                    animate={{ left: "110%", opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.36, ease: "easeInOut" }}
                  >
                    <ArrowRight className="h-4 w-4 text-blue-500" />
                  </motion.div>
                ))}
              </>
            )}
            {(done || remaining === 0) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}
          </div>
        </div>

        {/* Destination table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 border-b bg-muted/40">
            <Table2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="truncate">{targetLabel}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              live
              <span className="inline-block ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse align-middle" />
            </span>
          </div>

          {visibleCols.length > 0 ? (
            <div className="overflow-hidden">
              {/* header */}
              <div
                className="grid gap-px bg-muted/60 text-[10px] font-medium text-muted-foreground"
                style={{ gridTemplateColumns: `repeat(${visibleCols.length}, minmax(0,1fr))` }}
              >
                {visibleCols.map((c) => (
                  <div key={c.id} className="px-2 py-1.5 bg-muted/40 truncate" title={c.label}>
                    {c.label}{extraCols > 0 && c === visibleCols[visibleCols.length - 1] ? ` +${extraCols}` : ""}
                  </div>
                ))}
              </div>
              {/* streaming rows */}
              <div className="min-h-[150px]">
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleRows.map((r) => (
                    <motion.div
                      key={r.key}
                      layout
                      initial={{ opacity: 0, y: -14, backgroundColor: "rgba(59,130,246,0.16)" }}
                      animate={{ opacity: 1, y: 0, backgroundColor: "rgba(59,130,246,0)" }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                      className="grid gap-px border-b last:border-b-0 text-[11px]"
                      style={{ gridTemplateColumns: `repeat(${visibleCols.length}, minmax(0,1fr))` }}
                    >
                      {visibleCols.map((c, ci) => (
                        <div key={c.id} className="px-2 py-1.5 truncate" title={r.cells[ci]}>
                          {r.cells[ci] || <span className="text-muted-foreground/40">—</span>}
                        </div>
                      ))}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {visibleRows.length === 0 && (
                  <div className="flex items-center justify-center h-[150px] text-xs text-muted-foreground">
                    Waiting for the first rows to land…
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-xs text-muted-foreground">
              Importing {total.toLocaleString()} rows…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode; label: string; value: string; sub: string; accent: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className={accent}>{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold leading-none tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
