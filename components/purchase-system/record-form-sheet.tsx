"use client";

/**
 * Generic, schema-driven create/edit form for any purchase document. Same
 * engine as the inventory form: fields render from the submodule schema,
 * grouped by section. `master` fields source live options from the purchase
 * master registry (with inline add); `status` fields render the document's
 * workflow pipeline.
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
import { Plus, History, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePurchase, type ItemPurchaseHistory } from "@/lib/purchase-system/store";
import { formatMoney, formatDate, resolveStatus } from "@/lib/purchase-system/format";
import { deriveReceiptStatus } from "@/lib/purchase-system/receipt";
import { Badge } from "@/components/ui/badge";
import { MediaField } from "./media-field";
import { LineItemsField } from "./line-items-field";
import type { MediaRef } from "@/lib/purchase-system/media";
import type { FieldDef, PurchaseRecord, SubmoduleSchema } from "@/lib/purchase-system/types";

interface RecordFormSheetProps {
  schema: SubmoduleSchema;
  open: boolean;
  record: PurchaseRecord | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

function buildInitial(schema: SubmoduleSchema, record: PurchaseRecord | null): Record<string, unknown> {
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
  const { getMasterOptions, addMasterOption, getItemHistory } = usePurchase();
  const [form, setForm] = useState<Record<string, unknown>>(() => buildInitial(schema, record));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Repeat-purchase detection (Purchase Requisition only): as the item name is
  // typed, look it up against prior POs. A known item can reuse its supplier +
  // last rate and skip sourcing; a new one is flagged for sourcing.
  const itemName = String(form.itemName ?? "");
  const history = useMemo<ItemPurchaseHistory | null>(
    () => (schema.key === "pr" ? getItemHistory(itemName) : null),
    [schema.key, itemName, getItemHistory],
  );

  const applyRepeat = () => {
    if (!history?.found) return;
    setForm((prev) => ({
      ...prev,
      purchaseType: "REPEAT",
      preferredSupplier: history.lastSupplier ?? prev.preferredSupplier,
      lastRate: history.lastRate ?? prev.lastRate,
      lastPoRef: history.lastPoRef ?? prev.lastPoRef,
    }));
  };

  useEffect(() => {
    if (open) {
      setForm(buildInitial(schema, record));
      setErrors({});
    }
  }, [open, record, schema]);

  // Live-derive the GRN receipt status from the invoice/received quantities so
  // the read-only badge updates as the user edits the lines.
  useEffect(() => {
    if (schema.key !== "grn") return;
    setForm((prev) => {
      const next = deriveReceiptStatus(prev.lines);
      return prev.receiptStatus === next ? prev : { ...prev, receiptStatus: next };
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
      // Clear any dependent fields that this change hides, so stale values
      // aren't saved (e.g. unchecking Recommend Vendor clears name + phone).
      for (const f of schema.fields) {
        if (f.showIf?.field === key && next[f.showIf.field] !== f.showIf.equals) {
          next[f.key] = f.type === "number" || f.type === "currency" ? 0 : f.type === "checkbox" ? false : "";
        }
      }
      return next;
    });
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  // A field is visible unless its showIf condition is unmet by the current form.
  const isVisible = (f: FieldDef) =>
    !f.showIf || form[f.showIf.field] === f.showIf.equals;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    for (const f of schema.fields) {
      if (!f.required || !isVisible(f)) continue;
      const v = form[f.key];
      if (v == null || String(v).trim() === "") next[f.key] = `${f.label} is required`;
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
          <SheetTitle>
            {record ? `Edit ${schema.recordNoun}` : `New ${schema.recordNoun}`}
          </SheetTitle>
          <SheetDescription>
            {record
              ? `Update ${String(record.docNo ?? "this document")}.`
              : `Create a new ${schema.recordNoun}.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {schema.key === "pr" && itemName.trim() !== "" && history && (
            <RepeatPurchaseBanner
              history={history}
              isRepeat={String(form.purchaseType ?? "NEW") === "REPEAT"}
              onApply={applyRepeat}
            />
          )}
          {sections.map((section) => {
            const visible = section.fields.filter(isVisible);
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

/**
 * Repeat-purchase insight shown on the PR form. Tells the buyer whether the
 * item has been bought before and lets them adopt the prior supplier + rate in
 * one click (skipping sourcing), or flags a genuinely new item for sourcing.
 */
function RepeatPurchaseBanner({
  history,
  isRepeat,
  onApply,
}: {
  history: ItemPurchaseHistory;
  isRepeat: boolean;
  onApply: () => void;
}) {
  if (!history.found) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3">
        <Sparkles className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="text-sm">
          <span className="font-medium">New item.</span>{" "}
          <span className="text-muted-foreground">
            No prior purchase order found — this requisition will go through{" "}
            <strong>Sourcing &amp; Supplier Selection</strong> to fix a supplier and price.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-2">
      <div className="flex items-start gap-3">
        <History className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
        <div className="text-sm">
          <span className="font-medium">Repeat purchase detected.</span>{" "}
          <span className="text-muted-foreground">
            Bought {history.count}× before. Last:{" "}
            <strong>{history.lastSupplier ?? "—"}</strong> @{" "}
            <strong>{formatMoney(history.lastRate)}</strong>
            {history.lastPoRef ? ` (${history.lastPoRef})` : ""} on {formatDate(history.lastDate)}.
            Sourcing can be skipped.
          </span>
        </div>
      </div>
      {isRepeat ? (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 pl-7">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Marked as repeat — preferred supplier &amp; last rate applied; sourcing skipped.
        </div>
      ) : (
        <div className="pl-7">
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={onApply}>
            Use repeat purchase
          </Button>
        </div>
      )}
    </div>
  );
}

function FieldControl({
  field,
  value,
  error,
  onChange,
  getMasterOptions,
  onAddMasterOption,
}: {
  field: FieldDef;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  getMasterOptions: (key: string) => Array<{ id: string; value: string }>;
  onAddMasterOption: (key: string, value: string, code?: string) => Promise<void>;
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
            <Badge variant={resolveStatus(field, value).variant}>
              {resolveStatus(field, value).label}
            </Badge>
            <span className="text-[11px] text-muted-foreground">auto</span>
          </div>
        ) : (
          <div className="text-sm h-9 flex items-center">{value ? String(value) : "—"}</div>
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
        />
      ) : field.type === "select" ? (
        <Select value={(value as string) ?? ""} onValueChange={onChange}>
          <SelectTrigger className={cn(error && "border-destructive")}>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
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

/** Master-backed dropdown with an inline "add new value" row. */
function MasterSelect({
  masterKey,
  value,
  onChange,
  options,
  onAdd,
}: {
  masterKey: string;
  value: string;
  onChange: (value: unknown) => void;
  options: Array<{ id: string; value: string }>;
  onAdd: (key: string, value: string, code?: string) => Promise<void>;
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

  if (adding) {
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
      </SelectContent>
    </Select>
  );
}
