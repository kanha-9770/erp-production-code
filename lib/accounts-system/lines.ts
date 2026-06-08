/**
 * Line-item math for the Accounts System — pure, React-free, so both the UI
 * (line-items-field, form sheet) and the data layer (store) share one source of
 * truth for the document totals.
 *
 * Unlike the GRN's receipt math, accounts lines are flat (no nesting): an
 * invoice has item lines (qty × rate = amount); a journal has Dr/Cr lines.
 */

export type Row = Record<string, unknown>;

export function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

export function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum a numeric column across the rows of a lineItems value. */
export function sumColumn(value: unknown, key: string): number {
  return asRows(value).reduce((s, r) => s + num(r[key]), 0);
}

/** Parse a tax-rate label ("18%", "18", "GST 18%") to a percentage number. */
export function parseRatePct(value: unknown): number {
  if (value == null) return 0;
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface LineSummary {
  count: number;
  totalAmount: number;
}

/** Row count + summed amount column, for the table cell. */
export function lineSummary(value: unknown, amountKey = "amount"): LineSummary {
  const rows = asRows(value);
  return {
    count: rows.length,
    totalAmount: round2(rows.reduce((s, r) => s + num(r[amountKey]), 0)),
  };
}

// ── Per-document derivations (shared by store + form) ───────────────────────

/** Sales Invoice: subtotal from line amounts, tax from the header rate, total. */
export function deriveInvoiceTotals(form: Record<string, unknown>): {
  subtotal: number;
  taxAmount: number;
  total: number;
} {
  const subtotal = round2(sumColumn(form.items, "amount"));
  const pct = parseRatePct(form.taxRate);
  const taxAmount = round2((subtotal * pct) / 100);
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

/** Expense: total is the sum of its line amounts. */
export function deriveExpenseTotal(form: Record<string, unknown>): { total: number } {
  return { total: round2(sumColumn(form.items, "amount")) };
}

/** Journal: Dr/Cr totals + whether the voucher balances. */
export function deriveJournalTotals(form: Record<string, unknown>): {
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
} {
  const totalDebit = round2(sumColumn(form.lines, "debit"));
  const totalCredit = round2(sumColumn(form.lines, "credit"));
  return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.005 };
}
