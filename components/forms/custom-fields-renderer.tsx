"use client";

/**
 * CustomFieldsRenderer — drops admin-added builder fields into a static
 * React form (job-application, employee, …). Pairs with the
 * `useCustomFormFields` hook which fetches the non-core sections via
 * /api/forms/by-kind/[kind].
 *
 * Only the field types our ensure-*-form seeds use are supported here:
 *   text · email · phone · number · date · time · textarea · select · checkbox
 *
 * Anything else (lookup, file, formula, etc. — added manually by an admin in
 * the builder) renders a small "Unsupported here" pill so the value is
 * preserved on save but the admin knows to edit it inside the builder UI.
 *
 * Visual style mirrors the static forms: Card + CardHeader title + a grid
 * of Field wrappers, so a new section appears as another card under the
 * existing static cards.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Settings2 } from "lucide-react";
import type {
  CustomField,
  CustomFieldValues,
  CustomSection,
} from "@/lib/forms/use-custom-form-fields";

interface CustomFieldsRendererProps {
  sections: CustomSection[];
  values: CustomFieldValues;
  onChange: (fieldId: string, value: unknown) => void;
  /** When true, a small admin-only "Customizable" badge appears next to the
   *  section title so users understand these are dynamic fields. */
  showBadge?: boolean;
}

export function CustomFieldsRenderer({
  sections,
  values,
  onChange,
  showBadge = true,
}: CustomFieldsRendererProps) {
  if (sections.length === 0) return null;
  return (
    <>
      {sections.map((section) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {section.title}
              {showBadge && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Settings2 className="h-3 w-3" />
                  Custom
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`grid gap-4 ${
                section.columns === 1
                  ? "grid-cols-1"
                  : section.columns >= 3
                    ? "grid-cols-1 sm:grid-cols-3"
                    : "grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {section.fields.map((field) => (
                <CustomFieldInput
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  onChange={(v) => onChange(field.id, v)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

const NONE = "__none__";

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const required = field.validation?.required === true;
  const label = (
    <Label className="text-xs font-medium text-muted-foreground">
      {field.label}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );

  const type = field.type?.toLowerCase() ?? "text";

  switch (type) {
    case "textarea":
      return (
        <div className="space-y-1.5 sm:col-span-2">
          {label}
          <Textarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
            rows={3}
          />
        </div>
      );

    case "select": {
      const opts = Array.isArray(field.options) ? field.options : [];
      const stringValue = typeof value === "string" && value.length > 0 ? value : NONE;
      return (
        <div className="space-y-1.5">
          {label}
          <Select
            value={stringValue}
            onValueChange={(v) => onChange(v === NONE ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder ?? "Select…"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {opts.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    case "checkbox":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 h-10">
            <Checkbox
              checked={value === true}
              onCheckedChange={(c) => onChange(c === true)}
              id={`cf-${field.id}`}
            />
            <Label htmlFor={`cf-${field.id}`} className="text-sm cursor-pointer">
              {field.label}
              {required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
          </div>
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="number"
            value={
              typeof value === "number"
                ? value
                : typeof value === "string"
                  ? value
                  : ""
            }
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") onChange("");
              else {
                const n = Number(raw);
                onChange(Number.isFinite(n) ? n : raw);
              }
            }}
            placeholder={field.placeholder ?? undefined}
          />
        </div>
      );

    case "date":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
          />
        </div>
      );

    case "time":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="time"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
          />
        </div>
      );

    case "email":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="email"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
          />
        </div>
      );

    case "phone":
    case "tel":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="tel"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
          />
        </div>
      );

    case "text":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
          />
        </div>
      );

    default:
      // Anything exotic the admin added in the builder (lookup, file, signature,
      // formula…) — render a stable text input so the value still round-trips
      // and the admin sees it exists, but tag it so they know to edit in the
      // builder for the real input.
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            {label}
            <span className="text-[10px] text-muted-foreground italic">
              {type} — edit in builder
            </span>
          </div>
          <Input
            value={typeof value === "string" ? value : value == null ? "" : String(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? undefined}
          />
        </div>
      );
  }
}
