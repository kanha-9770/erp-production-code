/**
 * Static field schemas + seed master data for the Accounts System.
 *
 * Each submodule is a finance document (or a master entity). Its `status` field
 * encodes the workflow stages — e.g. a Sales Invoice moves Draft → Sent →
 * Partially Paid → Paid, and a Journal Voucher moves Draft → Posted.
 *
 * Two masters are ENTITY PROJECTIONS kept in sync by the store:
 *   - `customer` mirrors the Customer master records (used by Invoice/Receipt),
 *   - `ledger`   mirrors the Chart of Accounts records (used by Journal/Payment).
 */

import type {
  FieldDef,
  MasterType,
  StatusOption,
  SubmoduleSchema,
  AccountsSubmoduleKey,
} from "./types";
import { DIAL_CODE_OPTIONS, DEFAULT_DIAL_CODE } from "@/lib/dial-codes";

// ── Seed master dropdowns ───────────────────────────────────────────────────

function opts(values: string[]): MasterType["options"] {
  return values.map((value, i) => ({
    id: `aseed-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    value,
    active: true,
    sortOrder: i,
  }));
}

export const SEED_MASTERS: MasterType[] = [
  {
    key: "account_group",
    label: "Account Group",
    description: "Ledger classification (Tally-style groups).",
    icon: "layers",
    usedBy: ["coa"],
    system: true,
    options: opts([
      "Capital Account",
      "Current Assets",
      "Fixed Assets",
      "Investments",
      "Current Liabilities",
      "Loans (Liability)",
      "Sundry Debtors",
      "Sundry Creditors",
      "Bank Accounts",
      "Cash-in-Hand",
      "Duties & Taxes",
      "Direct Income",
      "Indirect Income",
      "Direct Expenses",
      "Indirect Expenses",
      "Purchase Accounts",
      "Sales Accounts",
    ]),
  },
  // Entity projection — options are derived from the Chart of Accounts records
  // by the store. Seeded empty; the provider fills it on load.
  {
    key: "ledger",
    label: "Ledger Account",
    description: "Posting accounts — projected from the Chart of Accounts.",
    icon: "book",
    usedBy: ["journal", "paymentVoucher"],
    system: true,
    options: [],
  },
  // Entity projection — options derived from the Customer master records.
  {
    key: "customer",
    label: "Customer",
    description: "Customers — projected from the Customer master.",
    icon: "user",
    usedBy: ["salesInvoice", "receipt"],
    system: true,
    options: [],
  },
  {
    key: "payment_terms",
    label: "Payment Terms",
    description: "Agreed payment terms.",
    icon: "wallet",
    usedBy: ["customer", "salesInvoice"],
    system: true,
    options: opts(["Advance", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Cash on Delivery"]),
  },
  {
    key: "tax_rate",
    label: "Tax Rate (GST)",
    description: "GST slabs applied on invoices.",
    icon: "percent",
    usedBy: ["salesInvoice"],
    system: true,
    options: opts(["0%", "5%", "12%", "18%", "28%"]),
  },
  {
    key: "payment_mode",
    label: "Payment Mode",
    description: "How money is received / paid.",
    icon: "credit-card",
    usedBy: ["receipt", "paymentVoucher", "expense"],
    system: true,
    options: opts(["Cash", "UPI", "Bank Transfer (NEFT/RTGS)", "Cheque", "Card"]),
  },
  {
    key: "bank_cash",
    label: "Bank / Cash Account",
    description: "Bank & cash accounts money moves through.",
    icon: "landmark",
    usedBy: ["receipt", "paymentVoucher", "expense"],
    system: true,
    options: opts(["HDFC Bank — Current", "ICICI Bank — Current", "SBI — Current", "Cash-in-Hand", "Petty Cash"]),
  },
  {
    key: "expense_category",
    label: "Expense Category",
    description: "Operating expense heads.",
    icon: "tags",
    usedBy: ["expense"],
    system: true,
    options: opts([
      "Travel & Conveyance",
      "Office Supplies",
      "Rent",
      "Electricity & Utilities",
      "Telephone & Internet",
      "Repairs & Maintenance",
      "Salaries & Wages",
      "Professional Fees",
      "Marketing & Advertising",
      "Freight & Courier",
      "Bank Charges",
      "Miscellaneous",
    ]),
  },
  {
    key: "cost_center",
    label: "Cost Center",
    description: "Department / cost center for allocation.",
    icon: "building",
    usedBy: ["expense", "paymentVoucher"],
    options: opts(["Administration", "Sales", "Production", "Marketing", "IT", "HR", "Finance"]),
  },
];

// ── Status pipelines ────────────────────────────────────────────────────────

const COA_STATUS: StatusOption[] = [
  { value: "ACTIVE", label: "Active", variant: "default" },
  { value: "INACTIVE", label: "Inactive", variant: "secondary" },
];

const CUSTOMER_STATUS: StatusOption[] = [
  { value: "ACTIVE", label: "Active", variant: "default" },
  { value: "HOLD", label: "On Hold", variant: "outline" },
  { value: "BLOCKED", label: "Blocked", variant: "destructive" },
  { value: "INACTIVE", label: "Inactive", variant: "secondary" },
];

const INVOICE_STATUS: StatusOption[] = [
  { value: "DRAFT", label: "Draft", variant: "secondary" },
  { value: "SENT", label: "Sent", variant: "outline" },
  { value: "PARTIALLY_PAID", label: "Partially Paid", variant: "outline" },
  { value: "PAID", label: "Paid", variant: "default" },
  { value: "OVERDUE", label: "Overdue", variant: "destructive" },
  { value: "CANCELLED", label: "Cancelled", variant: "destructive" },
];

const RECEIPT_STATUS: StatusOption[] = [
  { value: "RECEIVED", label: "Received", variant: "secondary" },
  { value: "DEPOSITED", label: "Deposited", variant: "outline" },
  { value: "CLEARED", label: "Cleared", variant: "default" },
  { value: "BOUNCED", label: "Bounced", variant: "destructive" },
];

const PV_STATUS: StatusOption[] = [
  { value: "DRAFT", label: "Draft", variant: "secondary" },
  { value: "APPROVED", label: "Approved", variant: "outline" },
  { value: "PAID", label: "Paid", variant: "default" },
  { value: "ON_HOLD", label: "On Hold", variant: "outline" },
  { value: "CANCELLED", label: "Cancelled", variant: "destructive" },
];

const EXPENSE_STATUS: StatusOption[] = [
  { value: "DRAFT", label: "Draft", variant: "secondary" },
  { value: "SUBMITTED", label: "Submitted", variant: "outline" },
  { value: "APPROVED", label: "Approved", variant: "outline" },
  { value: "REIMBURSED", label: "Reimbursed", variant: "default" },
  { value: "REJECTED", label: "Rejected", variant: "destructive" },
];

const JOURNAL_STATUS: StatusOption[] = [
  { value: "DRAFT", label: "Draft", variant: "secondary" },
  { value: "POSTED", label: "Posted", variant: "default" },
  { value: "CANCELLED", label: "Cancelled", variant: "destructive" },
];

// ── Inline select option sets ───────────────────────────────────────────────

const ACCOUNT_TYPE_OPTS = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "EQUITY", label: "Equity" },
];
const DR_CR_OPTS = [
  { value: "Dr", label: "Dr" },
  { value: "Cr", label: "Cr" },
];
const CUSTOMER_TYPE_OPTS = [
  { value: "COMPANY", label: "Company" },
  { value: "PROPRIETORSHIP", label: "Proprietorship" },
  { value: "PARTNERSHIP", label: "Partnership / LLP" },
  { value: "INDIVIDUAL", label: "Individual" },
];
const PARTY_TYPE_OPTS = [
  { value: "SUPPLIER", label: "Supplier / Vendor" },
  { value: "EMPLOYEE", label: "Employee" },
  { value: "STATUTORY", label: "Statutory / Tax" },
  { value: "OTHER", label: "Other" },
];

// ── Submodule schemas ───────────────────────────────────────────────────────

export const COA_SCHEMA: SubmoduleSchema = {
  key: "coa",
  label: "Chart of Accounts",
  shortLabel: "Ledgers",
  icon: "book",
  recordNoun: "ledger account",
  route: "chart-of-accounts",
  codePrefix: "ACC",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "Account Code", type: "text", section: "Account", required: true, inTable: true, pinned: true, width: 130 },
    { key: "accountName", label: "Account Name", type: "text", section: "Account", required: true, inTable: true, pinned: true, width: 220 },
    { key: "accountGroup", label: "Account Group", type: "master", master: "account_group", section: "Classification", required: true, inTable: true, width: 180 },
    { key: "accountType", label: "Type", type: "select", options: ACCOUNT_TYPE_OPTS, defaultValue: "ASSET", section: "Classification", inTable: true, width: 130 },
    { key: "openingBalance", label: "Opening Balance", type: "currency", section: "Balances", defaultValue: 0, inTable: true, width: 150, align: "right" },
    { key: "openingDrCr", label: "Dr / Cr", type: "select", options: DR_CR_OPTS, defaultValue: "Dr", section: "Balances", inTable: true, width: 90 },
    { key: "description", label: "Description", type: "textarea", section: "Other" },
    { key: "status", label: "Status", type: "status", statusOptions: COA_STATUS, defaultValue: "ACTIVE", section: "Status", inTable: true, width: 120 },
  ],
};

export const CUSTOMER_SCHEMA: SubmoduleSchema = {
  key: "customer",
  label: "Customer Master",
  shortLabel: "Customers",
  icon: "users",
  recordNoun: "customer",
  route: "customers",
  codePrefix: "CUST",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "Customer Code", type: "text", section: "General", required: true, inTable: true, pinned: true, width: 130 },
    { key: "customerName", label: "Customer Name", type: "text", section: "General", required: true, inTable: true, pinned: true, width: 220 },
    { key: "customerType", label: "Type", type: "select", options: CUSTOMER_TYPE_OPTS, defaultValue: "COMPANY", section: "General", inTable: true, width: 140 },
    { key: "status", label: "Status", type: "status", statusOptions: CUSTOMER_STATUS, defaultValue: "ACTIVE", section: "General", inTable: true, width: 120 },

    { key: "contactPerson", label: "Contact Person", type: "text", section: "Contact", inTable: true, width: 150 },
    { key: "phoneCode", label: "Country Code", type: "select", options: DIAL_CODE_OPTIONS, defaultValue: DEFAULT_DIAL_CODE, section: "Contact", inTable: true, defaultHidden: true, width: 120 },
    { key: "phone", label: "Phone", type: "text", section: "Contact", inTable: true, width: 130, placeholder: "Number without code" },
    { key: "email", label: "Email", type: "text", section: "Contact", inTable: true, width: 180 },

    { key: "gstin", label: "GSTIN", type: "text", section: "Tax & Legal", inTable: true, width: 150 },
    { key: "pan", label: "PAN", type: "text", section: "Tax & Legal", inTable: true, defaultHidden: true, width: 120 },

    { key: "addressLine", label: "Address", type: "textarea", section: "Address", placeholder: "Street, area…" },
    { key: "city", label: "City", type: "text", section: "Address", inTable: true, width: 120 },
    { key: "state", label: "State", type: "text", section: "Address", inTable: true, defaultHidden: true, width: 120 },
    { key: "country", label: "Country", type: "text", section: "Address", defaultValue: "India", defaultHidden: true, inTable: true, width: 120 },
    { key: "pincode", label: "Pincode", type: "text", section: "Address", defaultHidden: true, inTable: true, width: 100 },

    { key: "paymentTerms", label: "Payment Terms", type: "master", master: "payment_terms", section: "Payment", inTable: true, width: 140 },
    { key: "creditDays", label: "Credit Days", type: "number", section: "Payment", defaultValue: 0, inTable: true, defaultHidden: true, width: 110, align: "right" },
    { key: "creditLimit", label: "Credit Limit", type: "currency", section: "Payment", defaultValue: 0, inTable: true, defaultHidden: true, width: 140, align: "right" },
    { key: "openingBalance", label: "Opening Balance", type: "currency", section: "Payment", defaultValue: 0, inTable: true, width: 150, align: "right" },

    { key: "remarks", label: "Remarks", type: "textarea", section: "Other" },
  ],
};

const INVOICE_ITEM_COLUMNS: FieldDef[] = [
  { key: "itemName", label: "Item / Description", type: "text", section: "line", required: true },
  { key: "hsn", label: "HSN / SAC", type: "text", section: "line" },
  { key: "quantity", label: "Qty", type: "number", section: "line", defaultValue: 1 },
  { key: "rate", label: "Rate", type: "currency", section: "line", defaultValue: 0 },
  { key: "amount", label: "Amount", type: "currency", section: "line", defaultValue: 0 },
];

export const SALES_INVOICE_SCHEMA: SubmoduleSchema = {
  key: "salesInvoice",
  label: "Sales Invoice",
  shortLabel: "Invoices",
  icon: "file-text",
  recordNoun: "invoice",
  route: "sales-invoice",
  codePrefix: "INV",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "Invoice No.", type: "text", section: "Invoice", required: true, inTable: true, pinned: true, width: 130 },
    { key: "docDate", label: "Invoice Date", type: "date", section: "Invoice", inTable: true, width: 130 },
    { key: "customer", label: "Customer", type: "master", master: "customer", section: "Invoice", required: true, inTable: true, width: 200 },
    { key: "reference", label: "Customer PO / Ref.", type: "text", section: "Invoice", inTable: true, defaultHidden: true, width: 150 },

    { key: "items", label: "Items", type: "lineItems", section: "Items", rowNoun: "Line", addLabel: "Add line", columns: INVOICE_ITEM_COLUMNS },

    { key: "subtotal", label: "Subtotal", type: "currency", computed: true, section: "Amount", defaultValue: 0, inTable: true, width: 140, align: "right" },
    { key: "taxRate", label: "GST Rate", type: "master", master: "tax_rate", section: "Amount", defaultValue: "18%", inTable: true, width: 110 },
    { key: "taxAmount", label: "Tax Amount", type: "currency", computed: true, section: "Amount", defaultValue: 0, inTable: true, defaultHidden: true, width: 130, align: "right" },
    { key: "total", label: "Invoice Total", type: "currency", computed: true, section: "Amount", defaultValue: 0, inTable: true, width: 150, align: "right" },
    { key: "paymentTerms", label: "Payment Terms", type: "master", master: "payment_terms", section: "Amount", inTable: true, defaultHidden: true, width: 140 },
    { key: "dueDate", label: "Due Date", type: "date", section: "Amount", inTable: true, width: 130 },

    { key: "status", label: "Status", type: "status", statusOptions: INVOICE_STATUS, defaultValue: "DRAFT", section: "Status", inTable: true, width: 160 },
    { key: "remarks", label: "Remarks", type: "textarea", section: "Status" },
  ],
};

export const RECEIPT_SCHEMA: SubmoduleSchema = {
  key: "receipt",
  label: "Receipt",
  shortLabel: "Receipts",
  icon: "arrow-down-circle",
  recordNoun: "receipt",
  route: "receipts",
  codePrefix: "RCP",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "Receipt No.", type: "text", section: "Receipt", required: true, inTable: true, pinned: true, width: 130 },
    { key: "docDate", label: "Receipt Date", type: "date", section: "Receipt", inTable: true, width: 130 },
    // Selecting an open invoice auto-fills the customer + outstanding amount.
    { key: "invoiceRef", label: "Against Invoice", type: "select", optionsSource: "openInvoice", section: "Receipt", inTable: true, width: 160 },
    { key: "customer", label: "Customer", type: "master", master: "customer", section: "Receipt", required: true, inTable: true, width: 200 },

    // Auto-filled outstanding on the chosen invoice — read-only, shown once an
    // invoice is selected. On-account receipts (no invoice) skip it.
    { key: "invoiceAmount", label: "Invoice Outstanding", type: "currency", computed: true, requiresOpenInvoice: true, section: "Amount", defaultValue: 0, inTable: true, width: 160, align: "right" },
    { key: "amount", label: "Received Amount", type: "currency", required: true, section: "Amount", defaultValue: 0, inTable: true, width: 150, align: "right" },
    { key: "paymentMode", label: "Payment Mode", type: "master", master: "payment_mode", section: "Amount", inTable: true, width: 150 },
    { key: "bankCash", label: "Deposited To", type: "master", master: "bank_cash", section: "Amount", inTable: true, width: 160 },
    { key: "reference", label: "Reference (UTR / Cheque No.)", type: "text", section: "Amount", inTable: true, defaultHidden: true, width: 170 },

    { key: "status", label: "Status", type: "status", statusOptions: RECEIPT_STATUS, defaultValue: "RECEIVED", section: "Status", inTable: true, width: 150 },
    { key: "remarks", label: "Remarks", type: "textarea", section: "Status" },
  ],
};

export const PAYMENT_VOUCHER_SCHEMA: SubmoduleSchema = {
  key: "paymentVoucher",
  label: "Payment Voucher",
  shortLabel: "Payments",
  icon: "arrow-up-circle",
  recordNoun: "payment voucher",
  route: "payment-voucher",
  codePrefix: "PV",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "Voucher No.", type: "text", section: "Voucher", required: true, inTable: true, pinned: true, width: 130 },
    { key: "docDate", label: "Voucher Date", type: "date", section: "Voucher", inTable: true, width: 130 },
    { key: "partyType", label: "Pay To", type: "select", options: PARTY_TYPE_OPTS, defaultValue: "SUPPLIER", section: "Voucher", inTable: true, width: 140 },
    { key: "partyName", label: "Party Name", type: "text", section: "Voucher", inTable: true, width: 180 },
    { key: "account", label: "Ledger / Expense Account", type: "master", master: "ledger", section: "Voucher", inTable: true, width: 200 },
    { key: "againstRef", label: "Against Ref. (Bill / PO)", type: "text", section: "Voucher", inTable: true, defaultHidden: true, width: 160 },

    { key: "amount", label: "Amount", type: "currency", required: true, section: "Amount", defaultValue: 0, inTable: true, width: 150, align: "right" },
    { key: "paymentMode", label: "Payment Mode", type: "master", master: "payment_mode", section: "Amount", inTable: true, width: 150 },
    { key: "bankCash", label: "Paid From", type: "master", master: "bank_cash", section: "Amount", inTable: true, width: 160 },
    { key: "instrumentNo", label: "Reference (UTR / Cheque No.)", type: "text", section: "Amount", inTable: true, defaultHidden: true, width: 170 },
    { key: "costCenter", label: "Cost Center", type: "master", master: "cost_center", section: "Amount", inTable: true, defaultHidden: true, width: 150 },

    { key: "status", label: "Status", type: "status", statusOptions: PV_STATUS, defaultValue: "DRAFT", section: "Status", inTable: true, width: 150 },
    { key: "remarks", label: "Remarks", type: "textarea", section: "Status" },
  ],
};

const EXPENSE_ITEM_COLUMNS: FieldDef[] = [
  { key: "description", label: "Description", type: "text", section: "line", required: true },
  { key: "category", label: "Category", type: "master", master: "expense_category", section: "line" },
  { key: "amount", label: "Amount", type: "currency", section: "line", defaultValue: 0 },
];

export const EXPENSE_SCHEMA: SubmoduleSchema = {
  key: "expense",
  label: "Expense Voucher",
  shortLabel: "Expenses",
  icon: "receipt",
  recordNoun: "expense",
  route: "expenses",
  codePrefix: "EXP",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "Expense No.", type: "text", section: "Expense", required: true, inTable: true, pinned: true, width: 130 },
    { key: "docDate", label: "Date", type: "date", section: "Expense", inTable: true, width: 120 },
    { key: "paidBy", label: "Incurred By", type: "text", section: "Expense", inTable: true, width: 150 },
    { key: "costCenter", label: "Cost Center", type: "master", master: "cost_center", section: "Expense", inTable: true, width: 150 },

    { key: "items", label: "Expense Lines", type: "lineItems", section: "Lines", rowNoun: "Line", addLabel: "Add expense line", columns: EXPENSE_ITEM_COLUMNS },

    { key: "total", label: "Total", type: "currency", computed: true, section: "Amount", defaultValue: 0, inTable: true, width: 150, align: "right" },
    { key: "paymentMode", label: "Payment Mode", type: "master", master: "payment_mode", section: "Amount", inTable: true, width: 150 },
    { key: "bankCash", label: "Paid From", type: "master", master: "bank_cash", section: "Amount", inTable: true, width: 160 },

    { key: "status", label: "Status", type: "status", statusOptions: EXPENSE_STATUS, defaultValue: "DRAFT", section: "Status", inTable: true, width: 160 },
    { key: "remarks", label: "Remarks", type: "textarea", section: "Status" },
  ],
};

const JOURNAL_LINE_COLUMNS: FieldDef[] = [
  { key: "account", label: "Ledger Account", type: "master", master: "ledger", section: "line", required: true },
  { key: "description", label: "Note", type: "text", section: "line" },
  { key: "debit", label: "Debit", type: "currency", section: "line", defaultValue: 0 },
  { key: "credit", label: "Credit", type: "currency", section: "line", defaultValue: 0 },
];

export const JOURNAL_SCHEMA: SubmoduleSchema = {
  key: "journal",
  label: "Journal Voucher",
  shortLabel: "Journal",
  icon: "book-open",
  recordNoun: "journal voucher",
  route: "journal-voucher",
  codePrefix: "JV",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "Journal No.", type: "text", section: "Journal", required: true, inTable: true, pinned: true, width: 130 },
    { key: "docDate", label: "Date", type: "date", section: "Journal", inTable: true, width: 120 },

    { key: "lines", label: "Entries", type: "lineItems", section: "Entries", rowNoun: "Entry", addLabel: "Add entry", columns: JOURNAL_LINE_COLUMNS },

    { key: "totalDebit", label: "Total Debit", type: "currency", computed: true, section: "Totals", defaultValue: 0, inTable: true, width: 140, align: "right" },
    { key: "totalCredit", label: "Total Credit", type: "currency", computed: true, section: "Totals", defaultValue: 0, inTable: true, width: 140, align: "right" },

    { key: "narration", label: "Narration", type: "textarea", section: "Narration" },
    { key: "status", label: "Status", type: "status", statusOptions: JOURNAL_STATUS, defaultValue: "DRAFT", section: "Status", inTable: true, width: 140 },
  ],
};

export const SUBMODULE_SCHEMAS: Record<AccountsSubmoduleKey, SubmoduleSchema> = {
  coa: COA_SCHEMA,
  customer: CUSTOMER_SCHEMA,
  salesInvoice: SALES_INVOICE_SCHEMA,
  receipt: RECEIPT_SCHEMA,
  paymentVoucher: PAYMENT_VOUCHER_SCHEMA,
  expense: EXPENSE_SCHEMA,
  journal: JOURNAL_SCHEMA,
};

export const SUBMODULE_ORDER: AccountsSubmoduleKey[] = [
  "coa",
  "customer",
  "salesInvoice",
  "receipt",
  "paymentVoucher",
  "expense",
  "journal",
];

export function getSchema(key: AccountsSubmoduleKey): SubmoduleSchema {
  return SUBMODULE_SCHEMAS[key];
}
