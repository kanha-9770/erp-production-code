/**
 * Sample records for the Accounts System — a small but internally-consistent
 * book so the screens (and the cross-links: Receipt → Invoice, Reports →
 * outstanding) have something real to show on first load.
 *
 * Ledger / customer names below match the Chart of Accounts / Customer master
 * records so the projected `ledger` and `customer` dropdowns resolve them.
 */

import type { AccountsRecord, AccountsSubmoduleKey } from "./types";

function stamp(
  submodule: AccountsSubmoduleKey,
  rows: Array<Record<string, unknown>>,
): AccountsRecord[] {
  return rows.map((r, i) => {
    const date = typeof r.docDate === "string" && r.docDate ? r.docDate : "2026-06-01";
    return {
      ...r,
      id: `aseed_${submodule}_${i + 1}`,
      submodule,
      createdAt: `${date}T09:00:00.000Z`,
      updatedAt: `${date}T09:00:00.000Z`,
    } as AccountsRecord;
  });
}

const COA_SEED: Array<Record<string, unknown>> = [
  { docNo: "ACC-1001", accountName: "Cash-in-Hand", accountGroup: "Cash-in-Hand", accountType: "ASSET", openingBalance: 50000, openingDrCr: "Dr", status: "ACTIVE" },
  { docNo: "ACC-1002", accountName: "HDFC Bank — Current", accountGroup: "Bank Accounts", accountType: "ASSET", openingBalance: 850000, openingDrCr: "Dr", status: "ACTIVE" },
  { docNo: "ACC-1003", accountName: "Sundry Debtors", accountGroup: "Sundry Debtors", accountType: "ASSET", openingBalance: 0, openingDrCr: "Dr", status: "ACTIVE" },
  { docNo: "ACC-2001", accountName: "Sundry Creditors", accountGroup: "Sundry Creditors", accountType: "LIABILITY", openingBalance: 0, openingDrCr: "Cr", status: "ACTIVE" },
  { docNo: "ACC-2002", accountName: "GST Payable", accountGroup: "Duties & Taxes", accountType: "LIABILITY", openingBalance: 0, openingDrCr: "Cr", status: "ACTIVE" },
  { docNo: "ACC-3001", accountName: "Capital Account", accountGroup: "Capital Account", accountType: "EQUITY", openingBalance: 900000, openingDrCr: "Cr", status: "ACTIVE" },
  { docNo: "ACC-4001", accountName: "Sales", accountGroup: "Sales Accounts", accountType: "INCOME", openingBalance: 0, openingDrCr: "Cr", status: "ACTIVE" },
  { docNo: "ACC-5001", accountName: "Purchase", accountGroup: "Purchase Accounts", accountType: "EXPENSE", openingBalance: 0, openingDrCr: "Dr", status: "ACTIVE" },
  { docNo: "ACC-5002", accountName: "Rent", accountGroup: "Indirect Expenses", accountType: "EXPENSE", openingBalance: 0, openingDrCr: "Dr", status: "ACTIVE" },
  { docNo: "ACC-5003", accountName: "Salaries & Wages", accountGroup: "Indirect Expenses", accountType: "EXPENSE", openingBalance: 0, openingDrCr: "Dr", status: "ACTIVE" },
];

const CUSTOMER_SEED: Array<Record<string, unknown>> = [
  { docNo: "CUST-0001", customerName: "Apollo Traders", customerType: "COMPANY", status: "ACTIVE", contactPerson: "Anil Mehta", phoneCode: "+91", phone: "98290 11111", email: "accounts@apollotraders.in", gstin: "08ABCDA1234A1Z5", city: "Jaipur", state: "Rajasthan", country: "India", paymentTerms: "Net 30", creditDays: 30, creditLimit: 500000, openingBalance: 0 },
  { docNo: "CUST-0002", customerName: "Bluewave Industries", customerType: "COMPANY", status: "ACTIVE", contactPerson: "Sneha Rao", phoneCode: "+91", phone: "99870 22222", email: "finance@bluewave.co", gstin: "27ABCDB5678B1Z3", city: "Pune", state: "Maharashtra", country: "India", paymentTerms: "Net 45", creditDays: 45, creditLimit: 800000, openingBalance: 0 },
  { docNo: "CUST-0003", customerName: "Crest Engineering", customerType: "PROPRIETORSHIP", status: "ACTIVE", contactPerson: "Vikram Shah", phoneCode: "+91", phone: "90040 33333", email: "vikram@cresteng.in", gstin: "24ABCDC9012C1Z1", city: "Ahmedabad", state: "Gujarat", country: "India", paymentTerms: "Net 15", creditDays: 15, creditLimit: 200000, openingBalance: 0 },
  { docNo: "CUST-0004", customerName: "Deepak Enterprises", customerType: "PARTNERSHIP", status: "HOLD", contactPerson: "Deepak Jain", phoneCode: "+91", phone: "93130 44444", email: "info@deepakent.in", city: "Delhi", state: "Delhi", country: "India", paymentTerms: "Advance", creditDays: 0, creditLimit: 0, openingBalance: 0 },
];

const SALES_INVOICE_SEED: Array<Record<string, unknown>> = [
  {
    docNo: "INV-0001", docDate: "2026-05-18", customer: "Apollo Traders", reference: "PO-AT-771",
    items: [
      { _id: "ln_inv1a", itemName: "MS Steel Pipe 2 inch", hsn: "7306", quantity: 100, rate: 450, amount: 45000 },
    ],
    subtotal: 45000, taxRate: "18%", taxAmount: 8100, total: 53100, paymentTerms: "Net 30", dueDate: "2026-06-17", status: "SENT",
  },
  {
    docNo: "INV-0002", docDate: "2026-05-22", customer: "Bluewave Industries", reference: "BW/2026/214",
    items: [
      { _id: "ln_inv2a", itemName: "Hydraulic Valve Assembly", hsn: "8481", quantity: 50, rate: 1200, amount: 60000 },
      { _id: "ln_inv2b", itemName: "Sealing Kit", hsn: "8484", quantity: 10, rate: 500, amount: 5000 },
    ],
    subtotal: 65000, taxRate: "18%", taxAmount: 11700, total: 76700, paymentTerms: "Net 45", dueDate: "2026-07-06", status: "PARTIALLY_PAID",
  },
  {
    docNo: "INV-0003", docDate: "2026-05-28", customer: "Crest Engineering", reference: "",
    items: [
      { _id: "ln_inv3a", itemName: "CNC Machining — Job Work", hsn: "9988", quantity: 1, rate: 30000, amount: 30000 },
    ],
    subtotal: 30000, taxRate: "18%", taxAmount: 5400, total: 35400, paymentTerms: "Net 15", dueDate: "2026-06-12", status: "PAID",
  },
];

const RECEIPT_SEED: Array<Record<string, unknown>> = [
  { docNo: "RCP-0001", docDate: "2026-06-02", invoiceRef: "INV-0003", customer: "Crest Engineering", invoiceAmount: 35400, amount: 35400, paymentMode: "Bank Transfer (NEFT/RTGS)", bankCash: "HDFC Bank — Current", reference: "NEFT-HDFC-99812", status: "CLEARED" },
  { docNo: "RCP-0002", docDate: "2026-06-04", invoiceRef: "INV-0002", customer: "Bluewave Industries", invoiceAmount: 76700, amount: 40000, paymentMode: "Cheque", bankCash: "ICICI Bank — Current", reference: "CHQ-554120", status: "DEPOSITED" },
];

const PAYMENT_VOUCHER_SEED: Array<Record<string, unknown>> = [
  { docNo: "PV-0001", docDate: "2026-06-01", partyType: "SUPPLIER", partyName: "Sharma Steels", account: "Purchase", againstRef: "BILL-SS-3320", amount: 25000, paymentMode: "Bank Transfer (NEFT/RTGS)", bankCash: "HDFC Bank — Current", instrumentNo: "NEFT-77310", costCenter: "Production", status: "PAID" },
  { docNo: "PV-0002", docDate: "2026-06-05", partyType: "STATUTORY", partyName: "GST Department", account: "GST Payable", amount: 8100, paymentMode: "Bank Transfer (NEFT/RTGS)", bankCash: "HDFC Bank — Current", costCenter: "Finance", status: "APPROVED" },
];

const EXPENSE_SEED: Array<Record<string, unknown>> = [
  {
    docNo: "EXP-0001", docDate: "2026-06-03", paidBy: "Rahul Verma", costCenter: "Sales",
    items: [
      { _id: "ln_exp1a", description: "Client visit — cab fare", category: "Travel & Conveyance", amount: 1200 },
      { _id: "ln_exp1b", description: "Lunch meeting", category: "Miscellaneous", amount: 800 },
    ],
    total: 2000, paymentMode: "Cash", bankCash: "Petty Cash", status: "APPROVED",
  },
  {
    docNo: "EXP-0002", docDate: "2026-06-05", paidBy: "Office Admin", costCenter: "Administration",
    items: [
      { _id: "ln_exp2a", description: "Printer cartridges (set of 4)", category: "Office Supplies", amount: 3500 },
    ],
    total: 3500, paymentMode: "Card", bankCash: "HDFC Bank — Current", status: "SUBMITTED",
  },
];

const JOURNAL_SEED: Array<Record<string, unknown>> = [
  {
    docNo: "JV-0001", docDate: "2026-06-01", narration: "Rent paid for June 2026",
    lines: [
      { _id: "ln_jv1a", account: "Rent", description: "June rent", debit: 30000, credit: 0 },
      { _id: "ln_jv1b", account: "HDFC Bank — Current", description: "Paid via NEFT", debit: 0, credit: 30000 },
    ],
    totalDebit: 30000, totalCredit: 30000, status: "POSTED",
  },
];

const SEED_BY_KEY: Record<AccountsSubmoduleKey, Array<Record<string, unknown>>> = {
  coa: COA_SEED,
  customer: CUSTOMER_SEED,
  salesInvoice: SALES_INVOICE_SEED,
  receipt: RECEIPT_SEED,
  paymentVoucher: PAYMENT_VOUCHER_SEED,
  expense: EXPENSE_SEED,
  journal: JOURNAL_SEED,
};

export function seedRecords(key: AccountsSubmoduleKey): AccountsRecord[] {
  return stamp(key, SEED_BY_KEY[key]);
}
