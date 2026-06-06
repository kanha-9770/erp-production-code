/**
 * Receipt math for GRN line items — pure, React-free, so both the UI
 * (line-items-field) and the data layer (store) can share it.
 *
 * Structure: a `lineItems` value is an array of rows; a row may carry a nested
 * `lineItems` column (Invoice → PO/PR lines). Quantities live on the leaf
 * (PO/PR) rows: invoiceQty vs receivedQty.
 */

import type { FieldDef } from "./types";

export type Row = Record<string, unknown>;
export type Receipt = "PENDING" | "PARTIAL" | "FULL" | "EXCESS";

export function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

export function nestedCol(columns: FieldDef[]): FieldDef | undefined {
  return columns.find((c) => c.type === "lineItems");
}

export function computeReceipt(inv: number, rec: number): { balance: number; receiptType: Receipt } {
  const balance = Math.max(0, inv - rec);
  let receiptType: Receipt;
  if (rec <= 0) receiptType = "PENDING";
  else if (rec < inv) receiptType = "PARTIAL";
  else if (rec === inv) receiptType = "FULL";
  else receiptType = "EXCESS";
  return { balance, receiptType };
}

/** Sum invoice/received/amount over the leaf PO-line rows under `rows`. */
export function aggregate(rows: Row[], columns: FieldDef[]): { inv: number; rec: number; amount: number } {
  const nc = nestedCol(columns);
  let inv = 0;
  let rec = 0;
  let amount = 0;
  for (const r of rows) {
    if (nc) {
      const s = aggregate(asRows(r[nc.key]), nc.columns ?? []);
      inv += s.inv;
      rec += s.rec;
      amount += s.amount;
    } else {
      inv += Number(r.invoiceQty ?? 0) || 0;
      rec += Number(r.receivedQty ?? 0) || 0;
      amount += Number(r.amount ?? 0) || 0;
    }
  }
  return { inv, rec, amount };
}

/** Receipt status for one row, aggregating its nested lines when present. */
export function rowReceipt(row: Row, columns: FieldDef[]): { balance: number; receiptType: Receipt } {
  const nc = nestedCol(columns);
  if (nc) {
    const a = aggregate(asRows(row[nc.key]), nc.columns ?? []);
    return computeReceipt(a.inv, a.rec);
  }
  return computeReceipt(Number(row.invoiceQty ?? 0) || 0, Number(row.receivedQty ?? 0) || 0);
}

export function leafRows(rows: Row[], columns: FieldDef[]): Row[] {
  const nc = nestedCol(columns);
  if (!nc) return rows;
  return rows.flatMap((r) => leafRows(asRows(r[nc.key]), nc.columns ?? []));
}

// Fallback shape (invoice → items) so callers can omit columns.
const INVOICE_COLUMNS_FALLBACK: FieldDef[] = [
  { key: "items", label: "Items", type: "lineItems", section: "line", columns: [] },
];

export interface LineSummary {
  invoices: number;
  poLines: number;
  anyPartial: boolean;
  totalAmount: number;
}

export function lineSummary(value: unknown, columns: FieldDef[] = INVOICE_COLUMNS_FALLBACK): LineSummary {
  const rows = asRows(value);
  const leaves = leafRows(rows, columns);
  let totalAmount = 0;
  let anyPartial = false;
  for (const r of leaves) {
    totalAmount += Number(r.amount ?? 0) || 0;
    const { receiptType } = computeReceipt(Number(r.invoiceQty ?? 0) || 0, Number(r.receivedQty ?? 0) || 0);
    if (receiptType === "PARTIAL" || receiptType === "PENDING") anyPartial = true;
  }
  return { invoices: rows.length, poLines: leaves.length, anyPartial, totalAmount };
}

/**
 * Roll the leaf lines up to a single GRN receipt status:
 *   - no receipts yet      → PENDING
 *   - every line fully recd → FULL
 *   - otherwise            → PARTIAL
 */
export function deriveReceiptStatus(
  value: unknown,
  columns: FieldDef[] = INVOICE_COLUMNS_FALLBACK,
): "PENDING" | "PARTIAL" | "FULL" {
  const leaves = leafRows(asRows(value), columns);
  if (leaves.length === 0) return "PENDING";
  let anyReceived = false;
  let allComplete = true;
  for (const r of leaves) {
    const inv = Number(r.invoiceQty ?? 0) || 0;
    const rec = Number(r.receivedQty ?? 0) || 0;
    if (rec > 0) anyReceived = true;
    if (rec < inv) allComplete = false;
  }
  if (!anyReceived) return "PENDING";
  return allComplete ? "FULL" : "PARTIAL";
}
