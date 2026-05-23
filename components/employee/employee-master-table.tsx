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

/**
 * One row of the advanced filter sidebar. Operators are kind-scoped: `is` /
 * `contains` only make sense for text-y fields, `gt` / `lt` only for numbers
 * and dates, etc. See `operatorsForKind` for the canonical list per kind.
 */
export type FilterOp =
  | "is"
  | "isNot"
  | "contains"
  | "doesNotContain"
  | "startsWith"
  | "endsWith"
  | "isEmpty"
  | "isNotEmpty"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "before"
  | "after";

export interface FilterRule {
  fieldId: string;
  op: FilterOp;
  value: string;
}

export interface SavedView {
  id: string;
  name: string;
  filters: { search: string };
  hiddenColumns: string[];
  sort: { field: string; order: "asc" | "desc" } | null;
  filterRules?: FilterRule[];
  columnWidths?: Record<string, number>;
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
  selectedId?: string | null;
  onRowClick?: (row: T) => void;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  /** Optional CSV import handler — receives the raw file. */
  onImport?: (file: File) => Promise<void> | void;
  /** Right-aligned slot for an extra action button (e.g. "New employee"). */
  extraToolbarActions?: React.ReactNode;
  /** Hide the internal toolbar when the parent provides one (e.g. WorkspaceShell). */
  hideToolbar?: boolean;
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
  filterRules: FilterRule[];
  // Per-column override widths set by dragging the resize handle. Falls back
  // to `column.width` and then to `COL_W_DATA` when absent.
  columnWidths: Record<string, number>;
};

function defaultPrefs(): Prefs {
  return {
    hiddenColumns: [],
    perPage: 20,
    wrapText: false,
    sort: null,
    savedViews: [],
    filterRules: [],
    columnWidths: {},
  };
}

function loadPrefs(key: string): Prefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw);
    return {
      hiddenColumns: Array.isArray(parsed.hiddenColumns) ? parsed.hiddenColumns : [],
      perPage: typeof parsed.perPage === "number" ? parsed.perPage : 20,
      wrapText: !!parsed.wrapText,
      sort: parsed.sort ?? null,
      savedViews: Array.isArray(parsed.savedViews) ? parsed.savedViews : [],
      filterRules: Array.isArray(parsed.filterRules) ? parsed.filterRules : [],
      columnWidths:
        parsed.columnWidths && typeof parsed.columnWidths === "object"
          ? parsed.columnWidths
          : {},
    };
  } catch {
    return defaultPrefs();
  }
}

function savePrefs(key: string, prefs: Prefs) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(prefs)); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter operators
// ─────────────────────────────────────────────────────────────────────────────

const OP_LABEL: Record<FilterOp, string> = {
  is: "is",
  isNot: "is not",
  contains: "contains",
  doesNotContain: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  gt: "greater than",
  lt: "less than",
  gte: "greater than or equal",
  lte: "less than or equal",
  before: "is before",
  after: "is after",
};

/**
 * Operators offered per field kind. Text-y kinds get `contains`/`startsWith`
 * etc; numeric and date kinds get comparison operators; everything supports
 * empty/non-empty. Keep this list small — too many options paralyse users.
 */
function operatorsForKind(kind: FieldKind): FilterOp[] {
  switch (kind) {
    case "number":
    case "currency":
      return ["is", "isNot", "gt", "lt", "gte", "lte", "isEmpty", "isNotEmpty"];
    case "date":
      return ["is", "isNot", "before", "after", "isEmpty", "isNotEmpty"];
    case "status":
      return ["is", "isNot", "isEmpty", "isNotEmpty"];
    default:
      return [
        "is",
        "isNot",
        "contains",
        "doesNotContain",
        "startsWith",
        "endsWith",
        "isEmpty",
        "isNotEmpty",
      ];
  }
}

/** True iff the op doesn't need a value box (the value box is hidden). */
function isUnaryOp(op: FilterOp): boolean {
  return op === "isEmpty" || op === "isNotEmpty";
}

/**
 * Evaluate a single filter rule against a row's value. Returns true to KEEP
 * the row. Null/empty input is treated as "no value" for emptiness checks
 * and as non-matching for everything else.
 */
function evaluateRule<T>(rule: FilterRule, column: EMColumn<T>, row: T): boolean {
  const raw = column.value(row);
  const isBlank = raw == null || raw === "";

  if (rule.op === "isEmpty") return isBlank;
  if (rule.op === "isNotEmpty") return !isBlank;
  if (isBlank) return false;

  const sVal = String(raw).toLowerCase();
  const sRule = rule.value.toLowerCase();

  switch (rule.op) {
    case "is":
      return sVal === sRule;
    case "isNot":
      return sVal !== sRule;
    case "contains":
      return sVal.includes(sRule);
    case "doesNotContain":
      return !sVal.includes(sRule);
    case "startsWith":
      return sVal.startsWith(sRule);
    case "endsWith":
      return sVal.endsWith(sRule);
    case "gt":
    case "lt":
    case "gte":
    case "lte": {
      const a = Number(raw);
      const b = Number(rule.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (rule.op === "gt") return a > b;
      if (rule.op === "lt") return a < b;
      if (rule.op === "gte") return a >= b;
      return a <= b;
    }
    case "before":
    case "after": {
      const a = new Date(String(raw)).getTime();
      const b = new Date(rule.value).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return rule.op === "before" ? a < b : a > b;
    }
    default:
      return true;
  }
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
    selectedId,
    onRowClick,
    onView,
    onEdit,
    onDelete,
    onImport,
    extraToolbarActions,
    hideToolbar,
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
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false);

  // Column resize is driven by mouse-move handlers attached on demand. We
  // hold the in-progress drag in a ref instead of state to avoid re-rendering
  // the whole table on every pixel of mouse movement.
  const resizeStateRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  const columnsById = useMemo(() => {
    const map = new Map<string, EMColumn<T>>();
    columns.forEach((c) => map.set(c.id, c));
    return map;
  }, [columns]);

  // Look up a column's effective width: per-user override → declared width → default.
  const widthOf = (id: string) =>
    prefs.columnWidths[id] ?? columnsById.get(id)?.width ?? COL_W_DATA;

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
  // Two filter layers: the toolbar search box (matches anywhere in any cell)
  // and the structured filter sidebar rules (AND across rules, with kind-aware
  // operators). A row must pass both to be visible.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const activeRules = prefs.filterRules.filter(
      (r) => columnsById.has(r.fieldId) && (isUnaryOp(r.op) || r.value !== ""),
    );

    if (!q && activeRules.length === 0) return rows;

    return rows.filter((row) => {
      if (q) {
        const hit = columns.some((c) => {
          const v = c.value(row);
          return v != null && String(v).toLowerCase().includes(q);
        });
        if (!hit) return false;
      }
      for (const rule of activeRules) {
        const col = columnsById.get(rule.fieldId);
        if (!col) continue;
        if (!evaluateRule(rule, col, row)) return false;
      }
      return true;
    });
  }, [rows, search, columns, prefs.filterRules, columnsById]);

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
      setPrefs((p) => ({
        ...p,
        hiddenColumns: columns.filter((c) => c.defaultHidden).map((c) => c.id),
        sort: null,
        filterRules: [],
        columnWidths: {},
      }));
      setPage(1);
      return;
    }
    setActiveView(view.id);
    setSearch(view.filters.search);
    setPrefs((p) => ({
      ...p,
      hiddenColumns: view.hiddenColumns,
      sort: view.sort,
      filterRules: view.filterRules ?? [],
      columnWidths: view.columnWidths ?? {},
    }));
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
      filterRules: prefs.filterRules,
      columnWidths: prefs.columnWidths,
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

  // ── Filter rule helpers ──────────────────────────────────────────────────
  const setRule = (fieldId: string, partial: Partial<FilterRule>) => {
    setPrefs((p) => {
      const existing = p.filterRules.find((r) => r.fieldId === fieldId);
      if (existing) {
        return {
          ...p,
          filterRules: p.filterRules.map((r) =>
            r.fieldId === fieldId ? { ...r, ...partial } : r,
          ),
        };
      }
      // Adding a brand-new rule: default to first valid op for the kind.
      const col = columnsById.get(fieldId);
      const op = col ? operatorsForKind(col.kind)[0] : "is";
      return {
        ...p,
        filterRules: [...p.filterRules, { fieldId, op, value: "", ...partial }],
      };
    });
    setPage(1);
  };

  const removeRule = (fieldId: string) => {
    setPrefs((p) => ({
      ...p,
      filterRules: p.filterRules.filter((r) => r.fieldId !== fieldId),
    }));
    setPage(1);
  };

  const clearAllRules = () => {
    setPrefs((p) => ({ ...p, filterRules: [] }));
    setPage(1);
  };

  const activeRuleCount = prefs.filterRules.filter(
    (r) => isUnaryOp(r.op) || r.value !== "",
  ).length;

  // ── Column resize ────────────────────────────────────────────────────────
  const startResize = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStateRef.current = {
      id,
      startX: e.clientX,
      startWidth: widthOf(id),
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = ev.clientX - state.startX;
      // Floor at 60px so columns can't shrink past the icon + a few chars.
      const next = Math.max(60, state.startWidth + delta);
      setPrefs((p) => ({
        ...p,
        columnWidths: { ...p.columnWidths, [state.id]: next },
      }));
    };
    const onUp = () => {
      resizeStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const resetColumnWidth = (id: string) => {
    setPrefs((p) => {
      const { [id]: _, ...rest } = p.columnWidths;
      return { ...p, columnWidths: rest };
    });
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
      {!hideToolbar && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-background print:hidden">
        {/* Filter — opens the structured sidebar where rules are built
            per-field with kind-aware operators. The active rule count is
            shown as a badge so users can see at a glance whether any
            filtering is currently applied. */}
        <Button
          variant={filterSidebarOpen || activeRuleCount > 0 ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => setFilterSidebarOpen((o) => !o)}
        >
          <Filter className="h-3.5 w-3.5" /> Filter
          {activeRuleCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-background/30 text-[10px] font-semibold">
              {activeRuleCount}
            </span>
          )}
        </Button>

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
      )}

      {/* Selection summary */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-primary/5 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Body — filter sidebar slides in on the left, table fills the rest. */}
      <div className="flex-1 min-h-0 flex">
        {filterSidebarOpen && (
          <FilterSidebar
            columns={columns}
            rules={prefs.filterRules}
            onSetRule={setRule}
            onRemoveRule={removeRule}
            onClearAll={clearAllRules}
            onSave={() => setSaveViewOpen(true)}
            onClose={() => setFilterSidebarOpen(false)}
          />
        )}

      {/* Table */}
      <div
        ref={tableRef}
        className="flex-1 min-h-0 overflow-auto [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y]"
      >
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
              <col key={c.id} style={{ width: widthOf(c.id) }} />
            ))}
          </colgroup>

          <thead className="sticky top-0 z-10">
            {/* Section banner row */}
            <tr>
              <th className="bg-muted border-b border-r h-9 md:sticky md:left-0 z-30" />
              <th
                className="bg-muted border-b border-r h-9 md:sticky z-30 text-xs font-semibold text-muted-foreground text-center"
                style={{ left: COL_W_CHECK }}
              >
                #
              </th>
              <th
                className="bg-muted border-b border-r h-9 md:sticky z-30 text-xs font-semibold text-muted-foreground text-center"
                style={{ left: COL_W_CHECK + COL_W_NUM }}
              >
                Actions
              </th>
              {sectionGroups.map((g, i) => (
                <th
                  key={`${g.section}-${i}`}
                  colSpan={g.span}
                  className="bg-muted border-b border-r h-9 px-3 text-xs font-semibold text-foreground text-left whitespace-nowrap"
                >
                  {g.section}
                </th>
              ))}
            </tr>
            {/* Field row */}
            <tr>
              <th className="bg-background border-b border-r h-14 px-2 md:sticky md:left-0 z-30 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">
                <Checkbox
                  checked={isAllPageSelected}
                  onCheckedChange={(v) => toggleAllOnPage(!!v)}
                  aria-label="Select all on page"
                />
              </th>
              <th
                className="bg-background border-b border-r h-14 md:sticky z-30 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]"
                style={{ left: COL_W_CHECK }}
              />
              <th
                className="bg-background border-b border-r h-14 md:sticky z-30 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]"
                style={{ left: COL_W_CHECK + COL_W_NUM }}
              />
              {visibleColumns.map((c) => {
                const Icon = KIND_ICON[c.kind];
                const isSorted = prefs.sort?.field === c.id;
                return (
                  <th
                    key={c.id}
                    className="group/col relative bg-background border-b border-r h-14 px-3 text-left align-middle"
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
                    {/* Resize handle — narrow drag strip on the right edge.
                        Opacity-0 by default so it stays out of the way until
                        the user hovers the column header, then a subtle blue
                        line shows where to grab. Double-click resets to the
                        default width. */}
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${c.label} column`}
                      title="Drag to resize · double-click to reset"
                      onMouseDown={(e) => startResize(c.id, e)}
                      onDoubleClick={() => resetColumnWidth(c.id)}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover/col:opacity-100 hover:bg-primary/50 transition-opacity z-10 select-none"
                    />
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
              const isSelected = id === selectedId;
              return (
                <tr
                  key={id}
                  className={cn(
                    "group hover:bg-muted/30 cursor-pointer",
                    checked && "bg-primary/5",
                    isSelected && "bg-primary/[0.08] hover:bg-primary/[0.12]",
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  <td
                    className="border-b border-r px-2 md:sticky md:left-0 bg-background group-hover:bg-muted z-20 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]"
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
                    className="border-b border-r md:sticky bg-background group-hover:bg-muted z-20 text-xs text-muted-foreground tabular-nums text-center shadow-[1px_0_0_0_rgba(0,0,0,0.1)]"
                    style={{ left: COL_W_CHECK }}
                  >
                    {start + idx + 1}
                  </td>
                  <td
                    className="border-b border-r md:sticky bg-background group-hover:bg-muted z-20 text-center shadow-[1px_0_0_0_rgba(0,0,0,0.1)]"
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
                        "border-b border-r px-3 text-sm align-middle bg-background group-hover:bg-muted/30 transition-colors",
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

// ─────────────────────────────────────────────────────────────────────────────
// Filter sidebar
// ─────────────────────────────────────────────────────────────────────────────

interface FilterSidebarProps<T> {
  columns: EMColumn<T>[];
  rules: FilterRule[];
  onSetRule: (fieldId: string, partial: Partial<FilterRule>) => void;
  onRemoveRule: (fieldId: string) => void;
  onClearAll: () => void;
  onSave: () => void;
  onClose: () => void;
}

function FilterSidebar<T>({
  columns,
  rules,
  onSetRule,
  onRemoveRule,
  onClearAll,
  onSave,
  onClose,
}: FilterSidebarProps<T>) {
  const [fieldSearch, setFieldSearch] = useState("");

  const ruleByField = useMemo(() => {
    const m = new Map<string, FilterRule>();
    rules.forEach((r) => m.set(r.fieldId, r));
    return m;
  }, [rules]);

  const filteredColumns = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q),
    );
  }, [columns, fieldSearch]);

  return (
    <aside className="w-72 shrink-0 border-r bg-background flex flex-col overflow-hidden print:hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">Filters</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Close filters">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search fields"
            value={fieldSearch}
            onChange={(e) => setFieldSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filter by field
        </div>
        {filteredColumns.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-muted-foreground">No fields match.</p>
        ) : (
          <ul className="px-1.5 pb-3 space-y-1">
            {filteredColumns.map((c) => {
              const rule = ruleByField.get(c.id);
              const checked = !!rule;
              const ops = operatorsForKind(c.kind);
              return (
                <li key={c.id} className={cn("rounded-md", checked && "bg-muted/40")}>
                  <label className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        if (v) onSetRule(c.id, {});
                        else onRemoveRule(c.id);
                      }}
                    />
                    <span className="text-sm flex-1 truncate" title={`${c.section} · ${c.label}`}>
                      {c.label}
                    </span>
                  </label>
                  {checked && rule && (
                    <div className="px-2 pb-2 space-y-1.5">
                      <Select
                        value={rule.op}
                        onValueChange={(op) => onSetRule(c.id, { op: op as FilterOp })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ops.map((op) => (
                            <SelectItem key={op} value={op} className="text-xs">
                              {OP_LABEL[op]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!isUnaryOp(rule.op) && (
                        <FilterValueInput
                          kind={c.kind}
                          value={rule.value}
                          onChange={(v) => onSetRule(c.id, { value: v })}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t px-3 py-2 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={onClearAll}
          disabled={rules.length === 0}
        >
          Clear all
        </Button>
        <Button
          size="sm"
          className="h-8 ml-auto"
          onClick={onSave}
          disabled={rules.length === 0}
        >
          Save
        </Button>
      </div>
    </aside>
  );
}

function FilterValueInput({
  kind,
  value,
  onChange,
}: {
  kind: FieldKind;
  value: string;
  onChange: (v: string) => void;
}) {
  if (kind === "date") {
    return (
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
    );
  }
  if (kind === "number" || kind === "currency") {
    return (
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Value"
        className="h-8 text-xs"
      />
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
      className="h-8 text-xs"
    />
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
