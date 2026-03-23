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

  const fieldById = new Map<string, FormFieldWithSection>();
  formFields.forEach((field) => {
    fieldById.set(field.id, field);
    fieldById.set(field.originalId, field);
  });

  if (record.recordData && typeof record.recordData === "object") {
    Object.entries(record.recordData).forEach(([fieldKey, fieldData]) => {
      const formField =
        fieldById.get(fieldKey) ||
        fieldById.get(fieldKey.split("_").pop() || "");

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
