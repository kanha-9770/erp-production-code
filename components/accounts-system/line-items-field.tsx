"use client";

/**
 * Flat, repeatable line-items grid for the Accounts System (invoice item lines,
 * expense lines, journal Dr/Cr entries).
 *
 * Simpler than the GRN's nestable grid: rows are flat and carry no receipt
 * math. The one bit of smarts is auto-computing `amount = qty × rate` on rows
 * that have both columns (invoice lines), so the buyer types quantity + rate
 * and the line amount (and the document total) follow.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/lib/accounts-system/store";
import { formatMoney, formatNumber, formatDate } from "@/lib/accounts-system/format";
import { asRows, num, round2, lineSummary, type Row } from "@/lib/accounts-system/lines";
import type { FieldDef } from "@/lib/accounts-system/types";

// Re-export so importers (record-table-view) get the summary from one place.
export { lineSummary };

function uid(): string {
  return `ln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

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
  const { getMasterOptions } = useAccounts();
  const rows = asRows(value);
  const columns = field.columns ?? [];
  const noun = field.rowNoun ?? "Row";

  // Auto-derive a line `amount` from qty × rate when the row models that shape.
  const computesAmount =
    columns.some((c) => c.key === "quantity") &&
    columns.some((c) => c.key === "rate") &&
    columns.some((c) => c.key === "amount");

  const optionsFor = (col: FieldDef): Array<{ value: string; label: string }> | undefined => {
    if (col.type === "master" && col.master)
      return getMasterOptions(col.master).map((o) => ({ value: o.value, label: o.value }));
    if (col.type === "select") return col.options ?? [];
    return undefined;
  };

  const addRow = () => {
    const row: Row = { _id: uid() };
    for (const c of columns) {
      row[c.key] = c.defaultValue ?? (c.type === "number" || c.type === "currency" ? 0 : "");
    }
    onChange([...rows, row]);
  };

  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  const updateCell = (idx: number, key: string, val: unknown) => {
    onChange(
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next: Row = { ...r, [key]: val };
        if (computesAmount && (key === "quantity" || key === "rate")) {
          next.amount = round2(num(next.quantity) * num(next.rate));
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

      {rows.map((row, idx) => (
        <div key={(row._id as string) ?? idx} className="rounded-lg border p-3 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {noun} {idx + 1}
            </span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {columns.map((c) => (
              <SubField
                key={c.key}
                field={c}
                value={row[c.key]}
                options={optionsFor(c)}
                // `amount` is derived from qty × rate, so lock it on those rows.
                readOnly={computesAmount && c.key === "amount"}
                onChange={(v) => updateCell(idx, c.key, v)}
              />
            ))}
          </div>
        </div>
      ))}

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
  readOnly,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: Array<{ value: string; label: string }>;
  readOnly?: boolean;
}) {
  const label = (
    <Label className="text-xs text-muted-foreground">
      {field.label}
      {field.required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );

  if (field.type === "select" || field.type === "master") {
    const list = options ?? [];
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
              <div className="px-2 py-2 text-xs text-muted-foreground">No options</div>
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
        readOnly={readOnly}
        onChange={(e) =>
          onChange(numeric ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
        }
        className={cn("h-9", numeric && "font-mono", readOnly && "bg-muted/50 text-muted-foreground")}
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

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => {
        const title =
          (row.itemName as string) ||
          (row.description as string) ||
          (row.account as string) ||
          `${noun} ${idx + 1}`;
        return (
          <div key={(row._id as string) ?? idx} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{title}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {columns.map((c) => (
                <Pair key={c.key} field={c} row={row} />
              ))}
            </dl>
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
  const mono = field.type === "currency" || field.type === "number";
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{field.label}</dt>
      <dd className={cn("truncate", mono && "font-mono text-xs")}>{display}</dd>
    </div>
  );
}
