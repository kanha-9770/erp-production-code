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
import {
  Columns3, RotateCcw, Check, Lock, Search, X, EyeOff, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
   * by Real-Estate tables (Properties / Transactions / Leads / Agents).
   * "dialog" opens the full-screen modal with search + section grouping —
   * opted into by HR/Performance/Employee-Engagement tables which have
   * many more columns to browse.
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
  // modal. Section-grouped card grid with a search box, per-section bulk
  // toggles, and a reset/apply footer. All state flows through the same
  // useTablePrefs hook so changes propagate live to the DataTable.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
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
        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setSearch(""); // clear search on close so next open is fresh
          }}
        >
          <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
            {/* ── Header ─────────────────────────────────────────────── */}
            <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <DialogTitle className="text-base font-semibold flex items-center gap-2">
                    <Columns3 className="h-4 w-4 text-muted-foreground" />
                    Manage Columns
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Choose which columns appear in the table. Pinned columns always show.
                  </DialogDescription>
                </div>
                <Badge variant="secondary" className="text-[11px] font-semibold tabular-nums shrink-0">
                  {visibleCount} / {totalCount}
                </Badge>
              </div>
            </DialogHeader>

            {/* ── Toolbar (search + bulk actions) ────────────────────── */}
            <div className="px-6 py-3 border-b shrink-0 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search columns…"
                  className="h-8 pl-8 pr-8 text-sm"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={showAll}
                disabled={!hasAnyHidden}
                title="Show every column"
              >
                <Eye className="h-3.5 w-3.5" />
                Show all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={hideAll}
                disabled={visibleCount <= columns.filter((c) => c.pinned).length}
                title="Hide every non-pinned column"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Hide all
              </Button>
            </div>

            {/* ── Section-grouped column grid ────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0">
              {(() => {
                // Bucket columns by group (declaration order preserved so
                // sections appear in form order). Pinned columns always
                // land under "Always visible" at the top.
                const groups: { name: string; columns: typeof columns }[] = [];
                const byName = new Map<string, typeof columns>();
                const searchLower = search.trim().toLowerCase();
                for (const c of columns) {
                  // Filter by search before grouping so empty sections
                  // disappear instead of showing as headers with no cards.
                  if (searchLower) {
                    const label =
                      typeof c.header === "string" ? c.header : c.id;
                    if (
                      !label.toLowerCase().includes(searchLower) &&
                      !c.id.toLowerCase().includes(searchLower)
                    ) {
                      continue;
                    }
                  }
                  const name = c.pinned ? "Always visible" : (c.group ?? "Other");
                  if (!byName.has(name)) {
                    const arr: typeof columns = [];
                    byName.set(name, arr);
                    groups.push({ name, columns: arr });
                  }
                  byName.get(name)!.push(c);
                }

                // Empty-state when search filters out everything.
                if (groups.length === 0) {
                  return (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No columns match <span className="font-medium text-foreground">"{search}"</span>
                    </div>
                  );
                }

                return groups.map((g) => {
                  // Per-section bulk-toggle state.
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
                  const handleSectionToggle = () => {
                    for (const c of sectionToggleable) setColumnVisible(c.id, !allOn);
                  };
                  const isAlwaysVisible = g.name === "Always visible";
                  return (
                    <section key={g.name} className="space-y-2.5">
                      {/* Section header — non-sticky so it never overlaps
                          the cards. Border-top + padding clearly separates
                          one section from the next. */}
                      <header className="flex items-center justify-between gap-3 pb-2 border-b border-border/60">
                        <div className="flex items-center gap-2 min-w-0">
                          {isAlwaysVisible && (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          )}
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/70">
                            {g.name}
                          </h3>
                          <span className="text-[10px] text-muted-foreground tabular-nums font-medium">
                            {sectionVisible}/{sectionTotal}
                          </span>
                        </div>
                        {sectionToggleable.length > 0 && (
                          <button
                            type="button"
                            onClick={handleSectionToggle}
                            className="text-[11px] font-medium text-primary hover:underline shrink-0 transition-colors"
                          >
                            {allOn ? "Hide section" : "Show all"}
                          </button>
                        )}
                      </header>

                      {/* Cards. role=checkbox div pattern avoids the
                          nested-button issue (Radix Checkbox is itself a
                          button). pointer-events-none on the Checkbox lets
                          the outer div handle the click. */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {g.columns.map((c) => {
                          const isPinned = !!c.pinned;
                          const explicit = prefs.hidden[c.id];
                          const effectivelyHidden =
                            explicit === true
                              ? true
                              : explicit === false
                                ? false
                                : !!c.defaultHidden;
                          const isChecked = !effectivelyHidden;
                          const handleToggle = () => {
                            if (isPinned) return;
                            toggleHidden(c.id, !!c.defaultHidden);
                          };
                          const label =
                            typeof c.header === "string" && c.header.trim().length > 0
                              ? c.header
                              : c.id;
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
                                "group flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-all select-none outline-none",
                                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                isPinned
                                  ? "border-muted bg-muted/30 cursor-not-allowed"
                                  : isChecked
                                    ? "border-primary/40 bg-primary/[0.03] cursor-pointer hover:border-primary hover:bg-primary/[0.06]"
                                    : "border-border bg-card cursor-pointer hover:border-primary/30 hover:bg-muted/40",
                              )}
                            >
                              <Checkbox
                                checked={isChecked}
                                disabled={isPinned}
                                tabIndex={-1}
                                className="h-4 w-4 flex-none pointer-events-none"
                              />
                              <span
                                className={cn(
                                  "flex-1 min-w-0 truncate text-sm",
                                  isChecked ? "font-medium text-foreground" : "text-foreground/80",
                                )}
                                title={label}
                              >
                                {label}
                              </span>
                              {isPinned && (
                                <Lock className="h-3 w-3 text-muted-foreground flex-none" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                });
              })()}
            </div>

            {/* ── Footer ─────────────────────────────────────────────── */}
            <DialogFooter className="px-6 py-3 border-t flex items-center justify-between gap-2 sm:justify-between shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={reset}
                title="Restore default columns"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to defaults
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-4 gap-1.5"
                  onClick={() => setDialogOpen(false)}
                >
                  <Check className="h-3.5 w-3.5" />
                  Done
                </Button>
              </div>
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
