// lib/utils/form-utils.ts
// Shared structured-data transformation used by both manual submission and import

// ──────────────────────────────────────────────
// Type definitions (mirrors submit/route.ts)
// ──────────────────────────────────────────────

export interface StructuredFieldData {
  fieldId: string;
  label: string;
  type: string;
  value: any;
  sectionId: string | null;
  sectionTitle: string;
  subformId: string | null;
  subformName: string | null;
  order: number;
  placeholder?: string | null;
  description?: string | null;
  validation?: Record<string, any>;
  options?: any[];
  lookup?: any;
}

export interface StructuredSectionData {
  sectionId: string;
  sectionTitle: string;
  sectionDescription: string | null;
  order: number;
  fields: Record<string, StructuredFieldData>;
}

export interface StructuredSubformRowData {
  rowIndex: number;
  instanceId: string;
  fields: Record<string, StructuredFieldData>;
}

export interface StructuredSubformData {
  subformId: string;
  subformName: string;
  subformDescription: string | null;
  parentSubformId: string | null;
  order: number;
  level: number;
  path: string | null;
  fields: Record<string, StructuredFieldData>;
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
 * Transforms flat recordData (fieldId → value) into the full nested structure
 * grouped by sections and subforms. Produces identical output regardless of
 * whether the data comes from manual form fill or CSV/Excel import.
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

  // ── Sections ─────────────────────────────────
  (form.sections || []).forEach((section: any) => {
    const sectionData: StructuredSectionData = {
      sectionId: section.id,
      sectionTitle: section.title,
      sectionDescription: section.description || null,
      order: section.order,
      fields: {},
    };

    (section.fields || []).forEach((field: any) => {
      const value = recordData[field.id];
      if (value !== undefined) {
        sectionData.fields[field.id] = {
          fieldId: field.id,
          label: field.label,
          type: field.type,
          value,
          sectionId: section.id,
          sectionTitle: section.title,
          subformId: null,
          subformName: null,
          order: field.order,
          placeholder: field.placeholder,
          description: field.description,
          validation: field.validation || {},
          options: field.options || [],
          lookup: field.lookup || null,
        };
        fieldCount++;
      }
    });

    structured.sections[section.id] = sectionData;
  });

  // ── Subforms (recursive) ─────────────────────
  const processSubform = (subform: any, parentPath = ""): StructuredSubformData => {
    const currentPath = parentPath ? `${parentPath}/${subform.id}` : subform.id;
    subformCount++;

    const data: StructuredSubformData = {
      subformId: subform.id,
      subformName: subform.name,
      subformDescription: subform.description || null,
      parentSubformId: subform.parentSubformId || null,
      order: subform.order,
      level: subform.level,
      path: subform.path || currentPath,
      fields: {},
      rows: [],
      childSubforms: {},
    };

    // Static fields
    (subform.fields || []).forEach((field: any) => {
      const value = recordData[field.id];
      if (value !== undefined) {
        data.fields[field.id] = {
          fieldId: field.id,
          label: field.label,
          type: field.type,
          value,
          sectionId: null,
          sectionTitle: "",
          subformId: subform.id,
          subformName: subform.name,
          order: field.order,
          placeholder: field.placeholder,
          description: field.description,
          validation: field.validation || {},
          options: field.options || [],
          lookup: field.lookup || null,
        };
        fieldCount++;
      }
    });

    // Dynamic rows (only present in manual submissions, not imports)
    const rowsKey = `_dynamicRows_${subform.id}`;
    const rows = recordData[rowsKey];

    if (Array.isArray(rows) && rows.length > 0) {
      rows.forEach((row: any, idx: number) => {
        const rowFields: Record<string, StructuredFieldData> = {};

        (subform.fields || []).forEach((field: any) => {
          const val = row[field.id];
          if (val !== undefined) {
            rowFields[field.id] = {
              fieldId: field.id,
              label: field.label,
              type: field.type,
              value: val,
              sectionId: null,
              sectionTitle: "",
              subformId: subform.id,
              subformName: subform.name,
              order: field.order,
              placeholder: field.placeholder,
              description: field.description,
              validation: field.validation || {},
              options: field.options || [],
              lookup: field.lookup || null,
            };
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
        data.childSubforms![child.id] = processSubform(child, currentPath);
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
