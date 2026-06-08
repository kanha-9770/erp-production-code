"use client";

/**
 * Excel-like data table for the Real Estate workspace.
 *
 * Behaves like a spreadsheet:
 *   - Row-number gutter on the left (sticky)
 *   - Pinned columns stick to the left after the gutter
 *   - Full grid lines between every cell
 *   - Click a cell to make it active; Shift+click extends a range; drag to
 *     marquee-select; arrow keys move the active cell, Home/End jump within
 *     a row, Ctrl+Home / Ctrl+End jump to corners.
 *   - Ctrl/⌘+C copies the active selection as TSV (tab-separated values),
 *     so a paste straight into Excel / Google Sheets just works.
 *   - Sortable headers (click to cycle asc → desc → none), draggable
 *     resize edge per header, gear menu for column visibility + density.
 *   - Per-table preferences (column visibility, sort, density, widths) are
 *     persisted in localStorage via useTablePrefs.
 *
 * The component is otherwise headless — pages provide rows + ColumnDef[]
 * and own the data fetching / mutation. Inline-edit cells (status etc.)
 * still work by using e.stopPropagation in InlineEditCell so the selection
 * model doesn't fight with the editor.
 */

import {
  ReactNode, useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowUpDown, ArrowUp, ArrowDown, Settings2, Rows3, Rows4,
  Copy as CopyIcon,
} from "lucide-react";
import { useTablePrefs } from "./table-prefs";
import { useIsMobile } from "@/hooks/use-mobile";

export interface ColumnDef<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Plain-text value for clipboard / TSV export. Defaults to a blank cell. */
  copyValue?: (row: T) => string;
  /** Default width in px (used when user hasn't resized). */
  width?: number;
  minWidth?: number;
  /** Pinned columns are always visible AND stick to the left in Excel style. */
  pinned?: boolean;
  /** Header click sorts when set; passed to onSortChange. */
  sortKey?: string;
  /** Right-align — also marks the column as numeric for copy/paste. */
  align?: "left" | "right";
  defaultHidden?: boolean;
  cellClassName?: string;
  /**
   * Logical section the column belongs to (e.g. "Personal Information",
   * "Bank Details"). The Manage Columns dialog groups columns by this label
   * so HR can find a field by section rather than scanning a flat list.
   * Falls back to "Other" when unset.
   */
  group?: string;
}

interface DataTableProps<T> {
  tableId: string;
  columns: ColumnDef<T>[];
  rows: T[];
  rowId: (row: T) => string;
  isLoading?: boolean;
  selectedId?: string | null;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  onSortChange?: (column: string | null, direction: "asc" | "desc" | null) => void;
  /**
   * When set (> 0), the table paginates client-side: only this many rows
   * render at a time and a Previous/Next footer appears. Omit to render
   * every row (the original behaviour the Real Estate pages rely on).
   */
  pageSize?: number;
  /**
   * Controlled (server-side) pagination. When supplied, the table does NOT
   * slice `rows` itself — it renders exactly the `rows` given (already the
   * current page) and drives the footer from these values, calling
   * `onPageChange` when the user clicks Previous/Next. Use this for true
   * server-side pagination where each page is a separate fetch.
   */
  serverPagination?: {
    page: number; // 0-based current page
    pageSize: number;
    total: number; // total rows across all pages
    onPageChange: (page: number) => void;
  };
  /**
   * Opt-in row selection (checkboxes in the gutter + select-all on the current
   * page + shift-click range). Omit entirely and the table behaves exactly as
   * before — no checkbox column, identical layout. The parent owns the set and
   * decides what the bulk actions are.
   */
  selection?: {
    selectedIds: Set<string>;
    onChange: (next: Set<string>) => void;
  };
  /**
   * Opt-in: render an extra header row above the column headers that spans each
   * run of consecutive visible columns sharing the same `group`, labelled with
   * that group. Off by default so existing tables are unchanged. Used by dense,
   * sectioned masters (e.g. Product Master) to show section names above fields.
   */
  groupHeaders?: boolean;
  /**
   * Optional per-group background colour (any CSS colour) for the group-header
   * row. Keyed by the column `group` label. Cells with a colour render white,
   * bold text; groups without one fall back to the muted style.
   */
  groupColors?: Record<string, string>;
}

interface CellRef { r: number; c: number }

/**
 * Build the visible-column list once per render. Honours user-pref hidden
 * map plus the column's own defaultHidden flag (only when the user has never
 * touched the column — once they set anything explicit, defaultHidden is
 * ignored).
 */
function useVisibleColumns<T>(
  columns: ColumnDef<T>[],
  hidden: Record<string, boolean>,
): ColumnDef<T>[] {
  return useMemo(() => {
    return columns.filter((c) => {
      if (c.pinned) return true;
      // Tri-state: explicit override wins, otherwise honour defaultHidden.
      const explicit = hidden[c.id];
      if (explicit === true) return false;     // user hid it
      if (explicit === false) return true;     // user showed it
      return !c.defaultHidden;                  // no override → use default
    });
  }, [columns, hidden]);
}

/** Compute the cumulative `left` offset for each visible column (for sticky pinned). */
function useStickyOffsets<T>(
  visible: ColumnDef<T>[],
  widthMap: Record<string, number>,
  gutterWidth: number,
): { offsets: number[]; pinnedSet: Set<string>; pinnedTotalWidth: number } {
  return useMemo(() => {
    const offsets: number[] = [];
    const pinnedSet = new Set<string>();
    let acc = gutterWidth;
    let pinnedAcc = 0;
    for (const c of visible) {
      offsets.push(acc);
      const w = widthMap[c.id] ?? c.width ?? 140;
      if (c.pinned) {
        pinnedSet.add(c.id);
        pinnedAcc += w;
        acc += w;
      }
      // Non-pinned columns still take their natural width but their `left`
      // value is irrelevant since we won't apply sticky to them.
    }
    return { offsets, pinnedSet, pinnedTotalWidth: pinnedAcc };
  }, [visible, widthMap, gutterWidth]);
}

const ROW_GUTTER_WIDTH = 44; // pixels — wide enough for 5-digit row numbers

export function DataTable<T>({
  tableId,
  columns,
  rows: allRows,
  rowId,
  isLoading,
  selectedId,
  onRowClick,
  emptyState,
  onSortChange,
  pageSize,
  serverPagination,
  selection,
  groupHeaders,
  groupColors,
}: DataTableProps<T>) {
  const { prefs, isHidden, toggleHidden, setWidth, setSort, setDensity } =
    useTablePrefs(tableId);

  const visible = useVisibleColumns(columns, prefs.hidden);
  const { offsets, pinnedSet } = useStickyOffsets(visible, prefs.width, ROW_GUTTER_WIDTH);
  // On mobile, column pinning (sticky/frozen columns) is disabled so the
  // table scrolls freely left/right — frozen columns otherwise eat the narrow
  // viewport and make horizontal scrolling feel stuck. Pinning stays on md+.
  const isMobile = useIsMobile();

  // ── Pagination ────────────────────────────────────────────────────────────
  // Two modes:
  //   • Server-side (serverPagination set) — parent owns page/total and `rows`
  //     is ALREADY the current page; we just render it and wire the footer.
  //   • Client-side (pageSize set) — we slice `allRows` ourselves.
  // When neither is set, every row renders (original Real Estate behaviour).
  const [clientPage, setClientPage] = useState(0);
  const serverMode = !!serverPagination;
  const clientPaginate = !serverMode && !!pageSize && pageSize > 0;
  const paginate = serverMode || clientPaginate;

  const effectivePageSize = serverMode ? serverPagination!.pageSize : pageSize ?? 0;
  const totalRows = serverMode ? serverPagination!.total : allRows.length;
  const totalPages =
    paginate && effectivePageSize > 0
      ? Math.max(1, Math.ceil(totalRows / effectivePageSize))
      : 1;
  const currentPage = serverMode ? serverPagination!.page : clientPage;
  const safePage = Math.min(currentPage, totalPages - 1);

  // Client mode only: snap back to a valid page when the data shrinks so we
  // don't strand the user on an empty page. Server mode's page is the
  // parent's responsibility.
  useEffect(() => {
    if (!serverMode && clientPage !== safePage) setClientPage(safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, serverMode]);

  const goToPage = useCallback(
    (p: number) => {
      const clamped = Math.max(0, Math.min(totalPages - 1, p));
      if (serverMode) serverPagination!.onPageChange(clamped);
      else setClientPage(clamped);
    },
    [serverMode, serverPagination, totalPages],
  );

  const rows = useMemo(() => {
    // Server mode: rows are already the page slice. Client mode: slice here.
    if (!clientPaginate) return allRows;
    const start = safePage * (pageSize as number);
    return allRows.slice(start, start + (pageSize as number));
  }, [allRows, clientPaginate, safePage, pageSize]);
  const pageStart = paginate ? safePage * effectivePageSize : 0;

  // ── Selection model ──────────────────────────────────────────────────────
  // anchor = cell where mouse-down began (or the only cell after a click)
  // focus  = current "active" cell — what arrow keys move
  const [sel, setSel] = useState<{ anchor: CellRef; focus: CellRef } | null>(null);
  const isDraggingRef = useRef(false);

  // Reset selection when rows change shape (filter, page) so we don't keep
  // pointing at a row that no longer exists.
  const rowCount = rows.length;
  const colCount = visible.length;
  useEffect(() => {
    if (sel && (sel.focus.r >= rowCount || sel.focus.c >= colCount)) setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount, colCount]);

  const setSingleCell = useCallback((r: number, c: number) => {
    setSel({ anchor: { r, c }, focus: { r, c } });
  }, []);
  const extendTo = useCallback((r: number, c: number) => {
    setSel((s) => (s ? { anchor: s.anchor, focus: { r, c } } : { anchor: { r, c }, focus: { r, c } }));
  }, []);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Don't interfere with edits inside the cell.
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;

      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && sel) {
        copySelection(sel, rows, visible);
        e.preventDefault();
        return;
      }

      if (!sel) {
        if (rows.length > 0 && (e.key.startsWith("Arrow") || e.key === "Enter")) {
          setSingleCell(0, 0);
          e.preventDefault();
        }
        return;
      }

      const { focus } = sel;
      const lastR = rows.length - 1;
      const lastC = visible.length - 1;
      let nr = focus.r;
      let nc = focus.c;

      switch (e.key) {
        case "ArrowUp":    nr = Math.max(0, focus.r - 1); break;
        case "ArrowDown":  nr = Math.min(lastR, focus.r + 1); break;
        case "ArrowLeft":  nc = Math.max(0, focus.c - 1); break;
        case "ArrowRight": nc = Math.min(lastC, focus.c + 1); break;
        case "Home":
          if (e.ctrlKey || e.metaKey) { nr = 0; nc = 0; } else nc = 0;
          break;
        case "End":
          if (e.ctrlKey || e.metaKey) { nr = lastR; nc = lastC; } else nc = lastC;
          break;
        case "Enter":
          // Mirror Excel: Enter advances to the next row, same column.
          nr = Math.min(lastR, focus.r + 1);
          break;
        case "Tab":
          if (e.shiftKey) nc = Math.max(0, focus.c - 1);
          else nc = Math.min(lastC, focus.c + 1);
          break;
        case "Escape":
          setSel(null);
          e.preventDefault();
          return;
        default:
          return;
      }
      e.preventDefault();
      if (e.shiftKey && e.key !== "Enter" && e.key !== "Tab") {
        extendTo(nr, nc);
      } else {
        setSingleCell(nr, nc);
      }

      // Fire the row-click handler if Enter advanced — keeps the preview
      // pane in sync with the keyboard.
      if (e.key === "Enter" && onRowClick && rows[nr]) onRowClick(rows[nr]);
    },
    [sel, rows, visible, setSingleCell, extendTo, onRowClick],
  );

  // ── Sort cycling ─────────────────────────────────────────────────────────
  const handleSort = (col: ColumnDef<T>) => {
    if (!col.sortKey) return;
    const current = prefs.sort;
    let next: "asc" | "desc" | null = "asc";
    if (current && current.column === col.sortKey) {
      next = current.direction === "asc" ? "desc" : current.direction === "desc" ? null : "asc";
    }
    setSort(col.sortKey, next);
    onSortChange?.(next == null ? null : col.sortKey, next);
  };

  const cellPad = prefs.density === "compact" ? "px-2 py-1" : "px-3 py-2";

  // Compute the rectangular selection [r0..r1, c0..c1] for highlight rendering.
  const range = useMemo(() => {
    if (!sel) return null;
    return {
      r0: Math.min(sel.anchor.r, sel.focus.r),
      r1: Math.max(sel.anchor.r, sel.focus.r),
      c0: Math.min(sel.anchor.c, sel.focus.c),
      c1: Math.max(sel.anchor.c, sel.focus.c),
    };
  }, [sel]);

  // ── Row selection (opt-in via `selection`) ────────────────────────────────
  // Operates on the CURRENT PAGE's rows; the parent set persists across pages.
  const pageIds = useMemo(() => rows.map(rowId), [rows, rowId]);
  const lastIndexRef = useRef<number | null>(null);
  const selectedSet = selection?.selectedIds;
  const pageAllSelected =
    !!selection && pageIds.length > 0 && pageIds.every((id) => selectedSet!.has(id));
  const pageSomeSelected =
    !!selection && !pageAllSelected && pageIds.some((id) => selectedSet!.has(id));

  const toggleAllOnPage = useCallback(() => {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (pageAllSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    selection.onChange(next);
  }, [selection, pageAllSelected, pageIds]);

  const toggleRowAt = useCallback(
    (index: number, shift: boolean) => {
      if (!selection) return;
      const next = new Set(selection.selectedIds);
      const id = pageIds[index];
      const willSelect = !next.has(id);
      if (shift && lastIndexRef.current != null) {
        const lo = Math.min(lastIndexRef.current, index);
        const hi = Math.max(lastIndexRef.current, index);
        for (let i = lo; i <= hi; i++) {
          if (willSelect) next.add(pageIds[i]);
          else next.delete(pageIds[i]);
        }
      } else if (willSelect) {
        next.add(id);
      } else {
        next.delete(id);
      }
      lastIndexRef.current = index;
      selection.onChange(next);
    },
    [selection, pageIds],
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full focus:outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseUp={() => { isDraggingRef.current = false; }}
      onMouseLeave={() => { isDraggingRef.current = false; }}
    >
      <div className="relative flex-1 overflow-auto bg-background [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y]">
        <table
          className="w-full text-[13px] border-separate border-spacing-0"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: ROW_GUTTER_WIDTH }} />
            {visible.map((c) => {
              // table-layout: fixed uses the col's width verbatim and
              // largely ignores minWidth, so a saved-too-narrow user width
              // can clip cell content (e.g. status badges). Floor the width
              // at the column's minWidth here so the saved value gets
              // bumped up to a sensible minimum at render time.
              const minW = c.minWidth ?? 60;
              const saved = prefs.width[c.id] ?? c.width ?? 140;
              const effective = Math.max(saved, minW);
              return (
                <col
                  key={c.id}
                  style={{
                    width: effective,
                    minWidth: minW,
                  }}
                />
              );
            })}
          </colgroup>

          {/* Header — bg-muted (fully opaque, NOT bg-muted/70) so vertical
              scroll doesn't bleed row content through the sticky header.
              Same reason for the gutter corner cell below. */}
          <thead className="sticky top-0 z-30 bg-muted">
            {groupHeaders &&
              (() => {
                // Group the visible columns into runs of consecutive columns
                // sharing the same `group`, each spanned by one labelled cell.
                const runs: Array<{ group?: string; span: number }> = [];
                for (const col of visible) {
                  const last = runs[runs.length - 1];
                  if (last && last.group === col.group) last.span += 1;
                  else runs.push({ group: col.group, span: 1 });
                }
                return (
                  <tr>
                    <th
                      className="bg-muted border-b border-r border-border md:sticky md:left-0 z-40 p-0"
                      aria-hidden
                    />
                    {runs.map((run, i) => {
                      const color = run.group ? groupColors?.[run.group] : undefined;
                      return (
                        <th
                          key={i}
                          colSpan={run.span}
                          className={cn(
                            "h-8 border-b border-r border-border px-2 text-center text-[11px] font-bold uppercase tracking-wider whitespace-nowrap",
                            !color && "bg-muted text-foreground/75",
                          )}
                          style={color ? { backgroundColor: color, color: "#fff" } : undefined}
                        >
                          {run.group ?? ""}
                        </th>
                      );
                    })}
                  </tr>
                );
              })()}
            <tr>
              {/* Row gutter corner — holds the select-all checkbox when row
                  selection is enabled, otherwise an empty sticky corner. */}
              <th
                className="bg-muted border-b border-r border-border h-9 md:sticky md:left-0 z-40 p-0"
                aria-hidden={!selection}
              >
                {selection && rows.length > 0 && (
                  <div className="flex items-center justify-center">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={
                        pageAllSelected
                          ? true
                          : pageSomeSelected
                            ? "indeterminate"
                            : false
                      }
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => toggleAllOnPage()}
                      className="h-3.5 w-3.5"
                    />
                  </div>
                )}
              </th>
              {visible.map((col, idx) => {
                const isPinned = !isMobile && pinnedSet.has(col.id);
                const sortDir =
                  prefs.sort && prefs.sort.column === col.sortKey ? prefs.sort.direction : null;
                return (
                  <th
                    key={col.id}
                    data-col-id={col.id}
                    className={cn(
                      "h-9 border-b border-r border-border select-none",
                      "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                      col.align === "right" ? "text-right" : "text-left",
                      cellPad,
                      "relative group",
                      // Non-pinned headers use FULLY OPAQUE bg-muted (not
                      // /70) so vertical-scrolling rows can't bleed through
                      // the sticky header. Pinned headers get an inline
                      // opaque background below for the same reason.
                      !isPinned && "bg-muted",
                      isPinned && "sticky",
                    )}
                    style={
                      isPinned
                        ? {
                            left: offsets[idx],
                            position: "sticky",
                            zIndex: 35,
                            isolation: "isolate",
                            backgroundColor: "hsl(var(--muted))",
                            boxShadow: "1px 0 0 0 hsl(var(--border))",
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-1 -my-0.5">
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        disabled={!col.sortKey}
                        className={cn(
                          "inline-flex items-center gap-1 truncate",
                          col.sortKey && "hover:text-foreground transition-colors",
                          !col.sortKey && "cursor-default",
                        )}
                      >
                        <span className="truncate">{col.header}</span>
                        {col.sortKey &&
                          (sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3 shrink-0" />
                          ) : sortDir === "desc" ? (
                            <ArrowDown className="h-3 w-3 shrink-0" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-100 shrink-0" />
                          ))}
                      </button>
                      {idx === visible.length - 1 && (
                        <SettingsMenu
                          columns={columns}
                          hiddenMap={prefs.hidden}
                          toggleHidden={toggleHidden}
                          density={prefs.density}
                          setDensity={setDensity}
                          onCopy={sel ? () => copySelection(sel, rows, visible) : undefined}
                        />
                      )}
                    </div>
                    <ResizeHandle
                      colId={col.id}
                      minWidth={col.minWidth ?? 60}
                      getStartWidth={() =>
                        prefs.width[col.id] ?? col.width ?? 140
                      }
                      setWidth={(px) => setWidth(col.id, px)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {/* Opaque background — translucent `/30` let scrolling
                      data cells bleed through the sticky gutter, which made
                      pill badges like "ACTIVE" appear to float outside the
                      table on horizontal scroll. */}
                  <td className="border-b border-r border-border bg-muted md:sticky md:left-0 z-30" />
                  {visible.map((c) => (
                    <td
                      key={c.id}
                      className={cn("border-b border-r border-border", cellPad)}
                    >
                      <Skeleton className="h-3.5 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td className="border-b border-r border-border bg-muted/30" />
                <td
                  colSpan={visible.length}
                  className="text-center text-muted-foreground py-16 border-b border-border"
                >
                  {emptyState ?? "No results."}
                </td>
              </tr>
            ) : (
              rows.map((row, rIdx) => {
                const id = rowId(row);
                const isRowSelected = id === selectedId;
                const isRowChecked = !!selection && selectedSet!.has(id);
                const isInRange = range && rIdx >= range.r0 && rIdx <= range.r1;
                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(row)}
                    aria-selected={isRowSelected}
                    className={cn(
                      "transition-colors",
                      selection && "group",
                      onRowClick && "cursor-pointer",
                      isRowChecked
                        ? "bg-primary/[0.06] hover:bg-primary/[0.10]"
                        : isRowSelected
                          ? "bg-primary/[0.08] hover:bg-primary/[0.12]"
                          : "hover:bg-muted/40",
                    )}
                  >
                    {/* Row number gutter — Excel-style 1, 2, 3 ...
                        Inline `backgroundColor` (opaque) + `isolation: isolate`
                        so horizontally-scrolling data cells (and full-bleed
                        badges like "ACTIVE") can't bleed through this sticky
                        column. The original `bg-muted/40` was 40% transparent
                        which let those badges peek out on the left. */}
                    <td
                      className={cn(
                        "border-b border-r border-border text-center text-[10px] tabular-nums text-muted-foreground select-none md:sticky md:left-0 z-30",
                        cellPad,
                        isInRange && "text-primary font-semibold",
                      )}
                      style={{
                        backgroundColor: isInRange
                          ? "hsl(var(--primary) / 0.10)"
                          : "hsl(var(--muted))",
                        isolation: "isolate",
                      }}
                    >
                      {selection ? (
                        <div className="relative flex items-center justify-center">
                          {/* Row number by default; checkbox on hover or when
                              the row is checked (keeps the Excel look at rest). */}
                          <span
                            className={cn(
                              isRowChecked ? "invisible" : "group-hover:invisible",
                            )}
                          >
                            {pageStart + rIdx + 1}
                          </span>
                          <span
                            className={cn(
                              "absolute inset-0 flex items-center justify-center",
                              isRowChecked ? "flex" : "hidden group-hover:flex",
                            )}
                          >
                            <Checkbox
                              aria-label="Select row"
                              checked={isRowChecked}
                              onClick={(e) => {
                                // Don't open the preview or fight cell selection.
                                e.stopPropagation();
                                toggleRowAt(rIdx, (e as React.MouseEvent).shiftKey);
                              }}
                              className="h-3.5 w-3.5"
                            />
                          </span>
                        </div>
                      ) : (
                        pageStart + rIdx + 1
                      )}
                    </td>
                    {visible.map((col, cIdx) => {
                      const isPinned = !isMobile && pinnedSet.has(col.id);
                      const isFocus =
                        sel && sel.focus.r === rIdx && sel.focus.c === cIdx;
                      const isInCellRange =
                        range &&
                        rIdx >= range.r0 && rIdx <= range.r1 &&
                        cIdx >= range.c0 && cIdx <= range.c1;
                      return (
                        <td
                          key={col.id}
                          data-col-id={col.id}
                          onMouseDown={(e) => {
                            // Don't hijack clicks landing on form controls etc.
                            if ((e.target as HTMLElement).closest(
                              "input, textarea, select, button, a, [role='button']",
                            )) return;
                            isDraggingRef.current = true;
                            if (e.shiftKey) extendTo(rIdx, cIdx);
                            else setSingleCell(rIdx, cIdx);
                          }}
                          onMouseEnter={() => {
                            if (isDraggingRef.current) extendTo(rIdx, cIdx);
                          }}
                          className={cn(
                            "border-b border-r border-border align-middle relative",
                            cellPad,
                            col.align === "right" && "text-right tabular-nums",
                            col.cellClassName,
                            // Non-pinned cells: tint via bg classes as usual.
                            !isPinned && "z-0",
                            !isPinned && isInCellRange && !isFocus && "bg-primary/[0.10]",
                            !isPinned && isFocus && "bg-primary/[0.18] ring-2 ring-primary ring-inset",
                            // Pinned cells get inline-style opaque background
                            // + isolation below so horizontally-scrolling
                            // non-pinned content can't bleed through.
                            isPinned && "sticky",
                          )}
                          style={
                            isPinned
                              ? {
                                  left: offsets[cIdx],
                                  position: "sticky",
                                  zIndex: 25,
                                  isolation: "isolate",
                                  backgroundColor: "hsl(var(--background))",
                                  boxShadow: [
                                    "1px 0 0 0 hsl(var(--border))",
                                    isFocus
                                      ? "inset 0 0 0 100vw hsl(var(--primary) / 0.18)"
                                      : isInCellRange
                                        ? "inset 0 0 0 100vw hsl(var(--primary) / 0.10)"
                                        : isRowSelected
                                          ? "inset 0 0 0 100vw hsl(var(--primary) / 0.04)"
                                          : null,
                                  ]
                                    .filter(Boolean)
                                    .join(", "),
                                }
                              : undefined
                          }
                        >
                          {col.cell(row)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer — when client- or server-side pagination is on.
          Stacks vertically + centres on mobile so the controls never spill
          past the viewport; switches to the spaced-out row on sm+. */}
      {paginate && !isLoading && totalRows > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-2 border-t bg-background text-xs shrink-0">
          <span className="text-muted-foreground tabular-nums order-2 sm:order-1 text-center">
            Showing {pageStart + 1}–{Math.min(pageStart + effectivePageSize, totalRows)} of{" "}
            {totalRows.toLocaleString()}
          </span>
          <div className="flex items-center justify-center gap-1 order-1 sm:order-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage <= 0}
              onClick={() => goToPage(safePage - 1)}
            >
              Previous
            </Button>
            <span className="px-1.5 tabular-nums whitespace-nowrap">
              {safePage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage >= totalPages - 1}
              onClick={() => goToPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Status bar — shows the selection summary like Excel does */}
      {sel && (
        <SelectionStatus
          sel={sel}
          rows={rows}
          visible={visible}
          onCopy={() => copySelection(sel, rows, visible)}
        />
      )}
    </div>
  );
}

// ─── Resize handle (right edge of header) ────────────────────────────────────

function ResizeHandle({
  colId,
  minWidth,
  getStartWidth,
  setWidth,
}: {
  colId: string;
  minWidth: number;
  getStartWidth: () => number;
  setWidth: (px: number) => void;
}) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    // Snapshot the start width at drag-start. Each pointermove computes
    // `startWidth + cumulativeDelta` so the column tracks the cursor in
    // real time, no matter how fast it moves.
    const startX = e.clientX;
    const startWidth = getStartWidth();
    const onMove = (ev: PointerEvent) => {
      setWidth(Math.max(minWidth, startWidth + (ev.clientX - startX)));
    };
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  // Double-click auto-fits the column to its widest visible content, the
  // same affordance Excel/Sheets put on the column-divider. We walk every
  // `data-col-id` cell in the table, recurse through descendants, and take
  // the largest scrollWidth — that's the natural width of truncated text
  // (`truncate` sets overflow:hidden, so scrollWidth = un-clipped width)
  // and the rendered width of badges/icons. Capped at 800px so a single
  // pathological cell can't blow the column out across the viewport.
  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const table = (e.currentTarget as HTMLElement).closest("table");
    if (!table) return;
    const cells = table.querySelectorAll<HTMLElement>(
      `[data-col-id="${CSS.escape(colId)}"]`,
    );
    let maxContent = 0;
    cells.forEach((cell) => {
      const stack: HTMLElement[] = [cell];
      while (stack.length) {
        const node = stack.pop()!;
        if (node.scrollWidth > maxContent) maxContent = node.scrollWidth;
        for (let i = 0; i < node.children.length; i++) {
          stack.push(node.children[i] as HTMLElement);
        }
      }
    });
    // +32 covers cell padding (px-3 = 24px) plus a small visual buffer so
    // text doesn't sit flush against the column divider.
    setWidth(Math.max(minWidth, Math.min(800, maxContent + 32)));
  };

  return (
    <span
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
      aria-hidden
      title="Drag to resize · double-click to auto-fit"
    />
  );
}

// ─── Settings popover (gear menu in last header cell) ────────────────────────

function SettingsMenu<T>({
  columns,
  hiddenMap,
  toggleHidden,
  density,
  setDensity,
  onCopy,
}: {
  columns: ColumnDef<T>[];
  // Raw hidden map so we can distinguish "explicit override" from "absent".
  hiddenMap: Record<string, boolean>;
  toggleHidden: (id: string, defaultHidden?: boolean) => void;
  density: "compact" | "comfortable";
  setDensity: (d: "compact" | "comfortable") => void;
  onCopy?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toggleable = columns.filter((c) => !c.pinned);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Table settings"
          className="ml-auto h-6 w-6 opacity-60 hover:opacity-100 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-0" sideOffset={6}>
        <div className="p-2 border-b">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
            Density
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Button
              variant={density === "comfortable" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDensity("comfortable")}
              className="justify-start gap-2"
            >
              <Rows3 className="h-3.5 w-3.5" /> Comfy
            </Button>
            <Button
              variant={density === "compact" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDensity("compact")}
              className="justify-start gap-2"
            >
              <Rows4 className="h-3.5 w-3.5" /> Compact
            </Button>
          </div>
        </div>
        {onCopy && (
          <div className="p-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => { onCopy(); setOpen(false); }}
            >
              <CopyIcon className="h-3.5 w-3.5" /> Copy selection
              <kbd className="ml-auto text-[10px] font-mono text-muted-foreground">⌘C</kbd>
            </Button>
          </div>
        )}
        <div className="p-2 max-h-72 overflow-auto">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
            Columns
          </div>
          {toggleable.map((c) => {
            // Effective visibility: explicit override wins, else fall back
            // to defaultHidden. Matches useVisibleColumns above.
            const explicit = hiddenMap[c.id];
            const effectivelyHidden =
              explicit === true
                ? true
                : explicit === false
                  ? false
                  : !!c.defaultHidden;
            return (
              <label
                key={c.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm"
              >
                <Checkbox
                  checked={!effectivelyHidden}
                  onCheckedChange={() =>
                    toggleHidden(c.id, !!c.defaultHidden)
                  }
                />
                <span className="flex-1 truncate">{c.header}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Status bar (bottom — selection summary) ─────────────────────────────────

function SelectionStatus<T>({
  sel,
  rows,
  visible,
  onCopy,
}: {
  sel: { anchor: CellRef; focus: CellRef };
  rows: T[];
  visible: ColumnDef<T>[];
  onCopy: () => void;
}) {
  const r0 = Math.min(sel.anchor.r, sel.focus.r);
  const r1 = Math.max(sel.anchor.r, sel.focus.r);
  const c0 = Math.min(sel.anchor.c, sel.focus.c);
  const c1 = Math.max(sel.anchor.c, sel.focus.c);
  const rowCount = r1 - r0 + 1;
  const colCount = c1 - c0 + 1;

  // Sum + average for any numeric cells in the selection — like Excel's
  // status bar. We detect "numeric" via right-aligned columns.
  let sum = 0;
  let count = 0;
  for (let r = r0; r <= r1; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = c0; c <= c1; c++) {
      const col = visible[c];
      if (!col) continue;
      const v = col.copyValue ? col.copyValue(row) : "";
      const n = parseFloat(v.replace(/[^\d.\-]/g, ""));
      if (!Number.isNaN(n) && col.align === "right") {
        sum += n;
        count++;
      }
    }
  }

  const cells = rowCount * colCount;
  const ref = a1Ref(sel);

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-t bg-muted/30 text-[11px] text-muted-foreground tabular-nums">
      <span className="font-mono font-medium text-foreground">{ref}</span>
      <span>{cells.toLocaleString()} cells</span>
      <span>·</span>
      <span>{rowCount} row{rowCount === 1 ? "" : "s"}</span>
      <span>·</span>
      <span>{colCount} col{colCount === 1 ? "" : "s"}</span>
      {count > 0 && (
        <>
          <span>·</span>
          <span>Sum: <span className="text-foreground font-medium">{sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
          <span>Avg: <span className="text-foreground font-medium">{(sum / count).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
        </>
      )}
      <div className="flex-1" />
      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={onCopy}>
        <CopyIcon className="h-3 w-3" /> Copy
        <kbd className="ml-1 font-mono">⌘C</kbd>
      </Button>
    </div>
  );
}

function a1Ref(sel: { anchor: CellRef; focus: CellRef }): string {
  const r0 = Math.min(sel.anchor.r, sel.focus.r);
  const r1 = Math.max(sel.anchor.r, sel.focus.r);
  const c0 = Math.min(sel.anchor.c, sel.focus.c);
  const c1 = Math.max(sel.anchor.c, sel.focus.c);
  const colName = (n: number) => {
    let s = "";
    let m = n;
    do {
      s = String.fromCharCode(65 + (m % 26)) + s;
      m = Math.floor(m / 26) - 1;
    } while (m >= 0);
    return s;
  };
  return r0 === r1 && c0 === c1
    ? `${colName(c0)}${r0 + 1}`
    : `${colName(c0)}${r0 + 1}:${colName(c1)}${r1 + 1}`;
}

// ─── Copy helper — selection → TSV in clipboard ──────────────────────────────

function copySelection<T>(
  sel: { anchor: CellRef; focus: CellRef },
  rows: T[],
  visible: ColumnDef<T>[],
) {
  const r0 = Math.min(sel.anchor.r, sel.focus.r);
  const r1 = Math.max(sel.anchor.r, sel.focus.r);
  const c0 = Math.min(sel.anchor.c, sel.focus.c);
  const c1 = Math.max(sel.anchor.c, sel.focus.c);

  const lines: string[] = [];
  for (let r = r0; r <= r1; r++) {
    const row = rows[r];
    if (!row) continue;
    const parts: string[] = [];
    for (let c = c0; c <= c1; c++) {
      const col = visible[c];
      const raw = col?.copyValue ? col.copyValue(row) : "";
      // TSV: replace tabs and newlines so paste lands on a single cell.
      parts.push(raw.replace(/\t/g, " ").replace(/\r?\n/g, " "));
    }
    lines.push(parts.join("\t"));
  }
  const tsv = lines.join("\n");

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv);
    } else {
      // Fallback for older browsers — temporary textarea + execCommand.
      const ta = document.createElement("textarea");
      ta.value = tsv;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  } catch {
    // Clipboard write may be blocked outside a user gesture; surface nothing
    // — the user retried via Ctrl+C so the next attempt is a fresh gesture.
  }
}
