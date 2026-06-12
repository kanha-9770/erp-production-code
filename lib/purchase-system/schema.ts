/**
 * Static field schemas + seed master data for the Purchase System.
 *
 * Each submodule is a procurement document. Its `status` field encodes the
 * workflow stages the user listed — e.g. the PR moves Draft → Submitted →
 * Production Approval → Approved, and the GRN moves Received → Purchase
 * Inspection → Inventory Inspection → GRN Posted → Stock Updated.
 */

import type {
  FieldDef,
  MasterType,
  StatusOption,
  SubmoduleSchema,
  PurchaseSubmoduleKey,
} from "./types";
import { DIAL_CODE_OPTIONS, DEFAULT_DIAL_CODE } from "@/lib/dial-codes";

// ── Seed master dropdowns ───────────────────────────────────────────────────

function opts(values: string[]): MasterType["options"] {
  return values.map((value, i) => ({
    id: `pseed-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    value,
    active: true,
    sortOrder: i,
  }));
}

export const SEED_MASTERS: MasterType[] = [
  {
    key: "supplier",
    label: "Vendor",
    description: "Approved vendors.",
    icon: "truck",
    usedBy: ["pr", "sourcing", "po", "grn", "payment"],
    system: true,
    options: opts([
      "Sharma Steels",
      "Nessco Fasteners",
      "Apex Pneumatics",
      "Metro Electricals",
      "Gupta Hardware Co.",
      "Precision Tools Pvt Ltd",
    ]),
  },
  {
    key: "supplier_group",
    label: "Vendor Group",
    description: "Vendor classification / category.",
    icon: "layers",
    usedBy: ["supplier"],
    options: opts([
      "Hardware",
      "Mechanical",
      "Electrical",
      "Pneumatic",
      "Hydraulic",
      "Consumable",
      "PPE",
      "Tool",
      "Stationary",
      "Tool Room",
      "Fabrication",
      "Chrome Plating",
      "Powder Coating",
      "Painting",
      "Raw Material - Metal",
      "Raw Material - Non Metal",
      "Pipe & Bends",
      "Hardening",
      "Printing",
      "Repair Work",
      "Old Machine",
      "New Machine",
      "Kitchen Equipment",
      "Antique",
      "Old Furniture",
      "Instruments",
      "Tool room + Die & tool",
      "Tool room + Mold",
      "ACCOUNTS",
      "MACHINE PURCHASE",
    ]),
  },
  {
    key: "department",
    label: "Department",
    description: "Requesting / indenting department.",
    icon: "building",
    usedBy: ["pr"],
    system: true,
    options: opts(["Production", "Maintenance", "Stores", "Quality", "R&D", "Admin", "IT"]),
  },
  {
    key: "priority",
    label: "Priority",
    description: "Requisition urgency.",
    icon: "flag",
    usedBy: ["pr"],
    options: opts(["Low", "Medium", "High", "Urgent"]),
  },
  {
    key: "category",
    label: "Category",
    description: "Item category for requisitions.",
    icon: "tags",
    usedBy: ["pr"],
    options: opts([
      "Hardware",
      "Mechanical",
      "Electrical",
      "Pneumatic",
      "Hydraulic",
      "Consumable",
      "PPE",
      "Tool",
      "Stationary",
      "Raw Material",
      "IT",
      "ASSET",
    ]),
  },
  {
    key: "uom",
    label: "Unit of Measure",
    description: "Order / receipt unit.",
    icon: "ruler",
    usedBy: ["pr", "sourcing", "po", "grn"],
    system: true,
    options: opts([
      "BAG",
      "BOX",
      "DOZEN",
      "FT",
      "GRAMS",
      "KG",
      "LTR",
      "ML",
      "MM",
      "MTR",
      "PAIR",
      "PC",
      "PKT",
      "ROLL",
      "SERIVCE",
      "SET",
      "SHEET",
      "SQFT",
    ]),
  },
  {
    key: "warehouse",
    label: "Warehouse",
    description: "Receiving store / godown.",
    icon: "warehouse",
    usedBy: ["grn"],
    options: opts(["JAIPUR WAREHOUSE", "MUMBAI WAREHOUSE"]),
  },
  {
    key: "inspection_result",
    label: "Inspection Result",
    description: "QC / inspection outcome.",
    icon: "clipboard-check",
    usedBy: ["grn"],
    options: opts(["Pending", "Passed", "Failed", "Partial"]),
  },
];

// ── Status pipelines (the user's workflow stages) ───────────────────────────

const PR_STATUS: StatusOption[] = [
  { value: "DRAFT", label: "Draft", variant: "secondary" },
  { value: "SUBMITTED", label: "PR Raised", variant: "outline" },
  { value: "PROD_APPROVAL", label: "Production Approval", variant: "outline" },
  { value: "APPROVED", label: "Approved", variant: "default" },
  { value: "REJECTED", label: "Rejected", variant: "destructive" },
];

const SOURCING_STATUS: StatusOption[] = [
  { value: "SOURCING", label: "Sourcing", variant: "secondary" },
  { value: "QUOTED", label: "Quoted", variant: "outline" },
  { value: "NEGOTIATION", label: "Negotiation", variant: "outline" },
  { value: "SELECTED", label: "Supplier Selected", variant: "default" },
  { value: "REJECTED", label: "Rejected", variant: "destructive" },
];

const PO_STATUS: StatusOption[] = [
  { value: "DRAFT", label: "Draft", variant: "secondary" },
  { value: "PENDING_APPROVAL", label: "Pending Approval", variant: "outline" },
  { value: "APPROVED", label: "Approved", variant: "outline" },
  { value: "GENERATED", label: "PO Generated", variant: "default" },
  { value: "SENT", label: "Sent to Supplier", variant: "default" },
  { value: "CLOSED", label: "Closed", variant: "secondary" },
  { value: "CANCELLED", label: "Cancelled", variant: "destructive" },
];

// Auto-derived receipt completeness (separate from the manual workflow stage).
const RECEIPT_STATUS: StatusOption[] = [
  { value: "PENDING", label: "Pending", variant: "secondary" },
  { value: "PARTIAL", label: "Partially Received", variant: "outline" },
  { value: "FULL", label: "Fully Received", variant: "default" },
];

const GRN_STATUS: StatusOption[] = [
  { value: "GATE_ENTRY", label: "Gate Entry", variant: "secondary" },
  { value: "GATE_INSPECTION", label: "Gate Inspection", variant: "outline" },
  { value: "RECEIVED", label: "Received", variant: "outline" },
  { value: "PURCHASE_INSPECTION", label: "Purchase Inspection", variant: "outline" },
  { value: "INVENTORY_INSPECTION", label: "Inventory Inspection", variant: "outline" },
  { value: "GRN_POSTED", label: "GRN Posted", variant: "default" },
  { value: "STOCK_UPDATED", label: "Stock Updated", variant: "default" },
  { value: "REJECTED", label: "Rejected", variant: "destructive" },
];

const PAYMENT_STATUS: StatusOption[] = [
  { value: "REQUESTED", label: "Payment Requested", variant: "secondary" },
  { value: "APPROVED", label: "Approved", variant: "outline" },
  { value: "ON_HOLD", label: "On Hold", variant: "outline" },
  { value: "PAID", label: "Paid", variant: "default" },
  { value: "REJECTED", label: "Rejected", variant: "destructive" },
];

// Fixed payment terms (replaces the old editable master). Three of them are
// "partial advance" terms that need an advance amount; "Credit" needs a number
// of days. The conditional fields below key off these exact values.
const PAYMENT_TERM_OPTS = [
  { value: "100% Advance", label: "100% Advance" },
  { value: "Partial Advance + Balance Before Delivery", label: "Partial Advance + Balance Before Delivery" },
  { value: "Partial Advance + Balance on Credit", label: "Partial Advance + Balance on Credit" },
  { value: "Credit", label: "Credit" },
  { value: "Partial Advance + Balance Against B/L", label: "Partial Advance + Balance Against B/L" },
  { value: "100% Against B/L", label: "100% Against B/L" },
];
// The terms that require an advance amount to be entered.
const PARTIAL_PAYMENT_TERMS = [
  "Partial Advance + Balance Before Delivery",
  "Partial Advance + Balance on Credit",
  "Partial Advance + Balance Against B/L",
];

// Repeatable contact rows for the Vendor Master ("Add contact" button).
const CONTACT_COLUMNS: FieldDef[] = [
  { key: "contactPerson", label: "Contact Person", type: "text", section: "line", required: true },
  { key: "designation", label: "Designation", type: "text", section: "line" },
  { key: "phone", label: "Phone", type: "text", section: "line" },
  { key: "email", label: "Email", type: "text", section: "line" },
];

const YES_NO = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
];
const APPROVAL_OPTS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];
const PAY_METHOD_OPTS = [
  { value: "Cash", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "By Bank", label: "By Bank" },
];
const INSPECTION_OPTS = [
  { value: "PENDING", label: "Pending" },
  { value: "PASSED", label: "Passed" },
  { value: "FAILED", label: "Failed" },
  { value: "PARTIAL", label: "Partial" },
];

const SUPPLIER_STATUS: StatusOption[] = [
  { value: "ACTIVE", label: "Active", variant: "default" },
  { value: "HOLD", label: "On Hold", variant: "outline" },
  { value: "BLOCKED", label: "Blocked", variant: "destructive" },
  { value: "INACTIVE", label: "Inactive", variant: "secondary" },
];
const SUPPLIER_TYPE_OPTS = [
  { value: "COMPANY", label: "Company" },
  { value: "PROPRIETORSHIP", label: "Proprietorship" },
  { value: "PARTNERSHIP", label: "Partnership / LLP" },
  { value: "INDIVIDUAL", label: "Individual" },
];
const CURRENCY_OPTS = [
  { value: "INR", label: "INR ₹" },
  { value: "USD", label: "USD $" },
  { value: "EUR", label: "EUR €" },
  { value: "GBP", label: "GBP £" },
];
const RATING_OPTS = [
  { value: "A", label: "A — Preferred" },
  { value: "B", label: "B — Approved" },
  { value: "C", label: "C — Conditional" },
];

// ── Submodule schemas ───────────────────────────────────────────────────────

export const PR_SCHEMA: SubmoduleSchema = {
  key: "pr",
  label: "Purchase Requisition",
  shortLabel: "Requisition",
  icon: "file-text",
  recordNoun: "requisition",
  route: "requisition",
  codePrefix: "PR",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "PR No.", type: "text", section: "Requisition", auto: true, inTable: true, pinned: true, width: 120 },
    { key: "docDate", label: "PR Date", type: "date", section: "Requisition", inTable: true, width: 120 },
    { key: "department", label: "Department", type: "master", master: "department", section: "Requisition", prefillUser: "department", required: true, inTable: true, width: 140 },
    { key: "requestedBy", label: "Requested By", type: "text", section: "Requisition", prefillUser: "name", inTable: true, width: 150 },
    { key: "priority", label: "Priority", type: "master", master: "priority", section: "Requisition", inTable: true, width: 110 },
    // Procurement route — NEW items go through sourcing & supplier selection;
    // REPEAT items are picked from Store Inventory and reuse supplier + last rate.
    { key: "purchaseType", label: "Purchase Type", type: "select", options: [
      { value: "NEW", label: "New Item" },
      { value: "REPEAT", label: "Repeat Purchase" },
    ], defaultValue: "NEW", section: "Requisition", inTable: true, width: 140 },

    // Every requisition (New or Repeat) captures its line items in the Items
    // subform below, so several items can be raised at once. These flat fields
    // are NOT shown on the form — they mirror the first line so the list view,
    // preview and item-history lookups keep working unchanged.
    { key: "itemName", label: "Item", type: "text", section: "Item Details", formHidden: true, inTable: true, width: 180 },
    { key: "itemDescription", label: "Item Description", type: "text", section: "Item Details", formHidden: true, inTable: true, width: 240 },
    { key: "category", label: "Category", type: "master", master: "category", section: "Item Details", formHidden: true, inTable: true, width: 140 },
    { key: "quantity", label: "Quantity", type: "number", section: "Item Details", formHidden: true, defaultValue: 0, inTable: true, width: 110, align: "right" },
    { key: "uom", label: "UOM", type: "master", master: "uom", section: "Item Details", formHidden: true, inTable: true, width: 90 },
    // The items grid — one row per item, added manually (New) or picked from
    // Store Inventory (Repeat).
    { key: "items", label: "Items", type: "lineItems", section: "Item Details", rowNoun: "Item", addLabel: "Add item", columns: [
      { key: "itemName", label: "Item", type: "text", section: "line", required: true },
      { key: "itemDescription", label: "Description", type: "text", section: "line" },
      { key: "category", label: "Category", type: "master", master: "category", section: "line", required: true },
      { key: "uom", label: "UOM", type: "master", master: "uom", section: "line", required: true },
      { key: "quantity", label: "Qty", type: "number", section: "line", defaultValue: 0, required: true },
    ] },
    { key: "requiredBy", label: "Required By", type: "date", section: "Item Details", required: true, inTable: true, width: 130 },
    { key: "purpose", label: "Purpose", type: "text", section: "Item Details", required: true, inTable: true, width: 180, placeholder: "Reason for requisition" },

    { key: "preferredSupplier", label: "Preferred Vendor", type: "master", master: "supplier", section: "Procurement Route", inTable: true, defaultHidden: true, width: 170 },
    { key: "lastRate", label: "Last Rate", type: "currency", section: "Procurement Route", defaultValue: 0, inTable: true, defaultHidden: true, width: 120, align: "right" },
    { key: "lastPoRef", label: "Last PO Ref.", type: "text", section: "Procurement Route", inTable: true, defaultHidden: true, width: 130 },

    { key: "productionApproval", label: "Production Approval", type: "select", options: APPROVAL_OPTS, defaultValue: "PENDING", section: "Approval", inTable: true, width: 150 },
    // Recorded by the production manager while approving: where the item will
    // be / is kept. Locked for users without the approve-requisition permission.
    { key: "itemLocationKept", label: "Item Location Kept", type: "text", section: "Approval", inTable: true, width: 170, placeholder: "Where the item is kept" },
    { key: "remarks", label: "Remarks", type: "textarea", section: "Approval", inTable: true, width: 200 },

    // Requester's vendor recommendation (optional).
    { key: "recommendVendor", label: "Recommend Vendor", type: "checkbox", section: "Recommended Vendor", inTable: true, width: 140 },
    { key: "recommendedVendorName", label: "Recommended Vendor Name", type: "text", section: "Recommended Vendor", inTable: true, width: 200, showIf: { field: "recommendVendor", equals: true } },
    { key: "recommendedVendorPhoneCode", label: "Vendor Country Code", type: "select", options: DIAL_CODE_OPTIONS, defaultValue: DEFAULT_DIAL_CODE, section: "Recommended Vendor", inTable: true, defaultHidden: true, width: 130, showIf: { field: "recommendVendor", equals: true } },
    { key: "recommendedVendorPhone", label: "Recommended Vendor Phone No.", type: "text", section: "Recommended Vendor", inTable: true, width: 190, placeholder: "Number without code", showIf: { field: "recommendVendor", equals: true } },

    { key: "status", label: "Status", type: "status", statusOptions: PR_STATUS, defaultValue: "DRAFT", section: "Status", inTable: true, width: 170 },
  ],
};

export const SOURCING_SCHEMA: SubmoduleSchema = {
  key: "sourcing",
  label: "Supplier Sourcing / RFQ",
  shortLabel: "Sourcing",
  icon: "search",
  recordNoun: "RFQ",
  route: "sourcing",
  codePrefix: "RFQ",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "RFQ No.", type: "text", section: "Sourcing", auto: true, inTable: true, pinned: true, width: 130 },
    { key: "docDate", label: "RFQ Date", type: "date", section: "Sourcing", inTable: true, width: 130 },
    { key: "prRef", label: "PR Ref.", type: "text", section: "Sourcing", inTable: true, width: 120 },
    { key: "supplier", label: "Vendor", type: "master", master: "supplier", section: "Sourcing", required: true, inTable: true, width: 180 },

    { key: "itemName", label: "Item", type: "text", section: "Quotation", required: true, inTable: true, width: 200 },
    { key: "quantity", label: "Quantity", type: "number", section: "Quotation", defaultValue: 0, inTable: true, width: 100, align: "right" },
    { key: "uom", label: "UOM", type: "master", master: "uom", section: "Quotation", inTable: true, width: 90 },
    { key: "quotedRate", label: "Quoted Rate", type: "currency", section: "Quotation", defaultValue: 0, inTable: true, width: 130, align: "right" },
    { key: "leadTimeDays", label: "Lead Time (days)", type: "number", section: "Quotation", defaultValue: 0, inTable: true, defaultHidden: true, width: 130, align: "right" },
    { key: "paymentTerms", label: "Payment Terms", type: "select", options: PAYMENT_TERM_OPTS, section: "Quotation", inTable: true, width: 140 },

    { key: "status", label: "Status", type: "status", statusOptions: SOURCING_STATUS, defaultValue: "SOURCING", section: "Decision", inTable: true, width: 160 },
    { key: "remarks", label: "Remarks", type: "textarea", section: "Decision" },
  ],
};

export const PO_SCHEMA: SubmoduleSchema = {
  key: "po",
  label: "Purchase Order",
  shortLabel: "Purchase Order",
  icon: "file-signature",
  recordNoun: "purchase order",
  route: "purchase-order",
  codePrefix: "PO",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "PO No.", type: "text", section: "Order", auto: true, inTable: true, pinned: true, width: 130 },
    { key: "docDate", label: "PO Date", type: "date", section: "Order", inTable: true, width: 130 },
    { key: "supplier", label: "Vendor", type: "master", master: "supplier", section: "Order", required: true, inTable: true, width: 180 },
    { key: "rfqRef", label: "RFQ / PR Ref.", type: "text", section: "Order", inTable: true, defaultHidden: true, width: 130 },

    { key: "itemName", label: "Item", type: "text", section: "Line", required: true, inTable: true, width: 200 },
    { key: "quantity", label: "Quantity", type: "number", section: "Line", defaultValue: 0, inTable: true, width: 100, align: "right" },
    { key: "uom", label: "UOM", type: "master", master: "uom", section: "Line", inTable: true, width: 90 },
    { key: "rate", label: "Rate", type: "currency", section: "Line", defaultValue: 0, inTable: true, width: 120, align: "right" },
    { key: "amount", label: "Amount", type: "currency", section: "Line", defaultValue: 0, inTable: true, width: 140, align: "right" },
    { key: "paymentTerms", label: "Payment Terms", type: "select", options: PAYMENT_TERM_OPTS, section: "Line", inTable: true, defaultHidden: true, width: 140 },
    { key: "payMethod", label: "Pay Method", type: "select", options: PAY_METHOD_OPTS, defaultValue: "By Bank", section: "Line", inTable: true, width: 120 },
    { key: "deliveryDate", label: "Delivery Date", type: "date", section: "Line", inTable: true, width: 130 },

    { key: "approvalStatus", label: "Approval", type: "select", options: APPROVAL_OPTS, defaultValue: "PENDING", section: "Approval", inTable: true, width: 120 },
    { key: "status", label: "Status", type: "status", statusOptions: PO_STATUS, defaultValue: "DRAFT", section: "Approval", inTable: true, width: 160 },
    { key: "remarks", label: "Remarks", type: "textarea", section: "Approval" },
  ],
};

// GRN receiving structure (standard ERP): one GRN → several invoices → each
// invoice covers MULTIPLE PO / PR item lines (a supplier invoice can span more
// than one PO). Full / Partial + balance are tracked per PO/PR line and rolled
// up to the invoice and the GRN.
const GRN_INVOICE_ITEM_COLUMNS: FieldDef[] = [
  { key: "poRef", label: "PO No.", type: "select", optionsSource: "openPo", section: "line", required: true },
  { key: "prRef", label: "PR No.", type: "select", optionsSource: "openPr", section: "line" },
  { key: "itemName", label: "Item", type: "text", section: "line" },
  { key: "invoiceQty", label: "Invoice Qty", type: "number", section: "line", defaultValue: 0 },
  { key: "receivedQty", label: "Received Qty", type: "number", section: "line", defaultValue: 0 },
  { key: "amount", label: "Amount", type: "currency", section: "line", defaultValue: 0 },
];

const GRN_INVOICE_COLUMNS: FieldDef[] = [
  { key: "invoiceNo", label: "Invoice No.", type: "text", section: "line", required: true },
  { key: "invoiceDate", label: "Invoice Date", type: "date", section: "line" },
  { key: "invoicePhoto", label: "Invoice Photo", type: "media", section: "line" },
  {
    key: "items",
    label: "PO / PR Lines",
    type: "lineItems",
    section: "line",
    columns: GRN_INVOICE_ITEM_COLUMNS,
    rowNoun: "Line",
    addLabel: "Add PO / PR line",
  },
];

// Receipts WITHOUT a supplier invoice (against a challan / no document): flat
// PO/PR item lines — same keys as the invoice item lines so receipt math,
// open-PO balances and stock posting work identically. "Expected Qty" plays
// the invoiceQty role (what the document / order says should arrive).
const GRN_RECEIPT_ITEM_COLUMNS: FieldDef[] = GRN_INVOICE_ITEM_COLUMNS.map((c) =>
  c.key === "invoiceQty" ? { ...c, label: "Expected Qty" } : { ...c },
);

// What the goods arrived against — drives which receipt fields open up.
const GRN_DOC_OPTS = [
  { value: "INVOICE", label: "Invoice" },
  { value: "CHALLAN", label: "Challan / DC" },
  { value: "NO_INVOICE", label: "No Invoice" },
];
// Who brought the material to the gate.
const BROUGHT_BY_OPTS = [
  { value: "COMPANY_PERSON", label: "Company Person" },
  { value: "OTHERS", label: "Others" },
];

export const GRN_SCHEMA: SubmoduleSchema = {
  key: "grn",
  label: "Goods Receipt (GRN)",
  shortLabel: "GRN",
  icon: "package-check",
  recordNoun: "GRN",
  route: "grn",
  codePrefix: "GRN",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "GRN No.", type: "text", section: "Receipt", auto: true, inTable: true, pinned: true, width: 130 },
    { key: "docDate", label: "GRN Date", type: "date", section: "Receipt", inTable: true, width: 130 },
    { key: "supplier", label: "Vendor", type: "master", master: "supplier", section: "Receipt", inTable: true, width: 170 },
    { key: "warehouse", label: "Warehouse", type: "master", master: "warehouse", section: "Receipt", inTable: true, width: 170 },
    // What the goods arrived against — Invoice opens the invoice grid, Challan
    // opens challan no./date + plain item lines, No Invoice just the item lines.
    { key: "receivedAgainst", label: "Received Against", type: "select", options: GRN_DOC_OPTS, defaultValue: "INVOICE", section: "Receipt", inTable: true, width: 140 },

    // Gate entry — security/gate inward record + first-level inspection at the
    // factory gate, before QC (purchase) and store (inventory) inspection.
    { key: "gateEntryNo", label: "Gate Entry No.", type: "text", section: "Gate Entry", inTable: true, width: 130 },
    { key: "gateEntryDate", label: "Gate Entry Date", type: "date", section: "Gate Entry", inTable: true, width: 140 },
    // Who delivered: a company person (employee ID) or an outside party
    // (vehicle / driver details).
    { key: "broughtBy", label: "Material Brought By", type: "select", options: BROUGHT_BY_OPTS, defaultValue: "OTHERS", section: "Gate Entry", inTable: true, width: 150 },
    { key: "employeeId", label: "Employee ID", type: "text", section: "Gate Entry", inTable: true, defaultHidden: true, width: 130, showIf: { field: "broughtBy", equals: "COMPANY_PERSON" } },
    { key: "vehicleNo", label: "Vehicle No.", type: "text", section: "Gate Entry", inTable: true, width: 120, showIf: { field: "broughtBy", equals: "OTHERS" } },
    { key: "driverName", label: "Driver Name", type: "text", section: "Gate Entry", inTable: true, defaultHidden: true, width: 140, showIf: { field: "broughtBy", equals: "OTHERS" } },
    { key: "driverMobile", label: "Driver Mobile No.", type: "text", section: "Gate Entry", inTable: true, defaultHidden: true, width: 140, placeholder: "Driver contact number", showIf: { field: "broughtBy", equals: "OTHERS" } },
    { key: "challanNo", label: "Challan / DC No.", type: "text", section: "Gate Entry", inTable: true, width: 130, showIf: { field: "receivedAgainst", equals: "CHALLAN" } },
    { key: "challanDate", label: "Challan Date", type: "date", section: "Gate Entry", inTable: true, defaultHidden: true, width: 130, showIf: { field: "receivedAgainst", equals: "CHALLAN" } },
    // Guard's physical count at the gate.
    { key: "boxCount", label: "Box Count", type: "number", section: "Gate Entry", defaultValue: 0, inTable: true, width: 100, align: "right" },
    { key: "partCount", label: "Part Count", type: "number", section: "Gate Entry", defaultValue: 0, inTable: true, width: 100, align: "right" },
    { key: "gateInspection", label: "Gate Entry Inspection", type: "select", options: INSPECTION_OPTS, defaultValue: "PENDING", section: "Gate Entry", inTable: true, width: 170 },
    { key: "gateInspectionMedia", label: "Gate Entry Inspection — Photos / Video", type: "media", section: "Gate Entry", inTable: true, width: 130 },

    { key: "purchaseInspection", label: "Purchase Inspection", type: "select", options: INSPECTION_OPTS, defaultValue: "PENDING", section: "Inspection", inTable: true, width: 160 },
    { key: "purchaseInspectionMedia", label: "Purchase Inspection — Photos / Video", type: "media", section: "Inspection", inTable: true, width: 130 },
    { key: "inventoryInspection", label: "Inventory Inspection", type: "select", options: INSPECTION_OPTS, defaultValue: "PENDING", section: "Inspection", inTable: true, width: 160 },
    { key: "inventoryInspectionMedia", label: "Inventory Inspection — Photos / Video", type: "media", section: "Inspection", inTable: true, width: 130 },

    // Multiple invoices on one GRN; each invoice covers multiple PO / PR item
    // lines with Full / Partial receipt and a balance for the remainder.
    // Placed under the inspections so quantities are booked after QC.
    { key: "lines", label: "Invoices", type: "lineItems", columns: GRN_INVOICE_COLUMNS, rowNoun: "Invoice", addLabel: "Add invoice", section: "Receipt Lines", inTable: true, width: 160, showIf: { field: "receivedAgainst", equals: "INVOICE" } },
    // Challan / no-invoice receipts book their quantities as flat item lines.
    { key: "receiptLines", label: "Received Items", type: "lineItems", columns: GRN_RECEIPT_ITEM_COLUMNS, rowNoun: "Item line", addLabel: "Add PO / PR line", section: "Receipt Lines", inTable: true, defaultHidden: true, width: 160, showIf: { field: "receivedAgainst", in: ["CHALLAN", "NO_INVOICE"] } },

    // Auto-derived from the invoice/received quantities above — read-only.
    { key: "receiptStatus", label: "Receipt Status", type: "status", statusOptions: RECEIPT_STATUS, defaultValue: "PENDING", computed: true, section: "Posting", inTable: true, width: 170 },
    { key: "stockUpdated", label: "Stock Updated", type: "select", options: YES_NO, defaultValue: "NO", section: "Posting", inTable: true, width: 120 },
    { key: "status", label: "Status", type: "status", statusOptions: GRN_STATUS, defaultValue: "GATE_ENTRY", section: "Posting", inTable: true, width: 180 },
    { key: "remarks", label: "Remarks", type: "textarea", section: "Posting" },
  ],
};

export const PAYMENT_SCHEMA: SubmoduleSchema = {
  key: "payment",
  label: "Payment Request",
  shortLabel: "Payment",
  icon: "banknote",
  recordNoun: "payment request",
  route: "payment-request",
  codePrefix: "PAY",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "Payment Req. No.", type: "text", section: "Request", auto: true, inTable: true, pinned: true, width: 150 },
    { key: "docDate", label: "Request Date", type: "date", section: "Request", inTable: true, width: 130 },
    { key: "poRef", label: "PO No.", type: "select", optionsSource: "paymentPo", required: true, section: "Request", inTable: true, width: 130 },
    // Auto-filled from the selected PO — never entered manually.
    { key: "supplier", label: "Vendor", type: "master", master: "supplier", computed: true, section: "Request", inTable: true, width: 180 },
    // Only appears once the chosen PO has been received via GRN — lists that
    // GRN's invoice number(s).
    { key: "invoiceNo", label: "Invoice No.", type: "select", optionsSource: "grnInvoice", dependsOn: "poRef", section: "Request", inTable: true, width: 130 },

    // Auto-filled from the GRN invoice booked against the chosen PO — read-only,
    // and only shown once goods have been received (a GRN exists). When no GRN
    // has been done yet this stays hidden and the user keys the amount straight
    // into Request Amount below.
    { key: "invoiceAmount", label: "Invoice Amount", type: "currency", computed: true, requiresGrnInvoice: true, section: "Amount", defaultValue: 0, inTable: true, width: 150, align: "right" },
    // The amount actually being requested for payment. Defaults to the invoice
    // amount when a GRN invoice is resolved, but the user can override it (and
    // enters it directly when no GRN has been done).
    { key: "requestAmount", label: "Request Amount", type: "currency", required: true, section: "Amount", defaultValue: 0, inTable: true, width: 150, align: "right" },

    { key: "status", label: "Status", type: "status", statusOptions: PAYMENT_STATUS, defaultValue: "REQUESTED", section: "Status", inTable: true, width: 170 },
    { key: "remarks", label: "Remarks", type: "textarea", section: "Status" },
  ],
};

// ── Supplier (Vendor) Master — a first-class entity, referenced by every
// procurement document. The supplier dropdowns elsewhere are projections of the
// ACTIVE suppliers here (kept in sync by the provider).
export const SUPPLIER_SCHEMA: SubmoduleSchema = {
  key: "supplier",
  label: "Vendor Master",
  shortLabel: "Vendors",
  icon: "truck",
  recordNoun: "vendor",
  route: "suppliers",
  codePrefix: "SUP",
  statusKey: "status",
  fields: [
    { key: "docNo", label: "Vendor Code", type: "text", section: "General", auto: true, inTable: true, pinned: true, width: 120 },
    { key: "supplierName", label: "Vendor Name", type: "text", section: "General", required: true, inTable: true, pinned: true, width: 220 },
    { key: "supplierType", label: "Type", type: "select", options: SUPPLIER_TYPE_OPTS, defaultValue: "COMPANY", section: "General", inTable: true, width: 140 },
    { key: "supplierGroup", label: "Group / Category", type: "master", master: "supplier_group", section: "General", inTable: true, width: 150 },
    { key: "status", label: "Status", type: "status", statusOptions: SUPPLIER_STATUS, defaultValue: "ACTIVE", section: "General", inTable: true, width: 120 },

    // Multiple contacts — "Add contact" appends a row (name / designation /
    // phone / email). Not a table column (it's a repeatable list).
    { key: "contacts", label: "Contacts", type: "lineItems", columns: CONTACT_COLUMNS, rowNoun: "Contact", addLabel: "Add contact", section: "Contact" },
    { key: "website", label: "Website", type: "text", section: "Contact", defaultHidden: true, inTable: true, width: 160 },

    { key: "addressLine", label: "Address", type: "textarea", section: "Address", placeholder: "Street, area…" },
    { key: "city", label: "City", type: "text", section: "Address", inTable: true, width: 120 },
    { key: "state", label: "State", type: "text", section: "Address", inTable: true, defaultHidden: true, width: 120 },
    { key: "country", label: "Country", type: "text", section: "Address", defaultValue: "India", defaultHidden: true, inTable: true, width: 120 },
    { key: "pincode", label: "Pincode", type: "text", section: "Address", defaultHidden: true, inTable: true, width: 100 },

    { key: "gstin", label: "GSTIN", type: "text", section: "Tax & Legal", inTable: true, width: 150 },
    { key: "pan", label: "PAN", type: "text", section: "Tax & Legal", inTable: true, defaultHidden: true, width: 120 },
    { key: "msmeNo", label: "MSME / Udyam No.", type: "text", section: "Tax & Legal", defaultHidden: true, inTable: true, width: 150 },

    { key: "paymentTerms", label: "Payment Terms", type: "select", options: PAYMENT_TERM_OPTS, section: "Payment", inTable: true, width: 140 },
    // Advance amount — shown only when a "Partial Advance + …" term is selected.
    { key: "advanceAmount", label: "Advance Amount", type: "currency", section: "Payment", defaultValue: 0, showIf: { field: "paymentTerms", in: PARTIAL_PAYMENT_TERMS }, inTable: true, defaultHidden: true, width: 150, align: "right" },
    { key: "currency", label: "Currency", type: "select", options: CURRENCY_OPTS, defaultValue: "INR", section: "Payment", inTable: true, defaultHidden: true, width: 110 },
    // Credit days — shown only when the term is "Credit".
    { key: "creditDays", label: "Credit Days", type: "number", section: "Payment", defaultValue: 0, showIf: { field: "paymentTerms", equals: "Credit" }, inTable: true, defaultHidden: true, width: 110, align: "right" },
    { key: "creditLimit", label: "Credit Limit", type: "currency", section: "Payment", defaultValue: 0, inTable: true, defaultHidden: true, width: 140, align: "right" },
    { key: "rating", label: "Rating", type: "select", options: RATING_OPTS, section: "Payment", inTable: true, defaultHidden: true, width: 140 },

    { key: "bankName", label: "Bank Name", type: "text", section: "Banking", defaultHidden: true, inTable: true, width: 150 },
    { key: "accountNo", label: "Account No.", type: "text", section: "Banking", defaultHidden: true, inTable: true, width: 150 },
    { key: "ifsc", label: "IFSC", type: "text", section: "Banking", defaultHidden: true, inTable: true, width: 120 },
    { key: "bankBranch", label: "Branch", type: "text", section: "Banking", defaultHidden: true, inTable: true, width: 140 },

    { key: "remarks", label: "Remarks", type: "textarea", section: "Other" },
  ],
};

export const SUBMODULE_SCHEMAS: Record<PurchaseSubmoduleKey, SubmoduleSchema> = {
  supplier: SUPPLIER_SCHEMA,
  pr: PR_SCHEMA,
  sourcing: SOURCING_SCHEMA,
  po: PO_SCHEMA,
  grn: GRN_SCHEMA,
  payment: PAYMENT_SCHEMA,
};

export const SUBMODULE_ORDER: PurchaseSubmoduleKey[] = ["supplier", "pr", "sourcing", "po", "grn", "payment"];

export function getSchema(key: PurchaseSubmoduleKey): SubmoduleSchema {
  return SUBMODULE_SCHEMAS[key];
}
