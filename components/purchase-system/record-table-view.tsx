"use client";

/**
 * Generic workspace list for a purchase document. Builds DataTable columns from
 * the submodule schema, wires search + status + master filters, and drives
 * create/edit/delete through the optimistic provider. Shared by all five
 * documents (PR, RFQ, PO, GRN, Payment).
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
  FileText,
  Search as SearchIcon,
  FileSignature,
  PackageCheck,
  Truck,
  Banknote,
  Plus,
  Search,
  Loader2,
  RotateCcw,
  Paperclip,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePurchase } from "@/lib/purchase-system/store";
import { getSchema } from "@/lib/purchase-system/schema";
import { formatMoney, formatNumber, formatDate, resolveStatus } from "@/lib/purchase-system/format";
import { mediaCount } from "./media-field";
import { lineSummary } from "./line-items-field";
import type { FieldDef, PurchaseRecord, PurchaseSubmoduleKey } from "@/lib/purchase-system/types";
import { RecordFormSheet } from "./record-form-sheet";
import { RecordPreview } from "./record-preview";

const ICON: Record<PurchaseSubmoduleKey, React.ComponentType<{ className?: string }>> = {
  supplier: Truck,
  pr: FileText,
  sourcing: SearchIcon,
  po: FileSignature,
  grn: PackageCheck,
  payment: Banknote,
};

const PAGE_SIZE = 25;

function cellFor(field: FieldDef, record: PurchaseRecord): React.ReactNode {
  if (field.type === "checkbox") {
    return record[field.key] ? (
      <Check className="h-4 w-4 text-primary" />
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  if (field.type === "lineItems") {
    const s = lineSummary(record[field.key], field.columns);
    if (s.invoices === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span>
          {s.invoices} inv · {s.poLines} PO
        </span>
        <Badge variant={s.anyPartial ? "outline" : "default"} className="h-4 px-1.5 text-[10px]">
          {s.anyPartial ? "Partial" : "Full"}
        </Badge>
      </span>
    );
  }
  if (field.type === "media") {
    const n = mediaCount(record[field.key]);
    return n > 0 ? (
      <span className="inline-flex items-center gap-1 text-xs">
        <Paperclip className="h-3 w-3" />
        {n}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  if (field.type === "status") {
    const s = resolveStatus(field, record[field.key]);
    return <Badge variant={s.variant}>{s.label}</Badge>;
  }
  if (field.type === "currency") return <span className="tabular-nums">{formatMoney(record[field.key])}</span>;
  if (field.type === "number") return <span className="tabular-nums">{formatNumber(record[field.key])}</span>;
  if (field.type === "date") return formatDate(record[field.key]);
  const v = record[field.key];
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  if (field.type === "select") {
    const opt = field.options?.find((o) => o.value === v);
    return opt ? opt.label : String(v);
  }
  if (field.key === "docNo") return <span className="font-mono text-xs">{String(v)}</span>;
  return String(v);
}

function copyFor(field: FieldDef, record: PurchaseRecord): string {
  if (field.type === "checkbox") return record[field.key] ? "Yes" : "No";
  if (field.type === "status") return resolveStatus(field, record[field.key]).label;
  if (field.type === "lineItems") {
    const s = lineSummary(record[field.key], field.columns);
    return s.invoices > 0 ? `${s.invoices} invoice${s.invoices === 1 ? "" : "s"}, ${s.poLines} PO line${s.poLines === 1 ? "" : "s"}` : "";
  }
  if (field.type === "media") {
    const n = mediaCount(record[field.key]);
    return n > 0 ? `${n} file${n === 1 ? "" : "s"}` : "";
  }
  const v = record[field.key];
  return v == null ? "" : String(v);
}

export function RecordTableView({ submodule }: { submodule: PurchaseSubmoduleKey }) {
  const schema = getSchema(submodule);
  const { ready, records, createRecord, updateRecord, deleteRecord, getMasterOptions } = usePurchase();
  const Icon = ICON[submodule];

  const rows = records[submodule];
  const statusField = useMemo(
    () => schema.fields.find((f) => f.key === schema.statusKey),
    [schema],
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [masterFilters, setMasterFilters] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filterFields = useMemo(() => schema.fields.filter((f) => f.type === "master"), [schema]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((rec) => {
      if (q) {
        const hay = `${rec.docNo ?? ""} ${rec.itemName ?? ""} ${rec.supplier ?? ""} ${rec.supplierName ?? ""} ${rec.poRef ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter && rec[schema.statusKey] !== statusFilter) return false;
      for (const f of filterFields) {
        const want = masterFilters[f.key];
        if (want && rec[f.key] !== want) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, masterFilters, filterFields, schema.statusKey]);

  const pageRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const columns: ColumnDef<PurchaseRecord>[] = useMemo(() => {
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
        cell: (rec: PurchaseRecord) => (
          <span className={cn(rec._deleting && "opacity-40 line-through")}>{cellFor(f, rec)}</span>
        ),
        copyValue: (rec: PurchaseRecord) => copyFor(f, rec),
      }));
  }, [schema]);

  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  const activeFilters = [
    statusFilter && statusField
      ? { key: "status", label: `Status: ${resolveStatus(statusField, statusFilter).label}` }
      : null,
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
  const openEdit = (rec: PurchaseRecord) => {
    setEditing(rec);
    setFormOpen(true);
  };

  const handleSubmit = (data: Record<string, unknown>) => {
    if (editing) void updateRecord(submodule, editing.id, data);
    else void createRecord(submodule, data);
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    void deleteRecord(submodule, deletingId);
    if (selectedId === deletingId) setSelectedId(null);
    setDeletingId(null);
  };

  return (
    <>
      <WorkspaceShell
        scope={`purchase-${submodule}`}
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        previewHeader={
          selected ? (
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate font-mono">{String(selected.docNo)}</div>
              <div className="text-xs text-muted-foreground truncate">
                {String(selected.supplierName ?? selected.supplier ?? selected.itemName ?? "")}
              </div>
            </div>
          ) : null
        }
        header={
          <div className="space-y-2">
            <WorkspaceHeader
              icon={<Icon className="h-5 w-5" />}
              title={schema.label}
              subtitle={`${filtered.length} ${schema.recordNoun}${filtered.length === 1 ? "" : "s"}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={`Search ${schema.recordNoun}s…`}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="h-8 w-44 sm:w-56 pl-8"
                />
              </div>
              <ManageColumnsButton tableId={`purchase-${submodule}`} columns={columns} variant="dialog" />
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">New {schema.recordNoun}</span>
              </Button>
            </WorkspaceHeader>

            <div className="px-4 sm:px-6 pb-1 flex flex-wrap items-center gap-2">
              {statusField?.statusOptions && (
                <SelectFilter
                  label="Status"
                  value={statusFilter}
                  onChange={(v) => {
                    setStatusFilter(v);
                    setPage(0);
                  }}
                  options={statusField.statusOptions.map((s) => ({ value: s.value, label: s.label }))}
                />
              )}
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
          <DataTable<PurchaseRecord>
            tableId={`purchase-${submodule}`}
            columns={columns}
            rows={pageRows}
            rowId={(r) => r.id}
            isLoading={!ready}
            selectedId={selectedId}
            onRowClick={(r) => setSelectedId(r.id)}
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
                  <p className="font-medium">{ready ? `No ${schema.recordNoun}s found` : "Loading…"}</p>
                  {ready && (
                    <p className="text-sm text-muted-foreground">
                      {rows.length === 0
                        ? `Create your first ${schema.recordNoun} to get started.`
                        : "Try adjusting your search or filters."}
                    </p>
                  )}
                </div>
                {ready && rows.length === 0 && (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New {schema.recordNoun}
                  </Button>
                )}
              </div>
            }
          />
        }
        preview={
          selected ? (
            <RecordPreview
              schema={schema}
              record={selected}
              onEdit={() => openEdit(selected)}
              onDelete={() => setDeletingId(selected.id)}
            />
          ) : null
        }
      />

      <RecordFormSheet
        schema={schema}
        open={formOpen}
        record={editing}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {schema.recordNoun}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the document from {schema.label}. This action cannot be undone.
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

/** Restore sample data — shown on the Master page footer. */
export function ResetDataButton() {
  const { resetAll } = usePurchase();
  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void resetAll()}>
      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset sample data
    </Button>
  );
}
