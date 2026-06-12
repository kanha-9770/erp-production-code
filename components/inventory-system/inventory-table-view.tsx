"use client";

/**
 * Generic workspace list for an inventory submodule. Given a submodule key it
 * derives the schema, builds the DataTable columns from the schema's `inTable`
 * fields, wires search + master filters, and drives create/edit/delete through
 * the optimistic provider. Used by all three submodule pages — store, machine,
 * metal — with zero per-page duplication.
 *
 * Data fetching is SERVER-SIDE: search / status / master filters / sort /
 * pagination are pushed to Postgres via `useInventoryList`, so opening a tab
 * with thousands of records fetches only the current page (one round-trip) and
 * stays fast as the dataset grows. Heavy fields (the base64 image, the
 * description) are stripped from list rows and lazy-loaded for the preview/edit
 * pane on row-select.
 */

import { useEffect, useMemo, useState } from "react";
import {
  WorkspaceShell,
  WorkspaceHeader,
  DataTable,
  type ColumnDef,
  SelectFilter,
  ActiveFilterPills,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AnimatePresence, motion } from "framer-motion";
import {
  Boxes,
  Cog,
  Layers,
  Plus,
  Search,
  Loader2,
  RotateCcw,
  ImageOff,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInventory } from "@/lib/inventory-system/store";
import { useInventoryList } from "@/lib/inventory-system/use-inventory-list";
import { inventoryService, type InventoryListQuery } from "@/lib/inventory-system/service";
import { getSchema } from "@/lib/inventory-system/schema";
import {
  formatMoney,
  formatNumber,
  formatDate,
  deriveStockStatus,
  STATUS_LABEL,
  STATUS_VARIANT,
  getApprovalMeta,
  APPROVAL_BADGE,
} from "@/lib/inventory-system/format";
import type {
  FieldDef,
  InventoryItem,
  ItemStatus,
  SubmoduleKey,
} from "@/lib/inventory-system/types";
import { ItemFormSheet } from "./item-form-sheet";
import { ItemPreview } from "./item-preview";
import { useToast } from "@/hooks/use-toast";

const ICON: Record<SubmoduleKey, React.ComponentType<{ className?: string }>> = {
  store: Boxes,
  machine: Cog,
  metal: Layers,
};

const PAGE_SIZE_OPTIONS = [100, 300, 500, 1000, 2000];

function cellFor(field: FieldDef, item: InventoryItem): React.ReactNode {
  if (field.type === "image") {
    const src = item[field.key] as string | undefined;
    return (
      <div className="h-8 w-8 rounded-md border bg-muted/40 overflow-hidden flex items-center justify-center">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-3.5 w-3.5 text-muted-foreground/60" />
        )}
      </div>
    );
  }
  if (field.type === "status") {
    const a = getApprovalMeta(item);
    if (a && (a.status === "PENDING" || a.status === "REJECTED")) {
      const b = APPROVAL_BADGE[a.status];
      return <Badge variant={b.variant}>{b.label}</Badge>;
    }
    const s = deriveStockStatus(item);
    return <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABEL[s]}</Badge>;
  }
  if (field.type === "currency") return <span className="tabular-nums">{formatMoney(item[field.key])}</span>;
  if (field.type === "number") return <span className="tabular-nums">{formatNumber(item[field.key])}</span>;
  if (field.type === "date") return formatDate(item[field.key]);
  const v = item[field.key];
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  if (field.key === "itemCode") return <span className="font-mono text-xs">{String(v)}</span>;
  if (field.key === "itemName") return <span className="font-medium">{String(v)}</span>;
  return String(v);
}

function copyFor(field: FieldDef, item: InventoryItem): string {
  if (field.type === "status") return STATUS_LABEL[deriveStockStatus(item)];
  const v = item[field.key];
  return v == null ? "" : String(v);
}

export function InventoryTableView({ submodule }: { submodule: SubmoduleKey }) {
  const schema = getSchema(submodule);
  const { toast } = useToast();
  const {
    ready,
    revalidateToken,
    createItem,
    updateItem,
    deleteItem,
    bulkDelete,
    getMasterOptions,
  } = useInventory();
  const Icon = ICON[submodule];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [masterFilters, setMasterFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  // Multi-row selection for bulk operations (persists across pages — ids only).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  // Rows mid-delete — dimmed until the next refetch removes them.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Which master fields to expose as quick filters (the dropdown-backed ones).
  const filterFields = useMemo(
    () => schema.fields.filter((f) => f.type === "master"),
    [schema],
  );

  // The server query — the single source of truth for what's fetched.
  const query: InventoryListQuery = useMemo(
    () => ({
      submodule,
      page,
      pageSize,
      search,
      status: statusFilter || undefined,
      masters: masterFilters,
      sortKey: sort?.key,
      sortDir: sort?.dir,
    }),
    [submodule, page, pageSize, search, statusFilter, masterFilters, sort],
  );

  const { rows, total, lowCount, outCount, loading, resolvedQuery } = useInventoryList(query);

  // Reset paging + selection + sort when switching submodule.
  useEffect(() => {
    setSelectedIds(new Set());
    setPendingIds(new Set());
    setPage(0);
    setSelectedId(null);
    setSelectedItem(null);
    setSort(null);
    setStatusFilter("");
    setMasterFilters({});
    setSearch("");
  }, [submodule]);

  // If a delete/filter shrinks the result set past the current page, clamp to
  // the last valid page (drives off the freshly-fetched total, not row count,
  // so we land on the right page instead of always snapping to 0).
  useEffect(() => {
    if (loading) return;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [loading, total, pageSize, page]);

  // Clear the "deleting" dim once a refetch lands.
  useEffect(() => {
    setPendingIds((prev) => (prev.size ? new Set() : prev));
  }, [rows]);

  // Lazy-load the FULL record (image + description) for the preview/edit pane.
  // Seeded synchronously from the clicked row so the pane opens instantly, then
  // replaced with the full record. Re-fetches after mutations (revalidateToken).
  useEffect(() => {
    if (!selectedId) {
      setSelectedItem(null);
      return;
    }
    let alive = true;
    inventoryService
      .getItem(selectedId)
      .then((full) => {
        if (alive) setSelectedItem(full);
      })
      .catch(() => {
        /* keep the lean seed if the full fetch fails */
      });
    return () => {
      alive = false;
    };
  }, [selectedId, revalidateToken]);

  // Pagination math driven by the server total.
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * pageSize;

  // Dim rows that are mid-delete (re-uses the cell's `_deleting` styling).
  const displayRows = useMemo(
    () => (pendingIds.size ? rows.map((r) => (pendingIds.has(r.id) ? { ...r, _deleting: true } : r)) : rows),
    [rows, pendingIds],
  );

  const hasFilters = !!(search.trim() || statusFilter || Object.values(masterFilters).some(Boolean));
  const firstLoading = loading && rows.length === 0;

  // ── Bulk selection / operations ──
  const selectAllFiltered = async () => {
    setActionBusy(true);
    try {
      // Use the resolved query (debounced search baked in) so the selected set
      // matches the displayed total exactly.
      const ids = await inventoryService.listItemIds(resolvedQuery ?? query);
      setSelectedIds(new Set(ids));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not select all",
        description: (err as Error)?.message ?? "Please try again.",
      });
    } finally {
      setActionBusy(false);
    }
  };
  const clearSelection = () => setSelectedIds(new Set());

  const exportSelected = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setActionBusy(true);
    try {
      const chosen = await inventoryService.getItemsByIds(ids);
      if (!chosen.length) return;
      const cols = schema.fields.filter((f) => f.inTable && f.type !== "image");
      const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [cols.map((c) => esc(c.label)).join(",")];
      for (const it of chosen) lines.push(cols.map((c) => esc(copyFor(c, it))).join(","));
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${schema.route}-selected-${chosen.length}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not export",
        description: (err as Error)?.message ?? "Please try again.",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const undim = (ids: string[]) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((i) => next.delete(i));
      return next;
    });

  const confirmBulkDelete = async () => {
    const ids = [...selectedIds];
    setBulkConfirm(false);
    if (!ids.length) return;
    setBulkBusy(true);
    setPendingIds((prev) => new Set([...prev, ...ids]));
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    setSelectedIds(new Set());
    try {
      await bulkDelete(submodule, ids);
      // success → revalidate refetch removes the rows (and clears the dim).
    } catch {
      undim(ids); // failed → restore the rows we dimmed (toast already shown)
    } finally {
      setBulkBusy(false);
    }
  };

  const columns: ColumnDef<InventoryItem>[] = useMemo(() => {
    return schema.fields
      .filter((f) => f.inTable)
      .map((f) => ({
        id: f.key,
        header: f.label,
        width: f.width,
        pinned: f.pinned,
        defaultHidden: f.defaultHidden,
        align: f.align,
        // The image column can't be sorted server-side (it's stripped); status
        // is derived. Everything else maps to a sortable JSON/column key.
        sortKey: f.type === "image" ? undefined : f.key,
        group: f.section,
        cell: (item: InventoryItem) => (
          <span className={cn(item._deleting && "opacity-40 line-through")}>
            {cellFor(f, item)}
          </span>
        ),
        copyValue: (item: InventoryItem) => copyFor(f, item),
      }));
  }, [schema]);

  const selected = selectedItem;

  const activeFilters = [
    statusFilter ? { key: "status", label: `Status: ${STATUS_LABEL[statusFilter as ItemStatus]}` } : null,
    ...filterFields
      .filter((f) => masterFilters[f.key])
      .map((f) => ({ key: f.key, label: `${f.label}: ${masterFilters[f.key]}` })),
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const clearFilter = (key: string) => {
    if (key === "status") setStatusFilter("");
    else setMasterFilters((m) => ({ ...m, [key]: "" }));
    setPage(0);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setFormOpen(true);
  };
  const openPreview = (item: InventoryItem) => {
    setSelectedId(item.id);
    setSelectedItem(item); // instant lean seed; effect replaces with full record
  };

  const handleSubmit = (data: Record<string, unknown>) => {
    if (editing) {
      void updateItem(submodule, editing.id, data);
    } else {
      // Jump to page 1 so the new (top-of-list) record is visible after refetch.
      setPage(0);
      void createItem(submodule, data);
    }
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    const id = deletingId;
    setPendingIds((prev) => new Set([...prev, id]));
    void deleteItem(submodule, id).catch(() => undim([id])); // restore on failure
    if (selectedId === id) setSelectedId(null);
    setDeletingId(null);
  };

  const handleSortChange = (column: string | null, direction: "asc" | "desc" | null) => {
    setSort(column && direction ? { key: column, dir: direction } : null);
    setPage(0);
  };

  return (
    <>
      <WorkspaceShell
        scope={`inventory-${submodule}`}
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        previewHeader={
          selected ? (
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{String(selected.itemName)}</div>
              <div className="text-xs text-muted-foreground font-mono">{String(selected.itemCode)}</div>
            </div>
          ) : null
        }
        header={
          <div className="space-y-2">
            <WorkspaceHeader
              icon={<Icon className="h-5 w-5" />}
              title={schema.label}
              subtitle={
                <span className="flex items-center gap-2">
                  {total.toLocaleString()} {schema.itemNoun}
                  {total === 1 ? "" : "s"}
                  {lowCount > 0 && (
                    <Badge variant="outline" className="h-4 text-[10px] px-1.5">
                      {lowCount} low
                    </Badge>
                  )}
                  {outCount > 0 && (
                    <Badge variant="destructive" className="h-4 text-[10px] px-1.5">
                      {outCount} out
                    </Badge>
                  )}
                  {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </span>
              }
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={`Search ${schema.itemNoun}s…`}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="h-8 w-44 sm:w-56 pl-8"
                />
              </div>
              <ManageColumnsButton tableId={`inventory-${submodule}`} columns={columns} variant="dialog" />
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">New {schema.itemNoun}</span>
              </Button>

              {/* Top-right: rows-per-page + page navigation (replaces the old
                  bottom Previous/Next footer). */}
              <div className="flex items-center gap-1.5">
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}
                >
                  <SelectTrigger className="h-8 w-[104px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">
                        {n.toLocaleString()} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap px-1 hidden md:inline">
                  {total === 0 ? "0" : `${(pageStart + 1).toLocaleString()}–${Math.min(pageStart + pageSize, total).toLocaleString()}`} of {total.toLocaleString()}
                </span>
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={safePage <= 0}
                  onClick={() => setPage(safePage - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage(safePage + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </WorkspaceHeader>

            <div className="px-4 sm:px-6 pb-1 flex flex-wrap items-center gap-2">
              <SelectFilter
                label="Status"
                value={statusFilter}
                onChange={(v) => {
                  setStatusFilter(v);
                  setPage(0);
                }}
                options={(["ACTIVE", "LOW_STOCK", "OUT_OF_STOCK", "INACTIVE"] as ItemStatus[]).map(
                  (s) => ({ value: s, label: STATUS_LABEL[s] }),
                )}
              />
              {filterFields.map((f) => (
                <SelectFilter
                  key={f.key}
                  label={f.label}
                  value={masterFilters[f.key] ?? ""}
                  onChange={(v) => {
                    setMasterFilters((m) => ({ ...m, [f.key]: v }));
                    setPage(0);
                  }}
                  options={getMasterOptions(f.master!).map((o) => ({ value: o.value, label: o.value }))}
                />
              ))}
              <ActiveFilterPills
                filters={activeFilters}
                onClear={clearFilter}
                onClearAll={() => {
                  setStatusFilter("");
                  setMasterFilters({});
                  setPage(0);
                }}
              />
            </div>

            {/* Bulk action bar — appears when rows are selected. */}
            <AnimatePresence initial={false}>
              {selectedIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="px-4 sm:px-6 pb-1 overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5">
                    <span className="text-xs font-semibold text-primary tabular-nums">
                      {selectedIds.size.toLocaleString()} selected
                    </span>
                    {selectedIds.size < total && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={selectAllFiltered} disabled={actionBusy}>
                        {actionBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                        Select all {total.toLocaleString()}
                      </Button>
                    )}
                    <div className="flex-1" />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportSelected} disabled={bulkBusy || actionBusy}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Export
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setBulkConfirm(true)}
                      disabled={bulkBusy}
                    >
                      {bulkBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={clearSelection} aria-label="Clear selection">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        }
        list={
          <DataTable<InventoryItem>
            tableId={`inventory-${submodule}`}
            columns={columns}
            rows={displayRows}
            rowId={(i) => i.id}
            isLoading={firstLoading || !ready}
            selectedId={selectedId}
            onRowClick={openPreview}
            onSortChange={handleSortChange}
            selection={{ selectedIds, onChange: setSelectedIds }}
            serverPagination={{
              page: safePage,
              pageSize,
              total,
              onPageChange: setPage,
            }}
            hidePaginationFooter
            emptyState={
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">
                    {hasFilters ? `No ${schema.itemNoun}s match` : `No ${schema.itemNoun}s yet`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {hasFilters
                      ? "Try adjusting your search or filters."
                      : `Add your first ${schema.itemNoun} to get started.`}
                  </p>
                </div>
                {!hasFilters && (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New {schema.itemNoun}
                  </Button>
                )}
              </div>
            }
          />
        }
        preview={
          selected ? (
            <ItemPreview
              schema={schema}
              item={selected}
              onEdit={() => openEdit(selected)}
              onDelete={() => setDeletingId(selected.id)}
            />
          ) : null
        }
      />

      <ItemFormSheet
        schema={schema}
        open={formOpen}
        item={editing}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {schema.itemNoun}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record from {schema.label.toLowerCase()}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkConfirm} onOpenChange={(o) => !o && setBulkConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size.toLocaleString()} {schema.itemNoun}{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected records from {schema.label.toLowerCase()}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {selectedIds.size.toLocaleString()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Small dev affordance to restore sample data — used on the Master page footer. */
export function ResetDataButton() {
  const { resetAll } = useInventory();
  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void resetAll()}>
      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset sample data
    </Button>
  );
}
