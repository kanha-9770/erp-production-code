/**
 * Types for the HR Master registry — the single management surface for every
 * editable HR dropdown (Department, Designation, Shift Type, …). Mirrors the
 * inventory-system master shape so the UI/store/service can be near-identical.
 */

export interface HrMasterOption {
  id: string;
  value: string; // display label, e.g. "Engineering", "Full-time"
  code?: string; // optional short code, e.g. "ENG"
  active: boolean;
  sortOrder: number;
}

/**
 * One HR dropdown definition. `key` is the stable identifier consumers
 * reference; `label` is what the management UI shows.
 */
export interface HrMasterType {
  key: string; // "department", "designation", "shift_type", ...
  label: string; // "Department", "Designation", "Shift Type"
  description?: string;
  /** Lucide icon name, resolved by the manager component. */
  icon?: string;
  /** When true the master cannot be deleted (system-critical). */
  system?: boolean;
  options: HrMasterOption[];
}
