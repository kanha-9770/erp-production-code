// Engagement status palette + checklist options derived from the company's
// physical form / Google Sheet (status colour key + Benefits + Standard
// Updated sections). Centralised here so the Kaizen / Suggestion / Problem
// pages and the admin Engagement dashboard render the exact same labels
// and colours.

export type CompanyStatus =
  | "trial-phase"
  | "under-implementation"
  | "implemented"
  | "point-allotted"
  | "rejected"
  // Legacy / per-module values still in the DB — kept so the colour map
  // never falls back to a generic grey for old rows.
  | "idea"
  | "approved"
  | "in-implementation"
  | "submitted"
  | "under-review"
  | "accepted"
  | "open"
  | "in-review"
  | "resolved"
  | "closed"
  | "planning"
  | "in-progress"
  | "completed"
  | "on-hold"
  | "not-started"
  | "draft"
  | "active";

export interface StatusMeta {
  label: string;
  // Tailwind colour token for the company palette: yellow / pink / blue /
  // green / red — matches the colour key on the company's status sheet.
  className: string;
  // shadcn Badge variant — used by the dashboard table.
  badge: "default" | "secondary" | "destructive" | "outline";
}

// ── Canonical 5-status workflow (from the company status sheet) ─────────
// YELLOW  → TRIAL PHASE / UNDER REVIEW
// PINK    → UNDER IMPLEMENTATION / COST CALCULATION
// BLUE    → IMPLEMENTED / VALIDATION
// GREEN   → POINT ALLOTTED / AWARDED
// RED     → REJECTED
export const COMPANY_STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: "trial-phase", label: "Trial Phase / Under Review" },
  { value: "under-implementation", label: "Under Implementation / Cost Calculation" },
  { value: "implemented", label: "Implemented / Validation" },
  { value: "point-allotted", label: "Point Allotted / Awarded" },
  { value: "rejected", label: "Rejected" },
];

export const STATUS_META: Record<string, StatusMeta> = {
  // ── Canonical 5-status workflow ───────────────────────────────────────
  "trial-phase": {
    label: "Trial Phase / Under Review",
    className: "bg-yellow-100 text-yellow-900 border-yellow-300",
    badge: "secondary",
  },
  "under-implementation": {
    label: "Under Implementation / Cost Calc.",
    className: "bg-pink-100 text-pink-900 border-pink-300",
    badge: "outline",
  },
  implemented: {
    label: "Implemented / Validation",
    className: "bg-blue-100 text-blue-900 border-blue-300",
    badge: "default",
  },
  "point-allotted": {
    label: "Point Allotted / Awarded",
    className: "bg-green-100 text-green-900 border-green-300",
    badge: "default",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-900 border-red-300",
    badge: "destructive",
  },

  // ── Per-module legacy values (mapped onto the same palette) ───────────
  idea: { label: "Idea", className: "bg-yellow-100 text-yellow-900 border-yellow-300", badge: "secondary" },
  approved: { label: "Approved", className: "bg-green-100 text-green-900 border-green-300", badge: "default" },
  "in-implementation": { label: "In Implementation", className: "bg-pink-100 text-pink-900 border-pink-300", badge: "outline" },
  submitted: { label: "Submitted", className: "bg-yellow-100 text-yellow-900 border-yellow-300", badge: "secondary" },
  "under-review": { label: "Under Review", className: "bg-yellow-100 text-yellow-900 border-yellow-300", badge: "secondary" },
  accepted: { label: "Accepted", className: "bg-green-100 text-green-900 border-green-300", badge: "default" },
  open: { label: "Open", className: "bg-red-100 text-red-900 border-red-300", badge: "destructive" },
  "in-review": { label: "In Review", className: "bg-yellow-100 text-yellow-900 border-yellow-300", badge: "secondary" },
  resolved: { label: "Resolved", className: "bg-blue-100 text-blue-900 border-blue-300", badge: "default" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-700 border-slate-300", badge: "outline" },
  planning: { label: "Planning", className: "bg-yellow-100 text-yellow-900 border-yellow-300", badge: "secondary" },
  "in-progress": { label: "In Progress", className: "bg-pink-100 text-pink-900 border-pink-300", badge: "outline" },
  completed: { label: "Completed", className: "bg-blue-100 text-blue-900 border-blue-300", badge: "default" },
  "on-hold": { label: "On Hold", className: "bg-slate-100 text-slate-700 border-slate-300", badge: "secondary" },
  "not-started": { label: "Not Started", className: "bg-slate-100 text-slate-700 border-slate-300", badge: "secondary" },
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300", badge: "secondary" },
  active: { label: "Active", className: "bg-pink-100 text-pink-900 border-pink-300", badge: "outline" },
};

export function getStatusMeta(status: string | null | undefined): StatusMeta {
  if (!status) return { label: "Unknown", className: "bg-slate-100 text-slate-700 border-slate-300", badge: "secondary" };
  return (
    STATUS_META[status.toLowerCase()] ?? {
      label: status.replace(/-/g, " "),
      className: "bg-slate-100 text-slate-700 border-slate-300",
      badge: "outline",
    }
  );
}

// ── Benefits checklist (from the physical Kaizen / Suggestion form) ─────
export const BENEFIT_OPTIONS = [
  { value: "productivity", label: "Productivity Improvement" },
  { value: "quality", label: "Quality Improvement" },
  { value: "cost", label: "Cost Benefit" },
  { value: "delivery", label: "Delivery" },
  { value: "safety", label: "Safety Improvement" },
  { value: "five-s", label: "5S Improvement" },
  { value: "tpm", label: "TPM" },
] as const;

export type BenefitValue = (typeof BENEFIT_OPTIONS)[number]["value"];

// ── Standard Updated checklist (from the form) ─────────────────────────
export const STANDARD_UPDATED_OPTIONS = [
  { value: "design", label: "Design" },
  { value: "process", label: "Process" },
  { value: "qc", label: "Q.C." },
  { value: "not-applicable", label: "Not Applicable" },
] as const;

export type StandardUpdatedValue = (typeof STANDARD_UPDATED_OPTIONS)[number]["value"];

// Encode/decode helpers — the existing schema stores `benefits` as a free
// text column, so we join checkbox selections into a comma-separated value
// (with an optional free-text addendum) and pick them apart on read. Keeps
// the column-level API stable while letting the UI render checkboxes.
const BENEFIT_PREFIX = "[BENEFITS]";
const STANDARD_PREFIX = "[STANDARDS]";

export function encodeBenefits(
  checked: string[],
  freeText: string,
  standards: string[],
): string {
  const parts: string[] = [];
  if (checked.length) parts.push(`${BENEFIT_PREFIX} ${checked.join(",")}`);
  if (standards.length) parts.push(`${STANDARD_PREFIX} ${standards.join(",")}`);
  if (freeText.trim()) parts.push(freeText.trim());
  return parts.join("\n");
}

export function decodeBenefits(raw: string | null | undefined): {
  checked: string[];
  standards: string[];
  freeText: string;
} {
  const out = { checked: [] as string[], standards: [] as string[], freeText: "" };
  if (!raw) return out;
  const lines = raw.split(/\r?\n/);
  const freeLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith(BENEFIT_PREFIX)) {
      out.checked = line
        .slice(BENEFIT_PREFIX.length)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (line.startsWith(STANDARD_PREFIX)) {
      out.standards = line
        .slice(STANDARD_PREFIX.length)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (line.trim()) {
      freeLines.push(line);
    }
  }
  out.freeText = freeLines.join("\n").trim();
  return out;
}
