// lib/form-utils.ts
// Helper utilities for forms, including data transformation

import type { Form } from '@prisma/client';

// Transform raw form data (field IDs as keys) to structured data with metadata
export async function transformToStructuredData(form: Form & { sections: any[] }, recordData: Record<string, any>): Promise<Record<string, any>> {
  const structuredData: Record<string, any> = {};
  const fieldIdToFieldMap: Record<string, any> = {};
  let fieldOrder = 0;

  // Build field map from sections (including subforms if needed)
  form.sections.forEach((section: any) => {
    section.fields.forEach((field: any) => {
      fieldIdToFieldMap[field.id] = {
        ...field,
        sectionId: section.id,
        sectionTitle: section.title,
        order: fieldOrder++,
      };
    });
    // Handle subform fields if present
    section.subforms?.forEach((subform: any) => {
      subform.fields.forEach((field: any) => {
        fieldIdToFieldMap[field.id] = {
          ...field,
          sectionId: section.id,
          sectionTitle: section.title,
          subformId: subform.id,
          subformName: subform.name,
          order: fieldOrder++,
        };
      });
    });
  });

  // Transform each field
  for (const [fieldId, value] of Object.entries(recordData)) {
    const fieldDef = fieldIdToFieldMap[fieldId];
    if (fieldDef) {
      structuredData[fieldId] = {
        fieldId,
        label: fieldDef.label,
        type: fieldDef.type,
        value,
        sectionId: fieldDef.sectionId,
        sectionTitle: fieldDef.sectionTitle,
        ...(fieldDef.subformId && { subformId: fieldDef.subformId, subformName: fieldDef.subformName }),
        order: fieldDef.order,
        placeholder: fieldDef.placeholder,
        description: fieldDef.description,
        validation: fieldDef.validation || {},
        options: fieldDef.options || [],
        lookup: fieldDef.lookup || null,
      };
    } else {
      console.warn(`No field definition found for ID: ${fieldId}`);
      structuredData[fieldId] = {
        fieldId,
        label: fieldId,
        type: 'text',
        value,
        sectionId: null,
        sectionTitle: 'Unknown',
        order: 999,
      };
    }
  }

  return structuredData;
}

// Validate form data against field validations (basic implementation)
export function validateFormData(form: any, data: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  form.sections.forEach((section: any) => {
    section.fields.forEach((field: any) => {
      const value = data[field.id];
      const validation = field.validation || {};
      if (validation.required && (!value || value === '')) {
        errors.push(`${field.label} is required`);
      }
      // Add more validations (email, minLength, etc.) as needed
    });
  });
  return { valid: errors.length === 0, errors };
}