"use client";

/**
 * Generic workspace list for an inventory submodule. Given a submodule key it
 * derives the schema, builds the DataTable columns from the schema's `inTable`
 * fields, wires search + master filters, and drives create/edit/delete through
 * the optimistic provider. Used by all three submodule pages — store, machine,
 * metal — with zero per-page duplication.
 */

import { useMemo, useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Boxes,
  Cog,
  Layers,
  Plus,
  Search,
  Loader2,
  RotateCcw,
  ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInventory } from "@/lib/inventory-system/store";
import { getSchema } from "@/lib/inventory-system/schema";
import {
  formatMoney,
  formatNumber,
  formatDate,
  deriveStockStatus,
  STATUS_LABEL,
  STATUS_VARIANT,
} from "@/lib/inventory-system/format";
import type {
  FieldDef,
  InventoryItem,
  ItemStatus,
  SubmoduleKey,
} from "@/lib/inventory-system/types";
import { ItemFormSheet } from "./item-form-sheet";
import { ItemPreview } from "./item-preview";

const ICON: Record<SubmoduleKey, React.ComponentType<{ className?: string }>> = {
  store: Boxes,
  machine: Cog,
  metal: Layers,
};

const PAGE_SIZE = 25;

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
  const { ready, items, createItem, updateItem, deleteItem, getMasterOptions } = useInventory();
  const Icon = ICON[submodule];

  const rows = items[submodule];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [masterFilters, setMasterFilters] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Which master fields to expose as quick filters (the dropdown-backed ones).
  const filterFields = useMemo(
    () => schema.fields.filter((f) => f.type === "master"),
    [schema],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((item) => {
      if (q) {
        const hay = `${item.itemCode ?? ""} ${item.itemName ?? ""} ${item.brand ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter && deriveStockStatus(item) !== statusFilter) return false;
      for (const f of filterFields) {
        const want = masterFilters[f.key];
        if (want && item[f.key] !== want) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, masterFilters, filterFields]);

  // Reset to first page whenever the filtered set shrinks under the cursor.
  const pageRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

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
        sortKey: f.key,
        group: f.section,
        cell: (item: InventoryItem) => (
          <span className={cn(item._deleting && "opacity-40 line-through")}>
            {cellFor(f, item)}
          </span>
        ),
        copyValue: (item: InventoryItem) => copyFor(f, item),
      }));
  }, [schema]);

  const selected = selectedId ? rows.find((i) => i.id === selectedId) ?? null : null;

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

  const handleSubmit = (data: Record<string, unknown>) => {
    if (editing) void updateItem(submodule, editing.id, data);
    else void createItem(submodule, data);
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    void deleteItem(submodule, deletingId);
    if (selectedId === deletingId) setSelectedId(null);
    setDeletingId(null);
  };

  const lowCount = useMemo(
    () => filtered.filter((i) => deriveStockStatus(i) === "LOW_STOCK").length,
    [filtered],
  );
  const outCount = useMemo(
    () => filtered.filter((i) => deriveStockStatus(i) === "OUT_OF_STOCK").length,
    [filtered],
  );

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
                  {filtered.length} {schema.itemNoun}
                  {filtered.length === 1 ? "" : "s"}
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
          </div>
        }
        list={
          <DataTable<InventoryItem>
            tableId={`inventory-${submodule}`}
            columns={columns}
            rows={pageRows}
            rowId={(i) => i.id}
            isLoading={!ready}
            selectedId={selectedId}
            onRowClick={(i) => setSelectedId(i.id)}
            serverPagination={{
              page,
              pageSize: PAGE_SIZE,
              total: filtered.length,
              onPageChange: setPage,
            }}
            emptyState={
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  {ready ? <Icon className="h-6 w-6 text-muted-foreground" /> : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-medium">{ready ? `No ${schema.itemNoun}s found` : "Loading…"}</p>
                  {ready && (
                    <p className="text-sm text-muted-foreground">
                      {rows.length === 0
                        ? `Add your first ${schema.itemNoun} to get started.`
                        : "Try adjusting your search or filters."}
                    </p>
                  )}
                </div>
                {ready && rows.length === 0 && (
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
