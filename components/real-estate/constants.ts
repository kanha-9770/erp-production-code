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
  { value: "sqft", label: "sq ft" },
  { value: "sqm", label: "sq m" },
  { value: "acre", label: "acres" },
  { value: "hectare", label: "hectares" },
];

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
