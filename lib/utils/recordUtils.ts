// ─────────────────────────────────────────────────────────────────────────────
// Record data transformation utilities — single source of truth.
// Extracted from app/[module_name]/[module_Id]/[[...slug]]/page.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { formatFieldValue } from "./fieldUtils";
import type {
  FormRecord,
  FormFieldWithSection,
  EnhancedFormRecord,
  ProcessedFieldData,
} from "@/types/records";

/**
 * Transforms a raw API FormRecord into an EnhancedFormRecord by building
 * a processedData array from the record's flat recordData map.
 */
export const processRecordData = (
  record: FormRecord,
  formFields: FormFieldWithSection[],
): EnhancedFormRecord => {
  const processedData: ProcessedFieldData[] = [];

  // Build lookup maps keyed by:
  //   1. compound id  (formId_fieldId)  — used by formFieldsWithSections
  //   2. originalId   (raw field id)    — used by recordData from API
  // When the same originalId appears in multiple forms we must match by
  // record.formId so we pick the right field definition.
  const fieldByCompoundId = new Map<string, FormFieldWithSection>();
  const fieldsByOriginalId = new Map<string, FormFieldWithSection[]>();
  formFields.forEach((field) => {
    fieldByCompoundId.set(field.id, field);
    const list = fieldsByOriginalId.get(field.originalId) || [];
    list.push(field);
    fieldsByOriginalId.set(field.originalId, list);
  });

  if (record.recordData && typeof record.recordData === "object") {
    Object.entries(record.recordData).forEach(([fieldKey, fieldData]) => {
      // Try to find the matching field definition:
      // 1. compound id match (already includes formId)
      // 2. originalId match, preferring the one in the same form as this record
      let formField: FormFieldWithSection | undefined =
        fieldByCompoundId.get(fieldKey) ||
        fieldByCompoundId.get(`${record.formId}_${fieldKey}`);

      if (!formField) {
        const candidates = fieldsByOriginalId.get(fieldKey) ||
          fieldsByOriginalId.get(fieldKey.split("_").pop() || "") || [];
        // Prefer the candidate from the same form as this record
        formField = candidates.find((c) => c.formId === record.formId) || candidates[0];
      }

      // fieldData from the API may be a rich object with label, sectionTitle, etc.
      const isRichEntry = fieldData && typeof fieldData === "object" && "value" in fieldData;
      const value = isRichEntry ? fieldData.value : fieldData;

      const fieldType =
        formField?.type ||
        (isRichEntry && fieldData.type) ||
        (fieldKey.startsWith("_dynamicRows_") ? "dynamicRows" : "text");

      processedData.push({
        recordId: record.id,
        recordIdFromAPI: record.id,
        // Store the raw fieldKey as fieldId — this is what the API uses.
        fieldId: fieldKey,
        fieldLabel: formField?.label || (isRichEntry && fieldData.label) || fieldKey,
        fieldType,
        value,
        displayValue: formatFieldValue(fieldType, value),
        icon: fieldType,
        order: formField?.order ?? 999,
        sectionId: formField?.sectionId || (isRichEntry && fieldData.sectionId) || "other",
        sectionTitle: formField?.sectionTitle || (isRichEntry && fieldData.sectionTitle) || "General",
        subformId: formField?.subformId || (isRichEntry && fieldData.subformId),
        subformTitle: formField?.subformTitle || (isRichEntry && fieldData.subformTitle),
        formId: record.formId,
        formName: formField?.formName || record.formName || "Form",
        lookup: formField?.lookup || {},
        options: formField?.options || [],
        fieldDefinitions: (isRichEntry && fieldData.fieldDefinitions) || undefined,
      });
    });
  }

  processedData.sort((a, b) => a.order - b.order);
  return { ...record, processedData } as EnhancedFormRecord;
};
