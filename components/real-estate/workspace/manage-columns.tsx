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

import { useMemo, useState } from "react";
import { Columns3, RotateCcw, Check, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTablePrefs } from "./table-prefs";
import type { ColumnDef } from "./data-table";

interface ManageColumnsButtonProps<T> {
  tableId: string;
  columns: ColumnDef<T>[];
  className?: string;
  triggerLabel?: string;
  /**
   * Presentation style. "popover" (default) renders the compact list used
   * by the real-estate / employee-engagement tables; "dialog" renders the
   * full-screen modal with a 2-column card grid that matches the dynamic
   * form-builder's Manage Columns UI.
   */
  variant?: "popover" | "dialog";
}

export function ManageColumnsButton<T>({
  tableId,
  columns,
  className,
  triggerLabel = "Columns",
  variant = "popover",
}: ManageColumnsButtonProps<T>) {
  const { prefs, toggleHidden, setColumnVisible, reset } = useTablePrefs(tableId);

  // Helper: effective visibility for a column (matches data-table's logic).
  const isEffectivelyVisible = (c: ColumnDef<T>) => {
    if (c.pinned) return true;
    const explicit = prefs.hidden[c.id];
    if (explicit === true) return false;
    if (explicit === false) return true;
    return !c.defaultHidden;
  };

  // Number of toggleable (non-pinned) columns currently visible.
  const visibleCount = useMemo(() => {
    return columns.reduce((n, c) => (isEffectivelyVisible(c) ? n + 1 : n), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, prefs.hidden]);

  const totalCount = columns.length;
  const hasAnyHidden = visibleCount < totalCount;

  const showAll = () => {
    // Explicitly set every column to visible. Pinned are always visible
    // anyway but writing the override is harmless.
    for (const c of columns) setColumnVisible(c.id, true);
  };

  const hideAll = () => {
    for (const c of columns) {
      if (c.pinned) continue;
      setColumnVisible(c.id, false);
    }
  };

  // The dialog variant matches the dynamic form-builder's "Manage Columns"
  // modal — a centered card grid with a Select-All header and an Apply
  // Changes footer. Keeps the same toggle / showAll / hideAll handlers so
  // the underlying state still flows through useTablePrefs.
  const [dialogOpen, setDialogOpen] = useState(false);
  if (variant === "dialog") {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5", className)}
          onClick={() => setDialogOpen(true)}
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle className="text-lg">Manage Columns</DialogTitle>
              <DialogDescription>
                Select which columns are visible. Pinned columns always show.
              </DialogDescription>
            </DialogHeader>

            {/* Select All + counter. DIV not button (Radix Checkbox is
                already a button — can't nest button-in-button). */}
            <div className="px-6 py-3 flex items-center justify-between border-b">
              <div
                role="checkbox"
                aria-checked={visibleCount === totalCount}
                tabIndex={0}
                onClick={() => {
                  // If anything is hidden, show all; otherwise hide all
                  // toggleable. Pinned columns are always preserved.
                  if (hasAnyHidden) showAll();
                  else hideAll();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (hasAnyHidden) showAll();
                    else hideAll();
                  }
                }}
                className="flex items-center gap-2 text-sm font-medium hover:opacity-80 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              >
                <Checkbox
                  checked={visibleCount === totalCount}
                  tabIndex={-1}
                  className="h-4 w-4 pointer-events-none"
                />
                Select All
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {visibleCount} / {totalCount} visible
              </span>
            </div>

            {/* Section-grouped column list. Columns with a `group` field
                are bucketed under their group's header; everything else
                falls into "Other". Pinned columns always lead, regardless
                of their group, so users see the locked rows first. */}
            <div className="max-h-[55vh] overflow-y-auto px-6 py-4 space-y-5">
              {(() => {
                // Bucket columns by group, preserving the order they were
                // declared in the page's columns array (so sections stay
                // in form-order automatically).
                const groups: { name: string; columns: typeof columns }[] = [];
                const byName = new Map<string, typeof columns>();
                for (const c of columns) {
                  const name = c.pinned ? "Always visible" : (c.group ?? "Other");
                  if (!byName.has(name)) {
                    const arr: typeof columns = [];
                    byName.set(name, arr);
                    groups.push({ name, columns: arr });
                  }
                  byName.get(name)!.push(c);
                }
                return groups.map((g) => {
                  // Per-section visible count for the header pill.
                  const sectionVisible = g.columns.reduce((n, c) => {
                    if (c.pinned) return n + 1;
                    const explicit = prefs.hidden[c.id];
                    const eff =
                      explicit === true
                        ? true
                        : explicit === false
                          ? false
                          : !!c.defaultHidden;
                    return eff ? n : n + 1;
                  }, 0);
                  const sectionTotal = g.columns.length;
                  // Per-section bulk toggles. Skip pinned (they're locked).
                  const sectionToggleable = g.columns.filter((c) => !c.pinned);
                  const allOn = sectionToggleable.every((c) => {
                    const explicit = prefs.hidden[c.id];
                    const eff =
                      explicit === true
                        ? true
                        : explicit === false
                          ? false
                          : !!c.defaultHidden;
                    return !eff;
                  });
                  const handleSectionToggle = () => {
                    for (const c of sectionToggleable) setColumnVisible(c.id, !allOn);
                  };
                  return (
                    <div key={g.name} className="space-y-3">
                      <div className="flex items-center justify-between gap-3 sticky top-0 bg-background pt-1 pb-2 -mt-1 border-b">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/80">
                            {g.name}
                          </h3>
                          <Badge variant="secondary" className="text-[10px] font-semibold">
                            {sectionVisible} / {sectionTotal}
                          </Badge>
                        </div>
                        {sectionToggleable.length > 0 && (
                          <button
                            type="button"
                            onClick={handleSectionToggle}
                            className="text-[11px] font-medium text-primary hover:underline shrink-0"
                          >
                            {allOn ? "Hide all in section" : "Show all in section"}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {g.columns.map((c) => {
                  const isPinned = !!c.pinned;
                  // Tri-state: explicit override wins, else defaultHidden.
                  const explicit = prefs.hidden[c.id];
                  const effectivelyHidden =
                    explicit === true
                      ? true
                      : explicit === false
                        ? false
                        : !!c.defaultHidden;
                  const isChecked = !effectivelyHidden;
                  const isUntouched = explicit === undefined;
                  const handleToggle = () => {
                    if (isPinned) return;
                    // Pass defaultHidden so the tri-state toggle knows what
                    // the "no explicit override" case means and can flip
                    // correctly even for defaultHidden columns.
                    toggleHidden(c.id, !!c.defaultHidden);
                  };
                  return (
                    <div
                      key={c.id}
                      role="checkbox"
                      aria-checked={isChecked}
                      aria-disabled={isPinned}
                      tabIndex={isPinned ? -1 : 0}
                      onClick={handleToggle}
                      onKeyDown={(e) => {
                        if (isPinned) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleToggle();
                        }
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left transition-colors select-none outline-none",
                        "hover:border-primary/40 hover:bg-muted/30",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        isChecked && "border-primary/40",
                        isPinned
                          ? "opacity-70 cursor-not-allowed hover:border-border hover:bg-card"
                          : "cursor-pointer",
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={isPinned}
                        // Pure visual indicator — clicks are handled by the
                        // outer div above. tabIndex -1 so we don't get a
                        // second tab-stop inside the card.
                        tabIndex={-1}
                        className="h-4 w-4 flex-none pointer-events-none"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {typeof c.header === "string" ? c.header : c.id}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {isPinned && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                              pinned
                            </Badge>
                          )}
                          {c.defaultHidden && isUntouched && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground">
                              optional
                            </Badge>
                          )}
                          {!isPinned && !c.defaultHidden && (
                            <span className="text-[10px] text-muted-foreground">
                              column · {c.id}
                            </span>
                          )}
                        </div>
                      </div>
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-none pointer-events-none" />
                    </div>
                  );
                })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <DialogFooter className="px-6 py-3 border-t flex items-center justify-between gap-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1"
                onClick={reset}
                title="Restore default columns"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to defaults
              </Button>
              <Button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                Apply Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

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
            // Tri-state effective visibility (matches data-table).
            const explicit = prefs.hidden[c.id];
            const effectivelyHidden =
              explicit === true
                ? true
                : explicit === false
                  ? false
                  : !!c.defaultHidden;
            const isChecked = !effectivelyHidden;
            const isUntouched = explicit === undefined;

            return (
              <button
                key={c.id}
                type="button"
                disabled={isPinned}
                onClick={() => toggleHidden(c.id, !!c.defaultHidden)}
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
                {c.defaultHidden && isUntouched && (
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
