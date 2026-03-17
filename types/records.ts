// ─────────────────────────────────────────────────────────────────────────────
// Canonical record / display types — single source of truth.
// Imported by page.tsx, recordsDisplay.tsx, and any other consumer.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessedFieldData {
  recordId?: string;
  recordIdFromAPI?: string;
  lookup: any;
  options: any;
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  value: any;
  displayValue: string;
  icon: string;
  order: number;
  sectionId?: string;
  sectionTitle?: string;
  subformId?: string;
  subformTitle?: string;
  formId?: string;
  formName?: string;
  fieldDefinitions?: { id: string; label: string; type: string }[];
}

export interface EnhancedFormRecord {
  title: string;
  id: string;
  formId: string;
  formName?: string;
  recordData: Record<string, any>;
  submittedAt: string;
  status: "pending" | "approved" | "rejected" | "submitted";
  processedData: ProcessedFieldData[];
  originalRecordIds?: Map<string, string>;
  form?: any;
}

export interface FormFieldWithSection {
  id: string;
  originalId: string;
  label: string;
  type: string;
  order: number;
  sectionTitle: string;
  sectionId: string;
  subformId?: string;
  subformTitle?: string;
  formId: string;
  formName: string;
  formula?: string;
  placeholder?: string;
  description?: string;
  validation?: any;
  options?: any[];
  lookup?: any;
  returnType?: "text" | "number" | "currency" | "percent" | "date" | "boolean";
  properties?: any;
}

export interface EditingCell {
  recordId: string;
  fieldId: string;
  value: any;
  originalValue: any;
  fieldType: string;
  options?: any[];
}

export interface PendingChange {
  recordId: string;
  fieldId: string;
  originalFieldId: string;
  value: any;
  originalValue: any;
  fieldType: string;
  fieldLabel: string;
}

export interface FieldFilter {
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  operator: string;
  value: any;
  value2?: any;
}

export interface User {
  id: string;
  name: string;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  mentions: { name: string; id: string }[];
}

export type ConditionalFormatCondition =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "greaterThan"
  | "lessThan"
  | "isEmpty"
  | "isNotEmpty"
  | "startsWith"
  | "endsWith"
  | "today"
  | "overdue"
  | "dueSoon"
  | "pastDue"
  | "thisWeek"
  | "nextWeek";

export interface ConditionalFormatRule {
  id: string;
  fieldId: string;
  condition: ConditionalFormatCondition;
  value?: string | number;
  textColor?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface Permission {
  id: string;
  name: string;
  category: string;
  resource: string;
  source: string;
  canDelegate: boolean;
  module: { id: string; name: string };
  form: { id: string; name: string };
}

export interface PermissionItem {
  id: string;
  name: string;
  category: string;
  resource: string;
  canDelegate: boolean;
  source: "role" | "user";
  module: { id: string; name: string };
  form: { id: string; name: string };
  grantedBy: string;
  grantedTo: string;
  reason?: string;
  expiresAt?: string | null;
}

export interface PermissionSummary {
  total: number;
  fromRole: number;
  fromUser: number;
  denied: number;
}

// ── Hierarchy grouping types (used in recordsDisplay for form→subform→section) ──

export interface FieldGroup {
  id: string;
  title?: string;
  fields: FormFieldWithSection[];
}

export interface SubformGroup {
  id: string;
  name: string;
  sections: FieldGroup[];
}

export interface FormGroup {
  id: string;
  name: string;
  subforms: SubformGroup[];
  directSections: FieldGroup[];
}
