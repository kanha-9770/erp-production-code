// lib/api-handlers/data-migration.ts
// Reusable server-side logic for import/export operations

import { prisma } from "@/lib/prisma"
import { DatabaseService } from "@/lib/database-service"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExportRecordRow {
  [key: string]: any
}

export interface ExportResult {
  formName: string
  headers: string[]
  rows: ExportRecordRow[]
  totalRecords: number
}

export interface ImportRowResult {
  row: number
  status: "success" | "failed" | "skipped"
  error?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalizeKey = (str: string): string =>
  String(str).replace(/[\u2018\u2019]/g, "'").trim()

/**
 * Flatten nested recordData into a flat key-value map using field labels.
 * Handles the structured format: { sections: { fieldId: { label, value, type } } }
 * Also handles flat format: { fieldId: value }
 */
function flattenRecordData(
  recordData: Record<string, any>,
  fieldMap: Map<string, { label: string; type: string }>
): Record<string, any> {
  const flat: Record<string, any> = {}

  // Handle structured sections format
  if (recordData.sections && typeof recordData.sections === "object") {
    for (const section of Object.values(recordData.sections) as any[]) {
      const fields = section?.fields || section
      if (fields && typeof fields === "object") {
        for (const [, fieldData] of Object.entries(fields)) {
          const fd = fieldData as any
          if (fd?.label && fd?.value !== undefined) {
            flat[fd.label] = formatExportValue(fd.value, fd.type)
          }
        }
      }
    }
    return flat
  }

  // Handle flat format: { fieldId: value } or { fieldId: { value, label, type } }
  for (const [key, val] of Object.entries(recordData)) {
    if (key === "formId" || key === "formName" || key === "metadata") continue

    if (val && typeof val === "object" && "value" in val && "label" in val) {
      // Structured field: { fieldId, label, value, type }
      flat[val.label || key] = formatExportValue(val.value, val.type)
    } else {
      // Direct value — use field label from form definition
      const fieldDef = fieldMap.get(key)
      const label = fieldDef?.label || key
      flat[label] = formatExportValue(val, fieldDef?.type)
    }
  }

  return flat
}

/**
 * Format a field value for export (resolve lookups, arrays, objects)
 */
function formatExportValue(value: any, type?: string): string {
  if (value == null || value === "") return ""

  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" ? v.label || v.value || JSON.stringify(v) : String(v))).join("; ")
  }

  if (typeof value === "object") {
    if (value.label) return value.label
    if (value.value) return String(value.value)
    return JSON.stringify(value)
  }

  if (type === "date" || type === "datetime") {
    try {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0]
    } catch { /* use raw */ }
  }

  return String(value)
}

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Export records for a given form. Returns structured data ready for CSV/XLSX.
 * Reusable by API routes and client-side export.
 */
export async function exportFormRecords(
  formId: string,
  selectedFieldIds?: string[]
): Promise<ExportResult> {
  const form = await DatabaseService.getForm(formId)
  if (!form) throw new Error("Form not found")

  const records = await DatabaseService.getFormRecords(formId)

  // Build field map: fieldId → { label, type }
  const fieldMap = new Map<string, { label: string; type: string }>()
  const allFields: { id: string; label: string; type: string; order: number }[] = []

  ;(form as any).sections?.forEach((section: any) => {
    section.fields?.forEach((field: any) => {
      fieldMap.set(field.id, { label: field.label, type: field.type })
      allFields.push({ id: field.id, label: field.label, type: field.type, order: field.order ?? 0 })
    })
  })

  // Determine which fields to include
  const fieldsToExport = selectedFieldIds?.length
    ? allFields.filter((f) => selectedFieldIds.includes(f.id))
    : allFields

  fieldsToExport.sort((a, b) => a.order - b.order)

  const headers = fieldsToExport.map((f) => f.label)

  // Flatten each record
  const rows: ExportRecordRow[] = records.map((record: any) => {
    const flat = flattenRecordData(record.recordData || {}, fieldMap)
    const row: ExportRecordRow = {}
    for (const field of fieldsToExport) {
      row[field.label] = flat[field.label] ?? ""
    }
    // Add system fields
    row["Record ID"] = record.id
    row["Submitted At"] = record.submittedAt ? new Date(record.submittedAt).toISOString() : ""
    return row
  })

  if (!headers.includes("Record ID")) headers.push("Record ID")
  if (!headers.includes("Submitted At")) headers.push("Submitted At")

  return {
    formName: (form as any).name || "export",
    headers,
    rows,
    totalRecords: records.length,
  }
}

// ─── Import ──────────────────────────────────────────────────────────────────

/**
 * Process parsed rows and create records. Reusable by API routes.
 */
export async function processImportRows(
  formId: string,
  mappings: { sourceColumn: string; targetFieldId: string }[],
  rows: Record<string, any>[],
  userId?: string
): Promise<{ success: number; failed: number; skipped: number; results: ImportRowResult[] }> {
  const form = await DatabaseService.getForm(formId)
  if (!form) throw new Error("Form not found")

  // Ensure table mapping exists
  let tableMapping = await prisma.formTableMapping.findUnique({ where: { formId } })
  if (!tableMapping) {
    const existing = await prisma.formTableMapping.findMany({ select: { storageTable: true } })
    const counts: Record<string, number> = {}
    existing.forEach((m) => { counts[m.storageTable] = (counts[m.storageTable] || 0) + 1 })

    let bestTable = "form_records_1"
    let minCount = Infinity
    for (let i = 1; i <= 15; i++) {
      const t = `form_records_${i}`
      const c = counts[t] || 0
      if (c < minCount) { minCount = c; bestTable = t }
    }

    tableMapping = await prisma.formTableMapping.create({ data: { formId, storageTable: bestTable } })
  }

  // Build field map
  const fields = (form as any).sections?.flatMap((s: any) => s.fields || []) || []
  const fieldMap = new Map<string, any>()
  fields.forEach((f: any) => fieldMap.set(f.id, f))

  let success = 0, failed = 0, skipped = 0
  const results: ImportRowResult[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const normRow: Record<string, string> = {}
    Object.entries(row).forEach(([k, v]) => { normRow[normalizeKey(k)] = String(v || "").trim() })

    const recordData: Record<string, any> = {}
    let hasData = false

    for (const m of mappings) {
      let val = normRow[normalizeKey(m.sourceColumn)]
      if (val === undefined) {
        const match = Object.keys(normRow).find((k) => k.toLowerCase() === m.sourceColumn.toLowerCase())
        if (match) val = normRow[match]
      }
      if (val) {
        recordData[m.targetFieldId] = val
        hasData = true
      }
    }

    if (!hasData) {
      skipped++
      results.push({ row: i + 1, status: "skipped" })
      continue
    }

    try {
      // Transform to structured format with field metadata
      const structured: Record<string, any> = {}
      for (const [fieldId, value] of Object.entries(recordData)) {
        const fDef = fieldMap.get(fieldId)
        structured[fieldId] = fDef
          ? { fieldId, label: fDef.label, type: fDef.type, value, sectionId: null, order: fDef.order ?? 0 }
          : { fieldId, label: fieldId, type: "text", value, sectionId: null, order: 999 }
      }

      await DatabaseService.createFormRecord(formId, structured, "system", undefined, undefined, undefined, userId)
      success++
      results.push({ row: i + 1, status: "success" })
    } catch (err: any) {
      failed++
      results.push({ row: i + 1, status: "failed", error: err.message })
    }
  }

  return { success, failed, skipped, results }
}
