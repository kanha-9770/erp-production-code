"use client";

/** Read-only detail pane for a selected purchase document. */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Pencil,
  Trash2,
  Loader2,
  ArrowRight,
  PackageCheck,
  CheckCircle2,
  Lock,
  BadgeCheck,
  Ban,
  Banknote,
} from "lucide-react";
import { formatDate, formatMoney, formatNumber, resolveStatus, showIfSatisfied } from "@/lib/purchase-system/format";
import { promotionsFor, type PromotionDef } from "@/lib/purchase-system/promote";
import { MediaGallery } from "./media-field";
import { LineItemsView } from "./line-items-field";
import type { FieldDef, PurchaseRecord, PurchasePermissions, SubmoduleSchema } from "@/lib/purchase-system/types";

function displayValue(field: FieldDef, record: PurchaseRecord): React.ReactNode {
  const v = record[field.key];
  if (field.type === "checkbox") return v ? "Yes" : "No";
  if (field.type === "status") {
    const s = resolveStatus(field, v);
    return <Badge variant={s.variant}>{s.label}</Badge>;
  }
  if (field.type === "currency") return formatMoney(v);
  if (field.type === "number") return formatNumber(v);
  if (field.type === "date") return formatDate(v);
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  return String(v);
}

export function RecordPreview({
  schema,
  record,
  onEdit,
  onDelete,
  onPromote,
  onPostStock,
  onSetStatus,
  permissions,
}: {
  schema: SubmoduleSchema;
  record: PurchaseRecord;
  onEdit: () => void;
  onDelete: () => void;
  /** Promote this document to the next step in the procure-to-pay chain. */
  onPromote?: (def: PromotionDef) => void;
  /** GRN only: post received quantities into Store Inventory. */
  onPostStock?: () => void;
  /** Advance this document's workflow status (payment approval buttons). */
  onSetStatus?: (status: string) => void;
  /** The logged-in user's purchase capabilities — drives which action buttons
   *  show. A pure requester (no caps) sees only the read-only document. */
  permissions: PurchasePermissions;
}) {
  // Capability → button visibility. Edit shows for anyone who can act on the doc
  // (buyer/approver/store/AP); delete is buyer/admin only; each promote needs the
  // capability for the stage it creates. Mirrors the server-side gates.
  const canEdit =
    permissions.process ||
    permissions.approveRequisition ||
    permissions.approvePo ||
    permissions.postStock ||
    permissions.raisePayment ||
    permissions.approvePayment;
  const canDelete = permissions.process;
  const canPostStock = permissions.postStock;
  const canPromoteTo = (to: string) =>
    to === "grn" ? permissions.postStock : to === "payment" ? permissions.raisePayment : permissions.process;

  const promotions = (onPromote ? promotionsFor(schema.key) : []).filter((p) => canPromoteTo(p.to));
  const stockPosted = String(record.stockUpdated ?? "NO") === "YES";
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

  // Records saved before a controlling field existed (e.g. a GRN without
  // "Received Against") evaluate showIf against that field's default, so their
  // dependent sections don't vanish from the preview.
  const controllingValue = (f: FieldDef) => {
    const key = f.showIf!.field;
    if (record[key] != null && record[key] !== "") return record[key];
    return schema.fields.find((c) => c.key === key)?.defaultValue;
  };
  const isVisible = (f: FieldDef) => !f.showIf || showIfSatisfied(f.showIf, controllingValue(f));

  // Payment workflow — split by role: the APPROVAL decisions (approve / hold /
  // reject) belong to the approver (approvePayment — admin / a given user); once
  // approved, the account manager who raised it (raisePayment) marks it PAID.
  const paymentStatus = schema.key === "payment" ? String(record.status ?? "") : null;
  const canMarkPaid = permissions.raisePayment || permissions.approvePayment;
  const paymentActions: Array<{ status: string; label: string; icon: React.ReactNode }> =
    schema.key === "payment" && onSetStatus
      ? paymentStatus === "REQUESTED" || paymentStatus === "ON_HOLD"
        ? permissions.approvePayment
          ? [
              { status: "APPROVED", label: "Approve payment", icon: <BadgeCheck className="h-3.5 w-3.5 mr-1.5" /> },
              ...(paymentStatus === "REQUESTED"
                ? [{ status: "ON_HOLD", label: "Put on hold", icon: <Loader2 className="h-3.5 w-3.5 mr-1.5" /> }]
                : []),
              { status: "REJECTED", label: "Reject", icon: <Ban className="h-3.5 w-3.5 mr-1.5" /> },
            ]
          : []
        : paymentStatus === "APPROVED" && canMarkPaid
          ? [{ status: "PAID", label: "Mark as paid", icon: <Banknote className="h-3.5 w-3.5 mr-1.5" /> }]
          : []
      : [];
  // When a line-items subform holds the detail, hide the flat mirror fields so
  // they aren't shown twice; legacy records without rows still show them.
  const hasLineItems = schema.fields.some(
    (f) => f.type === "lineItems" && Array.isArray(record[f.key]) && (record[f.key] as unknown[]).length > 0,
  );
  // Hide the auto-filled Invoice Amount when no GRN was booked (value is 0/empty)
  // — in that case the figure lives in Request Amount instead.
  const isShown = (f: FieldDef) =>
    isVisible(f) && !(f.formHidden && hasLineItems) && !(f.requiresGrnInvoice && !record[f.key]);

  return (
    <div className="p-5 sm:p-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight truncate font-mono">
              {String(record.docNo ?? "—")}
            </h2>
            {record._optimistic && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> saving…
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {String(record.supplierName ?? record.itemName ?? record.supplier ?? schema.label)}
          </div>
        </div>
        {(() => {
          const a = (record as any)?._approval;
          if (a && (a.status === "PENDING" || a.status === "REJECTED")) {
            return (
              <Badge variant={a.status === "PENDING" ? "outline" : "destructive"}>
                {a.status === "PENDING" ? "Pending Approval" : "Rejected"}
              </Badge>
            );
          }
          return status && <Badge variant={status.variant}>{status.label}</Badge>;
        })()}
      </div>

      {(canEdit || canDelete) && (
        <div className="flex gap-2">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          )}
        </div>
      )}

      {schema.key === "payment" &&
        (paymentActions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Payment approval
            </p>
            <div className="flex flex-wrap gap-2">
              {paymentActions.map((a) => (
                <Button
                  key={a.status}
                  size="sm"
                  variant={a.status === "REJECTED" ? "outline" : "default"}
                  className={a.status === "REJECTED" ? "text-destructive hover:text-destructive" : undefined}
                  onClick={() => onSetStatus?.(a.status)}
                >
                  {a.icon}
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        ) : !permissions.approvePayment && (paymentStatus === "REQUESTED" || paymentStatus === "ON_HOLD") ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Approver permission required to act on this payment
          </span>
        ) : !canMarkPaid && paymentStatus === "APPROVED" ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Account-manager permission required to mark this payment paid
          </span>
        ) : null)}

      {(promotions.length > 0 || onPostStock) && record.docNo ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Next step
          </p>
          <div className="flex flex-wrap gap-2">
            {promotions.map((p) => (
              <Button key={`${p.to}-${p.label}`} size="sm" onClick={() => onPromote?.(p)}>
                {p.label} <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            ))}
            {onPostStock ? (
              stockPosted ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Stock posted to inventory
                </span>
              ) : canPostStock ? (
                <Button size="sm" variant="secondary" onClick={onPostStock}>
                  <PackageCheck className="h-3.5 w-3.5 mr-1.5" /> Post to inventory
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Store-keeper permission required to post stock
                </span>
              )
            ) : null}
          </div>
        </div>
      ) : null}

      {sections.map((section) => (
        <div key={section.name} className="space-y-3">
          <Separator />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.name}
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {section.fields
              .filter((f) => f.type !== "textarea" && f.type !== "media" && f.type !== "lineItems" && isShown(f))
              .map((f) => (
                <div key={f.key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="text-sm font-medium truncate">{displayValue(f, record)}</dd>
                </div>
              ))}
          </dl>
          {section.fields
            .filter((f) => f.type === "lineItems")
            .map((f) => (
              <div key={f.key} className="space-y-1.5">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd>
                  <LineItemsView field={f} value={record[f.key]} />
                </dd>
              </div>
            ))}
          {section.fields
            .filter((f) => f.type === "media")
            .map((f) => (
              <div key={f.key} className="space-y-1.5">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd>
                  <MediaGallery value={record[f.key]} />
                </dd>
              </div>
            ))}
          {section.fields
            .filter((f) => f.type === "textarea" && record[f.key])
            .map((f) => (
              <div key={f.key}>
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="text-sm whitespace-pre-wrap">{String(record[f.key])}</dd>
              </div>
            ))}
        </div>
      ))}

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
