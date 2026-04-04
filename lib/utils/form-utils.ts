// lib/utils/form-utils.ts
// Shared structured-data transformation used by both manual submission and import
// OPTIMIZED: stores only fieldId → value (no redundant metadata)

// ──────────────────────────────────────────────
// Type definitions (slim format)
// ──────────────────────────────────────────────

export interface StructuredSectionData {
  fields: Record<string, any>; // fieldId → value only
}

export interface StructuredSubformRowData {
  rowIndex: number;
  instanceId: string;
  fields: Record<string, any>; // fieldId → value only
}

export interface StructuredSubformData {
  fields: Record<string, any>; // fieldId → value only
  rows?: StructuredSubformRowData[];
  childSubforms?: Record<string, StructuredSubformData>;
}

export interface StructuredRecordData {
  formId: string;
  formName: string;
  sections: Record<string, StructuredSectionData>;
  subforms: Record<string, StructuredSubformData>;
  metadata: {
    submittedAt: string;
    submittedBy: string;
    totalFields: number;
    totalSections: number;
    totalSubforms: number;
  };
}

// ──────────────────────────────────────────────
// Transform function
// ──────────────────────────────────────────────

/**
 * Transforms flat recordData (fieldId → value) into the slim nested structure
 * grouped by sections and subforms. Stores only fieldId → value (no metadata).
 * Field metadata (label, type, options, etc.) is derived from form fields at read time.
 *
 * @param form - The form object with sections (with fields) and subforms loaded
 * @param recordData - Flat map of fieldId → value
 * @param submittedBy - Email or identifier of the submitter
 */
export function transformToStructuredData(
  form: any,
  recordData: Record<string, any>,
  submittedBy: string
): StructuredRecordData {
  const structured: StructuredRecordData = {
    formId: form.id,
    formName: form.name,
    sections: {},
    subforms: {},
    metadata: {
      submittedAt: new Date().toISOString(),
      submittedBy,
      totalFields: 0,
      totalSections: (form.sections || []).length,
      totalSubforms: 0,
    },
  };

  let fieldCount = 0;
  let subformCount = 0;

  // ── Sections — store only fieldId → value ──
  (form.sections || []).forEach((section: any) => {
    const sectionData: StructuredSectionData = { fields: {} };

    (section.fields || []).forEach((field: any) => {
      const value = recordData[field.id];
      if (value !== undefined) {
        sectionData.fields[field.id] = value;
        fieldCount++;
      }
    });

    structured.sections[section.id] = sectionData;
  });

  // ── Subforms (recursive) — store only fieldId → value ──
  const processSubform = (subform: any): StructuredSubformData => {
    subformCount++;

    const data: StructuredSubformData = {
      fields: {},
      rows: [],
      childSubforms: {},
    };

    // Static fields
    (subform.fields || []).forEach((field: any) => {
      const value = recordData[field.id];
      if (value !== undefined) {
        data.fields[field.id] = value;
        fieldCount++;
      }
    });

    // Dynamic rows (only present in manual submissions, not imports)
    const rowsKey = `_dynamicRows_${subform.id}`;
    const rows = recordData[rowsKey];

    if (Array.isArray(rows) && rows.length > 0) {
      rows.forEach((row: any, idx: number) => {
        const rowFields: Record<string, any> = {};

        (subform.fields || []).forEach((field: any) => {
          const val = row[field.id];
          if (val !== undefined) {
            rowFields[field.id] = val;
            fieldCount++;
          }
        });

        data.rows!.push({
          rowIndex: row._rowIndex || idx + 1,
          instanceId: row._instanceId || `row_${idx}`,
          fields: rowFields,
        });
      });
    }

    // Child subforms
    if (subform.childSubforms?.length) {
      subform.childSubforms.forEach((child: any) => {
        data.childSubforms![child.id] = processSubform(child);
      });
    }

    return data;
  };

  if (form.subforms) {
    form.subforms.forEach((subform: any) => {
      structured.subforms[subform.id] = processSubform(subform);
    });
  }

  structured.metadata.totalFields = fieldCount;
  structured.metadata.totalSubforms = subformCount;

  return structured;
}

// Validate form data against field validations (basic implementation)
export function validateFormData(form: any, data: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  (form.sections || []).forEach((section: any) => {
    (section.fields || []).forEach((field: any) => {
      const value = data[field.id];
      const validation = field.validation || {};
      if (validation.required && (!value || value === '')) {
        errors.push(`${field.label} is required`);
      }
    });
  });
  return { valid: errors.length === 0, errors };
}
