"use client";

/**
 * Inward / Outward goods-movement workspace. Lists the store's stock movements
 * of one direction, with search + warehouse filter, and create/edit/delete that
 * post through the optimistic provider (adjusting the linked item's stock).
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
import { Separator } from "@/components/ui/separator";
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
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  Search,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInventory } from "@/lib/inventory-system/store";
import { MovementFormSheet } from "./movement-form-sheet";
import type { InventoryMovement, MovementDirection } from "@/lib/inventory-system/types";

const PAGE_SIZE = 25;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
function money(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? inr.format(n) : "—";
}
function fnum(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : "—";
}
function fdate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

export function MovementTableView({ direction }: { direction: MovementDirection }) {
  const { ready, movements, items, getMasterOptions, createMovement, updateMovement, deleteMovement } =
    useInventory();

  const isIn = direction === "IN";
  const Icon = isIn ? ArrowDownToLine : ArrowUpFromLine;
  const title = isIn ? "Inward" : "Outward";
  const noun = isIn ? "inward entry" : "outward entry";
  const partyHeader = isIn ? "Supplier" : "Issued To";

  const rows = useMemo(
    () => movements.filter((m) => m.direction === direction),
    [movements, direction],
  );

  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryMovement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const warehouseOptions = useMemo(
    () => getMasterOptions("warehouse").map((o) => o.value),
    [getMasterOptions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((m) => {
      if (q) {
        const hay = `${m.docNo ?? ""} ${m.itemCode ?? ""} ${m.itemName ?? ""} ${m.party ?? ""} ${m.reference ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (warehouseFilter && m.warehouse !== warehouseFilter) return false;
      return true;
    });
  }, [rows, search, warehouseFilter]);

  const pageRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Suggest the next document number for a new entry.
  const nextDocNo = useMemo(() => {
    const prefix = isIn ? "IN" : "OUT";
    let max = 0;
    for (const m of rows) {
      const match = /(\d+)\s*$/.exec(String(m.docNo ?? ""));
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `${prefix}-${String(max + 1).padStart(4, "0")}`;
  }, [rows, isIn]);

  const columns: ColumnDef<InventoryMovement>[] = useMemo(
    () => [
      { id: "docNo", header: isIn ? "Inward No." : "Outward No.", width: 130, pinned: true, sortKey: "docNo", copyValue: (m) => String(m.docNo ?? ""), cell: (m) => <span className={cn("font-mono text-xs", m._deleting && "opacity-40 line-through")}>{String(m.docNo ?? "")}</span> },
      { id: "date", header: "Date", width: 120, sortKey: "date", copyValue: (m) => fdate(m.date), cell: (m) => <span className={cn(m._deleting && "opacity-40 line-through")}>{fdate(m.date)}</span> },
      { id: "itemName", header: "Item", width: 240, pinned: true, sortKey: "itemName", copyValue: (m) => `${m.itemCode ?? ""} ${m.itemName ?? ""}`.trim(), cell: (m) => (
        <div className={cn("min-w-0", m._deleting && "opacity-40 line-through")}>
          <div className="font-medium truncate">{String(m.itemName ?? "—")}</div>
          <div className="text-[11px] text-muted-foreground truncate font-mono">{String(m.itemCode ?? "")}</div>
        </div>
      ) },
      { id: "category", header: "Category", width: 130, defaultHidden: true, copyValue: (m) => String(m.category ?? ""), cell: (m) => <span className="text-sm text-muted-foreground">{String(m.category ?? "—")}</span> },
      { id: "quantity", header: "Qty", width: 90, align: "right", sortKey: "quantity", copyValue: (m) => String(m.quantity ?? 0), cell: (m) => (
        <span className={cn("tabular-nums font-medium", isIn ? "text-emerald-600" : "text-rose-600")}>
          {isIn ? "+" : "−"}{fnum(m.quantity)}
        </span>
      ) },
      { id: "uom", header: "UOM", width: 80, copyValue: (m) => String(m.uom ?? ""), cell: (m) => <span className="text-sm">{String(m.uom ?? "—")}</span> },
      { id: "warehouse", header: "Warehouse", width: 170, copyValue: (m) => String(m.warehouse ?? ""), cell: (m) => <span className="text-sm">{String(m.warehouse ?? "—")}</span> },
      { id: "rate", header: "Rate", width: 110, align: "right", defaultHidden: true, copyValue: (m) => String(m.rate ?? 0), cell: (m) => <span className="tabular-nums">{money(m.rate)}</span> },
      { id: "amount", header: "Amount", width: 140, align: "right", sortKey: "amount", copyValue: (m) => String(m.amount ?? 0), cell: (m) => <span className="tabular-nums">{money(m.amount)}</span> },
      { id: "party", header: partyHeader, width: 160, copyValue: (m) => String(m.party ?? ""), cell: (m) => <span className="text-sm">{String(m.party ?? "—")}</span> },
      { id: "reference", header: "Reference", width: 130, defaultHidden: true, copyValue: (m) => String(m.reference ?? ""), cell: (m) => <span className="text-sm text-muted-foreground">{String(m.reference ?? "—")}</span> },
    ],
    [isIn, partyHeader],
  );

  const selected = selectedId ? rows.find((m) => m.id === selectedId) ?? null : null;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (m: InventoryMovement) => {
    setEditing(m);
    setFormOpen(true);
  };

  const handleSubmit = (data: Record<string, unknown>) => {
    if (editing) void updateMovement(editing.id, data);
    else void createMovement(data);
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    void deleteMovement(deletingId);
    if (selectedId === deletingId) setSelectedId(null);
    setDeletingId(null);
  };

  const totalQty = filtered.reduce((s, m) => s + (Number(m.quantity ?? 0) || 0), 0);

  return (
    <>
      <WorkspaceShell
        scope={`inventory-movement-${direction}`}
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        previewHeader={
          selected ? (
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate font-mono">{String(selected.docNo)}</div>
              <div className="text-xs text-muted-foreground truncate">{String(selected.itemName ?? "")}</div>
            </div>
          ) : null
        }
        header={
          <div className="space-y-2">
            <WorkspaceHeader
              icon={<Icon className="h-5 w-5" />}
              title={`${title} — Goods Movement`}
              subtitle={`${filtered.length} ${filtered.length === 1 ? "entry" : "entries"} · ${fnum(totalQty)} qty`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search item, doc, party…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="h-8 w-44 sm:w-56 pl-8"
                />
              </div>
              <ManageColumnsButton tableId={`inventory-movement-${direction}`} columns={columns} variant="dialog" />
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">New {noun}</span>
              </Button>
            </WorkspaceHeader>

            <div className="px-4 sm:px-6 pb-1 flex flex-wrap items-center gap-2">
              <SelectFilter
                label="Warehouse"
                value={warehouseFilter}
                onChange={(v) => {
                  setWarehouseFilter(v);
                  setPage(0);
                }}
                options={warehouseOptions.map((w) => ({ value: w, label: w }))}
              />
              <ActiveFilterPills
                filters={warehouseFilter ? [{ key: "warehouse", label: `Warehouse: ${warehouseFilter}` }] : []}
                onClear={() => setWarehouseFilter("")}
                onClearAll={() => {
                  setWarehouseFilter("");
                  setPage(0);
                }}
              />
            </div>
          </div>
        }
        list={
          <DataTable<InventoryMovement>
            tableId={`inventory-movement-${direction}`}
            columns={columns}
            rows={pageRows}
            rowId={(m) => m.id}
            isLoading={!ready}
            selectedId={selectedId}
            onRowClick={(m) => setSelectedId(m.id)}
            serverPagination={{ page, pageSize: PAGE_SIZE, total: filtered.length, onPageChange: setPage }}
            emptyState={
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  {ready ? <Icon className="h-6 w-6 text-muted-foreground" /> : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-medium">{ready ? `No ${title.toLowerCase()} entries yet` : "Loading…"}</p>
                  {ready && (
                    <p className="text-sm text-muted-foreground">
                      Record the first {noun} to start tracking {isIn ? "goods received" : "goods issued"}.
                    </p>
                  )}
                </div>
                {ready && (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New {noun}
                  </Button>
                )}
              </div>
            }
          />
        }
        preview={
          selected ? (
            <MovementPreview movement={selected} partyHeader={partyHeader} onEdit={() => openEdit(selected)} onDelete={() => setDeletingId(selected.id)} />
          ) : null
        }
      />

      <MovementFormSheet
        direction={direction}
        open={formOpen}
        record={editing}
        storeItems={items.store}
        warehouseOptions={warehouseOptions}
        defaultDocNo={nextDocNo}
        takenDocNos={rows
          .filter((m) => m.id !== editing?.id)
          .map((m) => String(m.docNo ?? "").trim().toLowerCase())}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {noun}?</AlertDialogTitle>
            <AlertDialogDescription>
              This reverses its stock effect on the linked item ({isIn ? "decreasing" : "increasing"} current stock by the
              entry quantity). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MovementPreview({
  movement,
  partyHeader,
  onEdit,
  onDelete,
}: {
  movement: InventoryMovement;
  partyHeader: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isIn = movement.direction === "IN";
  const rows: Array<[string, React.ReactNode]> = [
    ["Date", fdate(movement.date)],
    ["Item Code", <span className="font-mono text-xs" key="ic">{String(movement.itemCode ?? "—")}</span>],
    ["Item", String(movement.itemName ?? "—")],
    ["Category", String(movement.category ?? "—")],
    ["Quantity", <span className={cn("font-medium tabular-nums", isIn ? "text-emerald-600" : "text-rose-600")} key="q">{isIn ? "+" : "−"}{fnum(movement.quantity)} {String(movement.uom ?? "")}</span>],
    ["Rate", money(movement.rate)],
    ["Amount", money(movement.amount)],
    ["Warehouse", String(movement.warehouse ?? "—")],
    [partyHeader, String(movement.party ?? "—")],
    ["Reference", String(movement.reference ?? "—")],
  ];

  return (
    <div className="p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight font-mono truncate">{String(movement.docNo)}</h2>
            {movement._optimistic && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> saving…
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">{String(movement.itemName ?? "")}</div>
        </div>
        <Badge variant={isIn ? "default" : "destructive"}>{isIn ? "Inward" : "Outward"}</Badge>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
        </Button>
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
        </Button>
      </div>

      <Separator />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map(([k, v], i) => (
          <div key={i} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-sm font-medium truncate">{v}</dd>
          </div>
        ))}
      </dl>
      {movement.remarks ? (
        <>
          <Separator />
          <div>
            <dt className="text-xs text-muted-foreground">Remarks</dt>
            <dd className="text-sm whitespace-pre-wrap">{String(movement.remarks)}</dd>
          </div>
        </>
      ) : null}
    </div>
  );
}
