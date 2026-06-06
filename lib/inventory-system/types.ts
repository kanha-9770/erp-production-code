/**
 * Inventory System — domain types (frontend-only, loosely coupled).
 *
 * This module is intentionally self-contained: it does NOT import from the
 * Prisma layer or the RTK Query baseApi. All data flows through the local
 * service boundary (`./service.ts`) so the entire feature can be developed,
 * demoed and tested with no backend. When a real API is ready, only
 * `service.ts` needs to change — the provider, schemas, and UI stay put.
 */

/** The three inventory submodules. */
export type SubmoduleKey = "store" | "machine" | "metal";

/**
 * Item lifecycle status. Some submodules use the stock-aware variants
 * (LOW_STOCK / OUT_OF_STOCK) which the UI can also derive from quantities;
 * others (machines) only use ACTIVE / INACTIVE / MAINTENANCE / RETIRED.
 */
export type ItemStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "MAINTENANCE"
  | "RETIRED";

// ── Master (dropdown) registry ──────────────────────────────────────────────

/** A single selectable value inside a master dropdown (e.g. "Hardware"). */
export interface MasterOption {
  id: string;
  value: string; // display label, e.g. "Hardware", "KG", "JAIPUR WAREHOUSE"
  code?: string; // optional short code, e.g. "HW"
  active: boolean;
  sortOrder: number;
}

/**
 * A master dropdown definition. `key` is the stable identifier a field
 * references; `label` is what the master-management UI shows. This mirrors the
 * ERP "master data" concept (LookupSource) but lives entirely on the client
 * for now.
 */
export interface MasterType {
  key: string; // "category", "uom", "warehouse", ...
  label: string; // "Category", "Unit of Measure", "Warehouse"
  description?: string;
  /** Lucide icon name, resolved by the master manager. */
  icon?: string;
  /** Submodules that consume this master — purely informational badges. */
  usedBy?: SubmoduleKey[];
  /** When true the master cannot be deleted (system-critical). */
  system?: boolean;
  options: MasterOption[];
}

// ── Field schema (drives the generic form + table) ──────────────────────────

export type FieldType =
  | "text"
  | "number"
  | "currency"
  | "textarea"
  | "date"
  | "image" // uploaded image stored as a data URL
  | "master" // dropdown sourced from a MasterType
  | "select" // dropdown with inline static options
  | "status";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** For type === "master": the MasterType.key to source options from. */
  master?: string;
  /** For type === "select": inline options. */
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  /** Section/group heading in the form. */
  section: string;
  /** Default value applied when creating a fresh item. */
  defaultValue?: string | number;

  // ── Table presentation ──
  /** Render this field as a column in the list. */
  inTable?: boolean;
  /** Pin the column (sticky-left, always visible). */
  pinned?: boolean;
  /** Hidden by default but toggleable in Manage Columns. */
  defaultHidden?: boolean;
  width?: number;
  align?: "left" | "right";
}

export interface SubmoduleSchema {
  key: SubmoduleKey;
  label: string;
  /** Lucide icon name. */
  icon: string;
  /** Singular noun, e.g. "item", "machine". */
  itemNoun: string;
  /** Route segment under /inventory-management. */
  route: string;
  /** Prefix for auto-generated item codes, e.g. "STK". */
  codePrefix: string;
  fields: FieldDef[];
}

// ── Item records ────────────────────────────────────────────────────────────

/**
 * A generic inventory record. Concrete fields are described by the
 * submodule's schema, so the shape is an open record. The reserved keys below
 * are always present.
 */
export interface InventoryItem {
  id: string;
  submodule: SubmoduleKey;
  createdAt: string;
  updatedAt: string;
  /** True while a create/update is in flight (optimistic placeholder). */
  _optimistic?: boolean;
  /** True while a delete is in flight (kept visible but dimmed). */
  _deleting?: boolean;
  /** Any schema-defined field. */
  [key: string]: unknown;
}

/** The full persisted snapshot the service round-trips. */
export interface InventorySnapshot {
  version: number;
  masters: MasterType[];
  items: Record<SubmoduleKey, InventoryItem[]>;
}
