/**
 * Document promotion (procure-to-pay carry-forward).
 *
 * Pure mapping that turns one procurement document into the next, copying the
 * fields forward and setting the back-reference (prRef / rfqRef / poRef) so the
 * existing trace helpers (getPoTrace, open-PO/PR options) keep working. The new
 * document's number is minted server-side on create — never carried over.
 *
 * The UI ("Convert / Raise next") opens the TARGET form pre-filled with
 * `build(source)`, the user reviews and saves, and the source's status is
 * advanced via `advanceSource`. No new endpoints: it rides the existing
 * optimistic `createRecord` / `updateRecord`.
 */

import type { PurchaseRecord, PurchaseSubmoduleKey } from "./types";

const num = (v: unknown): number => Number(v ?? 0) || 0;
const str = (v: unknown): string => (v == null ? "" : String(v));

/** Today as YYYY-MM-DD for date inputs (app runtime — Date is available here). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PromotionDef {
  /** Target submodule the source is promoted into. */
  to: PurchaseSubmoduleKey;
  /** Button label, e.g. "Convert to PO". */
  label: string;
  /** Build the pre-filled data for the new target document (no docNo). */
  build: (src: PurchaseRecord) => Record<string, unknown>;
  /** Status to stamp on the SOURCE after a successful promotion. */
  advanceSource?: string;
}

/** Sum line amounts and pick the first invoice/PO ref from a GRN's receipt
 *  lines — the invoice grid AND flat challan / no-invoice lines. */
function grnRollup(grn: PurchaseRecord): { amount: number; invoiceNo: string; poRef: string } {
  const invoices = Array.isArray(grn.lines) ? (grn.lines as Record<string, unknown>[]) : [];
  let amount = 0;
  let invoiceNo = "";
  let poRef = "";
  for (const inv of invoices) {
    if (!invoiceNo) invoiceNo = str(inv.invoiceNo);
    const items = Array.isArray(inv.items) ? (inv.items as Record<string, unknown>[]) : [];
    for (const it of items) {
      amount += num(it.amount);
      if (!poRef) poRef = str(it.poRef);
    }
  }
  const flat = Array.isArray(grn.receiptLines) ? (grn.receiptLines as Record<string, unknown>[]) : [];
  for (const it of flat) {
    amount += num(it.amount);
    if (!poRef) poRef = str(it.poRef);
  }
  return { amount, invoiceNo, poRef };
}

export const PROMOTIONS: Partial<Record<PurchaseSubmoduleKey, PromotionDef[]>> = {
  pr: [
    {
      to: "sourcing",
      label: "Raise RFQ",
      advanceSource: "SUBMITTED",
      build: (pr) => ({
        docDate: today(),
        prRef: str(pr.docNo),
        supplier: str(pr.preferredSupplier),
        itemName: str(pr.itemName),
        quantity: num(pr.quantity),
        uom: str(pr.uom),
        quotedRate: num(pr.lastRate),
        status: "SOURCING",
      }),
    },
    {
      to: "po",
      label: "Convert to PO",
      advanceSource: "APPROVED",
      build: (pr) => {
        const quantity = num(pr.quantity);
        const rate = num(pr.lastRate);
        return {
          docDate: today(),
          supplier: str(pr.preferredSupplier),
          rfqRef: str(pr.docNo), // reference the PR directly (repeat / direct buy)
          itemName: str(pr.itemName),
          quantity,
          uom: str(pr.uom),
          rate,
          amount: Number((quantity * rate).toFixed(2)),
          status: "DRAFT",
        };
      },
    },
  ],
  sourcing: [
    {
      to: "po",
      label: "Convert to PO",
      advanceSource: "SELECTED",
      build: (rfq) => {
        const quantity = num(rfq.quantity);
        const rate = num(rfq.quotedRate);
        return {
          docDate: today(),
          supplier: str(rfq.supplier),
          rfqRef: str(rfq.docNo),
          itemName: str(rfq.itemName),
          quantity,
          uom: str(rfq.uom),
          rate,
          amount: Number((quantity * rate).toFixed(2)),
          paymentTerms: str(rfq.paymentTerms),
          status: "DRAFT",
        };
      },
    },
  ],
  po: [
    {
      // Goods arriving against a PO are first logged at the gate as a Gate Entry,
      // which then runs the Gate → QC → Store inspection workflow before a GRN.
      to: "gateEntry",
      label: "Receive (Gate Entry)",
      advanceSource: "SENT",
      build: (po) => {
        const quantity = num(po.quantity);
        return {
          docDate: today(),
          supplier: str(po.supplier),
          receivedAgainst: "INVOICE",
          // Seed one invoice with one PO line defaulted to a full receipt; the
          // gate/store adjusts received qty / adds the invoice no. (Switching
          // "Received Against" in the form carries these lines across.)
          lines: [
            {
              invoiceNo: "",
              invoiceDate: today(),
              items: [
                {
                  poRef: str(po.docNo),
                  prRef: "",
                  itemName: str(po.itemName),
                  invoiceQty: quantity,
                  receivedQty: quantity,
                  amount: num(po.amount),
                },
              ],
            },
          ],
        };
      },
    },
    {
      // Raise a payment straight from the PO (e.g. an advance) without going
      // through a GRN first. Goods-receipt payments still flow GRN → Payment.
      to: "payment",
      label: "Raise Payment",
      build: (po) => ({
        docDate: today(),
        supplier: str(po.supplier),
        poRef: str(po.docNo),
        requestAmount: num(po.amount),
        status: "REQUESTED",
      }),
    },
  ],
  gateEntry: [
    {
      // Once the gate entry is CLEARED (all inspections passed), the store
      // incharge raises the GRN from it — pulling supplier / warehouse / items.
      // Creating the GRN consumes the gate entry server-side (→ GRN_CREATED), so
      // no `advanceSource` (its status is workflow-driven and can't be hand-set).
      to: "grn",
      label: "Create GRN",
      build: (ge) => ({
        docDate: today(),
        gateEntryRef: str(ge.docNo),
        supplier: str(ge.supplier),
        warehouse: str(ge.warehouse),
        receivedAgainst: str(ge.receivedAgainst) || "INVOICE",
        lines: Array.isArray(ge.lines) ? ge.lines : [],
        receiptLines: Array.isArray(ge.receiptLines) ? ge.receiptLines : [],
        status: "READY_TO_POST",
      }),
    },
  ],
  grn: [
    {
      to: "payment",
      label: "Raise Payment",
      build: (grn) => {
        const { amount, invoiceNo, poRef } = grnRollup(grn);
        return {
          docDate: today(),
          supplier: str(grn.supplier),
          poRef: poRef || str(grn.docNo),
          invoiceNo,
          invoiceAmount: amount,
          status: "REQUESTED",
        };
      },
    },
  ],
};

/** Promotions available from a given submodule (empty for supplier/payment). */
export function promotionsFor(submodule: PurchaseSubmoduleKey): PromotionDef[] {
  return PROMOTIONS[submodule] ?? [];
}

// ── Conversion / approval gate ──────────────────────────────────────────────

export interface PromotionApprovalBlock {
  /** The unsettled approval state that blocks conversion. */
  reason: "PENDING" | "REJECTED" | "RECALLED" | "OTHER";
  /** Human-readable reason, shown in the UI and the server error. */
  message: string;
}

/**
 * A document may only be promoted/converted to the next stage once its OWN
 * approval has settled as APPROVED. The generic approval engine stamps its state
 * in `data._approval`; while a request is PENDING, was REJECTED, or was RECALLED
 * (withdrawn, never approved), the next document must NOT be raised. No
 * `_approval` ⇒ no approval process matched ⇒ free to convert.
 *
 * Pure + client-safe (no prisma): used by the UI to hide the convert buttons and
 * mirrored server-side in `createRecord` so the gate can't be bypassed.
 */
export function promotionApprovalBlock(
  record: Record<string, unknown> | null | undefined,
): PromotionApprovalBlock | null {
  const a = record?._approval as { status?: string } | undefined;
  if (!a || typeof a !== "object" || !a.status) return null; // no approval needed
  const status = String(a.status).toUpperCase();
  if (status === "APPROVED") return null; // approval completed — free to convert
  if (status === "PENDING")
    return {
      reason: "PENDING",
      message: "Awaiting approval — this document can't be converted until its approval is completed.",
    };
  if (status === "REJECTED")
    return {
      reason: "REJECTED",
      message: "Approval was rejected — resubmit and get it approved before converting.",
    };
  if (status === "RECALLED")
    return {
      reason: "RECALLED",
      message: "Approval was recalled — resubmit and get it approved before converting.",
    };
  return {
    reason: "OTHER",
    message: "Approval is not complete — finish the approval before converting.",
  };
}
