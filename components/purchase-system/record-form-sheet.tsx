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
import { Plus, History, Sparkles, CheckCircle2, Boxes, Lock, Info, Undo2, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePurchase, type ItemPurchaseHistory } from "@/lib/purchase-system/store";
import { useToast } from "@/hooks/use-toast";
import {
  useRecallApprovalRequestMutation,
  useResubmitApprovalMutation,
} from "@/lib/api/approvals";
import { formatMoney, formatDate, resolveStatus, showIfSatisfied } from "@/lib/purchase-system/format";
import { asRows, deriveGrnReceiptStatus, grnItemRows } from "@/lib/purchase-system/receipt";
import { Badge } from "@/components/ui/badge";
import { MediaField, MediaGallery } from "./media-field";
import { LineItemsField, LineItemsView } from "./line-items-field";
import { StoreItemPicker, type SelectedStoreItem } from "./store-item-picker";
import type { MediaRef } from "@/lib/purchase-system/media";
import type { FieldDef, PurchaseRecord, SubmoduleSchema } from "@/lib/purchase-system/types";

interface RecordFormSheetProps {
  schema: SubmoduleSchema;
  open: boolean;
  record: PurchaseRecord | null;
  /** Pre-fill values for a NEW document (used by document promotion). Ignored
   *  when editing an existing `record`. */
  initial?: Record<string, unknown> | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

function rowUid(): string {
  return `ln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function buildInitial(
  schema: SubmoduleSchema,
  record: PurchaseRecord | null,
  initial?: Record<string, unknown> | null,
  currentUser?: { name: string; department: string } | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (record && record[f.key] != null) out[f.key] = record[f.key];
    // New documents prefill user-derived fields ("Requested By", Department)
    // read-only from the logged-in user (the server re-asserts these on save).
    else if (!record && f.prefillUser) out[f.key] = currentUser?.[f.prefillUser] ?? "";
    else if (!record && initial && initial[f.key] != null) out[f.key] = initial[f.key];
    else if (f.type === "lineItems") out[f.key] = [];
    else if (f.type === "checkbox") out[f.key] = false;
    else if (f.defaultValue != null) out[f.key] = f.defaultValue;
    else if (f.type === "status" && f.statusOptions?.length) out[f.key] = f.statusOptions[0].value;
    else out[f.key] = f.type === "number" || f.type === "currency" ? 0 : "";
  }
  // Back-compat: an existing single-item requisition (flat itemName, no Items
  // rows) is migrated into the subform so it can be edited there.
  if (schema.key === "pr") {
    const items = Array.isArray(out.items) ? (out.items as Record<string, unknown>[]) : [];
    if (items.length === 0 && record && record.itemName) {
      out.items = [
        {
          _id: rowUid(),
          itemName: record.itemName,
          itemDescription: record.itemDescription ?? "",
          category: record.category ?? "",
          uom: record.uom ?? "",
          quantity: Number(record.quantity ?? 0) || 0,
        },
      ];
    }
  }
  return out;
}

export function RecordFormSheet({ schema, open, record, initial, onOpenChange, onSubmit }: RecordFormSheetProps) {
  const {
    getMasterOptions,
    addMasterOption,
    getItemHistory,
    currentUser,
    permissions,
    sectionAccess,
    getPaymentPoOptions,
    getGrnInvoiceOptions,
    getPoTrace,
    reload,
  } = usePurchase();
  const { toast } = useToast();
  const [recall, { isLoading: recalling }] = useRecallApprovalRequestMutation();
  const [resubmit, { isLoading: resubmitting }] = useResubmitApprovalMutation();

  // Approval state the record carries (server-written `_approval` marker).
  const approval = (record as any)?._approval as
    | { status?: string; requestId?: string; processName?: string; totalStages?: number; stage?: number; comment?: string }
    | undefined;
  const pendingApproval = approval?.status === "PENDING";
  const rejectedApproval = approval?.status === "REJECTED";

  const handleRecall = async () => {
    if (!approval?.requestId) return;
    try {
      await recall({ id: approval.requestId }).unwrap();
      toast({ title: "Request recalled", description: "The document is editable again." });
      await reload();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not recall", description: e?.data?.error });
    }
  };
  const handleResubmit = async () => {
    if (!record) return;
    try {
      const res: any = await resubmit({ module: "purchase", recordId: record.id }).unwrap();
      toast({ title: res?.data?.resubmitted ? "Resubmitted for approval" : "Document is live (no matching process)" });
      await reload();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not resubmit", description: e?.data?.error });
    }
  };

  // Approval fields are privileged: lock them read-only for users who lack the
  // permission so they can't set a value the server would reject (403). Mirrors
  // guardedPermissionForPatch in lib/permissions/purchase-permissions.ts.
  const lockedByPermission = (f: FieldDef): boolean => {
    if (schema.key === "pr" && f.key === "productionApproval") return !permissions.approveRequisition;
    // Recorded by the production manager at approval time.
    if (schema.key === "pr" && f.key === "itemLocationKept") return !permissions.approveRequisition;
    if (schema.key === "po" && f.key === "approvalStatus") return !permissions.approvePo;
    if (schema.key === "grn" && f.key === "stockUpdated") return !permissions.postStock;
    if (schema.key === "payment" && f.key === "status") return !permissions.approvePayment;
    return false;
  };

  // Section-level edit access: a section an admin restricted (granted to
  // specific roles/users) renders read-only for everyone else. Mirrors
  // assertSectionEditsAllowed in lib/permissions/section-permissions.ts.
  const sectionLocked = (section: string): boolean =>
    pendingApproval || sectionAccess?.[schema.key]?.[section] === false;

  // The Vendor field is managed in Vendor Master and must be selectable by every
  // user in every form — so it is EXEMPT from section-permission locking (it still
  // locks while the whole document is pending approval). Mirrors the same exemption
  // in assertSectionEditsAllowed. Vendors are ADDED only in Vendor Master; here you
  // just pick one.
  const isVendorField = (f: FieldDef): boolean => f.type === "master" && f.master === "supplier";
  const fieldLocked = (f: FieldDef, section: string): boolean => {
    if (lockedByPermission(f)) return true;
    if (pendingApproval) return true; // whole document is read-only while pending
    if (isVendorField(f)) return false; // Vendor always selectable
    return sectionAccess?.[schema.key]?.[section] === false;
  };
  const [form, setForm] = useState<Record<string, unknown>>(() =>
    buildInitial(schema, record, initial, currentUser),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [storePickerOpen, setStorePickerOpen] = useState(false);

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

  // Build one Items-subform row from a chosen store item (item details + qty).
  const toItemRow = (item: SelectedStoreItem): Record<string, unknown> => ({
    _id: `ln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    itemName: item.itemName,
    itemDescription: item.itemDescription,
    category: item.category,
    uom: item.uom,
    quantity: item.quantity,
  });

  // Repeat purchase: append the chosen Store Inventory items (with quantities)
  // to the requisition's Items subform, and mirror the first line onto the flat
  // header fields so the list view and preview stay populated.
  const applyStoreItems = (chosen: SelectedStoreItem[]) => {
    if (chosen.length === 0) return;
    const newRows = chosen.map(toItemRow);
    setForm((prev) => {
      const existing = Array.isArray(prev.items) ? (prev.items as Record<string, unknown>[]) : [];
      const rows = [...existing, ...newRows];
      const head = rows[0] ?? {};
      return {
        ...prev,
        purchaseType: "REPEAT",
        items: rows,
        itemName: (head.itemName as string) || prev.itemName,
        itemDescription: (head.itemDescription as string) || prev.itemDescription,
        category: (head.category as string) || prev.category,
        uom: (head.uom as string) || prev.uom,
        quantity: (head.quantity as number) || prev.quantity,
      };
    });
  };

  useEffect(() => {
    if (open) {
      setForm(buildInitial(schema, record, initial, currentUser));
      setErrors({});
    }
  }, [open, record, schema, initial, currentUser]);

  // Live-derive the GRN receipt status from the invoice/received quantities so
  // the read-only badge updates as the user edits the lines (either shape:
  // invoice grid or flat challan / no-invoice lines).
  useEffect(() => {
    if (schema.key !== "grn") return;
    setForm((prev) => {
      const next = deriveGrnReceiptStatus(prev);
      return prev.receiptStatus === next ? prev : { ...prev, receiptStatus: next };
    });
  }, [schema.key, form.lines, form.receiptLines]);

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
      // Payment request: selecting a PO auto-fills the supplier (and clears the
      // stale invoice when the PO changes), so supplier is never keyed in.
      if (schema.key === "payment" && key === "poRef") {
        const poNo = String(value ?? "");
        const trace = getPoTrace(poNo);
        next.supplier = trace.supplier ?? "";
        next.invoiceNo = "";
        // If goods have been received (GRN done), pull the invoice amount in
        // automatically; a single invoice is auto-selected, otherwise the user
        // picks one below. With no GRN yet, both amounts reset to 0 and the user
        // keys the figure straight into Request Amount.
        const invoices = getGrnInvoiceOptions(poNo);
        if (invoices.length === 1) {
          next.invoiceNo = invoices[0].value;
          next.invoiceAmount = invoices[0].balance;
          next.requestAmount = invoices[0].balance;
        } else {
          next.invoiceAmount = 0;
          next.requestAmount = 0;
        }
      }
      // Picking a specific GRN invoice fills its amount and pre-fills the
      // requested amount (still editable).
      if (schema.key === "payment" && key === "invoiceNo") {
        const match = getGrnInvoiceOptions(String(next.poRef ?? "")).find(
          (o) => o.value === String(value ?? ""),
        );
        next.invoiceAmount = match ? match.balance : 0;
        if (match) next.requestAmount = match.balance;
      }
      // Clear any dependent fields that this change hides, so stale values
      // aren't saved (e.g. unchecking Recommend Vendor clears name + phone;
      // switching away from a partial-advance term clears the advance amount).
      for (const f of schema.fields) {
        if (f.showIf?.field === key && !showIfSatisfied(f.showIf, next[f.showIf.field])) {
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
      // GRN: switching "Received Against" carries the already-entered receipt
      // lines across shapes instead of dropping them — invoice grid rows
      // flatten to plain item lines, and vice versa (after the clear above).
      if (schema.key === "grn" && key === "receivedAgainst") {
        const wasInvoice = String(prev.receivedAgainst ?? "INVOICE") === "INVOICE";
        const isInvoice = String(value ?? "") === "INVOICE";
        if (wasInvoice && !isInvoice) {
          next.receiptLines = grnItemRows(prev);
          next.lines = [];
        } else if (!wasInvoice && isInvoice) {
          const flat = asRows(prev.receiptLines);
          next.lines = flat.length
            ? [{ _id: rowUid(), invoiceNo: "", invoiceDate: "", items: flat }]
            : [];
          next.receiptLines = [];
        }
      }
      return next;
    });
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
    // Repeat requisition → open the Store Inventory picker to choose the item.
    if (schema.key === "pr" && key === "purchaseType" && value === "REPEAT") {
      setStorePickerOpen(true);
    }
  };

  // A field is visible unless its showIf condition is unmet by the current form.
  const isVisible = (f: FieldDef) =>
    !f.showIf || showIfSatisfied(f.showIf, form[f.showIf.field]);

  // Options for a select that sources from live records (payment PO list / the
  // GRN invoices booked against the chosen PO).
  const dynamicOptionsFor = (f: FieldDef): Array<{ value: string; label: string }> | undefined => {
    if (f.optionsSource === "paymentPo")
      return getPaymentPoOptions(String(form[f.key] ?? "") || undefined).map((o) => ({ value: o.value, label: o.label }));
    if (f.optionsSource === "grnInvoice") {
      const poNo = f.dependsOn ? String(form[f.dependsOn] ?? "") : "";
      return getGrnInvoiceOptions(poNo).map((o) => ({ value: o.value, label: o.label }));
    }
    return undefined;
  };

  // A GRN-invoice select — and the auto-filled Invoice Amount — are shown only
  // once the chosen PO has invoices (i.e. goods received via GRN).
  const isShown = (f: FieldDef) => {
    if (f.formHidden || !isVisible(f)) return false;
    if (f.optionsSource === "grnInvoice") return (dynamicOptionsFor(f)?.length ?? 0) > 0;
    if (f.requiresGrnInvoice) {
      const poNo = String(form.poRef ?? "");
      return poNo !== "" && getGrnInvoiceOptions(poNo).length > 0;
    }
    return true;
  };

  // First missing required column across a lineItems value (recursing into
  // nested lineItems columns). Required numbers must be > 0 (a zero quantity
  // is as useless as a blank one).
  const firstRowError = (field: FieldDef, value: unknown): string | null => {
    const rows = asRows(value);
    const noun = field.rowNoun ?? "Row";
    for (let i = 0; i < rows.length; i++) {
      for (const col of field.columns ?? []) {
        if (col.type === "lineItems") {
          const nested = firstRowError(col, rows[i][col.key]);
          if (nested) return `${noun} ${i + 1} — ${nested}`;
          continue;
        }
        if (!col.required) continue;
        const v = rows[i][col.key];
        if (col.type === "number" || col.type === "currency") {
          if (!(Number(v) > 0)) return `${noun} ${i + 1}: ${col.label} must be greater than 0.`;
        } else if (v == null || String(v).trim() === "") {
          return `${noun} ${i + 1}: ${col.label} is required.`;
        }
      }
    }
    return null;
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    for (const f of schema.fields) {
      if (f.formHidden || !isVisible(f)) continue;
      // Read-only for this user (permission / section lock) — they can't fix
      // it, so don't block them on it; the value submits unchanged. (The Vendor
      // field stays editable even in a locked section, so it IS validated.)
      if (fieldLocked(f, f.section)) continue;
      const v = form[f.key];
      if (f.required && (v == null || String(v).trim() === "")) {
        next[f.key] = `${f.label} is required`;
        continue;
      }
      // Rows inside a line-items grid must fill their required columns too.
      if (f.type === "lineItems") {
        const rowError = firstRowError(f, v);
        if (rowError) next[f.key] = rowError;
      }
    }
    // A requisition must list at least one item in the subform.
    if (schema.key === "pr" && !sectionLocked("Item Details")) {
      const rows = Array.isArray(form.items) ? (form.items as unknown[]) : [];
      if (rows.length === 0) next.items = next.items ?? "Add at least one item.";
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
    // Mirror the first Items row onto the flat fields so the list view, preview
    // and item-history lookups keep working off a single "primary" item.
    if (schema.key === "pr") {
      const rows = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
      if (rows.length > 0) {
        const head = rows[0];
        data.itemName = head.itemName ?? "";
        data.itemDescription = head.itemDescription ?? "";
        data.category = head.category ?? "";
        data.uom = head.uom ?? "";
        data.quantity = Number(head.quantity ?? 0) || 0;
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
            {record ? `Edit ${schema.recordNoun}` : `New ${schema.recordNoun}`}
          </SheetTitle>
          <SheetDescription>
            {record
              ? `Update ${String(record.docNo ?? "this document")}.`
              : `Create a new ${schema.recordNoun}.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {approval && (pendingApproval || rejectedApproval) && (
            <div
              className={cn(
                "rounded-md border px-3 py-2.5 text-sm flex items-start gap-2",
                pendingApproval
                  ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                  : "border-destructive/40 bg-destructive/5 text-destructive",
              )}
            >
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-0.5">
                <div className="font-medium">
                  {pendingApproval ? "Pending Approval" : "Approval Rejected"}
                  {approval.processName ? ` · ${approval.processName}` : ""}
                </div>
                {pendingApproval && approval.totalStages ? (
                  <div className="text-xs">
                    Stage {(approval.stage ?? 0) + 1} of {approval.totalStages}. This document is read-only until approved —
                    recall the request to edit it.
                  </div>
                ) : null}
                {rejectedApproval && approval.comment ? (
                  <div className="text-xs">Reason: “{approval.comment}”. Edit and save to resubmit, or use Reapply.</div>
                ) : null}
              </div>
            </div>
          )}
          {schema.key === "pr" && String(form.purchaseType ?? "NEW") === "REPEAT" && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <div className="flex items-start gap-3 min-w-0">
                <Boxes className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="text-sm min-w-0">
                  <span className="font-medium">Repeat purchase.</span>{" "}
                  <span className="text-muted-foreground">
                    {form.itemName
                      ? `Selected “${String(form.itemName)}” from Store Inventory.`
                      : "Pick the item from Store Inventory."}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setStorePickerOpen(true)}
              >
                <Boxes className="h-3.5 w-3.5 mr-1.5" />
                {form.itemName ? "Change item" : "Select item"}
              </Button>
            </div>
          )}
          {schema.key === "pr" && itemName.trim() !== "" && history && (
            <RepeatPurchaseBanner
              history={history}
              isRepeat={String(form.purchaseType ?? "NEW") === "REPEAT"}
              onApply={applyRepeat}
            />
          )}
          {sections.map((section) => {
            const visible = section.fields.filter(isShown);
            if (visible.length === 0) return null;
            const secLocked = sectionLocked(section.name);
            return (
              <div key={section.name} className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  {section.name}
                  {secLocked && (
                    <span className="inline-flex items-center gap-1 normal-case font-normal tracking-normal text-[11px]">
                      <Lock className="h-3 w-3" /> view only — permission required
                    </span>
                  )}
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
                      locked={fieldLocked(f, section.name)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <SheetFooter className="px-6 py-4 border-t flex-row justify-end gap-2">
          {pendingApproval ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button variant="outline" onClick={handleRecall} disabled={recalling} className="gap-1.5">
                {recalling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                Recall request
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {rejectedApproval && (
                <Button variant="outline" onClick={handleResubmit} disabled={resubmitting} className="gap-1.5">
                  {resubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Reapply
                </Button>
              )}
              <Button onClick={handleSubmit}>{record ? "Save changes" : `Create ${schema.recordNoun}`}</Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>

      {schema.key === "pr" && (
        <StoreItemPicker
          open={storePickerOpen}
          onOpenChange={setStorePickerOpen}
          onConfirm={applyStoreItems}
        />
      )}
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
  dynamicOptions,
  locked = false,
}: {
  field: FieldDef;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  getMasterOptions: (key: string) => Array<{ id: string; value: string }>;
  onAddMasterOption: (key: string, value: string, code?: string) => Promise<void>;
  dynamicOptions?: Array<{ value: string; label: string }>;
  /** Render read-only because the user lacks permission to change this field. */
  locked?: boolean;
}) {
  const fullWidth =
    field.type === "textarea" || field.type === "media" || field.type === "lineItems";
  // Human-readable current value for the locked, read-only display.
  const lockedLabel =
    field.type === "status"
      ? resolveStatus(field, value).label
      : field.type === "checkbox"
        ? value
          ? "Yes"
          : "No"
        : field.options?.find((o) => o.value === value)?.label ??
          (value ? String(value) : "—");
  return (
    <div className={cn("space-y-1.5", fullWidth && "sm:col-span-2")}>
      <Label className="text-sm">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>

      {locked ? (
        // Privileged field the user can't change — show the value read-only.
        field.type === "lineItems" ? (
          <LineItemsView field={field} value={value} />
        ) : field.type === "media" ? (
          <MediaGallery value={value} />
        ) : (
          <div className="flex items-center gap-2 h-9">
            <Badge variant="outline">{lockedLabel}</Badge>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" /> permission required
            </span>
          </div>
        )
      ) : field.type === "checkbox" ? (
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
      ) : field.auto || (field.prefillUser && value) ? (
        // Locked, system-set. `auto` = server-minted document number; `prefillUser`
        // = pulled from the logged-in user (Requested By / Department). Read-only
        // when the profile actually supplied a value — an empty prefill (e.g. no
        // department on the profile) falls through to a normal editable control.
        <Input
          value={(value as string) ?? ""}
          readOnly
          placeholder={field.auto ? "Auto-generated on save" : "From your profile"}
          className={cn(
            "bg-muted/50 text-muted-foreground cursor-not-allowed",
            field.auto && "font-mono",
          )}
        />
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
            {(field.optionsSource ? dynamicOptions ?? [] : field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
            {field.optionsSource && (dynamicOptions?.length ?? 0) === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">No matching documents</div>
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
        {/* Vendors are a first-class entity — add them in Vendor Master (a
            permitted action), never ad-hoc here (that would orphan the value).
            Every other master keeps its inline "Add new value". */}
        {masterKey === "supplier" ? (
          <div className="border-t mt-1 pt-1 px-2 py-1.5 text-xs text-muted-foreground">
            {options.length === 0 ? "No vendors yet — " : ""}Add vendors in Vendor Master
          </div>
        ) : (
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
