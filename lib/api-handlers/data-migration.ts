// lib/api-handlers/data-migration.ts
// Reusable server-side logic for import/export operations

import { prisma } from "@/lib/prisma"
import { DatabaseService } from "@/lib/database/database-service"

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

type FieldMeta = { label: string; type: string; exportLabel: string }

const isLegacyWrapped = (v: any): boolean =>
  v != null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  "label" in v &&
  "value" in v

/**
 * Flatten nested recordData into a flat key-value map keyed by export labels.
 *
 * Handles three storage shapes:
 *  - Slim structured (current):
 *      { sections: { sectionId: { fields: { fieldId: value } } },
 *        subforms: { subformId: { fields, rows: [{ fields }], childSubforms } } }
 *  - Legacy structured wrapper: { sections: { sectionId: { fields: { fieldId: { label, value, type } } } } }
 *  - Old flat: { fieldId: value }
 *
 * Subform values across multiple dynamic rows are joined with "; " under a single column.
 */
function flattenRecordData(
  recordData: Record<string, any>,
  fieldMap: Map<string, FieldMeta>
): Record<string, any> {
  const flat: Record<string, any> = {}

  const setByFieldId = (fieldId: string, value: any) => {
    if (value === undefined) return
    const meta = fieldMap.get(fieldId)
    if (!meta) return // field not in current form definition; skip
    const formatted = formatExportValue(value, meta.type)
    if (formatted === "") return
    const key = meta.exportLabel
    if (flat[key] !== undefined && flat[key] !== "") {
      flat[key] = `${flat[key]}; ${formatted}`
    } else {
      flat[key] = formatted
    }
  }

  // ── Sections (slim or legacy wrapper) ──
  if (recordData.sections && typeof recordData.sections === "object") {
    for (const section of Object.values(recordData.sections) as any[]) {
      const fields = section?.fields || section
      if (fields && typeof fields === "object") {
        for (const [fieldId, fieldData] of Object.entries(fields)) {
          if (isLegacyWrapped(fieldData)) {
            const fd = fieldData as any
            const meta = fieldMap.get(fieldId)
            const key = meta?.exportLabel || fd.label
            flat[key] = formatExportValue(fd.value, meta?.type || fd.type)
          } else {
            setByFieldId(fieldId, fieldData)
          }
        }
      }
    }
  }

  // ── Subforms (recursive: static fields + dynamic rows + childSubforms) ──
  if (recordData.subforms && typeof recordData.subforms === "object") {
    const walk = (sub: any) => {
      if (!sub || typeof sub !== "object") return

      // Static fields directly on the subform
      const fields = sub.fields
      if (fields && typeof fields === "object") {
        for (const [fieldId, value] of Object.entries(fields)) {
          if (isLegacyWrapped(value)) {
            const fd = value as any
            const meta = fieldMap.get(fieldId)
            const key = meta?.exportLabel || fd.label
            const formatted = formatExportValue(fd.value, meta?.type || fd.type)
            if (formatted !== "") {
              flat[key] = flat[key] ? `${flat[key]}; ${formatted}` : formatted
            }
          } else {
            setByFieldId(fieldId, value)
          }
        }
      }

      // Dynamic rows
      const rows = sub.rows
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const rowFields = row?.fields || {}
          for (const [fieldId, value] of Object.entries(rowFields)) {
            setByFieldId(fieldId, value)
          }
        }
      }

      // Child subforms
      const children = sub.childSubforms
      if (children && typeof children === "object") {
        for (const child of Object.values(children) as any[]) walk(child)
      }
    }

    for (const sub of Object.values(recordData.subforms) as any[]) walk(sub)
  }

  // If we already pulled from sections/subforms, return now.
  if (recordData.sections || recordData.subforms) return flat

  // ── Old flat format fallback: { fieldId: value | { value, label, type } } ──
  for (const [key, val] of Object.entries(recordData)) {
    if (key === "formId" || key === "formName" || key === "metadata") continue

    if (isLegacyWrapped(val)) {
      const fd = val as any
      const meta = fieldMap.get(key)
      flat[meta?.exportLabel || fd.label || key] = formatExportValue(
        fd.value,
        meta?.type || fd.type,
      )
    } else {
      setByFieldId(key, val)
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
    // Phone-input fields commonly store { number, countryCode, ... } shapes
    if (value.number || value.phoneNumber) {
      const num = String(value.number || value.phoneNumber)
      const cc = value.countryCode || value.dialCode || ""
      const joined = cc && !num.startsWith("+") ? `${cc}${num}` : num
      return formatPhoneForCsv(joined)
    }
    if (value.label) return String(value.label)
    if (value.value) return String(value.value)
    return JSON.stringify(value)
  }

  if (type === "date" || type === "datetime") {
    try {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0]
    } catch { /* use raw */ }
  }

  const str = String(value)

  // Phone numbers and other long digit strings get parsed by Excel as numbers
  // (and displayed in scientific notation). Wrap them as ="..." so Excel
  // imports them as text from the CSV.
  if (type === "phone" || type === "phone-input" || type === "tel") {
    return formatPhoneForCsv(str)
  }

  return str
}

/**
 * Wrap a phone-like string as an Excel CSV text-formula so Excel preserves
 * it as text instead of parsing it as a number.
 *   "+911234567890"  →  '="+911234567890"'
 * Already-wrapped values pass through unchanged.
 */
function formatPhoneForCsv(raw: string): string {
  if (!raw) return ""
  if (raw.startsWith('="') && raw.endsWith('"')) return raw
  return `="${raw.replace(/"/g, '""')}"`
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

  // Build field map: fieldId → { label, type, exportLabel }
  // Section fields use the bare field label as the column header.
  // Subform fields are prefixed with the subform name path so identical labels
  // across different subforms don't collide in the exported sheet.
  const fieldMap = new Map<string, FieldMeta>()
  const allFields: {
    id: string
    label: string
    exportLabel: string
    type: string
    order: number
  }[] = []

  ;(form as any).sections?.forEach((section: any, sIdx: number) => {
    section.fields?.forEach((field: any, fIdx: number) => {
      const exportLabel = field.label
      fieldMap.set(field.id, {
        label: field.label,
        type: field.type,
        exportLabel,
      })
      allFields.push({
        id: field.id,
        label: field.label,
        exportLabel,
        type: field.type,
        order: (section.order ?? sIdx) * 1000 + (field.order ?? fIdx),
      })
    })
  })

  // Recursively walk subforms (and their childSubforms) to collect every field.
  // Use the bare field label as the column header. If two fields share a label,
  // suffix with " (2)", " (3)" etc. to keep columns distinct.
  const sectionCount = ((form as any).sections?.length ?? 0)
  const usedLabels = new Map<string, number>()
  for (const f of allFields) usedLabels.set(f.exportLabel, 1)

  const uniquifyLabel = (label: string): string => {
    const count = usedLabels.get(label) ?? 0
    if (count === 0) {
      usedLabels.set(label, 1)
      return label
    }
    const next = count + 1
    usedLabels.set(label, next)
    return `${label} (${next})`
  }

  const collectSubformFields = (subforms: any[], baseOrder: number) => {
    let local = 0
    for (const sf of subforms || []) {
      const subBase = baseOrder + local++ * 100000
      ;(sf.fields || []).forEach((field: any, fIdx: number) => {
        if (fieldMap.has(field.id)) return
        const exportLabel = uniquifyLabel(field.label)
        fieldMap.set(field.id, {
          label: field.label,
          type: field.type,
          exportLabel,
        })
        allFields.push({
          id: field.id,
          label: field.label,
          exportLabel,
          type: field.type,
          order: subBase + (field.order ?? fIdx),
        })
      })
      if (sf.childSubforms?.length) {
        collectSubformFields(sf.childSubforms, subBase + 50000)
      }
    }
  }
  collectSubformFields((form as any).subforms || [], (sectionCount + 1) * 1000)

  // Determine which fields to include
  const fieldsToExport = selectedFieldIds?.length
    ? allFields.filter((f) => selectedFieldIds.includes(f.id))
    : allFields

  fieldsToExport.sort((a, b) => a.order - b.order)

  const headers = fieldsToExport.map((f) => f.exportLabel)

  // Flatten each record
  const rows: ExportRecordRow[] = records.map((record: any) => {
    const flat = flattenRecordData(record.recordData || {}, fieldMap)
    const row: ExportRecordRow = {}
    for (const field of fieldsToExport) {
      row[field.exportLabel] = flat[field.exportLabel] ?? ""
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

  // Build field map (sections + all subforms)
  const fields: any[] = []
  for (const s of (form as any).sections || []) {
    fields.push(...(s.fields || []))
  }
  const collectSubformFields = (subforms: any[]) => {
    for (const sf of subforms || []) {
      fields.push(...(sf.fields || []))
      if (sf.childSubforms?.length) collectSubformFields(sf.childSubforms)
    }
  }
  collectSubformFields((form as any).subforms || [])
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