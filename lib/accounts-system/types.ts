/**
 * Accounts System — domain types (frontend-only, self-contained).
 *
 * A parallel sibling to lib/purchase-system and lib/inventory-system: the same
 * schema-driven engine, its own optimistic store + localStorage service, so the
 * whole Accounts & Finance module is decoupled from the rest of the ERP. Swap
 * `./service.ts` to go live.
 *
 * The module models the core finance documents an SMB runs day-to-day:
 *   - Chart of Accounts (ledger master) + Customer master
 *   - Sales Invoice (AR) → Receipt (money in)
 *   - Payment Voucher / Expense (money out) + Journal Voucher (manual GL)
 * The procurement-side Payment Request lives in the Purchase module and is
 * surfaced read-through under Accounts as well.
 */

/** The two master entities + the finance documents. */
export type AccountsSubmoduleKey =
  | "coa" // Chart of Accounts (ledger master)
  | "customer" // Customer master
  | "salesInvoice" // AR invoice
  | "receipt" // customer receipt (money in)
  | "paymentVoucher" // payment / disbursement (money out)
  | "expense" // expense voucher / claim
  | "journal"; // manual journal voucher (GL)

// ── Master (dropdown) registry ──────────────────────────────────────────────

export interface MasterOption {
  id: string;
  value: string;
  code?: string;
  active: boolean;
  sortOrder: number;
}

export interface MasterType {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  usedBy?: AccountsSubmoduleKey[];
  system?: boolean;
  options: MasterOption[];
}

// ── Field schema ────────────────────────────────────────────────────────────

export type FieldType =
  | "text"
  | "number"
  | "currency"
  | "textarea"
  | "date"
  | "checkbox" // boolean tick
  | "media" // image / file uploads (stored in IndexedDB)
  | "master" // dropdown sourced from a MasterType
  | "select" // dropdown with inline static options
  | "status" // workflow status, rendered as a coloured badge
  | "lineItems"; // repeatable child rows (invoice lines, journal Dr/Cr lines)

export type StatusVariant = "default" | "secondary" | "outline" | "destructive";

export interface StatusOption {
  value: string;
  label: string;
  variant: StatusVariant;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** For type === "master": the MasterType.key to source options from. */
  master?: string;
  /** For type === "select": inline options. */
  options?: Array<{ value: string; label: string }>;
  /** For type === "select": pull options dynamically from live records instead
   *  of static `options`.
   *   - "openInvoice": sales invoices not yet fully received (for a Receipt's
   *     invoice dropdown); depends on nothing, scoped by the picked customer
   *     when present. */
  optionsSource?: "openInvoice";
  /** For optionsSource: the field key whose value scopes the dynamic list. */
  dependsOn?: string;
  /** For type === "status": the workflow pipeline for this document. */
  statusOptions?: StatusOption[];
  required?: boolean;
  placeholder?: string;
  section: string;
  defaultValue?: string | number;
  /** Value is auto-derived by the system, not entered — rendered read-only. */
  computed?: boolean;
  /** Show this field only when another field equals a value (form + preview). */
  showIf?: { field: string; equals: string | number | boolean };
  /** Accounts: show this field only once a Receipt's invoice (openInvoice) is
   *  chosen — used by the auto-filled Invoice Amount. */
  requiresOpenInvoice?: boolean;
  /** For type === "lineItems": the per-row sub-fields (columns). */
  columns?: FieldDef[];
  /** For type === "lineItems": the "add row" button label. */
  addLabel?: string;
  /** For type === "lineItems": singular noun for a row, e.g. "Line". */
  rowNoun?: string;

  /** Kept in the record (and table/preview) but NOT rendered as a form input. */
  formHidden?: boolean;

  // Table presentation
  inTable?: boolean;
  pinned?: boolean;
  defaultHidden?: boolean;
  width?: number;
  align?: "left" | "right";
}

export interface SubmoduleSchema {
  key: AccountsSubmoduleKey;
  label: string;
  /** Short tab label. */
  shortLabel: string;
  icon: string;
  /** Singular noun, e.g. "invoice", "receipt". */
  recordNoun: string;
  /** Route segment under /accounts. */
  route: string;
  /** Document-number prefix, e.g. "INV". */
  codePrefix: string;
  /** The field key that holds this document's workflow status. */
  statusKey: string;
  fields: FieldDef[];
}

// ── Records ─────────────────────────────────────────────────────────────────

export interface AccountsRecord {
  id: string;
  submodule: AccountsSubmoduleKey;
  createdAt: string;
  updatedAt: string;
  _optimistic?: boolean;
  _deleting?: boolean;
  [key: string]: unknown;
}

export interface AccountsSnapshot {
  version: number;
  masters: MasterType[];
  records: Record<AccountsSubmoduleKey, AccountsRecord[]>;
}
