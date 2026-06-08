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

/** Sum line amounts and pick the first invoice/PO ref from a GRN's nested lines. */
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
      to: "grn",
      label: "Receive (GRN)",
      advanceSource: "SENT",
      build: (po) => {
        const quantity = num(po.quantity);
        return {
          docDate: today(),
          supplier: str(po.supplier),
          status: "GATE_ENTRY",
          // Seed one invoice with one PO line defaulted to a full receipt; the
          // receiver adjusts received qty / adds the invoice no.
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
