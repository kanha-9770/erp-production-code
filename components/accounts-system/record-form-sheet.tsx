"use client";

/**
 * Generic, schema-driven create/edit form for any accounts document. Same
 * engine as the purchase form: fields render from the submodule schema, grouped
 * by section; `master` fields source live options (with inline add); `status`
 * fields render the document's workflow pipeline.
 *
 * Accounts specifics:
 *   - Sales Invoice / Expense / Journal totals are derived live from their line
 *     items (read-only computed fields update as you type).
 *   - A Receipt's invoice dropdown is sourced from open invoices; picking one
 *     auto-fills the customer and the outstanding amount.
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/lib/accounts-system/store";
import { resolveStatus } from "@/lib/accounts-system/format";
import {
  deriveInvoiceTotals,
  deriveExpenseTotal,
  deriveJournalTotals,
  asRows,
} from "@/lib/accounts-system/lines";
import { Badge } from "@/components/ui/badge";
import { MediaField } from "./media-field";
import { LineItemsField } from "./line-items-field";
import type { MediaRef } from "@/lib/accounts-system/media";
import type { FieldDef, AccountsRecord, SubmoduleSchema } from "@/lib/accounts-system/types";

interface RecordFormSheetProps {
  schema: SubmoduleSchema;
  open: boolean;
  record: AccountsRecord | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

function buildInitial(schema: SubmoduleSchema, record: AccountsRecord | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (record && record[f.key] != null) out[f.key] = record[f.key];
    else if (f.type === "lineItems") out[f.key] = [];
    else if (f.type === "checkbox") out[f.key] = false;
    else if (f.defaultValue != null) out[f.key] = f.defaultValue;
    else if (f.type === "status" && f.statusOptions?.length) out[f.key] = f.statusOptions[0].value;
    else out[f.key] = f.type === "number" || f.type === "currency" ? 0 : "";
  }
  return out;
}

export function RecordFormSheet({ schema, open, record, onOpenChange, onSubmit }: RecordFormSheetProps) {
  const { getMasterOptions, addMasterOption, getOpenInvoiceOptions, getInvoiceTrace } = useAccounts();
  const [form, setForm] = useState<Record<string, unknown>>(() => buildInitial(schema, record));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(buildInitial(schema, record));
      setErrors({});
    }
  }, [open, record, schema]);

  // Live-derive the document totals so the read-only computed fields update as
  // the user edits the line items / tax rate.
  useEffect(() => {
    if (schema.key !== "salesInvoice") return;
    setForm((prev) => {
      const { subtotal, taxAmount, total } = deriveInvoiceTotals(prev);
      return prev.subtotal === subtotal && prev.taxAmount === taxAmount && prev.total === total
        ? prev
        : { ...prev, subtotal, taxAmount, total };
    });
  }, [schema.key, form.items, form.taxRate]);

  useEffect(() => {
    if (schema.key !== "expense") return;
    setForm((prev) => {
      const { total } = deriveExpenseTotal(prev);
      return prev.total === total ? prev : { ...prev, total };
    });
  }, [schema.key, form.items]);

  useEffect(() => {
    if (schema.key !== "journal") return;
    setForm((prev) => {
      const { totalDebit, totalCredit } = deriveJournalTotals(prev);
      return prev.totalDebit === totalDebit && prev.totalCredit === totalCredit
        ? prev
        : { ...prev, totalDebit, totalCredit };
    });
  }, [schema.key, form.lines]);

  const sections = useMemo(() => {
    const order: string[] = [];
    const bySection = new Map<string, FieldDef[]>();
    for (const f of schema.fields) {
      if (!bySection.has(f.section)) {
        bySection.set(f.section, []);
        order.push(f.section);
      }
      bySection.get(f.section)!.push(f);
    }
    return order.map((name) => ({ name, fields: bySection.get(name)! }));
  }, [schema]);

  const set = (key: string, value: unknown) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Receipt: picking an open invoice auto-fills the customer and prefills
      // the outstanding amount (still editable for part-payments).
      if (schema.key === "receipt" && key === "invoiceRef") {
        const trace = getInvoiceTrace(String(value ?? ""));
        if (trace.found) {
          next.customer = trace.customer ?? next.customer;
          next.invoiceAmount = trace.balance ?? 0;
          next.amount = trace.balance ?? 0;
        } else {
          next.invoiceAmount = 0;
        }
      }
      // Clear dependent fields a change hides, so stale values aren't saved.
      for (const f of schema.fields) {
        if (f.showIf?.field === key && next[f.showIf.field] !== f.showIf.equals) {
          next[f.key] =
            f.type === "number" || f.type === "currency"
              ? 0
              : f.type === "checkbox"
                ? false
                : f.type === "lineItems"
                  ? []
                  : "";
        }
      }
      return next;
    });
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const isVisible = (f: FieldDef) => !f.showIf || form[f.showIf.field] === f.showIf.equals;

  // Options for a select sourced from live records (open invoices).
  const dynamicOptionsFor = (f: FieldDef): Array<{ value: string; label: string }> | undefined => {
    if (f.optionsSource === "openInvoice")
      return getOpenInvoiceOptions(String(form[f.key] ?? "") || undefined).map((o) => ({
        value: o.value,
        label: o.label,
      }));
    return undefined;
  };

  // The auto-filled Invoice Outstanding shows only once an invoice is chosen.
  const isShown = (f: FieldDef) => {
    if (f.formHidden || !isVisible(f)) return false;
    if (f.requiresOpenInvoice) return String(form.invoiceRef ?? "") !== "";
    return true;
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    for (const f of schema.fields) {
      if (!f.required || f.formHidden || !isVisible(f)) continue;
      if (f.requiresOpenInvoice && String(form.invoiceRef ?? "") === "") continue;
      const v = form[f.key];
      if (v == null || String(v).trim() === "") next[f.key] = `${f.label} is required`;
    }
    // Documents that are nothing without lines.
    if (schema.key === "salesInvoice" && asRows(form.items).length === 0) {
      next.items = "Add at least one invoice line.";
    }
    if (schema.key === "expense" && asRows(form.items).length === 0) {
      next.items = "Add at least one expense line.";
    }
    if (schema.key === "journal") {
      const lines = asRows(form.lines);
      if (lines.length === 0) next.lines = "Add at least one entry.";
      else {
        const { totalDebit, totalCredit, balanced } = deriveJournalTotals(form);
        if (!balanced || totalDebit === 0) {
          next.lines = `Debit (${totalDebit}) must equal Credit (${totalCredit}) and be non-zero.`;
        }
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const data: Record<string, unknown> = { ...form };
    for (const f of schema.fields) {
      if (f.type === "number" || f.type === "currency") data[f.key] = Number(data[f.key] ?? 0) || 0;
    }
    onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>{record ? `Edit ${schema.recordNoun}` : `New ${schema.recordNoun}`}</SheetTitle>
          <SheetDescription>
            {record
              ? `Update ${String(record.docNo ?? "this document")}.`
              : `Create a new ${schema.recordNoun}.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {sections.map((section) => {
            const visible = section.fields.filter(isShown);
            if (visible.length === 0) return null;
            return (
              <div key={section.name} className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.name}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {visible.map((f) => (
                    <FieldControl
                      key={f.key}
                      field={f}
                      value={form[f.key]}
                      error={errors[f.key]}
                      onChange={(v) => set(f.key, v)}
                      getMasterOptions={getMasterOptions}
                      onAddMasterOption={addMasterOption}
                      dynamicOptions={dynamicOptionsFor(f)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <SheetFooter className="px-6 py-4 border-t flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{record ? "Save changes" : `Create ${schema.recordNoun}`}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FieldControl({
  field,
  value,
  error,
  onChange,
  getMasterOptions,
  onAddMasterOption,
  dynamicOptions,
}: {
  field: FieldDef;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  getMasterOptions: (key: string) => Array<{ id: string; value: string }>;
  onAddMasterOption: (key: string, value: string, code?: string) => Promise<void>;
  dynamicOptions?: Array<{ value: string; label: string }>;
}) {
  const fullWidth =
    field.type === "textarea" || field.type === "media" || field.type === "lineItems";
  return (
    <div className={cn("space-y-1.5", fullWidth && "sm:col-span-2")}>
      <Label className="text-sm">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>

      {field.type === "checkbox" ? (
        <div className="flex items-center h-9">
          <Checkbox
            checked={!!value}
            onCheckedChange={(v) => onChange(v === true)}
            aria-label={field.label}
          />
        </div>
      ) : field.computed ? (
        field.type === "status" ? (
          <div className="flex items-center gap-2 h-9">
            <Badge variant={resolveStatus(field, value).variant}>{resolveStatus(field, value).label}</Badge>
            <span className="text-[11px] text-muted-foreground">auto</span>
          </div>
        ) : (
          <div className="text-sm h-9 flex items-center font-mono">
            {field.type === "currency" || field.type === "number"
              ? Number(value ?? 0).toLocaleString("en-IN")
              : value
                ? String(value)
                : "—"}
            <span className="ml-2 text-[11px] text-muted-foreground font-sans">auto</span>
          </div>
        )
      ) : field.type === "lineItems" ? (
        <LineItemsField field={field} value={value} onChange={(rows) => onChange(rows)} />
      ) : field.type === "media" ? (
        <MediaField value={value} onChange={(refs: MediaRef[]) => onChange(refs)} />
      ) : field.type === "textarea" ? (
        <Textarea
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : field.type === "master" ? (
        <MasterSelect
          masterKey={field.master!}
          value={(value as string) ?? ""}
          onChange={onChange}
          options={getMasterOptions(field.master!)}
          onAdd={onAddMasterOption}
          // `customer` and `ledger` are projections of the Customer Master /
          // Chart of Accounts records — an inline-added value isn't backed by a
          // record and would be wiped by the next sync, so add is disabled.
          allowAdd={field.master !== "customer" && field.master !== "ledger"}
        />
      ) : field.type === "select" ? (
        <Select value={(value as string) ?? ""} onValueChange={onChange}>
          <SelectTrigger className={cn(error && "border-destructive")}>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {(field.optionsSource ? dynamicOptions ?? [] : field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
            {field.optionsSource && (dynamicOptions?.length ?? 0) === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">No open invoices</div>
            )}
          </SelectContent>
        </Select>
      ) : field.type === "status" ? (
        <Select value={(value as string) || ""} onValueChange={onChange}>
          <SelectTrigger className={cn(error && "border-destructive")}>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {(field.statusOptions ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={field.type === "number" || field.type === "currency" ? "number" : field.type === "date" ? "date" : "text"}
          value={(value as string | number) ?? ""}
          placeholder={field.placeholder}
          onChange={(e) =>
            onChange(
              field.type === "number" || field.type === "currency"
                ? e.target.value === ""
                  ? ""
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          className={cn(
            (field.type === "number" || field.type === "currency") && "font-mono",
            error && "border-destructive",
          )}
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Master-backed dropdown with an optional inline "add new value" row. */
function MasterSelect({
  masterKey,
  value,
  onChange,
  options,
  onAdd,
  allowAdd = true,
}: {
  masterKey: string;
  value: string;
  onChange: (value: unknown) => void;
  options: Array<{ id: string; value: string }>;
  onAdd: (key: string, value: string, code?: string) => Promise<void>;
  allowAdd?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const commitAdd = async () => {
    const v = draft.trim();
    if (!v) return;
    setBusy(true);
    try {
      await onAdd(masterKey, v);
      onChange(v);
      setDraft("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  if (adding && allowAdd) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={draft}
          placeholder="New value…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitAdd();
            }
            if (e.key === "Escape") setAdding(false);
          }}
        />
        <Button type="button" size="sm" onClick={commitAdd} disabled={busy || !draft.trim()}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
          ✕
        </Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.value}>
            {o.value}
          </SelectItem>
        ))}
        {options.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">No options yet</div>
        )}
        {allowAdd && (
          <div className="border-t mt-1 pt-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-primary hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                setAdding(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add new value
            </button>
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
