/**
 * Generic report-builder for the workflow "Report Export" instant action.
 *
 * Two data sources are supported:
 *
 * 1. **attendance** — wraps the existing team-attendance-report generator
 *    (lib/hr/team-attendance-report.ts). The same XLSX an HR admin would
 *    receive from the legacy attendance scheduler, only now driven by a
 *    workflow rule.
 *
 * 2. **form-module** — queries form_records (unified + sharded) for any
 *    FormModule and emits an XLSX with one row per record. Columns are
 *    every section field on every form in the module. Optional period
 *    filtering uses the record's createdAt against the same daily/weekly/
 *    monthly window as the attendance generator.
 *
 * Output is always { filename, buffer, htmlSummary, summary } so the email
 * action can attach the buffer and embed the html in the body uniformly.
 */

import * as XLSX from "xlsx"
import { prisma } from "@/lib/prisma"
import { attachApiNames } from "@/lib/functions/apiName"
import {
  generateTeamAttendanceReport,
  rangeForKind,
  type ReportKind,
} from "@/lib/hr/team-attendance-report"

export type ReportPeriod = "daily" | "weekly" | "monthly" | "all-time"
export type ReportDataSource = "attendance" | "form-module"
export type SortDirection = "asc" | "desc"

export interface ReportFilter {
  field: string // record field id
  operator: string // "equals" | "is not" | "contains" | "is empty" | "is not empty" | ">" | ">=" | "<" | "<="
  value?: string
}

export interface ReportSpec {
  dataSource: ReportDataSource
  moduleName?: string // for form-module
  period?: ReportPeriod
  timezone?: string | null
  /** Optional fieldId allowlist; empty/missing = all fields. */
  fieldIds?: string[]
  /** Optional formId allowlist within the module; empty/missing = all forms. */
  formIds?: string[]
  /** Record-level filters applied AFTER the date window. AND-combined. */
  filters?: ReportFilter[]
  /** Field id to sort by; default = createdAt desc. */
  sortBy?: string
  sortDir?: SortDirection
  /**
   * Filename template — supports {{module}}, {{period}}, {{date}}, {{from}},
   * {{to}}. Defaults to "{{module}}-{{period}}-{{date}}.xlsx".
   */
  filenameTemplate?: string
  /** Hard cap on rows. 1..50000. Default 5000. */
  maxRows?: number
  /** Custom XLSX sheet name. Default "Records". */
  sheetName?: string
}

export interface BuiltReport {
  filename: string
  buffer: Buffer
  contentType: string
  htmlSummary: string
  summary: {
    label: string
    rowCount: number
    from?: string
    to?: string
  }
}

function fmtCellValue(v: any): any {
  if (v == null) return ""
  if (typeof v === "object") return JSON.stringify(v)
  return v
}

function htmlEsc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/**
 * Pluck the value of a field id from a record's `recordData`, regardless of
 * whether it's flat ({ fid: v }) or sectioned ({ sections: { sid: { fields }}})
 * Mirrors getRecordFieldValue in lib/workflow/trigger.ts. Kept inline so the
 * report-builder doesn't reach into trigger.ts internals.
 */
function readField(recordData: any, fieldId: string): any {
  if (!recordData || typeof recordData !== "object") return undefined
  const unwrap = (v: any) =>
    v && typeof v === "object" && "value" in v ? v.value : v

  if (Object.prototype.hasOwnProperty.call(recordData, fieldId)) {
    return unwrap(recordData[fieldId])
  }
  const sections = recordData.sections
  if (sections && typeof sections === "object") {
    for (const s of Object.values(sections) as any[]) {
      const f = s?.fields?.[fieldId]
      if (f !== undefined) return unwrap(f)
    }
  }
  return undefined
}

/**
 * Walk every form in a module and collect (fieldId, label, apiName) tuples
 * across all sections. Subforms are intentionally skipped — repeating-row
 * fields don't fit into a single XLSX cell, so we leave that for a v2.
 */
async function collectModuleColumns(
  moduleName: string,
  organizationId: string,
): Promise<Array<{ fieldId: string; label: string; apiName: string }>> {
  const mod = await prisma.formModule.findFirst({
    where: { name: moduleName, organizationId },
    select: {
      forms: {
        select: {
          sections: {
            orderBy: { order: "asc" },
            select: {
              fields: {
                orderBy: { order: "asc" },
                select: { id: true, label: true },
              },
            },
          },
        },
      },
    },
  })

  const flat: Array<{ id: string; label: string }> = []
  const seen = new Set<string>()
  for (const f of mod?.forms || []) {
    for (const s of f.sections) {
      for (const fld of s.fields) {
        if (seen.has(fld.id)) continue
        seen.add(fld.id)
        flat.push({ id: fld.id, label: fld.label })
      }
    }
  }
  const withApi = attachApiNames(flat)
  return withApi.map((f) => ({
    fieldId: f.id,
    label: f.label,
    apiName: f.apiName ?? f.id,
  }))
}

async function fetchModuleRecords(
  moduleName: string,
  organizationId: string,
  from: Date | null,
  to: Date | null,
  formIdsAllowlist: string[] | null,
  maxRows: number,
): Promise<Array<{ id: string; formId: string; createdAt: Date; recordData: any }>> {
  // Unified table is the primary source going forward. The 15 numbered
  // legacy tables are walked too — every record exists in exactly one of
  // them (or both, since the dual-write mirrors to unified).
  const out: Array<{ id: string; formId: string; createdAt: Date; recordData: any }> = []
  const seen = new Set<string>()

  const dateFilter: any = {}
  if (from) dateFilter.gte = from
  if (to) dateFilter.lte = to

  // Resolve formIds belonging to this module + org so the records query can
  // filter on formId (FormRecord has no direct formModule relation — it goes
  // through Form). If the caller passed a formIds allowlist, intersect.
  let formIds = (
    await prisma.form.findMany({
      where: { module: { name: moduleName, organizationId } },
      select: { id: true },
    })
  ).map((f) => f.id)
  if (formIdsAllowlist && formIdsAllowlist.length > 0) {
    const allowed = new Set(formIdsAllowlist)
    formIds = formIds.filter((id) => allowed.has(id))
  }
  if (formIds.length === 0) return []

  const baseWhere: any = {
    organizationId,
    formId: { in: formIds },
  }
  if (Object.keys(dateFilter).length > 0) baseWhere.createdAt = dateFilter

  // Slight over-fetch from each shard so post-filter sort still has enough
  // rows to honour `maxRows`. Total memory is bounded — caller caps maxRows.
  const perShardCap = Math.max(maxRows, 500)

  try {
    const rows = await prisma.formRecord.findMany({
      where: baseWhere,
      select: { id: true, formId: true, createdAt: true, recordData: true },
      orderBy: { createdAt: "desc" },
      take: perShardCap,
    })
    for (const r of rows) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      out.push({ id: r.id, formId: r.formId, createdAt: r.createdAt, recordData: r.recordData })
    }
  } catch (err) {
    console.warn("[report-builder] formRecord query failed:", err)
  }

  for (let i = 1; i <= 15; i++) {
    const t = `formRecord${i}`
    try {
      const rows = await (prisma as any)[t].findMany({
        where: baseWhere,
        select: { id: true, formId: true, createdAt: true, recordData: true },
        orderBy: { createdAt: "desc" },
        take: perShardCap,
      })
      for (const r of rows as any[]) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
        out.push({ id: r.id, formId: r.formId, createdAt: r.createdAt, recordData: r.recordData })
      }
    } catch {
      /* table missing in this schema build — ignore */
    }
  }

  return out
}

/**
 * Apply admin-defined filters (AND-combined) to a set of records.
 * Operators are intentionally permissive — unknown ops short-circuit to true
 * so a renamed-but-still-stored operator doesn't silently filter everything
 * out and produce an empty report.
 */
function applyReportFilters(
  records: Array<{ recordData: any }>,
  filters: ReportFilter[] | undefined,
): typeof records {
  if (!filters || filters.length === 0) return records
  return records.filter((rec) => {
    for (const c of filters) {
      if (!c.field || !c.operator) continue
      const left = readField(rec.recordData, c.field)
      const right = c.value
      const leftStr = left == null ? "" : String(left)
      const rightStr = right == null ? "" : String(right)
      let pass = true
      switch (c.operator) {
        case "equals":
        case "is":
        case "=":
          pass = leftStr === rightStr
          break
        case "is not":
        case "!=":
          pass = leftStr !== rightStr
          break
        case "contains":
          pass = leftStr.toLowerCase().includes(rightStr.toLowerCase())
          break
        case "does not contain":
          pass = !leftStr.toLowerCase().includes(rightStr.toLowerCase())
          break
        case "is empty":
          pass = left === undefined || left === null || left === ""
          break
        case "is not empty":
          pass = !(left === undefined || left === null || left === "")
          break
        case ">":
        case "greater than":
          pass = Number(left) > Number(right)
          break
        case ">=":
          pass = Number(left) >= Number(right)
          break
        case "<":
        case "less than":
          pass = Number(left) < Number(right)
          break
        case "<=":
          pass = Number(left) <= Number(right)
          break
        default:
          pass = true
      }
      if (!pass) return false
    }
    return true
  })
}

/**
 * Render `{{module}}`, `{{period}}`, `{{date}}`, `{{from}}`, `{{to}}` into
 * a filename. Falls back to the default template on empty input.
 */
function renderFilename(
  template: string | undefined,
  ctx: {
    moduleName: string
    period: string
    date: string
    from?: string
    to?: string
  },
): string {
  const tpl =
    (template && template.trim()) || "{{module}}-{{period}}-{{date}}.xlsx"
  const replaced = tpl
    .replace(/\{\{\s*module\s*\}\}/gi, ctx.moduleName)
    .replace(/\{\{\s*period\s*\}\}/gi, ctx.period)
    .replace(/\{\{\s*date\s*\}\}/gi, ctx.date)
    .replace(/\{\{\s*from\s*\}\}/gi, ctx.from || ctx.date)
    .replace(/\{\{\s*to\s*\}\}/gi, ctx.to || ctx.date)
  // Strip path separators & sanitise.
  return replaced.replace(/[\/\\:*?"<>|]+/g, "_")
}

function safeFilenamePart(s: string): string {
  return String(s).replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 60)
}

/**
 * Compute (from, to) ISO date strings for a given period. Reuses the
 * attendance generator's range helper so daily/weekly/monthly stay aligned.
 * "all-time" returns { null, null } — caller skips the createdAt filter.
 */
export function rangeForPeriod(
  period: ReportPeriod,
  now: Date,
  timezone: string | null | undefined,
): { from: Date | null; to: Date | null; label: string } {
  if (period === "all-time") {
    return { from: null, to: null, label: "all time" }
  }
  const kind = period as ReportKind
  const r = rangeForKind(kind, now, timezone || undefined)
  // r.from / r.to are YYYY-MM-DD (date-only) — convert to UTC bounds so the
  // createdAt filter catches every record on those days regardless of the
  // record's stored timezone.
  const from = new Date(`${r.from}T00:00:00.000Z`)
  const to = new Date(`${r.to}T23:59:59.999Z`)
  return { from, to, label: r.from === r.to ? r.from : `${r.from} → ${r.to}` }
}

/**
 * Build a report on demand. Returns the XLSX buffer + a short HTML summary
 * suitable for embedding in an email body.
 */
export async function buildReport(
  spec: ReportSpec,
  organizationId: string,
  now: Date = new Date(),
): Promise<BuiltReport> {
  // ── Attendance: delegate to the existing battle-tested generator ────────
  if (spec.dataSource === "attendance") {
    const period = (spec.period && spec.period !== "all-time"
      ? spec.period
      : "daily") as ReportKind
    const { from, to } = rangeForKind(period, now, spec.timezone || undefined)
    const r = await generateTeamAttendanceReport(organizationId, from, to, period)
    return {
      filename: r.filename,
      buffer: r.buffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      htmlSummary: r.htmlSummary,
      summary: {
        label: `attendance ${period}`,
        rowCount: r.summary.totalRecords,
        from: r.summary.from,
        to: r.summary.to,
      },
    }
  }

  // ── Form module: generic XLSX export ────────────────────────────────────
  if (!spec.moduleName) {
    throw new Error("ReportSpec.moduleName is required for dataSource=form-module")
  }
  const moduleName = spec.moduleName

  const period = spec.period || "all-time"
  const { from, to, label } = rangeForPeriod(period, now, spec.timezone)

  const maxRows = Math.max(1, Math.min(50000, spec.maxRows ?? 5000))

  const allColumns = await collectModuleColumns(moduleName, organizationId)
  const columns =
    spec.fieldIds && spec.fieldIds.length > 0
      ? allColumns.filter((c) => spec.fieldIds!.includes(c.fieldId))
      : allColumns

  // 1. Fetch (date window + form allowlist + per-shard cap)
  let records = await fetchModuleRecords(
    moduleName,
    organizationId,
    from,
    to,
    spec.formIds && spec.formIds.length > 0 ? spec.formIds : null,
    maxRows,
  )

  // 2. Apply admin-defined filters
  records = applyReportFilters(records, spec.filters)

  // 3. Sort. Default = createdAt desc; sortBy = field id reads from recordData.
  if (spec.sortBy) {
    const dir = spec.sortDir === "asc" ? 1 : -1
    records.sort((a, b) => {
      const av = readField(a.recordData, spec.sortBy!) ?? ""
      const bv = readField(b.recordData, spec.sortBy!) ?? ""
      // Numeric sort if both look numeric, otherwise string compare.
      const an = Number(av)
      const bn = Number(bv)
      if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "") {
        return (an - bn) * dir
      }
      return String(av).localeCompare(String(bv)) * dir
    })
  } else {
    records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  // 4. Cap to maxRows (sort first so the "top N" makes sense).
  if (records.length > maxRows) records = records.slice(0, maxRows)

  // 5. Build the XLSX. Form name column is added when more than one form is
  //    present in the result so admins can tell which form a row came from.
  const distinctForms = new Set(records.map((r) => r.formId))
  const includeFormColumn = distinctForms.size > 1

  // Resolve form name lookup once.
  const formNameById = new Map<string, string>()
  if (includeFormColumn) {
    const forms = await prisma.form.findMany({
      where: { id: { in: Array.from(distinctForms) } },
      select: { id: true, name: true },
    })
    for (const f of forms) formNameById.set(f.id, f.name)
  }

  const headerRow: string[] = ["Record ID", "Created At"]
  if (includeFormColumn) headerRow.push("Form")
  for (const c of columns) headerRow.push(c.label)

  const rows: any[][] = [headerRow]
  for (const rec of records) {
    const row: any[] = [rec.id, rec.createdAt.toISOString()]
    if (includeFormColumn) row.push(formNameById.get(rec.formId) || rec.formId)
    for (const col of columns) {
      row.push(fmtCellValue(readField(rec.recordData, col.fieldId)))
    }
    rows.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    ws,
    (spec.sheetName || "Records").slice(0, 31), // XLSX sheet name limit
  )
  const buffer = Buffer.from(
    XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
  )

  const dateStr = now.toISOString().slice(0, 10)
  const fromStr = from?.toISOString().slice(0, 10)
  const toStr = to?.toISOString().slice(0, 10)
  const filename =
    safeFilenamePart(
      renderFilename(spec.filenameTemplate, {
        moduleName,
        period,
        date: dateStr,
        from: fromStr,
        to: toStr,
      }),
    ) + (spec.filenameTemplate?.toLowerCase().endsWith(".xlsx") ? "" : ".xlsx")

  // Filter summary line — shown in the email body so HR can verify what was
  // applied without opening the XLSX.
  const filtersHtml =
    spec.filters && spec.filters.length > 0
      ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Filters</td><td style="padding:4px 0">${htmlEsc(
          spec.filters
            .filter((f) => f.field && f.operator)
            .map((f) => `${f.field} ${f.operator}${f.value ? ` "${f.value}"` : ""}`)
            .join(" AND "),
        )}</td></tr>`
      : ""
  const formsHtml =
    spec.formIds && spec.formIds.length > 0
      ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Forms</td><td style="padding:4px 0">${spec.formIds.length} selected</td></tr>`
      : ""

  const htmlSummary = `
    <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;margin:8px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Module</td><td style="padding:4px 0"><b>${htmlEsc(moduleName)}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Period</td><td style="padding:4px 0">${htmlEsc(label)}</td></tr>
      ${formsHtml}
      ${filtersHtml}
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Records</td><td style="padding:4px 0">${records.length}${records.length === maxRows ? ` (capped at ${maxRows})` : ""}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b">Columns</td><td style="padding:4px 0">${columns.length}</td></tr>
    </table>
  `

  return {
    filename,
    buffer,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    htmlSummary,
    summary: {
      label: `${moduleName} ${period}`,
      rowCount: records.length,
      from: fromStr,
      to: toStr,
    },
  }
}
