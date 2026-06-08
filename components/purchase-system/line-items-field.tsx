"use client";

/**
 * Repeatable, NESTABLE line-items grid.
 *
 * For the GRN this models the real structure: one GRN holds multiple invoices,
 * and each invoice covers multiple PO/PR item lines (a supplier invoice can span
 * several POs). So a `lineItems` column can itself contain a nested `lineItems`
 * column:
 *
 *   GRN → lines (Invoice) → items (PO / PR line)
 *
 * Full / Partial receipt and balance are computed on the leaf PO/PR lines
 * (invoice vs received qty) and rolled up to the invoice and the GRN list.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePurchase, type OpenDocOption } from "@/lib/purchase-system/store";
import { formatMoney, formatNumber, formatDate } from "@/lib/purchase-system/format";
import type { FieldDef } from "@/lib/purchase-system/types";
import { MediaField, MediaGallery, mediaCount } from "./media-field";
import {
  asRows,
  rowReceipt,
  lineSummary,
  type Receipt,
  type Row,
} from "@/lib/purchase-system/receipt";

// Re-export so existing importers (record-table-view) keep working.
export { lineSummary };

function uid(): string {
  return `ln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const RECEIPT_VARIANT: Record<Receipt, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "secondary",
  PARTIAL: "outline",
  FULL: "default",
  EXCESS: "destructive",
};
const RECEIPT_LABEL: Record<Receipt, string> = {
  PENDING: "Pending",
  PARTIAL: "Partial",
  FULL: "Full",
  EXCESS: "Excess",
};

// ── Editable grid (form) ────────────────────────────────────────────────────

export function LineItemsField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (rows: Row[]) => void;
}) {
  const { getPoTrace, getOpenPoOptions, getOpenPrOptions } = usePurchase();
  const rows = asRows(value);
  const columns = field.columns ?? [];
  const noun = field.rowNoun ?? "Row";
  // Receipt status applies to GRN rows — leaf rows (invoiceQty/receivedQty) and
  // invoice rows (which aggregate a nested lineItems column). Plain repeatable
  // rows like vendor contacts have neither, so no receipt badge.
  const showReceipt = columns.some(
    (c) => c.key === "invoiceQty" || c.key === "receivedQty" || c.type === "lineItems",
  );

  const optionsFor = (col: FieldDef, current: string): OpenDocOption[] | undefined => {
    if (col.optionsSource === "openPo") return getOpenPoOptions(current);
    if (col.optionsSource === "openPr") return getOpenPrOptions(current);
    return undefined;
  };

  const addRow = () => {
    const row: Row = { _id: uid() };
    for (const c of columns) {
      if (c.type === "lineItems") row[c.key] = [];
      else row[c.key] = c.defaultValue ?? (c.type === "number" || c.type === "currency" ? 0 : "");
    }
    onChange([...rows, row]);
  };

  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  const updateCell = (idx: number, key: string, val: unknown) => {
    onChange(
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next: Row = { ...r, [key]: val };
        // Picking a PO prefills the line from the order: PR, item, and the
        // remaining balance as the default invoice/received qty + amount.
        // Only blank/zero fields are filled, so manual edits are never clobbered.
        if (key === "poRef") {
          const trace = getPoTrace(String(val ?? ""));
          if (trace.found) {
            if (trace.prRef && !String(next.prRef ?? "").trim()) next.prRef = trace.prRef;
            if (trace.itemName && !String(next.itemName ?? "").trim()) next.itemName = trace.itemName;
            const bal = trace.balance ?? 0;
            if (bal > 0) {
              if (!Number(next.invoiceQty)) next.invoiceQty = bal;
              if (!Number(next.receivedQty)) next.receivedQty = bal;
              if (!Number(next.amount) && trace.rate) next.amount = Number((bal * trace.rate).toFixed(2));
            }
          }
        }
        return next;
      }),
    );
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
          No {noun.toLowerCase()}s yet.
        </div>
      )}

      {rows.map((row, idx) => {
        const receipt = showReceipt ? rowReceipt(row, columns) : null;
        return (
          <div key={(row._id as string) ?? idx} className="rounded-lg border p-3 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {noun} {idx + 1}
                </span>
                {receipt && (
                  <>
                    <Badge variant={RECEIPT_VARIANT[receipt.receiptType]} className="h-5">
                      {RECEIPT_LABEL[receipt.receiptType]}
                    </Badge>
                    {receipt.balance > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Balance {formatNumber(receipt.balance)}
                      </span>
                    )}
                  </>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => removeRow(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Scalar columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {columns
                .filter((c) => c.type !== "media" && c.type !== "lineItems")
                .map((c) => (
                  <SubField
                    key={c.key}
                    field={c}
                    value={row[c.key]}
                    options={optionsFor(c, String(row[c.key] ?? ""))}
                    onChange={(v) => updateCell(idx, c.key, v)}
                  />
                ))}
            </div>

            {/* Media columns */}
            {columns
              .filter((c) => c.type === "media")
              .map((c) => (
                <div key={c.key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{c.label}</Label>
                  <MediaField value={row[c.key]} onChange={(refs) => updateCell(idx, c.key, refs)} />
                </div>
              ))}

            {/* Nested line items (e.g. PO / PR item lines under an invoice) */}
            {columns
              .filter((c) => c.type === "lineItems")
              .map((c) => (
                <div key={c.key} className="space-y-2 rounded-md border-l-2 border-primary/30 pl-3">
                  <Label className="text-xs font-medium">{c.label}</Label>
                  <LineItemsField
                    field={c}
                    value={row[c.key]}
                    onChange={(sub) => updateCell(idx, c.key, sub)}
                  />
                </div>
              ))}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> {field.addLabel ?? "Add row"}
      </Button>
    </div>
  );
}

function SubField({
  field,
  value,
  onChange,
  options,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: OpenDocOption[];
}) {
  const label = (
    <Label className="text-xs text-muted-foreground">
      {field.label}
      {field.required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );

  // Dynamic dropdown (open POs / PRs) or a static select.
  if (field.type === "select") {
    const list =
      field.optionsSource && options
        ? options
        : (field.options ?? []).map((o) => ({ value: o.value, label: o.label, balance: 0 }));
    return (
      <div className="space-y-1">
        {label}
        <Select value={(value as string) || ""} onValueChange={onChange}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {list.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
            {list.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">No open documents</div>
            )}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const numeric = field.type === "number" || field.type === "currency";
  return (
    <div className="space-y-1">
      {label}
      <Input
        type={numeric ? "number" : field.type === "date" ? "date" : "text"}
        value={(value as string | number) ?? ""}
        placeholder={field.placeholder}
        onChange={(e) =>
          onChange(numeric ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
        }
        className={cn("h-9", numeric && "font-mono")}
      />
    </div>
  );
}

// ── Read-only view (preview) ────────────────────────────────────────────────

export function LineItemsView({ field, value }: { field: FieldDef; value: unknown }) {
  const rows = asRows(value);
  const columns = field.columns ?? [];
  const noun = field.rowNoun ?? "Row";
  if (rows.length === 0) return <span className="text-sm text-muted-foreground">None</span>;

  const scalarCols = columns.filter((c) => c.type !== "media" && c.type !== "lineItems");
  const mediaCols = columns.filter((c) => c.type === "media");
  const nestedCols = columns.filter((c) => c.type === "lineItems");
  // Receipt status applies to GRN rows — leaf rows (invoiceQty/receivedQty) and
  // invoice rows (which aggregate a nested lineItems column). Plain repeatable
  // rows like vendor contacts have neither, so no receipt badge.
  const showReceipt = columns.some(
    (c) => c.key === "invoiceQty" || c.key === "receivedQty" || c.type === "lineItems",
  );

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => {
        const receipt = showReceipt ? rowReceipt(row, columns) : null;
        const title =
          (row.invoiceNo as string) ||
          (row.poRef as string) ||
          (row.contactPerson as string) ||
          (row.itemName as string) ||
          `${noun} ${idx + 1}`;
        return (
          <div key={(row._id as string) ?? idx} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-sm font-medium truncate", showReceipt && "font-mono")}>{title}</span>
              {receipt && (
                <Badge variant={RECEIPT_VARIANT[receipt.receiptType]}>{RECEIPT_LABEL[receipt.receiptType]}</Badge>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {scalarCols.map((c) => (
                <Pair key={c.key} field={c} row={row} />
              ))}
            </dl>
            {mediaCols.map((c) =>
              mediaCount(row[c.key]) > 0 ? (
                <div key={c.key} className="space-y-1">
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <MediaGallery value={row[c.key]} />
                </div>
              ) : null,
            )}
            {nestedCols.map((c) => (
              <div key={c.key} className="space-y-1.5 border-l-2 border-primary/30 pl-3">
                <div className="text-xs font-medium">{c.label}</div>
                <LineItemsView field={c} value={row[c.key]} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Pair({ field, row }: { field: FieldDef; row: Row }) {
  const v = row[field.key];
  let display: string;
  if (field.type === "currency") display = formatMoney(v);
  else if (field.type === "number") display = formatNumber(v);
  else if (field.type === "date") display = formatDate(v);
  else display = v == null || v === "" ? "—" : String(v);
  const mono = field.type === "currency" || field.type === "number" || /no\.?$/i.test(field.label);
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{field.label}</dt>
      <dd className={cn("truncate", mono && "font-mono text-xs")}>{display}</dd>
    </div>
  );
}
