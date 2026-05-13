"use client";

/**
 * Employee Master — spreadsheet-style table with section-grouped columns,
 * field-type icons, and a toolbar matching the form-builder records UI:
 * Filter / Sort / Saved views / Search / Print / Import / Export /
 * per-page / Column options (Wrap text + Manage columns).
 *
 * Purpose-built for the static `/employee-master` page so it can mimic the
 * dynamic form-records look without dragging in form-builder dependencies.
 */

import React, { useMemo, useRef, useState } from "react";
import {
  Filter,
  ArrowUpDown,
  Bookmark,
  Search,
  Printer,
  Upload,
  Download,
  SlidersHorizontal,
  WrapText,
  Columns3,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Type,
  AtSign,
  Phone,
  Calendar,
  Hash,
  Tag,
  Link2,
  X,
  Save,
  Plus,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FieldKind =
  | "text"
  | "email"
  | "phone"
  | "date"
  | "number"
  | "currency"
  | "status"
  | "link";

export interface EMColumn<T> {
  id: string;
  label: string;
  section: string;
  kind: FieldKind;
  width?: number;
  /** Pull the raw value for sorting / filtering / export. */
  value: (row: T) => string | number | null | undefined;
  /** Render the cell. Defaults to the stringified value. */
  cell?: (row: T) => React.ReactNode;
  defaultHidden?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  filters: { search: string };
  hiddenColumns: string[];
  sort: { field: string; order: "asc" | "desc" } | null;
}

interface Props<T> {
  rows: T[];
  rowId: (row: T) => string;
  columns: EMColumn<T>[];
  title?: string;
  /** localStorage key used to persist per-user table preferences. */
  storageKey: string;
  isLoading?: boolean;
  /** Header label shown above every column — matches the image's "EMPLOYEE MASTER" badge. */
  recordLabel?: string;
  onRowClick?: (row: T) => void;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  /** Optional CSV import handler — receives the raw file. */
  onImport?: (file: File) => Promise<void> | void;
  /** Right-aligned slot for an extra action button (e.g. "New employee"). */
  extraToolbarActions?: React.ReactNode;
}

const KIND_ICON: Record<FieldKind, React.ComponentType<{ className?: string }>> = {
  text: Type,
  email: AtSign,
  phone: Phone,
  date: Calendar,
  number: Hash,
  currency: Hash,
  status: Tag,
  link: Link2,
};

const PAGE_SIZES = [10, 20, 50, 100];

// Column widths in px. The three frozen columns (checkbox / # / Actions) use
// these for both `<col>` width and the `left:` offset of subsequent sticky
// cells — keep them in lockstep or the sticky stack will misalign.
const COL_W_CHECK = 44;
const COL_W_NUM = 56;
const COL_W_ACTIONS = 80;
const COL_W_DATA = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

type Prefs = {
  hiddenColumns: string[];
  perPage: number;
  wrapText: boolean;
  sort: { field: string; order: "asc" | "desc" } | null;
  savedViews: SavedView[];
};

function loadPrefs(key: string): Prefs {
  if (typeof window === "undefined") {
    return { hiddenColumns: [], perPage: 20, wrapText: false, sort: null, savedViews: [] };
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { hiddenColumns: [], perPage: 20, wrapText: false, sort: null, savedViews: [] };
    const parsed = JSON.parse(raw);
    return {
      hiddenColumns: Array.isArray(parsed.hiddenColumns) ? parsed.hiddenColumns : [],
      perPage: typeof parsed.perPage === "number" ? parsed.perPage : 20,
      wrapText: !!parsed.wrapText,
      sort: parsed.sort ?? null,
      savedViews: Array.isArray(parsed.savedViews) ? parsed.savedViews : [],
    };
  } catch {
    return { hiddenColumns: [], perPage: 20, wrapText: false, sort: null, savedViews: [] };
  }
}

function savePrefs(key: string, prefs: Prefs) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(prefs)); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────────────────────

function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv<T>(filename: string, rows: T[], columns: EMColumn<T>[]) {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(c.value(row))).join(","),
  );
  const blob = new Blob([[header, ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function EmployeeMasterTable<T>(props: Props<T>) {
  const {
    rows,
    rowId,
    columns,
    title = "Records",
    storageKey,
    isLoading,
    recordLabel = "EMPLOYEE MASTER",
    onRowClick,
    onView,
    onEdit,
    onDelete,
    onImport,
    extraToolbarActions,
  } = props;

  const { toast } = useToast();
  const tableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prefs, setPrefs] = useState<Prefs>(() => {
    const loaded = loadPrefs(storageKey);
    // Hide columns marked as defaultHidden if no user pref exists yet.
    if (loaded.hiddenColumns.length === 0) {
      loaded.hiddenColumns = columns.filter((c) => c.defaultHidden).map((c) => c.id);
    }
    return loaded;
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<string | null>(null);
  const [manageColsOpen, setManageColsOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  // Persist whenever prefs change.
  React.useEffect(() => { savePrefs(storageKey, prefs); }, [storageKey, prefs]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !prefs.hiddenColumns.includes(c.id)),
    [columns, prefs.hiddenColumns],
  );

  // Group consecutive columns by section so the merged-cell header banner can
  // span the right number of columns. Order is preserved from `columns` so
  // the user can reshuffle by editing the column list.
  const sectionGroups = useMemo(() => {
    const groups: Array<{ section: string; span: number }> = [];
    for (const col of visibleColumns) {
      const last = groups[groups.length - 1];
      if (last && last.section === col.section) last.span += 1;
      else groups.push({ section: col.section, span: 1 });
    }
    return groups;
  }, [visibleColumns]);

  // ── Filtering + sort + pagination ────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((c) => {
        const v = c.value(row);
        return v != null && String(v).toLowerCase().includes(q);
      }),
    );
  }, [rows, search, columns]);

  const sorted = useMemo(() => {
    if (!prefs.sort) return filtered;
    const { field, order } = prefs.sort;
    const col = columns.find((c) => c.id === field);
    if (!col) return filtered;
    const dir = order === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, prefs.sort, columns]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / prefs.perPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * prefs.perPage;
  const pageRows = sorted.slice(start, start + prefs.perPage);

  // ── Selection helpers ────────────────────────────────────────────────────
  const toggleAllOnPage = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      pageRows.forEach((r) => {
        const id = rowId(r);
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const isAllPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(rowId(r)));

  // ── Toolbar actions ──────────────────────────────────────────────────────
  const handlePrint = () => {
    if (typeof window === "undefined") return;
    window.print();
  };

  const handleExport = () => {
    if (rows.length === 0) {
      toast({ title: "Nothing to export", description: "The table is empty." });
      return;
    }
    const ts = new Date().toISOString().slice(0, 10);
    downloadCsv(`employee-master-${ts}.csv`, sorted, visibleColumns);
    toast({ title: "Exported", description: `${sorted.length} row(s) downloaded.` });
  };

  const handleImportClick = () => {
    if (!onImport) {
      toast({ title: "Import not wired", description: "Hook up `onImport` to enable CSV import." });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportFile = async (file: File) => {
    if (!onImport) return;
    try {
      await onImport(file);
      toast({ title: "Imported", description: `Loaded ${file.name}.` });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err?.message ?? "Could not parse file.",
      });
    }
  };

  // ── Saved views ──────────────────────────────────────────────────────────
  const applyView = (view: SavedView | null) => {
    if (!view) {
      setActiveView(null);
      setSearch("");
      setPrefs((p) => ({ ...p, hiddenColumns: columns.filter((c) => c.defaultHidden).map((c) => c.id), sort: null }));
      return;
    }
    setActiveView(view.id);
    setSearch(view.filters.search);
    setPrefs((p) => ({ ...p, hiddenColumns: view.hiddenColumns, sort: view.sort }));
    setPage(1);
  };

  const saveCurrentView = () => {
    const name = newViewName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Name required" });
      return;
    }
    const view: SavedView = {
      id: `v-${Date.now()}`,
      name,
      filters: { search },
      hiddenColumns: prefs.hiddenColumns,
      sort: prefs.sort,
    };
    setPrefs((p) => ({ ...p, savedViews: [...p.savedViews, view] }));
    setActiveView(view.id);
    setNewViewName("");
    setSaveViewOpen(false);
    toast({ title: "View saved", description: `"${name}" is now in your saved views.` });
  };

  const deleteView = (id: string) => {
    setPrefs((p) => ({ ...p, savedViews: p.savedViews.filter((v) => v.id !== id) }));
    if (activeView === id) setActiveView(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Hidden file input for CSV import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportFile(f);
          e.target.value = "";
        }}
      />

      {/* Toolbar — wraps gracefully on narrow viewports, but stays on one row
          whenever the container is wide enough. */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-background print:hidden">
        {/* Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <div className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">
                Filter rows by any visible field. Type into the search box —
                results update live across every column.
              </p>
              <Input
                placeholder="Type to filter…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-8 text-sm"
              />
              {search && (
                <Button size="sm" variant="ghost" onClick={() => setSearch("")} className="h-7 text-xs">
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" /> Sort
              {prefs.sort && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  · {columns.find((c) => c.id === prefs.sort!.field)?.label} {prefs.sort.order === "asc" ? "↑" : "↓"}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPrefs((p) => ({ ...p, sort: null }))}>
              <X className="h-3.5 w-3.5 mr-2" /> Clear sort
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {visibleColumns.map((c) => (
              <React.Fragment key={c.id}>
                <DropdownMenuItem
                  onClick={() => setPrefs((p) => ({ ...p, sort: { field: c.id, order: "asc" } }))}
                  className="text-xs"
                >
                  <ChevronUp className="h-3.5 w-3.5 mr-2" /> {c.label} (A→Z)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setPrefs((p) => ({ ...p, sort: { field: c.id, order: "desc" } }))}
                  className="text-xs"
                >
                  <ChevronDown className="h-3.5 w-3.5 mr-2" /> {c.label} (Z→A)
                </DropdownMenuItem>
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Saved views */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Bookmark className="h-3.5 w-3.5" /> Saved
              {activeView && (
                <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1">
                  {prefs.savedViews.find((v) => v.id === activeView)?.name ?? "view"}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs">Saved views</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => applyView(null)} className="text-xs">
              <X className="h-3.5 w-3.5 mr-2" /> Show all (default)
            </DropdownMenuItem>
            {prefs.savedViews.length > 0 && <DropdownMenuSeparator />}
            {prefs.savedViews.map((v) => (
              <DropdownMenuItem
                key={v.id}
                onClick={() => applyView(v)}
                className="text-xs flex items-center justify-between group"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {activeView === v.id && <Check className="h-3 w-3" />}
                  <span className="truncate">{v.name}</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteView(v.id); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                  title="Delete view"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSaveViewOpen(true)} className="text-xs">
              <Plus className="h-3.5 w-3.5 mr-2" /> Save current view…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search — stretches to fill remaining toolbar width on one row. */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search all records..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Print */}
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>

          {/* Import */}
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleImportClick}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>

          {/* Export */}
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>

          {/* Per page */}
          <Select
            value={String(prefs.perPage)}
            onValueChange={(v) => setPrefs((p) => ({ ...p, perPage: Number(v) }))}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Column options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Column Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={prefs.wrapText}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, wrapText: !!v }))}
                className="text-xs"
              >
                <WrapText className="h-3.5 w-3.5 mr-2" /> Wrap Text
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem onClick={() => setManageColsOpen(true)} className="text-xs">
                <Columns3 className="h-3.5 w-3.5 mr-2" /> Manage Columns
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {extraToolbarActions}
        </div>
      </div>

      {/* Selection summary */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-primary/5 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      <div ref={tableRef} className="flex-1 min-h-0 overflow-auto">
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          {/* Explicit widths so `table-layout: fixed` enforces them — without
              this every column collapses to its content and section banners
              overlap the sticky cells. */}
          <colgroup>
            <col style={{ width: COL_W_CHECK }} />
            <col style={{ width: COL_W_NUM }} />
            <col style={{ width: COL_W_ACTIONS }} />
            {visibleColumns.map((c) => (
              <col key={c.id} style={{ width: c.width ?? COL_W_DATA }} />
            ))}
          </colgroup>

          <thead className="sticky top-0 z-10">
            {/* Section banner row */}
            <tr>
              <th className="bg-muted/50 border-b border-r h-9 sticky left-0 z-20" />
              <th
                className="bg-muted/50 border-b border-r h-9 sticky z-20 text-xs font-semibold text-muted-foreground text-center"
                style={{ left: COL_W_CHECK }}
              >
                #
              </th>
              <th
                className="bg-muted/50 border-b border-r h-9 sticky z-20 text-xs font-semibold text-muted-foreground text-center"
                style={{ left: COL_W_CHECK + COL_W_NUM }}
              >
                Actions
              </th>
              {sectionGroups.map((g, i) => (
                <th
                  key={`${g.section}-${i}`}
                  colSpan={g.span}
                  className="bg-muted/50 border-b border-r h-9 px-3 text-xs font-semibold text-foreground text-left whitespace-nowrap"
                >
                  {g.section}
                </th>
              ))}
            </tr>
            {/* Field row */}
            <tr>
              <th className="bg-background border-b border-r h-14 px-2 sticky left-0 z-20">
                <Checkbox
                  checked={isAllPageSelected}
                  onCheckedChange={(v) => toggleAllOnPage(!!v)}
                  aria-label="Select all on page"
                />
              </th>
              <th
                className="bg-background border-b border-r h-14 sticky z-20"
                style={{ left: COL_W_CHECK }}
              />
              <th
                className="bg-background border-b border-r h-14 sticky z-20"
                style={{ left: COL_W_CHECK + COL_W_NUM }}
              />
              {visibleColumns.map((c) => {
                const Icon = KIND_ICON[c.kind];
                const isSorted = prefs.sort?.field === c.id;
                return (
                  <th
                    key={c.id}
                    className="bg-background border-b border-r h-14 px-3 text-left align-middle"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                        {recordLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPrefs((p) => ({
                          ...p,
                          sort: isSorted && p.sort?.order === "asc"
                            ? { field: c.id, order: "desc" }
                            : isSorted && p.sort?.order === "desc"
                              ? null
                              : { field: c.id, order: "asc" },
                        }))}
                        className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary min-w-0"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{c.label}</span>
                        {isSorted && (
                          prefs.sort?.order === "asc"
                            ? <ChevronUp className="h-3 w-3 shrink-0" />
                            : <ChevronDown className="h-3 w-3 shrink-0" />
                        )}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={visibleColumns.length + 3} className="text-center py-10 text-muted-foreground text-sm">
                  Loading…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 3} className="text-center py-10 text-muted-foreground text-sm">
                  No records found.
                </td>
              </tr>
            ) : pageRows.map((row, idx) => {
              const id = rowId(row);
              const checked = selected.has(id);
              return (
                <tr
                  key={id}
                  className={cn(
                    "group hover:bg-muted/30 cursor-pointer",
                    checked && "bg-primary/5",
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  <td
                    className="border-b border-r px-2 sticky left-0 bg-background group-hover:bg-muted/30 z-[5]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(id); else next.delete(id);
                          return next;
                        });
                      }}
                      aria-label="Select row"
                    />
                  </td>
                  <td
                    className="border-b border-r sticky bg-background group-hover:bg-muted/30 z-[5] text-xs text-muted-foreground tabular-nums text-center"
                    style={{ left: COL_W_CHECK }}
                  >
                    {start + idx + 1}
                  </td>
                  <td
                    className="border-b border-r sticky bg-background group-hover:bg-muted/30 z-[5] text-center"
                    style={{ left: COL_W_CHECK + COL_W_NUM }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        {onView && (
                          <DropdownMenuItem onClick={() => onView(row)} className="text-xs">
                            <Eye className="h-3.5 w-3.5 mr-2" /> View
                          </DropdownMenuItem>
                        )}
                        {onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(row)} className="text-xs">
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onDelete(row)}
                              className="text-xs text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                  {visibleColumns.map((c) => (
                    <td
                      key={c.id}
                      className={cn(
                        "border-b border-r px-3 text-sm align-middle",
                        prefs.wrapText ? "whitespace-normal break-words py-2" : "whitespace-nowrap overflow-hidden text-ellipsis h-11",
                      )}
                      title={prefs.wrapText ? undefined : String(c.value(row) ?? "")}
                    >
                      {c.cell ? c.cell(row) : renderDefault(c.value(row), c.kind)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer / pagination */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-t bg-background text-xs print:hidden">
        <span className="text-muted-foreground tabular-nums">
          {total === 0 ? "0 results" : `Showing ${start + 1}–${Math.min(start + prefs.perPage, total)} of ${total.toLocaleString()}`}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="px-2 tabular-nums">
            Page {safePage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Manage columns dialog */}
      <Dialog open={manageColsOpen} onOpenChange={setManageColsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Columns</DialogTitle>
            <DialogDescription>
              Toggle column visibility. The order matches the table layout —
              hide what you don't need to declutter the view.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {columns.map((c) => {
              const visible = !prefs.hiddenColumns.includes(c.id);
              return (
                <label
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={visible}
                    onCheckedChange={(v) => {
                      setPrefs((p) => ({
                        ...p,
                        hiddenColumns: v
                          ? p.hiddenColumns.filter((id) => id !== c.id)
                          : [...p.hiddenColumns, c.id],
                      }));
                    }}
                  />
                  <span className="text-xs text-muted-foreground w-32 truncate">
                    {c.section}
                  </span>
                  <span className="flex-1 truncate font-medium">{c.label}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrefs((p) => ({ ...p, hiddenColumns: [] }))}
            >
              Show all
            </Button>
            <Button size="sm" onClick={() => setManageColsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save view dialog */}
      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
            <DialogDescription>
              Captures the search, sort, and visible columns under a name so
              you can jump back to this layout with one click.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. Active employees · Engineering"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveViewOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveCurrentView}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function renderDefault(v: string | number | null | undefined, kind: FieldKind): React.ReactNode {
  if (v == null || v === "") return <span className="text-muted-foreground">N/A</span>;
  if (kind === "email") {
    return (
      <a
        href={`mailto:${v}`}
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {String(v).toUpperCase()}
      </a>
    );
  }
  if (kind === "phone") {
    return (
      <a
        href={`tel:${v}`}
        className="text-primary hover:underline tabular-nums"
        onClick={(e) => e.stopPropagation()}
      >
        {String(v)}
      </a>
    );
  }
  if (kind === "currency") {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? (
      <span className="tabular-nums font-medium">
        ₹{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}
      </span>
    ) : <span>{String(v)}</span>;
  }
  return <span>{String(v)}</span>;
}
