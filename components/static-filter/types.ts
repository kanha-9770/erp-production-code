/**
 * Shared types for the static-list filter sidebar. The same shapes are used
 * by both the UI component and the filter evaluator so a page only declares
 * its fields once.
 */

export type StaticFilterFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "boolean";

export interface StaticFilterField<T> {
  id: string;
  label: string;
  type: StaticFilterFieldType;
  /** Returns the value used for both comparison and the "select values from
   * records" picker. Should return a primitive, not an object. */
  accessor: (record: T) => string | number | boolean | null | undefined;
  /** For `type: "select"` — predefined choices shown in a dropdown. */
  options?: Array<{ value: string; label: string }>;
}

export interface FieldFilter {
  fieldId: string;
  fieldLabel: string;
  fieldType: StaticFilterFieldType;
  operator: string;
  value: string;
  value2?: string;
}
