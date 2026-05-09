"use client";

/**
 * Structured product form — the *data* side of a product.
 *
 * Two tabs:
 *  • **Basics** — name, SKU, status, price, currency, stock, category, tags,
 *    primary image, short description, long description.
 *  • **Advanced** — variants, specs, gallery, SEO meta, tax, dimensions/weight.
 *
 * Each editable list (variants/specs/gallery/tags) is row-based and uses
 * inline +/− controls, no modals.
 *
 * Controlled — the parent owns the draft state and decides when to PUT.
 */

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ImageOff, X } from "lucide-react";
import {
  PRODUCT_STATUS_OPTIONS,
  CURRENCY_OPTIONS,
} from "./constants";
import type {
  InventoryProduct,
  ProductImage,
  ProductSpec,
  ProductVariant,
  ProductDimensions,
} from "@/lib/api/inventory/types";

export type ProductDraft = Omit<
  InventoryProduct,
  "id" | "organizationId" | "createdAt" | "updatedAt" | "createdById" | "pageLayout"
>;

interface FormProps {
  draft: ProductDraft;
  onChange: (d: ProductDraft) => void;
}

export function ProductForm({ draft, onChange }: FormProps) {
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) =>
    onChange({ ...draft, [k]: v });

  return (
    <Tabs defaultValue="basic" className="w-full">
      <TabsList>
        <TabsTrigger value="basic">Basics</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      </TabsList>

      {/* ─── BASIC ───────────────────────────────────────────── */}
      <TabsContent value="basic" className="mt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Identity" className="md:col-span-2">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name" required>
                <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="SKU">
                <Input value={draft.sku ?? ""} onChange={(e) => set("sku", e.target.value || null)} />
              </Field>
              <Field label="Slug" hint="URL: /storefront/products/<slug>">
                <Input value={draft.slug} onChange={(e) => set("slug", e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={draft.status} onValueChange={(v) => set("status", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRODUCT_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Pricing" className="md:col-span-2">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Price" required>
                <Input type="number" min={0} step="0.01" value={draft.price} onChange={(e) => set("price", Number(e.target.value))} />
              </Field>
              <Field label="Compare-at" hint="Strikethrough price">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.compareAtPrice ?? ""}
                  onChange={(e) => set("compareAtPrice", e.target.value === "" ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="Currency">
                <Select value={draft.currency} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tax %" hint="Inclusive">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.taxRate ?? ""}
                  onChange={(e) => set("taxRate", e.target.value === "" ? null : Number(e.target.value))}
                />
              </Field>
            </div>
          </Section>

          <Section title="Inventory">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Stock qty">
                <Input type="number" min={0} value={draft.stockQty} onChange={(e) => set("stockQty", Number(e.target.value) || 0)} />
              </Field>
              <Field label="Low-stock threshold">
                <Input
                  type="number"
                  min={0}
                  value={draft.lowStockThreshold ?? ""}
                  onChange={(e) => set("lowStockThreshold", e.target.value === "" ? null : Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between mt-3">
              <Label className="text-sm">Track stock</Label>
              <Switch checked={draft.trackStock} onCheckedChange={(v) => set("trackStock", v)} />
            </div>
          </Section>

          <Section title="Categorization">
            <div className="grid gap-3">
              <Field label="Brand">
                <Input value={draft.brand ?? ""} onChange={(e) => set("brand", e.target.value || null)} />
              </Field>
              <Field label="Category">
                <Input value={draft.category ?? ""} onChange={(e) => set("category", e.target.value || null)} />
              </Field>
              <Field label="Tags">
                <TagInput value={draft.tags} onChange={(v) => set("tags", v)} />
              </Field>
            </div>
          </Section>

          <Section title="Primary image" className="md:col-span-2">
            <div className="grid gap-3 md:grid-cols-[200px_1fr] items-start">
              <div className="aspect-square rounded-lg bg-muted overflow-hidden border">
                {draft.primaryImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.primaryImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <ImageOff className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <Field label="Image URL">
                <Input value={draft.primaryImageUrl ?? ""} onChange={(e) => set("primaryImageUrl", e.target.value || null)} placeholder="https://…" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Used as the hero image and the row thumbnail in lists.
                </p>
              </Field>
            </div>
          </Section>

          <Section title="Description" className="md:col-span-2">
            <div className="grid gap-3">
              <Field label="Short description">
                <Input value={draft.shortDescription ?? ""} onChange={(e) => set("shortDescription", e.target.value || null)} />
              </Field>
              <Field label="Long description">
                <Textarea
                  rows={6}
                  value={draft.description ?? ""}
                  onChange={(e) => set("description", e.target.value || null)}
                />
              </Field>
            </div>
          </Section>
        </div>
      </TabsContent>

      {/* ─── ADVANCED ────────────────────────────────────────── */}
      <TabsContent value="advanced" className="mt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Gallery images" className="md:col-span-2">
            <ImageList value={draft.images} onChange={(v) => set("images", v)} />
          </Section>

          <Section title="Variants" className="md:col-span-2">
            <VariantList value={draft.variants} onChange={(v) => set("variants", v)} />
          </Section>

          <Section title="Specs" className="md:col-span-2">
            <SpecList value={draft.specs} onChange={(v) => set("specs", v)} />
          </Section>

          <Section title="Shipping">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Weight">
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={draft.weight ?? ""}
                  onChange={(e) => set("weight", e.target.value === "" ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="Weight unit">
                <Select value={draft.weightUnit ?? "kg"} onValueChange={(v) => set("weightUnit", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["g", "kg", "lb", "oz"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <DimensionsField value={draft.dimensions} onChange={(v) => set("dimensions", v)} />
          </Section>

          <Section title="SEO">
            <div className="grid gap-3">
              <Field label="Meta title">
                <Input value={draft.metaTitle ?? ""} onChange={(e) => set("metaTitle", e.target.value || null)} />
              </Field>
              <Field label="Meta description">
                <Textarea rows={3} value={draft.metaDescription ?? ""} onChange={(e) => set("metaDescription", e.target.value || null)} />
              </Field>
              <Field label="Meta keywords" hint="Comma-separated">
                <Input value={draft.metaKeywords ?? ""} onChange={(e) => set("metaKeywords", e.target.value || null)} />
              </Field>
            </div>
          </Section>
        </div>
      </TabsContent>
    </Tabs>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-4 ${className ?? ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </div>
      {children}
    </Card>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = React.useState("");
  const add = (t: string) => {
    const trimmed = t.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== t))}
              className="hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(input);
          }
        }}
        onBlur={() => add(input)}
        placeholder="Type and press Enter…"
      />
    </div>
  );
}

function ImageList({ value, onChange }: { value: ProductImage[]; onChange: (v: ProductImage[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((img, i) => (
        <div key={i} className="grid grid-cols-[80px_1fr_1fr_auto] gap-2 items-center">
          <div className="aspect-square rounded bg-muted overflow-hidden border">
            {img.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.url} alt={img.alt ?? ""} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <ImageOff className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}
          </div>
          <Input
            placeholder="https://…"
            value={img.url}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...img, url: e.target.value };
              onChange(next);
            }}
          />
          <Input
            placeholder="Alt text"
            value={img.alt ?? ""}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...img, alt: e.target.value };
              onChange(next);
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...value, { url: "", alt: "" }])}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add image
      </Button>
    </div>
  );
}

function SpecList({ value, onChange }: { value: ProductSpec[]; onChange: (v: ProductSpec[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <Input
            placeholder="Label (e.g. Material)"
            value={s.label}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...s, label: e.target.value };
              onChange(next);
            }}
          />
          <Input
            placeholder="Value (e.g. 100% cotton)"
            value={s.value}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...s, value: e.target.value };
              onChange(next);
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...value, { label: "", value: "" }])}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add spec
      </Button>
    </div>
  );
}

function VariantList({ value, onChange }: { value: ProductVariant[]; onChange: (v: ProductVariant[]) => void }) {
  return (
    <div className="space-y-3">
      {value.map((v, i) => (
        <Card key={i} className="p-3 bg-muted/20">
          <div className="flex items-center gap-2 mb-2">
            <Input
              placeholder="Variant name (e.g. Size)"
              value={v.name}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...v, name: e.target.value };
                onChange(next);
              }}
              className="max-w-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive ml-auto"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1.5">
            {v.options.map((o, j) => (
              <div key={j} className="grid grid-cols-[1fr_120px_120px_auto] gap-2">
                <Input
                  placeholder="Option (e.g. Small)"
                  value={o.label}
                  onChange={(e) => {
                    const next = [...value];
                    const opts = [...v.options];
                    opts[j] = { ...o, label: e.target.value };
                    next[i] = { ...v, options: opts };
                    onChange(next);
                  }}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="± Price"
                  value={o.priceDelta ?? ""}
                  onChange={(e) => {
                    const next = [...value];
                    const opts = [...v.options];
                    opts[j] = { ...o, priceDelta: e.target.value === "" ? undefined : Number(e.target.value) };
                    next[i] = { ...v, options: opts };
                    onChange(next);
                  }}
                />
                <Input
                  placeholder="SKU"
                  value={o.sku ?? ""}
                  onChange={(e) => {
                    const next = [...value];
                    const opts = [...v.options];
                    opts[j] = { ...o, sku: e.target.value || undefined };
                    next[i] = { ...v, options: opts };
                    onChange(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => {
                    const next = [...value];
                    next[i] = { ...v, options: v.options.filter((_, k) => k !== j) };
                    onChange(next);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => {
                const next = [...value];
                next[i] = { ...v, options: [...v.options, { label: "" }] };
                onChange(next);
              }}
            >
              <Plus className="h-3 w-3 mr-1" /> Option
            </Button>
          </div>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...value, { name: "", options: [] }])}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add variant
      </Button>
    </div>
  );
}

function DimensionsField({
  value,
  onChange,
}: {
  value: ProductDimensions | null;
  onChange: (v: ProductDimensions | null) => void;
}) {
  const v = value ?? {};
  const set = (k: keyof ProductDimensions, val: any) => {
    const next: ProductDimensions = { ...v, [k]: val };
    if (next.length == null && next.width == null && next.height == null && !next.unit) {
      onChange(null);
    } else {
      onChange(next);
    }
  };
  return (
    <div className="grid grid-cols-4 gap-2 mt-3">
      <Field label="L">
        <Input
          type="number"
          min={0}
          step="0.1"
          value={v.length ?? ""}
          onChange={(e) => set("length", e.target.value === "" ? undefined : Number(e.target.value))}
        />
      </Field>
      <Field label="W">
        <Input
          type="number"
          min={0}
          step="0.1"
          value={v.width ?? ""}
          onChange={(e) => set("width", e.target.value === "" ? undefined : Number(e.target.value))}
        />
      </Field>
      <Field label="H">
        <Input
          type="number"
          min={0}
          step="0.1"
          value={v.height ?? ""}
          onChange={(e) => set("height", e.target.value === "" ? undefined : Number(e.target.value))}
        />
      </Field>
      <Field label="Unit">
        <Select value={v.unit ?? "cm"} onValueChange={(u) => set("unit", u)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["mm", "cm", "m", "in", "ft"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
