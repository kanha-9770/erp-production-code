"use client";

/** Read-only detail pane for a selected inventory record. */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import {
  formatDate,
  formatMoney,
  formatNumber,
  deriveStockStatus,
  STATUS_LABEL,
  STATUS_VARIANT,
  getApprovalMeta,
  APPROVAL_BADGE,
} from "@/lib/inventory-system/format";
import type { FieldDef, InventoryItem, SubmoduleSchema } from "@/lib/inventory-system/types";

function displayValue(field: FieldDef, item: InventoryItem): React.ReactNode {
  const v = item[field.key];
  if (field.type === "status") {
    const s = deriveStockStatus(item);
    return <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABEL[s]}</Badge>;
  }
  if (field.type === "currency") return formatMoney(v);
  if (field.type === "number") return formatNumber(v);
  if (field.type === "date") return formatDate(v);
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  return String(v);
}

export function ItemPreview({
  schema,
  item,
  onEdit,
  onDelete,
}: {
  schema: SubmoduleSchema;
  item: InventoryItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Group fields by section, same order as the form.
  const sections: Array<{ name: string; fields: FieldDef[] }> = [];
  for (const f of schema.fields) {
    let s = sections.find((x) => x.name === f.section);
    if (!s) {
      s = { name: f.section, fields: [] };
      sections.push(s);
    }
    s.fields.push(f);
  }

  const status = deriveStockStatus(item);
  const imageField = schema.fields.find((f) => f.type === "image");
  const imageSrc = imageField ? (item[imageField.key] as string | undefined) : undefined;

  return (
    <div className="p-5 sm:p-6 space-y-6">
      {imageSrc && (
        <div className="rounded-xl border bg-muted/30 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt={String(item.itemName ?? "")} className="w-full max-h-56 object-contain" />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight truncate">
              {String(item.itemName ?? "Untitled")}
            </h2>
            {item._optimistic && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> saving…
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground font-mono">
            {String(item.itemCode ?? "")}
          </div>
        </div>
        {(() => {
          const a = getApprovalMeta(item);
          if (a && (a.status === "PENDING" || a.status === "REJECTED")) {
            const b = APPROVAL_BADGE[a.status];
            return <Badge variant={b.variant}>{b.label}</Badge>;
          }
          return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
        })()}
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

      {sections.map((section) => (
        <div key={section.name} className="space-y-3">
          <Separator />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.name}
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {section.fields
              .filter((f) => f.type !== "textarea" && f.type !== "image")
              .map((f) => (
                <div key={f.key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="text-sm font-medium truncate">{displayValue(f, item)}</dd>
                </div>
              ))}
          </dl>
          {section.fields
            .filter((f) => f.type === "textarea" && item[f.key])
            .map((f) => (
              <div key={f.key}>
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="text-sm whitespace-pre-wrap">{String(item[f.key])}</dd>
              </div>
            ))}
        </div>
      ))}

      <Separator />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-muted-foreground">
        <div>
          <dt>Created</dt>
          <dd>{formatDate(item.createdAt)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatDate(item.updatedAt)}</dd>
        </div>
      </div>
    </div>
  );
}
