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

      const value =
        fieldData && typeof fieldData === "object" && "value" in fieldData
          ? fieldData.value
          : fieldData;

      const fieldType =
        formField?.type ||
        (fieldKey.startsWith("_dynamicRows_") ? "dynamicRows" : "text");

      processedData.push({
        recordId: record.id,
        recordIdFromAPI: record.id,
        fieldId: fieldKey,
        fieldLabel: formField?.label || fieldKey,
        fieldType,
        value,
        displayValue: formatFieldValue(fieldType, value),
        icon: fieldType,
        order: formField?.order ?? 999,
        sectionId: formField?.sectionId || "other",
        sectionTitle: formField?.sectionTitle || "Sub Form",
        formId: record.formId,
        formName: formField?.formName || record.formName || "Form",
        lookup: formField?.lookup || {},
        options: formField?.options || [],
      });
    });
  }

  processedData.sort((a, b) => a.order - b.order);
  return { ...record, processedData } as EnhancedFormRecord;
};
