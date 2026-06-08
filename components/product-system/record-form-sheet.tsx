"use client";

/**
 * Schema-driven create/edit form for the Product Master. Fields render from the
 * schema grouped by section (Identification, Technical, Financial, …). `master`
 * fields source live options with inline add; `status` renders the lifecycle
 * pipeline; `url` fields are plain inputs (rendered as links in the preview).
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
import { useProduct } from "@/lib/product-system/store";
import { MediaField } from "./media-field";
import type { MediaRef } from "@/lib/product-system/media";
import type { FieldDef, ProductRecord, SubmoduleSchema } from "@/lib/product-system/types";

interface RecordFormSheetProps {
  schema: SubmoduleSchema;
  open: boolean;
  record: ProductRecord | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

function buildInitial(schema: SubmoduleSchema, record: ProductRecord | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (record && record[f.key] != null) out[f.key] = record[f.key];
    else if (f.type === "checkbox") out[f.key] = false;
    else if (f.defaultValue != null) out[f.key] = f.defaultValue;
    else if (f.type === "status" && f.statusOptions?.length) out[f.key] = f.statusOptions[0].value;
    else out[f.key] = f.type === "number" || f.type === "currency" ? 0 : "";
  }
  return out;
}

export function RecordFormSheet({ schema, open, record, onOpenChange, onSubmit }: RecordFormSheetProps) {
  const { getMasterOptions, addMasterOption } = useProduct();
  const [form, setForm] = useState<Record<string, unknown>>(() => buildInitial(schema, record));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(buildInitial(schema, record));
      setErrors({});
    }
  }, [open, record, schema]);

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
      for (const f of schema.fields) {
        if (f.showIf?.field === key && next[f.showIf.field] !== f.showIf.equals) {
          next[f.key] =
            f.type === "number" || f.type === "currency"
              ? 0
              : f.type === "checkbox"
                ? false
                : "";
        }
      }
      return next;
    });
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const isVisible = (f: FieldDef) => !f.showIf || form[f.showIf.field] === f.showIf.equals;
  const isShown = (f: FieldDef) => !f.formHidden && isVisible(f);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    for (const f of schema.fields) {
      if (!f.required || f.formHidden || !isVisible(f)) continue;
      const v = form[f.key];
      if (v == null || String(v).trim() === "") next[f.key] = `${f.label} is required`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      // Surface the first error's section by scrolling isn't wired; the inline
      // messages are enough for this dense form.
      return;
    }
    const data: Record<string, unknown> = { ...form };
    for (const f of schema.fields) {
      if (f.type === "number" || f.type === "currency") data[f.key] = Number(data[f.key] ?? 0) || 0;
    }
    onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>{record ? `Edit ${schema.recordNoun}` : `New ${schema.recordNoun}`}</SheetTitle>
          <SheetDescription>
            {record
              ? `Update ${String(record.productName ?? record.docNo ?? "this product")}.`
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
}: {
  field: FieldDef;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  getMasterOptions: (key: string) => Array<{ id: string; value: string }>;
  onAddMasterOption: (key: string, value: string, code?: string) => Promise<void>;
}) {
  const fullWidth = field.type === "textarea" || field.type === "media" || field.type === "url";
  const numeric = field.type === "number" || field.type === "currency";
  return (
    <div className={cn("space-y-1.5", fullWidth && "sm:col-span-2")}>
      <Label className="text-sm">
        {field.label}
        {field.unit && <span className="text-muted-foreground font-normal"> ({field.unit})</span>}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>

      {field.type === "checkbox" ? (
        <div className="flex items-center h-9">
          <Checkbox checked={!!value} onCheckedChange={(v) => onChange(v === true)} aria-label={field.label} />
        </div>
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
          type={numeric ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
          value={(value as string | number) ?? ""}
          placeholder={field.placeholder ?? (field.type === "url" ? "https://…" : undefined)}
          onChange={(e) =>
            onChange(numeric ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
          }
          className={cn(numeric && "font-mono", error && "border-destructive")}
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
        {options.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">No options yet</div>}
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
