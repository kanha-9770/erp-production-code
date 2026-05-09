"use client";

import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * A row of filter "chips" — single-select pills that map onto a single
 * filter value (status, type, etc). Click an active chip to clear; click a
 * different chip to switch.
 *
 * Looks like a tab strip but behaves like a single-select control. Faster
 * than a Select dropdown for small option sets (~3-7 values).
 */

export interface ChipOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Optional count badge on the right of the label. */
  count?: number;
  /** Hex tint (e.g. green for ACTIVE, red for SUSPENDED). */
  tint?: string;
}

interface FilterChipsProps<V extends string> {
  value: V | "";
  onChange: (next: V | "") => void;
  options: ChipOption<V>[];
  /** Label rendered before the chip row (e.g. "Status"). */
  label?: ReactNode;
  className?: string;
  /** Whether to render a leading "All" chip. */
  showAll?: boolean;
  allLabel?: string;
  allCount?: number;
}

export function FilterChips<V extends string>({
  value,
  onChange,
  options,
  label,
  className,
  showAll = true,
  allLabel = "All",
  allCount,
}: FilterChipsProps<V>) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label && (
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mr-1">
          {label}
        </span>
      )}
      {showAll && (
        <Chip
          active={value === ""}
          onClick={() => onChange("")}
          tint={null}
          count={allCount}
        >
          {allLabel}
        </Chip>
      )}
      {options.map((o) => (
        <Chip
          key={o.value}
          active={value === o.value}
          onClick={() => onChange(value === o.value ? "" : o.value)}
          tint={o.tint ?? null}
          count={o.count}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  tint,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  tint: string | null;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5",
        "border transition-colors select-none",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background text-foreground hover:bg-accent border-border",
      )}
    >
      {tint && !active && (
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: tint }}
        />
      )}
      <span>{children}</span>
      {count != null && (
        <span
          className={cn(
            "tabular-nums text-[10px] px-1.5 rounded-full",
            active
              ? "bg-primary-foreground/20"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * "Active filters" summary row — render below filter inputs to show what's
 * applied and let the user clear individual filters without scanning the
 * controls. Matches the shadcn input/select aesthetic.
 */
export function ActiveFilterPills({
  filters,
  onClear,
  onClearAll,
}: {
  filters: Array<{ key: string; label: ReactNode }>;
  onClear: (key: string) => void;
  onClearAll?: () => void;
}) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Filters:</span>
      {filters.map((f) => (
        <Badge
          key={f.key}
          variant="secondary"
          className="gap-1 pl-2 pr-1 py-0.5 font-normal"
        >
          {f.label}
          <button
            type="button"
            onClick={() => onClear(f.key)}
            className="hover:bg-foreground/10 rounded-full p-0.5"
            aria-label={`Clear ${f.key}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {onClearAll && (
        <Button variant="link" size="sm" onClick={onClearAll} className="h-auto p-0 text-xs">
          Clear all
        </Button>
      )}
    </div>
  );
}
