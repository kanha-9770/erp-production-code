/**
 * Purchase System — domain types (frontend-only, loosely coupled).
 *
 * Standard procure-to-pay (P2P): the procurement workflow is modelled as five
 * documents (submodules); the individual workflow stages (Raise PR → Production
 * Approval → … → Payment) are the STATUS values that a document moves through.
 *
 * Like the inventory module, this is self-contained: all data flows through
 * `./service.ts`, so there is no backend coupling. Swap that one file to go
 * live.
 */

/** The supplier master entity + the five procurement documents. */
export type PurchaseSubmoduleKey = "supplier" | "pr" | "sourcing" | "po" | "grn" | "payment";

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
  usedBy?: PurchaseSubmoduleKey[];
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
  | "media" // image / video uploads (stored in IndexedDB)
  | "master" // dropdown sourced from a MasterType
  | "select" // dropdown with inline static options
  | "status" // workflow status, rendered as a coloured badge
  | "lineItems"; // repeatable child rows (e.g. multiple invoices on one GRN)

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
   *  of static `options` — "openPo"/"openPr" list documents not yet fully
   *  received (partial included, fully-GRN'd excluded). */
  optionsSource?: "openPo" | "openPr";
  /** For type === "status": the workflow pipeline for this document. */
  statusOptions?: StatusOption[];
  required?: boolean;
  placeholder?: string;
  section: string;
  defaultValue?: string | number;
  /** System-generated on save (e.g. the document number). Rendered read-only,
   *  skipped by required-validation, and never sent as an editable value — the
   *  server mints it. */
  auto?: boolean;
  /** Auto-filled from the logged-in user and rendered read-only. The server is
   *  authoritative — it overwrites the field from the authenticated user on
   *  create, so it can't be edited or spoofed (e.g. "Requested By", department). */
  prefillUser?: "name" | "department";
  /** Value is auto-derived by the system, not entered — rendered read-only. */
  computed?: boolean;
  /** Show this field only when another field's value matches (form + preview).
   *  Use `equals` for a single value, or `in` for a set (e.g. show "Advance
   *  Amount" for any of the partial-advance payment terms). */
  showIf?: {
    field: string;
    equals?: string | number | boolean;
    in?: Array<string | number | boolean>;
  };
  /** For type === "lineItems": the per-row sub-fields (columns). May itself
   *  contain a nested `lineItems` column (e.g. Invoice → PO/PR item lines). */
  columns?: FieldDef[];
  /** For type === "lineItems": the "add row" button label. */
  addLabel?: string;
  /** For type === "lineItems": singular noun for a row, e.g. "Invoice", "Line". */
  rowNoun?: string;

  // Table presentation
  inTable?: boolean;
  pinned?: boolean;
  defaultHidden?: boolean;
  width?: number;
  align?: "left" | "right";
}

export interface SubmoduleSchema {
  key: PurchaseSubmoduleKey;
  label: string;
  /** Short tab label. */
  shortLabel: string;
  icon: string;
  /** Singular noun, e.g. "requisition", "order". */
  recordNoun: string;
  /** Route segment under /purchase-management. */
  route: string;
  /** Document-number prefix, e.g. "PR". */
  codePrefix: string;
  /** The field key that holds this document's workflow status. */
  statusKey: string;
  fields: FieldDef[];
}

// ── Records ─────────────────────────────────────────────────────────────────

export interface PurchaseRecord {
  id: string;
  submodule: PurchaseSubmoduleKey;
  createdAt: string;
  updatedAt: string;
  _optimistic?: boolean;
  _deleting?: boolean;
  [key: string]: unknown;
}

/** Identity of the logged-in user, used to prefill user-derived fields. */
export interface CurrentUserIdentity {
  name: string;
  department: string;
}

export interface PurchaseSnapshot {
  version: number;
  masters: MasterType[];
  records: Record<PurchaseSubmoduleKey, PurchaseRecord[]>;
  /** The requesting user — drives read-only prefill of "Requested By" etc. */
  currentUser: CurrentUserIdentity;
}

/** Result of posting a GRN's received quantities into Store Inventory. */
export interface PostStockResult {
  grn: PurchaseRecord;
  increased: Array<{ itemCode: string; itemName: string; added: number; newStock: number }>;
  created: Array<{ itemCode: string; itemName: string; qty: number }>;
  alreadyPosted: boolean;
}
