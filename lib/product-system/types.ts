/**
 * Product Master System — domain types (frontend-only, self-contained).
 *
 * A parallel sibling to lib/purchase-system / lib/accounts-system: the same
 * schema-driven engine, its own optimistic store + localStorage service. The
 * module is a single rich entity — the Product Master — captured across many
 * grouped sections (identification, technical, financial, sales, service…).
 */

export type ProductSubmoduleKey = "product";

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
  usedBy?: ProductSubmoduleKey[];
  system?: boolean;
  options: MasterOption[];
}

// ── Field schema ────────────────────────────────────────────────────────────

export type FieldType =
  | "text"
  | "number"
  | "currency"
  | "textarea"
  | "url" // external link (catalogue / manual / video / folder) — rendered as a link
  | "date"
  | "checkbox"
  | "media" // image / video uploads (stored in IndexedDB)
  | "master" // dropdown sourced from a MasterType
  | "select" // dropdown with inline static options
  | "status"; // lifecycle status, rendered as a coloured badge

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
  /** For type === "status": the lifecycle pipeline. */
  statusOptions?: StatusOption[];
  required?: boolean;
  placeholder?: string;
  section: string;
  defaultValue?: string | number;
  /** Show this field only when another field equals a value (form + preview). */
  showIf?: { field: string; equals: string | number | boolean };
  /** Kept in the record but NOT rendered as a form input. */
  formHidden?: boolean;
  /** Optional unit suffix shown after the value (e.g. "mm", "kW"). */
  unit?: string;

  // Table presentation
  inTable?: boolean;
  pinned?: boolean;
  defaultHidden?: boolean;
  width?: number;
  align?: "left" | "right";
}

export interface SubmoduleSchema {
  key: ProductSubmoduleKey;
  label: string;
  shortLabel: string;
  icon: string;
  recordNoun: string;
  route: string;
  codePrefix: string;
  statusKey: string;
  fields: FieldDef[];
}

// ── Records ─────────────────────────────────────────────────────────────────

export interface ProductRecord {
  id: string;
  submodule: ProductSubmoduleKey;
  createdAt: string;
  updatedAt: string;
  _optimistic?: boolean;
  _deleting?: boolean;
  [key: string]: unknown;
}

export interface ProductSnapshot {
  version: number;
  masters: MasterType[];
  records: Record<ProductSubmoduleKey, ProductRecord[]>;
}
