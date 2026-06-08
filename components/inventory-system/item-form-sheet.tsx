"use client";

/**
 * Generic, schema-driven create/edit form for any inventory submodule.
 *
 * It renders fields from the submodule's `SubmoduleSchema`, grouping them by
 * section. `master` fields source their options from the live master registry
 * (so editing the Inventory Master instantly changes what's selectable here),
 * with an inline "+ Add" affordance to extend a master without leaving the
 * form. Submission is fire-and-forget: the parent closes the sheet immediately
 * and the optimistic provider reflects the change.
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
import { Plus, ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInventory } from "@/lib/inventory-system/store";
import { STATUS_OPTIONS } from "@/lib/inventory-system/format";
import { fileToResizedDataUrl } from "@/lib/inventory-system/image";
import { useToast } from "@/hooks/use-toast";
import type { FieldDef, InventoryItem, SubmoduleSchema } from "@/lib/inventory-system/types";

interface ItemFormSheetProps {
  schema: SubmoduleSchema;
  open: boolean;
  /** The item being edited, or null when creating. */
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

function buildInitial(schema: SubmoduleSchema, item: InventoryItem | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (item && item[f.key] != null) out[f.key] = item[f.key];
    else out[f.key] = f.defaultValue ?? (f.type === "number" || f.type === "currency" ? 0 : "");
  }
  return out;
}

export function ItemFormSheet({ schema, open, item, onOpenChange, onSubmit }: ItemFormSheetProps) {
  const { getMasterOptions, addMasterOption } = useInventory();
  const [form, setForm] = useState<Record<string, unknown>>(() => buildInitial(schema, item));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Re-seed the form whenever the sheet opens for a different item.
  useEffect(() => {
    if (open) {
      setForm(buildInitial(schema, item));
      setErrors({});
    }
  }, [open, item, schema]);

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
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    for (const f of schema.fields) {
      if (!f.required) continue;
      const v = form[f.key];
      if (v == null || String(v).trim() === "") next[f.key] = `${f.label} is required`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    // Coerce numeric fields.
    const data: Record<string, unknown> = { ...form };
    for (const f of schema.fields) {
      if (f.type === "number" || f.type === "currency") {
        data[f.key] = Number(data[f.key] ?? 0) || 0;
      }
    }
    onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>
            {item ? `Edit ${schema.itemNoun}` : `New ${schema.itemNoun}`}
          </SheetTitle>
          <SheetDescription>
            {item
              ? `Update the details for ${String(item.itemName ?? "this record")}.`
              : `Add a new ${schema.itemNoun} to ${schema.label.toLowerCase()}.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {sections.map((section) => (
            <div key={section.name} className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.name}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {section.fields.map((f) => (
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
          ))}
        </div>

        <SheetFooter className="px-6 py-4 border-t flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{item ? "Save changes" : `Create ${schema.itemNoun}`}</Button>
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
  const fullWidth = field.type === "textarea";
  return (
    <div className={cn("space-y-1.5", fullWidth && "sm:col-span-2")}>
      <Label className="text-sm">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>

      {field.type === "image" ? (
        <ImageField value={(value as string) ?? ""} onChange={onChange} />
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
          <SelectTrigger>
            <SelectValue placeholder="Auto (from stock)" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.auto ? (
        // System-generated, locked (e.g. the item code). Read-only.
        <Input
          value={(value as string) ?? ""}
          readOnly
          placeholder="Auto-generated on save"
          className="font-mono bg-muted/50 text-muted-foreground cursor-not-allowed"
        />
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

/** Image picker: upload → resized data URL preview, with a remove button. */
function ImageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: unknown) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not load image",
        description: (err as Error)?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 rounded-lg border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Item" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" asChild>
            <span className="cursor-pointer">
              <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
              {value ? "Replace" : "Upload"}
            </span>
          </Button>
        </label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive h-7 justify-start px-2"
            onClick={() => onChange("")}
          >
            <X className="h-3.5 w-3.5 mr-1.5" /> Remove
          </Button>
        )}
      </div>
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
              // onMouseDown so it fires before the Select closes/blur.
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
