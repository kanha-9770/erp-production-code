// ─────────────────────────────────────────────────────────────────────────────
// Canonical form-structure types — single source of truth.
// Imported by page.tsx, recordsDisplay.tsx, and any other consumer.
// ─────────────────────────────────────────────────────────────────────────────

export interface FormModule {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  children?: FormModule[];
  forms?: Form[];
}

export interface FormSubform {
  id: string;
  name: string;
  fields: FormField[];
  childSubforms?: FormSubform[];
}

export interface Form {
  id: string;
  name: string;
  description?: string;
  moduleId?: string;
  isPublished?: boolean;
  updatedAt?: string;
  sections?: FormSection[];
  subforms?: FormSubform[];
}

export interface FormSection {
  id: string;
  title: string;
  fields: FormField[];
}

export interface FormField {
  id: string;
  label: string;
  type: string;
  order: number;
  placeholder?: string;
  description?: string;
  validation?: any;
  options?: any[];
  lookup?: any;
  isIndexed?: boolean;
}

export interface FormRecord {
  id: string;
  formId: string;
  formName?: string;
  recordData: Record<string, any>;
  submittedAt: string;
  status: "pending" | "approved" | "rejected" | "submitted";
}
