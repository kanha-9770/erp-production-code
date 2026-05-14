"use client";

/**
 * ManageColumnsButton — discoverable column-visibility popover for the
 * real-estate workspace tables.
 *
 * The DataTable already has a gear menu inside its header row, but it's
 * easy to miss. This component surfaces the same capability as a top-level
 * filter-bar button alongside the search input and AdvancedFilter, so the
 * "where do I show/hide columns?" question stops getting asked.
 *
 * State is wired to the same {@link useTablePrefs} hook DataTable already
 * consumes, keyed by `tableId`. Toggling here updates the same
 * localStorage entry; no extra wiring required.
 *
 * Pinned columns are listed but disabled — they can't be hidden (the
 * spreadsheet metaphor relies on them always being on screen).
 */

import { useMemo } from "react";
import { Columns3, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTablePrefs } from "./table-prefs";
import type { ColumnDef } from "./data-table";

interface ManageColumnsButtonProps<T> {
  tableId: string;
  columns: ColumnDef<T>[];
  className?: string;
  triggerLabel?: string;
}

export function ManageColumnsButton<T>({
  tableId,
  columns,
  className,
  triggerLabel = "Columns",
}: ManageColumnsButtonProps<T>) {
  const { prefs, toggleHidden, reset } = useTablePrefs(tableId);

  // Number of toggleable (non-pinned) columns currently visible.
  const visibleCount = useMemo(() => {
    return columns.reduce((n, c) => {
      if (c.pinned) return n + 1;
      const userHidden = prefs.hidden[c.id];
      if (userHidden) return n;
      const userTouched = prefs.hidden[c.id] !== undefined;
      if (!userTouched && c.defaultHidden) return n;
      return n + 1;
    }, 0);
  }, [columns, prefs.hidden]);

  const totalCount = columns.length;
  const hasAnyHidden = visibleCount < totalCount;

  const showAll = () => {
    // Clear every entry from the user-pref hidden map so even
    // defaultHidden columns become visible.
    for (const c of columns) {
      if (prefs.hidden[c.id]) toggleHidden(c.id);
    }
    // Also flip on the defaultHidden columns explicitly — toggleHidden
    // treats absence as "user hasn't touched", which would leave
    // defaultHidden columns hidden. So we set them visible.
    for (const c of columns) {
      if (c.defaultHidden && prefs.hidden[c.id] === undefined) {
        // Setting then unsetting marks it as "user-touched, visible".
        toggleHidden(c.id);
        toggleHidden(c.id);
      }
    }
  };

  const hideAll = () => {
    for (const c of columns) {
      if (c.pinned) continue;
      const isVisible =
        !prefs.hidden[c.id] &&
        !(c.defaultHidden && prefs.hidden[c.id] === undefined);
      if (isVisible) toggleHidden(c.id);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5", className)}
        >
          <Columns3 className="h-3.5 w-3.5" />
          <span>{triggerLabel}</span>
          <Badge
            variant="secondary"
            className="ml-0.5 h-4 min-w-4 px-1 text-[10px] font-semibold"
          >
            {visibleCount}/{totalCount}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-0"
      >
        <div className="border-b px-3 py-2.5">
          <div className="text-sm font-semibold">Manage columns</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Choose which columns are visible. Pinned columns always show.
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {columns.map((c) => {
            const isPinned = !!c.pinned;
            const userHidden = !!prefs.hidden[c.id];
            const userTouched = prefs.hidden[c.id] !== undefined;
            const effectivelyHidden =
              userHidden || (!userTouched && !!c.defaultHidden);
            const isChecked = !effectivelyHidden;

            return (
              <button
                key={c.id}
                type="button"
                disabled={isPinned}
                onClick={() => toggleHidden(c.id)}
                className={cn(
                  "w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                  "hover:bg-muted/60 transition-colors",
                  isPinned && "opacity-60 cursor-not-allowed hover:bg-transparent",
                )}
              >
                <Checkbox
                  checked={isChecked}
                  disabled={isPinned}
                  className="h-3.5 w-3.5"
                  // Prevent double-toggling: the outer button handles it.
                  onClick={(e) => e.preventDefault()}
                />
                <span className="flex-1 truncate">
                  {typeof c.header === "string" ? c.header : c.id}
                </span>
                {isPinned && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1">
                    pinned
                  </Badge>
                )}
                {c.defaultHidden && !userTouched && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground">
                    optional
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t px-3 py-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={reset}
            title="Restore default columns"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={hideAll}
              disabled={!hasAnyHidden && visibleCount <= 1}
            >
              Hide all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={showAll}
              disabled={!hasAnyHidden}
            >
              <Check className="h-3 w-3" />
              Show all
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
