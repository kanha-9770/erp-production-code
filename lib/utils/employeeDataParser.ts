/**
 * employeeDataParser.ts
 * Handles the nested StructuredRecordData format written by the submit route.
 *
 * Stored shape:
 *   { sections: { [sId]: { fields: { [fId]: { label, value, type, ... } } } },
 *     subforms: { [sfId]: { fields: { ... }, rows: [...], childSubforms: { ... } } },
 *     metadata: { ... } }
 *
 * parseEmployeeData flattens that into { [fieldId]: { label, value } } and
 * then matches field labels to known employee attribute patterns.
 */

import { parseRecordData, type ParsedEmployeeData } from './response-parser';

// ── Flatten StructuredRecordData into { fieldId: { label, value } } ──────────

function flattenFields(recordData: any): Record<string, { label: string; value: any }> {
  const flat: Record<string, { label: string; value: any }> = {};

  if (!recordData || typeof recordData !== 'object') return flat;

  // Helper: absorb a fields map ({ fieldId: { label, value, ... } })
  const absorbFields = (fields: any) => {
    if (!fields || typeof fields !== 'object') return;
    Object.values(fields).forEach((f: any) => {
      if (f && typeof f === 'object' && f.fieldId && f.label !== undefined) {
        flat[f.fieldId] = { label: String(f.label), value: f.value };
      }
    });
  };

  // Helper: walk subforms recursively (handles rows + childSubforms)
  const walkSubform = (sf: any) => {
    if (!sf || typeof sf !== 'object') return;
    absorbFields(sf.fields);
    if (Array.isArray(sf.rows)) {
      sf.rows.forEach((row: any) => absorbFields(row?.fields));
    }
    if (sf.childSubforms && typeof sf.childSubforms === 'object') {
      Object.values(sf.childSubforms).forEach(walkSubform);
    }
  };

  // 1. Sections
  if (recordData.sections && typeof recordData.sections === 'object') {
    Object.values(recordData.sections).forEach((sec: any) => {
      absorbFields(sec?.fields);
      // Some sections embed subforms
      if (sec?.subforms && typeof sec.subforms === 'object') {
        Object.values(sec.subforms).forEach(walkSubform);
      }
    });
  }

  // 2. Top-level subforms
  if (recordData.subforms && typeof recordData.subforms === 'object') {
    Object.values(recordData.subforms).forEach(walkSubform);
  }

  // 3. Fallback: if recordData itself is already a flat { fieldId: {label,value} } map
  //    (older records stored before the nested format was introduced)
  if (Object.keys(flat).length === 0) {
    Object.values(recordData).forEach((f: any) => {
      if (f && typeof f === 'object' && f.label !== undefined && f.value !== undefined) {
        const key = f.fieldId || f.id || f.label;
        if (key) flat[key] = { label: String(f.label), value: f.value };
      }
    });
  }

  return flat;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a form record's raw JSON into structured employee fields.
 * Handles both the nested StructuredRecordData format and older flat formats.
 */
export function parseEmployeeData(recordData: any): ParsedEmployeeData {
  const flat = flattenFields(recordData);
  // parseRecordData expects Object.values() to yield { label, value } objects
  return parseRecordData(flat, 'employee') as ParsedEmployeeData;
}

/**
 * Debug helper: returns a summary of what fields were extracted.
 */
export function analyzeRecordDataStructure(recordData: any): Record<string, any> {
  if (!recordData || typeof recordData !== 'object') {
    return { error: 'Invalid or empty recordData', type: typeof recordData };
  }

  const flat = flattenFields(recordData);
  const fields: Record<string, any> = {};

  Object.entries(flat).forEach(([key, { label, value }]) => {
    fields[key] = { label, value, hasValue: value !== undefined && value !== null && value !== '' };
  });

  return {
    format: recordData.sections ? 'nested-structured' : 'flat',
    totalFields: Object.keys(flat).length,
    fieldsWithValues: Object.values(fields).filter((f: any) => f.hasValue).length,
    fields,
  };
}
