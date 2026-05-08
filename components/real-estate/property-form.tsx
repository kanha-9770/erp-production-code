"use client";

/**
 * Shared Property form, used by both /real-estate/properties/new and
 * /real-estate/properties/[id]/edit. Pure client component — the page wires
 * the create-or-update mutation and navigation.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import {
  PROPERTY_TYPE_OPTIONS,
  PROPERTY_SUBTYPE_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  AREA_UNIT_OPTIONS,
  COMMISSION_TERM_LABEL,
} from "./constants";
import type { Property } from "@/lib/api/real-estate/types";

export interface PropertyFormValues {
  title: string;
  code: string;
  description: string;
  type: string;
  subType: string;
  status: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  listingPrice: string;
  currency: string;
  area: string;
  areaUnit: string;
  bedrooms: string;
  bathrooms: string;
  parkingSpots: string;
  yearBuilt: string;
  features: string[];
  commissionTermType: "PERCENTAGE" | "FLAT_FEE";
  commissionPercentage: string;
  commissionFlatFee: string;
  expectedClosingAt: string;
  expiresAt: string;
  minClosingPercent: string;
  priceChangeReason: string;
}

const EMPTY: PropertyFormValues = {
  title: "",
  code: "",
  description: "",
  type: "RESIDENTIAL",
  subType: "",
  status: "DRAFT",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "India",
  postalCode: "",
  listingPrice: "",
  currency: "INR",
  area: "",
  areaUnit: "sqft",
  bedrooms: "",
  bathrooms: "",
  parkingSpots: "",
  yearBuilt: "",
  features: [],
  commissionTermType: "PERCENTAGE",
  commissionPercentage: "2",
  commissionFlatFee: "",
  expectedClosingAt: "",
  expiresAt: "",
  minClosingPercent: "",
  priceChangeReason: "",
};

export function fromProperty(p: Property): PropertyFormValues {
  return {
    title: p.title ?? "",
    code: p.code ?? "",
    description: p.description ?? "",
    type: p.type,
    subType: p.subType ?? "",
    status: p.status,
    addressLine1: p.addressLine1 ?? "",
    addressLine2: p.addressLine2 ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    country: p.country ?? "",
    postalCode: p.postalCode ?? "",
    listingPrice: String(p.listingPrice ?? ""),
    currency: p.currency ?? "INR",
    area: p.area != null ? String(p.area) : "",
    areaUnit: p.areaUnit ?? "sqft",
    bedrooms: p.bedrooms != null ? String(p.bedrooms) : "",
    bathrooms: p.bathrooms != null ? String(p.bathrooms) : "",
    parkingSpots: p.parkingSpots != null ? String(p.parkingSpots) : "",
    yearBuilt: p.yearBuilt != null ? String(p.yearBuilt) : "",
    features: p.features ?? [],
    commissionTermType: p.commissionTermType,
    commissionPercentage:
      p.commissionPercentage != null ? String(p.commissionPercentage) : "",
    commissionFlatFee:
      p.commissionFlatFee != null ? String(p.commissionFlatFee) : "",
    expectedClosingAt: p.expectedClosingAt
      ? p.expectedClosingAt.slice(0, 10)
      : "",
    expiresAt: p.expiresAt ? p.expiresAt.slice(0, 10) : "",
    minClosingPercent:
      p.minClosingPercent != null ? String(p.minClosingPercent) : "",
    priceChangeReason: "",
  };
}

export function toApiPayload(values: PropertyFormValues): Record<string, any> {
  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
  const intOrNull = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));

  return {
    title: values.title.trim(),
    code: values.code.trim() || null,
    description: values.description.trim() || null,
    type: values.type,
    subType: values.subType || null,
    status: values.status,
    addressLine1: values.addressLine1.trim(),
    addressLine2: values.addressLine2.trim() || null,
    city: values.city.trim(),
    state: values.state.trim() || null,
    country: values.country.trim(),
    postalCode: values.postalCode.trim() || null,
    listingPrice: numOrNull(values.listingPrice),
    currency: values.currency || "INR",
    area: numOrNull(values.area),
    areaUnit: values.areaUnit || null,
    bedrooms: intOrNull(values.bedrooms),
    bathrooms: intOrNull(values.bathrooms),
    parkingSpots: intOrNull(values.parkingSpots),
    yearBuilt: intOrNull(values.yearBuilt),
    features: values.features,
    commissionTermType: values.commissionTermType,
    commissionPercentage:
      values.commissionTermType === "PERCENTAGE"
        ? numOrNull(values.commissionPercentage)
        : null,
    commissionFlatFee:
      values.commissionTermType === "FLAT_FEE"
        ? numOrNull(values.commissionFlatFee)
        : null,
    expectedClosingAt: values.expectedClosingAt || null,
    expiresAt: values.expiresAt || null,
    minClosingPercent: numOrNull(values.minClosingPercent),
    priceChangeReason: values.priceChangeReason || undefined,
  };
}

export interface PropertyFormProps {
  initial?: Property | null;
  onSubmit: (payload: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel?: string;
  // When editing, show the price-change reason input only when listingPrice
  // actually differs from the initial value.
  priceChanged?: boolean;
}

export function PropertyForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  priceChanged: priceChangedProp,
}: PropertyFormProps) {
  const [values, setValues] = useState<PropertyFormValues>(() =>
    initial ? fromProperty(initial) : EMPTY,
  );
  const [featureDraft, setFeatureDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setValues(fromProperty(initial));
  }, [initial]);

  const set = <K extends keyof PropertyFormValues>(k: K, v: PropertyFormValues[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  const addFeature = () => {
    const f = featureDraft.trim();
    if (!f) return;
    if (values.features.includes(f)) {
      setFeatureDraft("");
      return;
    }
    set("features", [...values.features, f]);
    setFeatureDraft("");
  };

  const removeFeature = (f: string) => {
    set("features", values.features.filter((x) => x !== f));
  };

  const priceChanged =
    priceChangedProp ??
    (initial != null &&
      values.listingPrice !== "" &&
      Number(values.listingPrice) !== Number(initial.listingPrice));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.title.trim()) return setError("Title is required");
    if (!values.addressLine1.trim()) return setError("Address line 1 is required");
    if (!values.city.trim()) return setError("City is required");
    if (!values.country.trim()) return setError("Country is required");
    if (values.listingPrice === "" || Number(values.listingPrice) < 0)
      return setError("Listing price must be a non-negative number");

    if (
      values.commissionTermType === "PERCENTAGE" &&
      values.commissionPercentage !== "" &&
      Number(values.commissionPercentage) < 0
    )
      return setError("Commission percentage must be non-negative");

    await onSubmit(toApiPayload(values));
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Title *">
            <Input
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="3 BHK apartment in Andheri West"
            />
          </Field>
          <Field label="Code (optional)" hint="Internal reference, e.g. PROP-2026-0042">
            <Input value={values.code} onChange={(e) => set("code", e.target.value)} />
          </Field>
          <Field label="Type *" className="sm:col-span-1">
            <Select value={values.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sub-type">
            <Select value={values.subType} onValueChange={(v) => set("subType", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {PROPERTY_SUBTYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={values.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROPERTY_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1 *" className="sm:col-span-2">
            <Input value={values.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
          </Field>
          <Field label="Address line 2" className="sm:col-span-2">
            <Input value={values.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} />
          </Field>
          <Field label="City *">
            <Input value={values.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State">
            <Input value={values.state} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="Country *">
            <Input value={values.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="Postal code">
            <Input value={values.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {/* Pricing & area */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing & Area</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Listing price *">
            <Input
              type="number"
              inputMode="decimal"
              value={values.listingPrice}
              onChange={(e) => set("listingPrice", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Currency">
            <Input value={values.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </Field>
          {priceChanged && (
            <Field label="Reason for price change" className="sm:col-span-2">
              <Input
                value={values.priceChangeReason}
                onChange={(e) => set("priceChangeReason", e.target.value)}
                placeholder="Recorded in the price-history audit"
              />
            </Field>
          )}
          <Field label="Area">
            <Input
              type="number"
              inputMode="decimal"
              value={values.area}
              onChange={(e) => set("area", e.target.value)}
            />
          </Field>
          <Field label="Area unit">
            <Select value={values.areaUnit} onValueChange={(v) => set("areaUnit", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AREA_UNIT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Bedrooms">
            <Input type="number" value={values.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
          </Field>
          <Field label="Bathrooms">
            <Input type="number" value={values.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} />
          </Field>
          <Field label="Parking spots">
            <Input type="number" value={values.parkingSpots} onChange={(e) => set("parkingSpots", e.target.value)} />
          </Field>
          <Field label="Year built">
            <Input type="number" value={values.yearBuilt} onChange={(e) => set("yearBuilt", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features & amenities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {values.features.length === 0 ? (
              <span className="text-sm text-muted-foreground">No features added.</span>
            ) : (
              values.features.map((f) => (
                <Badge key={f} variant="secondary" className="gap-1">
                  {f}
                  <button
                    type="button"
                    aria-label={`Remove ${f}`}
                    className="hover:text-destructive"
                    onClick={() => removeFeature(f)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={featureDraft}
              onChange={(e) => setFeatureDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFeature();
                }
              }}
              placeholder="e.g. swimming pool, gated, gym"
            />
            <Button type="button" variant="outline" onClick={addFeature}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Commission */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" className="sm:col-span-2">
            <Select
              value={values.commissionTermType}
              onValueChange={(v) =>
                set("commissionTermType", v as PropertyFormValues["commissionTermType"])
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENTAGE">{COMMISSION_TERM_LABEL.PERCENTAGE}</SelectItem>
                <SelectItem value="FLAT_FEE">{COMMISSION_TERM_LABEL.FLAT_FEE}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {values.commissionTermType === "PERCENTAGE" ? (
            <Field label="Commission % of sale price">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={values.commissionPercentage}
                onChange={(e) => set("commissionPercentage", e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Flat fee">
              <Input
                type="number"
                inputMode="decimal"
                value={values.commissionFlatFee}
                onChange={(e) => set("commissionFlatFee", e.target.value)}
              />
            </Field>
          )}
          <Field label="Min closing % of listing price" hint="BR-12 — closing below this needs explicit approval">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={values.minClosingPercent}
              onChange={(e) => set("minClosingPercent", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Dates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dates</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Expected closing date">
            <Input
              type="date"
              value={values.expectedClosingAt}
              onChange={(e) => set("expectedClosingAt", e.target.value)}
            />
          </Field>
          <Field label="Listing expires on">
            <Input
              type="date"
              value={values.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel ?? "Save"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
