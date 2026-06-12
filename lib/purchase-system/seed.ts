/** Demo seed records so each procurement document shows realistic data. */

import type { PurchaseRecord, PurchaseSubmoduleKey } from "./types";

function base(submodule: PurchaseSubmoduleKey, i: number, fields: Record<string, unknown>): PurchaseRecord {
  const ts = new Date(2026, 4, 5 + i, 10, 0, 0).toISOString();
  return {
    id: `pseed_${submodule}_${i}`,
    submodule,
    createdAt: ts,
    updatedAt: ts,
    ...fields,
  };
}

const PR_SEED: Array<Record<string, unknown>> = [
  { docNo: "PR-0001", docDate: "2026-05-05", department: "Production", requestedBy: "R. Verma", priority: "High", itemName: "M8 x 25 Hex Bolt", itemDescription: "Grade 8.8 hex bolt, zinc plated", category: "Hardware", quantity: 2000, uom: "PC", requiredBy: "2026-05-20", purpose: "Assembly line consumption", estRate: 4.5, productionApproval: "APPROVED", remarks: "Recurring item", recommendVendor: true, recommendedVendorName: "Nessco Fasteners", recommendedVendorPhoneCode: "+91", recommendedVendorPhone: "99100 44556", status: "APPROVED" },
  { docNo: "PR-0002", docDate: "2026-05-07", department: "Maintenance", requestedBy: "S. Khan", priority: "Urgent", itemName: "Hydraulic Oil 68", itemDescription: "ISO VG 68 hydraulic oil", category: "Consumable", quantity: 200, uom: "LTR", requiredBy: "2026-05-12", purpose: "Press machine top-up", estRate: 210, productionApproval: "PENDING", remarks: "Breakdown maintenance", recommendVendor: true, recommendedVendorName: "Apex Pneumatics", recommendedVendorPhoneCode: "+91", recommendedVendorPhone: "98765 33445", status: "PROD_APPROVAL" },
  { docNo: "PR-0003", department: "Stores", requestedBy: "A. Mehta", priority: "Medium", itemName: "Safety Gloves", itemDescription: "Cut-resistant gloves, size L", category: "PPE", quantity: 300, uom: "PAIR", requiredBy: "2026-05-25", purpose: "PPE replenishment", estRate: 65, productionApproval: "PENDING", remarks: "", recommendVendor: false, status: "DRAFT" },
];

const SOURCING_SEED: Array<Record<string, unknown>> = [
  { docNo: "RFQ-0001", docDate: "2026-05-08", prRef: "PR-0001", supplier: "Nessco Fasteners", itemName: "M8 x 25 Hex Bolt", quantity: 2000, uom: "PC", quotedRate: 4.2, leadTimeDays: 7, paymentTerms: "Credit", status: "SELECTED" },
  { docNo: "RFQ-0002", docDate: "2026-05-08", prRef: "PR-0001", supplier: "Gupta Hardware Co.", itemName: "M8 x 25 Hex Bolt", quantity: 2000, uom: "PC", quotedRate: 4.6, leadTimeDays: 4, paymentTerms: "100% Advance", status: "QUOTED" },
  { docNo: "RFQ-0003", docDate: "2026-05-10", prRef: "PR-0002", supplier: "Apex Pneumatics", itemName: "Hydraulic Oil 68", quantity: 200, uom: "LTR", quotedRate: 205, leadTimeDays: 3, paymentTerms: "Advance + Credit", status: "NEGOTIATION" },
];

const PO_SEED: Array<Record<string, unknown>> = [
  { docNo: "PO-0001", docDate: "2026-05-12", supplier: "Nessco Fasteners", rfqRef: "RFQ-0001", itemName: "M8 x 25 Hex Bolt", quantity: 2000, uom: "PC", rate: 4.2, amount: 8400, paymentTerms: "Credit", deliveryDate: "2026-05-19", approvalStatus: "APPROVED", status: "GENERATED" },
  { docNo: "PO-0002", docDate: "2026-05-13", supplier: "Apex Pneumatics", rfqRef: "RFQ-0003", itemName: "Hydraulic Oil 68", quantity: 200, uom: "LTR", rate: 205, amount: 41000, paymentTerms: "Advance + Credit", deliveryDate: "2026-05-16", approvalStatus: "PENDING", status: "PENDING_APPROVAL" },
  { docNo: "PO-0003", docDate: "2026-05-13", supplier: "Gupta Hardware Co.", rfqRef: "PR-0001", itemName: "M10 Flat Washer", quantity: 500, uom: "PC", rate: 3, amount: 1500, paymentTerms: "100% Advance", deliveryDate: "2026-05-22", approvalStatus: "APPROVED", status: "GENERATED" },
  { docNo: "PO-0004", docDate: "2026-05-13", supplier: "Precision Tools Pvt Ltd", rfqRef: "PR-0001", itemName: "Spring Washer", quantity: 1000, uom: "PC", rate: 1.2, amount: 1200, paymentTerms: "100% Advance", deliveryDate: "2026-05-20", approvalStatus: "APPROVED", status: "GENERATED" },
  { docNo: "PO-0005", docDate: "2026-05-14", supplier: "Metro Electricals", rfqRef: "PR-0003", itemName: "Cable Gland 20mm", quantity: 300, uom: "PC", rate: 18, amount: 5400, paymentTerms: "Credit", deliveryDate: "2026-05-24", approvalStatus: "PENDING", status: "PENDING_APPROVAL" },
];

const GRN_SEED: Array<Record<string, unknown>> = [
  {
    docNo: "GRN-0001", docDate: "2026-05-19", supplier: "Nessco Fasteners", warehouse: "JAIPUR WAREHOUSE", receivedAgainst: "INVOICE",
    gateEntryNo: "GE-0451", gateEntryDate: "2026-05-19", broughtBy: "OTHERS", vehicleNo: "RJ14 GC 2231", driverName: "Ramesh", challanNo: "DC-8841", challanDate: "2026-05-18", boxCount: 4, partCount: 120, gateInspection: "PASSED",
    lines: [
      {
        _id: "inv_s1a", invoiceNo: "INV-NF-3321", invoiceDate: "2026-05-18",
        items: [
          { _id: "it_s1a1", poRef: "PO-0001", prRef: "PR-0001", itemName: "M8 x 25 Hex Bolt", invoiceQty: 2000, receivedQty: 2000, amount: 8400 },
          { _id: "it_s1a2", poRef: "PO-0003", prRef: "PR-0001", itemName: "M10 Flat Washer", invoiceQty: 500, receivedQty: 300, amount: 1500 },
        ],
      },
      {
        _id: "inv_s1b", invoiceNo: "INV-NF-3322", invoiceDate: "2026-05-18",
        items: [
          { _id: "it_s1b1", poRef: "PO-0004", prRef: "PR-0001", itemName: "Spring Washer", invoiceQty: 1000, receivedQty: 1000, amount: 1200 },
        ],
      },
    ],
    receiptStatus: "PARTIAL", purchaseInspection: "PASSED", inventoryInspection: "PASSED", stockUpdated: "YES", status: "STOCK_UPDATED",
  },
  {
    docNo: "GRN-0002", docDate: "2026-05-16", supplier: "Apex Pneumatics", warehouse: "MUMBAI WAREHOUSE", receivedAgainst: "INVOICE",
    gateEntryNo: "GE-0452", gateEntryDate: "2026-05-16", broughtBy: "OTHERS", vehicleNo: "MH12 AB 9087", driverName: "Suresh", challanNo: "DC-2210", challanDate: "2026-05-15", boxCount: 2, partCount: 36, gateInspection: "PASSED",
    lines: [
      {
        _id: "inv_s2a", invoiceNo: "INV-AP-1180", invoiceDate: "2026-05-15",
        items: [
          { _id: "it_s2a1", poRef: "PO-0002", prRef: "PR-0002", itemName: "Hydraulic Oil 68", invoiceQty: 200, receivedQty: 150, amount: 30750 },
        ],
      },
    ],
    receiptStatus: "PARTIAL", purchaseInspection: "PASSED", inventoryInspection: "PENDING", stockUpdated: "NO", status: "INVENTORY_INSPECTION",
  },
];

const PAYMENT_SEED: Array<Record<string, unknown>> = [
  { docNo: "PAY-0001", docDate: "2026-05-20", supplier: "Nessco Fasteners", poRef: "PO-0001", invoiceNo: "INV-NF-3321", invoiceAmount: 8316, requestAmount: 8316, status: "APPROVED" },
  { docNo: "PAY-0002", docDate: "2026-05-21", supplier: "Apex Pneumatics", poRef: "PO-0002", invoiceNo: "INV-AP-1180", invoiceAmount: 41000, requestAmount: 41000, status: "REQUESTED" },
];

const SUPPLIER_SEED: Array<Record<string, unknown>> = [
  { docNo: "SUP-0001", supplierName: "Sharma Steels", supplierType: "COMPANY", supplierGroup: "Raw Material - Metal", status: "ACTIVE", contactPerson: "Rakesh Sharma", phoneCode: "+91", phone: "98290 11223", email: "sales@sharmasteels.in", city: "Jaipur", state: "Rajasthan", country: "India", pincode: "302013", gstin: "08ABCDS1234F1Z5", pan: "ABCDS1234F", paymentTerms: "Credit", currency: "INR", creditDays: 30, creditLimit: 500000, rating: "A", bankName: "HDFC Bank", accountNo: "50100123456789", ifsc: "HDFC0001234", bankBranch: "MI Road" },
  { docNo: "SUP-0002", supplierName: "Nessco Fasteners", supplierType: "COMPANY", supplierGroup: "Hardware", status: "ACTIVE", contactPerson: "Amit Gupta", phoneCode: "+91", phone: "99100 44556", email: "info@nesscofasteners.com", city: "Jaipur", state: "Rajasthan", country: "India", pincode: "302022", gstin: "08NESSC6789K1Z2", pan: "NESSC6789K", paymentTerms: "Credit", currency: "INR", creditDays: 30, creditLimit: 300000, rating: "A", bankName: "ICICI Bank", accountNo: "001401512345", ifsc: "ICIC0000014", bankBranch: "Vaishali Nagar" },
  { docNo: "SUP-0003", supplierName: "Apex Pneumatics", supplierType: "PROPRIETORSHIP", supplierGroup: "Pneumatic", status: "ACTIVE", contactPerson: "S. Khan", phoneCode: "+91", phone: "98765 33445", email: "apex.pneumatics@gmail.com", city: "Mumbai", state: "Maharashtra", country: "India", pincode: "400072", gstin: "27APEXP4567L1Z9", pan: "APEXP4567L", paymentTerms: "Advance + Credit", currency: "INR", creditDays: 15, creditLimit: 200000, rating: "B", bankName: "Axis Bank", accountNo: "918020012345", ifsc: "UTIB0000123", bankBranch: "Andheri" },
  { docNo: "SUP-0004", supplierName: "Metro Electricals", supplierType: "PARTNERSHIP", supplierGroup: "Electrical", status: "HOLD", contactPerson: "Vijay Rao", phoneCode: "+91", phone: "90040 55667", email: "purchase@metroelectricals.in", city: "Pune", state: "Maharashtra", country: "India", pincode: "411019", gstin: "27METRO8901M1Z1", pan: "METRO8901M", paymentTerms: "100% Advance", currency: "INR", creditDays: 0, creditLimit: 0, rating: "C" },
  { docNo: "SUP-0005", supplierName: "Gupta Hardware Co.", supplierType: "PROPRIETORSHIP", supplierGroup: "Hardware", status: "ACTIVE", contactPerson: "Mahesh Gupta", phoneCode: "+91", phone: "93100 77889", email: "guptahardware@yahoo.com", city: "Delhi", state: "Delhi", country: "India", pincode: "110006", gstin: "07GUPTA2345N1Z7", pan: "GUPTA2345N", paymentTerms: "100% Advance", currency: "INR", creditDays: 0, creditLimit: 100000, rating: "B" },
  { docNo: "SUP-0006", supplierName: "Precision Tools Pvt Ltd", supplierType: "COMPANY", supplierGroup: "Tool", status: "ACTIVE", contactPerson: "N. Iyer", phoneCode: "+91", phone: "98455 99001", email: "sales@precisiontools.co.in", city: "Bengaluru", state: "Karnataka", country: "India", pincode: "560058", gstin: "29PRECI6789P1Z3", pan: "PRECI6789P", paymentTerms: "Net 45", currency: "INR", creditDays: 45, creditLimit: 750000, rating: "A", bankName: "SBI", accountNo: "32145678901", ifsc: "SBIN0001234", bankBranch: "Peenya" },
  { docNo: "SUP-0007", supplierName: "Speedways Logistics", supplierType: "COMPANY", supplierGroup: "Repair Work", status: "INACTIVE", contactPerson: "Ravi Menon", phoneCode: "+91", phone: "90000 12121", email: "ops@speedways.in", city: "Mumbai", state: "Maharashtra", country: "India", pincode: "400001", gstin: "27SPEED1212Q1Z4", pan: "SPEED1212Q", paymentTerms: "Credit", currency: "INR", rating: "C" },
];

const SEED_BY_SUBMODULE: Record<PurchaseSubmoduleKey, Array<Record<string, unknown>>> = {
  supplier: SUPPLIER_SEED,
  pr: PR_SEED,
  sourcing: SOURCING_SEED,
  po: PO_SEED,
  grn: GRN_SEED,
  payment: PAYMENT_SEED,
};

export function seedRecords(submodule: PurchaseSubmoduleKey): PurchaseRecord[] {
  return SEED_BY_SUBMODULE[submodule].map((fields, i) => base(submodule, i, fields));
}
