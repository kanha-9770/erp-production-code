"use client";

/**
 * Store Inventory item picker — opened from the Purchase Requisition form when
 * Purchase Type = Repeat. Lists the live Store Inventory items (read through the
 * inventory module's service), supports multi-select with a per-item quantity
 * and free-text search, and asks for confirmation before handing the chosen
 * items (with quantities) back to the requisition's Items subform.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Boxes, Loader2, PackageSearch, Search } from "lucide-react";
import { loadStoreItems, type StoreItemOption } from "@/lib/purchase-system/inventory-link";
import { formatMoney, formatNumber } from "@/lib/purchase-system/format";

export type SelectedStoreItem = StoreItemOption & { quantity: number };

export function StoreItemPicker({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (items: SelectedStoreItem[]) => void;
}) {
  const [items, setItems] = useState<StoreItemOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setQuery("");
    setSelected({});
    setQty({});
    loadStoreItems()
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.itemCode, i.itemName, i.itemDescription, i.category, i.uom, i.warehouse]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  const selectedItems: SelectedStoreItem[] = useMemo(
    () =>
      items
        .filter((i) => selected[i.id])
        .map((i) => ({ ...i, quantity: Math.max(0, Number(qty[i.id] ?? 1) || 0) })),
    [items, selected, qty],
  );
  const selectedCount = selectedItems.length;

  const setChecked = (id: string, on: boolean) => {
    setSelected((prev) => ({ ...prev, [id]: on }));
    if (on) setQty((prev) => (prev[id] ? prev : { ...prev, [id]: 1 }));
  };
  const toggle = (id: string) => setChecked(id, !selected[id]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected[i.id]);
  const toggleAllFiltered = () => {
    const target = !allFilteredSelected;
    setSelected((prev) => {
      const next = { ...prev };
      for (const i of filtered) next[i.id] = target;
      return next;
    });
    if (target) setQty((prev) => {
      const next = { ...prev };
      for (const i of filtered) next[i.id] ??= 1;
      return next;
    });
  };

  const handleContinue = () => {
    onConfirm(selectedItems);
    setConfirmOpen(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Select from Store Inventory
          </DialogTitle>
          <DialogDescription>
            Tick the items being re-purchased and set the quantity for each.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code, name, description, category, UOM or warehouse…"
              className="pl-8"
            />
          </div>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={toggleAllFiltered}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Checkbox checked={allFilteredSelected} className="pointer-events-none" />
              {allFilteredSelected ? "Clear all" : "Select all"}
              {query.trim() ? ` (${filtered.length} matching)` : ` (${filtered.length})`}
            </button>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading store items…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <PackageSearch className="h-6 w-6" />
              {items.length === 0
                ? "No items in Store Inventory yet."
                : "No items match your search."}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((item) => {
                const checked = !!selected[item.id];
                return (
                  <li
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    className={cnRow(checked)}
                  >
                    <Checkbox checked={checked} className="mt-1 pointer-events-none shrink-0" />
                    <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{item.itemName || "—"}</span>
                          {item.itemCode && (
                            <span className="text-xs font-mono text-muted-foreground shrink-0">
                              {item.itemCode}
                            </span>
                          )}
                        </div>
                        {item.itemDescription && (
                          <div className="text-xs text-muted-foreground truncate">
                            {item.itemDescription}
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {item.category && <Badge variant="secondary">{item.category}</Badge>}
                          {item.uom && <Badge variant="outline">{item.uom}</Badge>}
                          <span className="text-[11px] text-muted-foreground">
                            {formatNumber(item.currentStock)} in stock
                            {item.unitRate > 0 ? ` · ${formatMoney(item.unitRate)}` : ""}
                          </span>
                        </div>
                      </div>

                      {checked && (
                        <div
                          className="shrink-0 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="text-[11px] text-muted-foreground block mb-0.5">
                            Qty{item.uom ? ` (${item.uom})` : ""}
                          </label>
                          <Input
                            type="number"
                            min={0}
                            value={qty[item.id] ?? 1}
                            onChange={(e) =>
                              setQty((prev) => ({
                                ...prev,
                                [item.id]: e.target.value === "" ? 0 : Number(e.target.value),
                              }))
                            }
                            className="h-8 w-24 font-mono text-right"
                          />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t">
          <span className="text-sm text-muted-foreground">
            {selectedCount > 0 ? `${selectedCount} selected` : "No items selected"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selectedCount === 0}
              onClick={() => setConfirmOpen(true)}
            >
              Continue{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Do you want to continue?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCount === 1
                ? `“${selectedItems[0]?.itemName}” × ${formatNumber(selectedItems[0]?.quantity)} will be added to this requisition.`
                : `${selectedCount} items will be added to this requisition's Items list with the quantities you set.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleContinue}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function cnRow(checked: boolean): string {
  return [
    "flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-accent",
    checked ? "bg-accent/60" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
