"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  FileDown,
  FileSpreadsheet,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import VisualToolbar from "./visual-toolbar";
import {
  downloadKpiGridPDF,
  downloadKpiGridCSV,
  copyKpiGrid,
} from "@/lib/visual-export";

export interface KpiEntry {
  label: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down" | "flat";
  hint?: string;
  accent?: "violet" | "cyan" | "amber" | "emerald" | "pink" | "blue";
}

const ACCENT_CLASSES: Record<NonNullable<KpiEntry["accent"]>, string> = {
  violet: "from-violet-500/20 to-violet-500/5 border-violet-500/30",
  cyan: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
  amber: "from-amber-500/20 to-amber-500/5 border-amber-500/30",
  emerald: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30",
  pink: "from-pink-500/20 to-pink-500/5 border-pink-500/30",
  blue: "from-blue-500/20 to-blue-500/5 border-blue-500/30",
};

const ACCENT_DOT: Record<NonNullable<KpiEntry["accent"]>, string> = {
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  pink: "bg-pink-500",
  blue: "bg-blue-500",
};

const DEFAULT_ACCENTS: NonNullable<KpiEntry["accent"]>[] = [
  "violet",
  "cyan",
  "emerald",
  "amber",
  "pink",
  "blue",
];

function TrendBadge({ trend, delta }: { trend?: KpiEntry["trend"]; delta?: string }) {
  if (!delta && !trend) return null;
  const t = trend ?? "flat";
  const Icon = t === "up" ? ArrowUpRight : t === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold font-mono",
        t === "up" &&
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20",
        t === "down" &&
          "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/20",
        t === "flat" &&
          "bg-muted text-muted-foreground ring-1 ring-border/50"
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {delta ?? "0%"}
    </span>
  );
}

function KpiCardImpl({
  entry,
  index = 0,
  compact = false,
}: {
  entry: KpiEntry;
  index?: number;
  compact?: boolean;
}) {
  const accent = entry.accent ?? DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br p-3 shadow-sm",
        "hover:shadow-md transition-shadow",
        ACCENT_CLASSES[accent],
        compact && "p-2.5"
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute top-0 left-0 right-0 h-[2px]",
          ACCENT_DOT[accent]
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
            {entry.label}
          </div>
          <div
            className={cn(
              "mt-1 font-bold text-foreground tracking-tight tabular-nums",
              compact ? "text-lg" : "text-2xl"
            )}
          >
            {entry.value}
          </div>
          {entry.hint && !compact && (
            <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
              {entry.hint}
            </div>
          )}
        </div>
        <TrendBadge trend={entry.trend} delta={entry.delta} />
      </div>
    </motion.div>
  );
}

export const KpiCard = memo(KpiCardImpl);

export function KpiGrid({
  entries,
  compact = false,
  titleHint = "Key metrics",
}: {
  entries: KpiEntry[];
  compact?: boolean;
  titleHint?: string;
}) {
  if (!entries || entries.length === 0) return null;
  const cols =
    entries.length === 1
      ? "grid-cols-1"
      : entries.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : entries.length === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4";

  const run = async (fn: () => Promise<void> | void, name: string) => {
    try {
      await fn();
      toast.success(`${name} downloaded`);
    } catch (err) {
      toast.error(`${name} failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="group relative my-3">
      <VisualToolbar
        label="Download KPIs"
        className="top-1 right-1"
        groups={[
          {
            label: "Key metrics",
            items: [
              {
                label: "PDF report",
                icon: <FileDown className="h-3.5 w-3.5" />,
                onSelect: () =>
                  run(() => downloadKpiGridPDF(entries, titleHint), "PDF"),
              },
              {
                label: "CSV data",
                icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
                onSelect: () =>
                  run(() => downloadKpiGridCSV(entries, titleHint), "CSV"),
              },
            ],
          },
          {
            items: [
              {
                label: "Copy as text",
                icon: <Copy className="h-3.5 w-3.5" />,
                onSelect: async () => {
                  try {
                    await copyKpiGrid(entries);
                    toast.success("Metrics copied");
                  } catch {
                    toast.error("Clipboard blocked");
                  }
                },
              },
            ],
          },
        ]}
      />
      <div className={cn("grid gap-2.5", cols)}>
        {entries.map((entry, i) => (
          <KpiCard
            key={`${entry.label}-${i}`}
            entry={entry}
            index={i}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

export function parseKpiBlock(raw: string): KpiEntry[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const entries: KpiEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const label = typeof item.label === "string" ? item.label : null;
      const value = item.value;
      if (!label || value === undefined || value === null) continue;
      entries.push({
        label,
        value: typeof value === "number" ? value : String(value),
        delta: typeof item.delta === "string" ? item.delta : undefined,
        trend:
          item.trend === "up" || item.trend === "down" || item.trend === "flat"
            ? item.trend
            : undefined,
        hint: typeof item.hint === "string" ? item.hint : undefined,
        accent:
          item.accent &&
          ["violet", "cyan", "amber", "emerald", "pink", "blue"].includes(
            item.accent
          )
            ? item.accent
            : undefined,
      });
    }
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}
