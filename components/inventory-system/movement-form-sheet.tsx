"use client";

/**
 * Create/edit sheet for a goods movement (Inward or Outward). The item is
 * picked from the live Store inventory; choosing it auto-fills the code, UOM,
 * warehouse and last rate. Quantity × rate drives the amount, and on save the
 * provider adjusts the item's current stock.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { InventoryItem, InventoryMovement, MovementDirection } from "@/lib/inventory-system/types";

interface Props {
  direction: MovementDirection;
  open: boolean;
  record: InventoryMovement | null;
  storeItems: InventoryItem[];
  warehouseOptions: string[];
  defaultDocNo: string;
  /** Lower-cased doc numbers already used by OTHER entries of this direction
   *  (excludes the record being edited), for the uniqueness check. */
  takenDocNos: string[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

type Form = {
  docNo: string;
  date: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  category: string;
  uom: string;
  warehouse: string;
  quantity: number | "";
  rate: number | "";
  amount: number;
  party: string;
  reference: string;
  remarks: string;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildInitial(record: InventoryMovement | null, defaultDocNo: string): Form {
  if (record) {
    return {
      docNo: record.docNo ?? "",
      date: (record.date as string) ?? todayStr(),
      itemId: record.itemId ?? "",
      itemCode: record.itemCode ?? "",
      itemName: record.itemName ?? "",
      category: record.category ?? "",
      uom: record.uom ?? "",
      warehouse: record.warehouse ?? "",
      quantity: num(record.quantity),
      rate: num(record.rate),
      amount: num(record.amount),
      party: record.party ?? "",
      reference: record.reference ?? "",
      remarks: record.remarks ?? "",
    };
  }
  return {
    docNo: defaultDocNo,
    date: todayStr(),
    itemId: "",
    itemCode: "",
    itemName: "",
    category: "",
    uom: "",
    warehouse: "",
    quantity: "",
    rate: "",
    amount: 0,
    party: "",
    reference: "",
    remarks: "",
  };
}

export function MovementFormSheet({
  direction,
  open,
  record,
  storeItems,
  warehouseOptions,
  defaultDocNo,
  takenDocNos,
  onOpenChange,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<Form>(() => buildInitial(record, defaultDocNo));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(buildInitial(record, defaultDocNo));
      setErrors({});
    }
  }, [open, record, defaultDocNo]);

  const partyLabel = direction === "IN" ? "Supplier" : "Issued To / Department";
  const isIn = direction === "IN";

  const itemOptions = useMemo(
    () =>
      storeItems
        .filter((i) => !i._deleting)
        .map((i) => ({
          id: i.id,
          label: `${String(i.itemCode ?? "")} · ${String(i.itemName ?? "")}`.trim(),
        })),
    [storeItems],
  );

  const set = (patch: Partial<Form>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      next.amount = Number((num(next.quantity) * num(next.rate)).toFixed(2));
      return next;
    });
  };

  const pickItem = (itemId: string) => {
    const item = storeItems.find((i) => i.id === itemId);
    if (!item) {
      set({ itemId });
      return;
    }
    set({
      itemId,
      itemCode: String(item.itemCode ?? ""),
      itemName: String(item.itemName ?? ""),
      category: String(item.category ?? ""),
      uom: String(item.uom ?? ""),
      warehouse: String(item.warehouse ?? form.warehouse),
      rate: form.rate === "" || num(form.rate) === 0 ? num(item.unitRate) : form.rate,
    });
    setErrors((e) => ({ ...e, itemId: "" }));
  };

  const selectedItem = useMemo(
    () => storeItems.find((i) => i.id === form.itemId),
    [storeItems, form.itemId],
  );
  const available = selectedItem ? num(selectedItem.currentStock) : null;
  // Soft, non-blocking warning: issuing more than is on hand drives stock
  // negative. We surface it but still allow it (e.g. backdated corrections).
  const exceedsStock = !isIn && available != null && num(form.quantity) > available;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.docNo.trim()) e.docNo = "Document no. is required";
    else if (takenDocNos.includes(form.docNo.trim().toLowerCase()))
      e.docNo = `${form.docNo.trim()} already exists`;
    if (!form.itemId) e.itemId = "Pick an item";
    if (num(form.quantity) <= 0) e.quantity = "Quantity must be greater than 0";
    if (num(form.rate) < 0) e.rate = "Rate cannot be negative";
    if (!form.warehouse.trim()) e.warehouse = "Warehouse is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit({
      direction,
      docNo: form.docNo.trim(),
      date: form.date,
      itemId: form.itemId,
      itemCode: form.itemCode,
      itemName: form.itemName,
      category: form.category,
      uom: form.uom,
      warehouse: form.warehouse,
      quantity: num(form.quantity),
      rate: num(form.rate),
      amount: num(form.amount),
      party: form.party.trim(),
      reference: form.reference.trim(),
      remarks: form.remarks.trim(),
    });
    onOpenChange(false);
  };

  const noun = isIn ? "inward entry" : "outward entry";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>{record ? `Edit ${noun}` : `New ${noun}`}</SheetTitle>
          <SheetDescription>
            {isIn
              ? "Record goods received into the store. Stock increases on save."
              : "Record goods issued from the store. Stock decreases on save."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={isIn ? "Inward No." : "Outward No."} required error={errors.docNo}>
              <Input
                value={form.docNo}
                onChange={(e) => set({ docNo: e.target.value })}
                className={cn(errors.docNo && "border-destructive")}
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
          </div>

          <Field label="Item" required error={errors.itemId} full>
            <Select value={form.itemId} onValueChange={pickItem}>
              <SelectTrigger className={cn(errors.itemId && "border-destructive")}>
                <SelectValue placeholder="Select a store item…" />
              </SelectTrigger>
              <SelectContent>
                {itemOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
                {itemOptions.length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">No store items yet</div>
                )}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Quantity" required error={errors.quantity}>
              <Input
                type="number"
                value={form.quantity}
                onChange={(e) => set({ quantity: e.target.value === "" ? "" : Number(e.target.value) })}
                className={cn("font-mono", (errors.quantity || exceedsStock) && "border-destructive")}
              />
            </Field>
            <Field label="UOM">
              <Input value={form.uom} readOnly className="bg-muted/50 text-muted-foreground" />
            </Field>
            <Field label="Rate" error={errors.rate}>
              <Input
                type="number"
                value={form.rate}
                onChange={(e) => set({ rate: e.target.value === "" ? "" : Number(e.target.value) })}
                className={cn("font-mono", errors.rate && "border-destructive")}
              />
            </Field>
          </div>

          {selectedItem && (
            <p className={cn("text-xs -mt-1", exceedsStock ? "text-amber-600" : "text-muted-foreground")}>
              On hand: <span className="font-medium tabular-nums">{(available ?? 0).toLocaleString("en-IN")}</span> {String(selectedItem.uom ?? "")}
              {exceedsStock && ` — issuing ${num(form.quantity).toLocaleString("en-IN")} will take stock negative.`}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount">
              <Input value={form.amount.toLocaleString("en-IN")} readOnly className="bg-muted/50 text-muted-foreground font-mono" />
            </Field>
            <Field label="Warehouse" required error={errors.warehouse}>
              <Select value={form.warehouse} onValueChange={(v) => set({ warehouse: v })}>
                <SelectTrigger className={cn(errors.warehouse && "border-destructive")}>
                  <SelectValue placeholder="Warehouse…" />
                </SelectTrigger>
                <SelectContent>
                  {warehouseOptions.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={partyLabel}>
              <Input value={form.party} onChange={(e) => set({ party: e.target.value })} placeholder={isIn ? "Supplier name" : "Dept / person"} />
            </Field>
            <Field label="Reference">
              <Input value={form.reference} onChange={(e) => set({ reference: e.target.value })} placeholder={isIn ? "GRN / PO no." : "Issue slip no."} />
            </Field>
          </div>

          <Field label="Remarks" full>
            <Textarea value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} rows={2} />
          </Field>
        </div>

        <SheetFooter className="px-6 py-4 border-t flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{record ? "Save changes" : `Post ${isIn ? "inward" : "outward"}`}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  required,
  error,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", full && "col-span-full")}>
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
