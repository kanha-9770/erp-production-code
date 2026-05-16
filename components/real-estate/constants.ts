/**
 * Real Estate module — shared constants for labels, status badges, and option
 * lists used across pages. Single source so a label change in one place doesn't
 * leave the property list rendering "UNDER_CONTRACT" while the detail page
 * shows "Under Contract".
 */

import type {
  AgentComplianceStatus,
  AgentStatus,
  CommissionSplitRole,
  CommissionStatus,
  CommissionTermType,
  ComplianceDocumentStatus,
  ComplianceDocumentType,
  LedgerCategory,
  LedgerStatus,
  LeadActivityType,
  LeadScore,
  LeadSource,
  LeadStatus,
  PropertyDocumentType,
  PropertyStatus,
  PropertySubType,
  PropertyType,
  TransactionDocumentType,
  TransactionStatus,
  ViewingStatus,
  WithdrawalStatus,
} from "@/lib/api/real-estate/types";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

// ─── Property ────────────────────────────────────────────────────────────────

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  LAND: "Land",
  INDUSTRIAL: "Industrial",
  AGRICULTURAL: "Agricultural",
};
export const PROPERTY_TYPE_OPTIONS = Object.entries(PROPERTY_TYPE_LABEL).map(
  ([value, label]) => ({ value: value as PropertyType, label }),
);

export const PROPERTY_SUBTYPE_LABEL: Record<PropertySubType, string> = {
  APARTMENT: "Apartment",
  VILLA: "Villa",
  HOUSE: "House",
  TOWNHOUSE: "Townhouse",
  STUDIO: "Studio",
  PENTHOUSE: "Penthouse",
  OFFICE: "Office",
  RETAIL: "Retail",
  WAREHOUSE: "Warehouse",
  HOTEL: "Hotel",
  PLOT: "Plot",
  FARM: "Farm",
  OTHER: "Other",
};
export const PROPERTY_SUBTYPE_OPTIONS = Object.entries(PROPERTY_SUBTYPE_LABEL).map(
  ([value, label]) => ({ value: value as PropertySubType, label }),
);

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  DRAFT: "Draft",
  AVAILABLE: "Available",
  UNDER_CONTRACT: "Under Contract",
  SOLD: "Sold",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};
export const PROPERTY_STATUS_OPTIONS = Object.entries(PROPERTY_STATUS_LABEL).map(
  ([value, label]) => ({ value: value as PropertyStatus, label }),
);
export const PROPERTY_STATUS_VARIANT: Record<PropertyStatus, BadgeVariant> = {
  DRAFT: "outline",
  AVAILABLE: "default",
  UNDER_CONTRACT: "secondary",
  SOLD: "default",
  WITHDRAWN: "destructive",
  EXPIRED: "destructive",
};

/**
 * Per-category vocabulary for the project + unit identifier fields on
 * Property. Keeps the form, list, and preview in sync so a Land plot reads
 * "Plot 142" while a Residential apartment reads "Flat A-502" — without
 * inventing one column per category in the DB.
 *
 * Resolution order: subType first (more specific), then type, then a
 * sensible default. `floor`/`block` are hidden for categories where they
 * make no sense (LAND, AGRICULTURAL).
 */
export interface PropertyUnitVocab {
  /** Form heading for the project/layout field. */
  projectLabel: string;
  /** Form heading for the block/tower/wing field. `null` → hide. */
  blockLabel: string | null;
  /** Form heading for the floor field. `null` → hide. */
  floorLabel: string | null;
  /** Form heading for the unit-number field. */
  unitLabel: string;
  /** Short label used in lists, e.g. "Plot", "Flat", "Office". */
  unitShort: string;
}

const VOCAB_DEFAULT: PropertyUnitVocab = {
  projectLabel: "Project / Society",
  blockLabel: "Block / Tower",
  floorLabel: "Floor",
  unitLabel: "Unit number",
  unitShort: "Unit",
};

const VOCAB_BY_SUBTYPE: Partial<Record<PropertySubType, PropertyUnitVocab>> = {
  PLOT: {
    projectLabel: "Layout / Survey",
    blockLabel: null,
    floorLabel: null,
    unitLabel: "Plot number",
    unitShort: "Plot",
  },
  FARM: {
    projectLabel: "Estate / Survey",
    blockLabel: null,
    floorLabel: null,
    unitLabel: "Survey / Khasra number",
    unitShort: "Survey",
  },
  APARTMENT: {
    projectLabel: "Society / Project",
    blockLabel: "Tower / Wing",
    floorLabel: "Floor",
    unitLabel: "Flat number",
    unitShort: "Flat",
  },
  STUDIO: {
    projectLabel: "Society / Project",
    blockLabel: "Tower / Wing",
    floorLabel: "Floor",
    unitLabel: "Studio number",
    unitShort: "Studio",
  },
  PENTHOUSE: {
    projectLabel: "Society / Project",
    blockLabel: "Tower / Wing",
    floorLabel: "Floor",
    unitLabel: "Penthouse number",
    unitShort: "PH",
  },
  VILLA: {
    projectLabel: "Society / Project",
    blockLabel: "Cluster",
    floorLabel: null,
    unitLabel: "Villa number",
    unitShort: "Villa",
  },
  HOUSE: {
    projectLabel: "Colony / Locality",
    blockLabel: "Block",
    floorLabel: null,
    unitLabel: "House number",
    unitShort: "House",
  },
  TOWNHOUSE: {
    projectLabel: "Society / Project",
    blockLabel: "Cluster",
    floorLabel: null,
    unitLabel: "Townhouse number",
    unitShort: "TH",
  },
  OFFICE: {
    projectLabel: "Building / Park",
    blockLabel: "Wing / Tower",
    floorLabel: "Floor",
    unitLabel: "Office number",
    unitShort: "Office",
  },
  RETAIL: {
    projectLabel: "Mall / Complex",
    blockLabel: "Wing",
    floorLabel: "Floor",
    unitLabel: "Shop number",
    unitShort: "Shop",
  },
  WAREHOUSE: {
    projectLabel: "Estate / Park",
    blockLabel: "Block",
    floorLabel: null,
    unitLabel: "Warehouse number",
    unitShort: "WH",
  },
  HOTEL: {
    projectLabel: "Property name",
    blockLabel: "Wing",
    floorLabel: "Floor",
    unitLabel: "Room / suite",
    unitShort: "Room",
  },
  OTHER: VOCAB_DEFAULT,
};

const VOCAB_BY_TYPE: Record<PropertyType, PropertyUnitVocab> = {
  LAND: {
    projectLabel: "Layout / Survey",
    blockLabel: null,
    floorLabel: null,
    unitLabel: "Plot number",
    unitShort: "Plot",
  },
  AGRICULTURAL: {
    projectLabel: "Estate / Survey",
    blockLabel: null,
    floorLabel: null,
    unitLabel: "Survey / Khasra number",
    unitShort: "Survey",
  },
  RESIDENTIAL: {
    projectLabel: "Society / Project",
    blockLabel: "Tower / Block",
    floorLabel: "Floor",
    unitLabel: "Unit number",
    unitShort: "Unit",
  },
  COMMERCIAL: {
    projectLabel: "Building / Mall",
    blockLabel: "Wing",
    floorLabel: "Floor",
    unitLabel: "Unit number",
    unitShort: "Unit",
  },
  INDUSTRIAL: {
    projectLabel: "Estate / Park",
    blockLabel: "Block",
    floorLabel: null,
    unitLabel: "Plot / Unit number",
    unitShort: "Unit",
  },
};

export function propertyUnitVocab(
  type: PropertyType,
  subType: PropertySubType | null | undefined,
): PropertyUnitVocab {
  if (subType && VOCAB_BY_SUBTYPE[subType]) return VOCAB_BY_SUBTYPE[subType]!;
  return VOCAB_BY_TYPE[type] ?? VOCAB_DEFAULT;
}

/**
 * Compact, list-friendly rendering of the unit identifier, e.g.
 *   "Tower A · 5F · Flat 502"   (apartment)
 *   "Plot 142"                  (land)
 *   "GF · Shop 12"              (retail)
 * Returns `null` if no identifier parts were filled in.
 */
export function formatPropertyUnit(p: {
  type: PropertyType;
  subType: PropertySubType | null;
  block: string | null;
  floor: string | null;
  unitNumber: string | null;
}): string | null {
  const v = propertyUnitVocab(p.type, p.subType);
  const parts: string[] = [];
  if (v.blockLabel && p.block) parts.push(p.block);
  if (v.floorLabel && p.floor) parts.push(/^\d+$/.test(p.floor) ? `${p.floor}F` : p.floor);
  if (p.unitNumber) parts.push(`${v.unitShort} ${p.unitNumber}`);
  return parts.length ? parts.join(" · ") : null;
}

export const PROPERTY_DOC_TYPE_LABEL: Record<PropertyDocumentType, string> = {
  TITLE_DEED: "Title Deed",
  NOC: "NOC",
  FLOOR_PLAN: "Floor Plan",
  TAX_RECEIPT: "Tax Receipt",
  AGREEMENT: "Agreement",
  POSSESSION_LETTER: "Possession Letter",
  OTHER: "Other",
};
export const PROPERTY_DOC_TYPE_OPTIONS = Object.entries(PROPERTY_DOC_TYPE_LABEL).map(
  ([value, label]) => ({ value: value as PropertyDocumentType, label }),
);

export const COMMISSION_TERM_LABEL: Record<CommissionTermType, string> = {
  PERCENTAGE: "Percentage of sale price",
  FLAT_FEE: "Flat fee",
};

export const AREA_UNIT_OPTIONS = [
  { value: "sqyd", label: "sq yd" },
  { value: "sqft", label: "sq ft" },
  { value: "sqm", label: "sq m" },
  { value: "acre", label: "acres" },
  { value: "hectare", label: "hectares" },
];

export const DEFAULT_AREA_UNIT = "sqyd";

// ─── Area unit conversion ────────────────────────────────────────────────────
// Mirror of lib/real-estate/slab-engine.ts so the FE can render every
// property's area in the brokerage's canonical unit (sq.yd) regardless of
// what the listing was input in. Multipliers are exact / standard:
//   1 sqft = 1/9 sqyd       (so 9 sqft → exactly 1 sqyd, no float drift)
//   1 sqm  = 1.19599 sqyd
//   1 acre = 4840 sqyd
//   1 hectare = 11959.9 sqyd
const SQYD_PER_UNIT: Record<string, number> = {
  sqyd: 1,
  sqft: 1 / 9,
  sqm: 1.19599,
  acre: 4840,
  hectare: 11959.9,
};

/** Convert any supported area unit → sq.yd. Returns 0 for unknown units. */
export function toSquareYards(area: number | null | undefined, unit: string | null | undefined): number {
  if (area == null) return 0;
  const key = (unit ?? "sqyd").toLowerCase();
  const mult = SQYD_PER_UNIT[key];
  if (mult == null) return 0;
  return area * mult;
}

/**
 * Format a property's area for listing display. Always renders sq.yd as the
 * primary number; if the property was input in another unit, the original
 * form is appended in parentheses so the user can still spot the source.
 *   1450 sqft → "161 sq.yd (1,450 sqft)"
 *   556 sqyd  → "556 sq.yd"
 *   2 acre    → "9,680 sq.yd (2 acres)"
 */
export function formatAreaSqyd(area: number | null | undefined, unit: string | null | undefined): string {
  if (area == null) return "—";
  const u = (unit ?? "sqyd").toLowerCase();
  const sqyd = toSquareYards(area, u);
  const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (u === "sqyd") return `${fmt(sqyd)} sq.yd`;
  // Use the same labels as AREA_UNIT_OPTIONS for the parenthetical hint.
  const originalLabel = AREA_UNIT_OPTIONS.find((o) => o.value === u)?.label ?? u;
  return `${fmt(sqyd)} sq.yd (${fmt(area)} ${originalLabel})`;
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  PENDING_KYC: "Pending KYC",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  TERMINATED: "Terminated",
};
export const AGENT_STATUS_OPTIONS = Object.entries(AGENT_STATUS_LABEL).map(
  ([value, label]) => ({ value: value as AgentStatus, label }),
);
export const AGENT_STATUS_VARIANT: Record<AgentStatus, BadgeVariant> = {
  PENDING_KYC: "secondary",
  ACTIVE: "default",
  SUSPENDED: "outline",
  TERMINATED: "destructive",
};

export const AGENT_COMPLIANCE_LABEL: Record<AgentComplianceStatus, string> = {
  COMPLIANT: "Compliant",
  PENDING_KYC: "Pending KYC",
  NON_COMPLIANT: "Non-compliant",
};
export const AGENT_COMPLIANCE_VARIANT: Record<AgentComplianceStatus, BadgeVariant> = {
  COMPLIANT: "default",
  PENDING_KYC: "secondary",
  NON_COMPLIANT: "destructive",
};

// ─── Lead ────────────────────────────────────────────────────────────────────

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  VIEWING_SCHEDULED: "Viewing Scheduled",
  NEGOTIATING: "Negotiating",
  CONVERTED: "Converted",
  LOST: "Lost",
};
// Pipeline order — also used to render the Kanban column order.
export const LEAD_PIPELINE: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING_SCHEDULED",
  "NEGOTIATING",
  "CONVERTED",
  "LOST",
];
export const LEAD_STATUS_OPTIONS = LEAD_PIPELINE.map((s) => ({
  value: s,
  label: LEAD_STATUS_LABEL[s],
}));
export const LEAD_STATUS_VARIANT: Record<LeadStatus, BadgeVariant> = {
  NEW: "secondary",
  CONTACTED: "secondary",
  QUALIFIED: "default",
  VIEWING_SCHEDULED: "default",
  NEGOTIATING: "default",
  CONVERTED: "default",
  LOST: "outline",
};
// Hex tints for pipeline column headers — keep colours muted; the badge
// variants above are the loud signal.
export const LEAD_STATUS_TINT: Record<LeadStatus, string> = {
  NEW: "#94a3b8",
  CONTACTED: "#60a5fa",
  QUALIFIED: "#22d3ee",
  VIEWING_SCHEDULED: "#a78bfa",
  NEGOTIATING: "#fb923c",
  CONVERTED: "#22c55e",
  LOST: "#94a3b8",
};

export const LEAD_SCORE_LABEL: Record<LeadScore, string> = {
  HOT: "Hot",
  WARM: "Warm",
  COLD: "Cold",
};
export const LEAD_SCORE_VARIANT: Record<LeadScore, BadgeVariant> = {
  HOT: "destructive",
  WARM: "default",
  COLD: "outline",
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  WEBSITE: "Website",
  REFERRAL: "Referral",
  WALK_IN: "Walk-in",
  PORTAL: "Portal",
  SOCIAL: "Social",
  CAMPAIGN: "Campaign",
  WEBHOOK: "Webhook",
  OTHER: "Other",
};
export const LEAD_SOURCE_OPTIONS = Object.entries(LEAD_SOURCE_LABEL).map(
  ([value, label]) => ({ value: value as LeadSource, label }),
);

export const LEAD_ACTIVITY_LABEL: Record<LeadActivityType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  VIEWING: "Viewing",
  NOTE: "Note",
  STATUS_CHANGE: "Status change",
  ASSIGNMENT: "Assignment",
};
export const LEAD_ACTIVITY_LOG_OPTIONS: LeadActivityType[] = [
  "CALL",
  "EMAIL",
  "MEETING",
  "NOTE",
];

export const VIEWING_STATUS_LABEL: Record<ViewingStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};
export const VIEWING_STATUS_VARIANT: Record<ViewingStatus, BadgeVariant> = {
  SCHEDULED: "default",
  COMPLETED: "default",
  CANCELLED: "outline",
  NO_SHOW: "destructive",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatCurrency(value: number | null, currency = "INR"): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

export function formatNumber(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fullName(u: { first_name?: string | null; last_name?: string | null; email?: string }): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return name || u.email || "—";
}

export function initials(u: { first_name?: string | null; last_name?: string | null; email?: string }): string {
  const a = (u.first_name || u.email || "?").charAt(0);
  const b = (u.last_name || "").charAt(0);
  return (a + b).toUpperCase();
}

// ─── Phase 2 — Finance ───────────────────────────────────────────────────────

export const TRANSACTION_STATUS_LABEL: Record<TransactionStatus, string> = {
  PENDING: "Pending",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
};
export const TRANSACTION_STATUS_VARIANT: Record<TransactionStatus, BadgeVariant> = {
  PENDING: "secondary",
  CLOSED: "default",
  CANCELLED: "destructive",
  DISPUTED: "outline",
};

export const TRANSACTION_DOC_TYPE_LABEL: Record<TransactionDocumentType, string> = {
  CONTRACT: "Contract",
  SALE_DEED: "Sale Deed",
  PAYMENT_PROOF: "Payment Proof",
  KYC: "KYC",
  OTHER: "Other",
};
export const TRANSACTION_DOC_TYPE_OPTIONS = Object.entries(
  TRANSACTION_DOC_TYPE_LABEL,
).map(([value, label]) => ({ value: value as TransactionDocumentType, label }));

export const COMMISSION_ROLE_LABEL: Record<CommissionSplitRole, string> = {
  LISTING_AGENT: "Listing agent",
  SELLING_AGENT: "Selling agent",
  BROKERAGE: "Brokerage (house)",
  OVERRIDE: "Override",
  RANK_BONUS: "Rank bonus",
};
export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  ON_HOLD: "On hold",
  RELEASED: "Released",
  REVERSED: "Reversed",
};
export const COMMISSION_STATUS_VARIANT: Record<CommissionStatus, BadgeVariant> = {
  ON_HOLD: "secondary",
  RELEASED: "default",
  REVERSED: "destructive",
};

export const LEDGER_CATEGORY_LABEL: Record<LedgerCategory, string> = {
  COMMISSION: "Commission",
  OVERRIDE: "Override",
  BONUS: "Bonus",
  DESK_FEE: "Desk fee",
  MARKETING_FEE: "Marketing fee",
  WITHDRAWAL: "Withdrawal",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
  REVERSAL: "Reversal",
  RANK_UP_BONUS: "Rank-up bonus",
};
export const LEDGER_CATEGORY_OPTIONS = Object.entries(LEDGER_CATEGORY_LABEL).map(
  ([value, label]) => ({ value: value as LedgerCategory, label }),
);
export const LEDGER_STATUS_LABEL: Record<LedgerStatus, string> = {
  ON_HOLD: "On hold",
  RELEASED: "Released",
  REVERSED: "Reversed",
};
export const LEDGER_STATUS_VARIANT: Record<LedgerStatus, BadgeVariant> = {
  ON_HOLD: "secondary",
  RELEASED: "default",
  REVERSED: "outline",
};

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};
export const WITHDRAWAL_STATUS_VARIANT: Record<WithdrawalStatus, BadgeVariant> = {
  REQUESTED: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  PROCESSING: "secondary",
  PAID: "default",
  FAILED: "destructive",
  CANCELLED: "outline",
};

// ─── Phase 3 — Compliance ────────────────────────────────────────────────────

export const COMPLIANCE_DOC_TYPE_LABEL: Record<ComplianceDocumentType, string> = {
  GOVERNMENT_ID: "Government ID",
  REAL_ESTATE_LICENSE: "Real Estate License",
  TAX_FORM: "Tax Form",
  AGENCY_AGREEMENT: "Agency Agreement",
  ADDRESS_PROOF: "Address Proof",
  OTHER: "Other",
};
export const COMPLIANCE_DOC_TYPE_OPTIONS = Object.entries(COMPLIANCE_DOC_TYPE_LABEL).map(
  ([value, label]) => ({ value: value as ComplianceDocumentType, label }),
);
export const COMPLIANCE_DOC_STATUS_LABEL: Record<ComplianceDocumentStatus, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};
export const COMPLIANCE_DOC_STATUS_VARIANT: Record<ComplianceDocumentStatus, BadgeVariant> = {
  PENDING: "secondary",
  VERIFIED: "default",
  REJECTED: "destructive",
  EXPIRED: "destructive",
};
