"use client";

/** Read-only detail pane for a selected product. */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Pencil, Trash2, Loader2, ExternalLink } from "lucide-react";
import { formatDate, formatMoney, formatNumber, resolveStatus } from "@/lib/product-system/format";
import { MediaGallery } from "./media-field";
import type { FieldDef, ProductRecord, SubmoduleSchema } from "@/lib/product-system/types";

function withUnit(text: string, unit?: string): string {
  return unit && text !== "—" ? `${text} ${unit}` : text;
}

function displayValue(field: FieldDef, record: ProductRecord): React.ReactNode {
  const v = record[field.key];
  if (field.type === "checkbox") return v ? "Yes" : "No";
  if (field.type === "status") {
    const s = resolveStatus(field, v);
    return <Badge variant={s.variant}>{s.label}</Badge>;
  }
  if (field.type === "currency") return formatMoney(v);
  if (field.type === "number") return withUnit(formatNumber(v), field.unit);
  if (field.type === "date") return formatDate(v);
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  if (field.type === "url") {
    const href = String(v);
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline break-all"
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        <span className="truncate">{href}</span>
      </a>
    );
  }
  if (field.type === "select") {
    const opt = field.options?.find((o) => o.value === v);
    return opt ? opt.label : String(v);
  }
  return withUnit(String(v), field.unit);
}

export function RecordPreview({
  schema,
  record,
  onEdit,
  onDelete,
}: {
  schema: SubmoduleSchema;
  record: ProductRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sections: Array<{ name: string; fields: FieldDef[] }> = [];
  for (const f of schema.fields) {
    let s = sections.find((x) => x.name === f.section);
    if (!s) {
      s = { name: f.section, fields: [] };
      sections.push(s);
    }
    s.fields.push(f);
  }

  const statusField = schema.fields.find((f) => f.key === schema.statusKey);
  const status = statusField ? resolveStatus(statusField, record[schema.statusKey]) : null;

  const isVisible = (f: FieldDef) => !f.showIf || record[f.showIf.field] === f.showIf.equals;
  const isShown = (f: FieldDef) => isVisible(f) && !f.formHidden;

  return (
    <div className="p-5 sm:p-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight truncate">
              {String(record.productName ?? record.docNo ?? "—")}
            </h2>
            {record._optimistic && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> saving…
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate font-mono">
            {String(record.docNo ?? "")}
            {record.nesscoModelNo ? ` · ${String(record.nesscoModelNo)}` : ""}
          </div>
        </div>
        {status && <Badge variant={status.variant}>{status.label}</Badge>}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
        </Button>
      </div>

      {sections.map((section) => {
        const shown = section.fields.filter(isShown);
        if (shown.length === 0) return null;
        return (
          <div key={section.name} className="space-y-3">
            <Separator />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.name}
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {shown
                .filter((f) => f.type !== "textarea" && f.type !== "media" && f.type !== "url")
                .map((f) => (
                  <div key={f.key} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="text-sm font-medium truncate">{displayValue(f, record)}</dd>
                  </div>
                ))}
            </dl>
            {shown
              .filter((f) => f.type === "url" && record[f.key])
              .map((f) => (
                <div key={f.key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="text-sm">{displayValue(f, record)}</dd>
                </div>
              ))}
            {shown
              .filter((f) => f.type === "media")
              .map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd>
                    <MediaGallery value={record[f.key]} />
                  </dd>
                </div>
              ))}
            {shown
              .filter((f) => f.type === "textarea" && record[f.key])
              .map((f) => (
                <div key={f.key}>
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="text-sm whitespace-pre-wrap">{String(record[f.key])}</dd>
                </div>
              ))}
          </div>
        );
      })}

      <Separator />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-muted-foreground">
        <div>
          <dt>Created</dt>
          <dd>{formatDate(record.createdAt)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatDate(record.updatedAt)}</dd>
        </div>
      </div>
    </div>
  );
}
