/**
 * Workflow trigger entry point.
 *
 * Call `triggerWorkflowsForRecord(...)` after a record CRUD operation. It will
 * find every active WorkflowRule for the module that matches the action,
 * evaluate any conditions, and execute the rule's attached `Function` actions
 * (other action types are queued for the future execution engine — they no-op
 * for now but the rule fires are still logged).
 *
 * This is fire-and-forget by design: callers should NOT await it from a
 * request handler. Any failure is swallowed and logged so a misbehaving
 * workflow can never break a normal record save.
 */

import { prisma } from "@/lib/prisma"
import { executeFunction } from "@/lib/functions/executor"
import { attachApiNames } from "@/lib/functions/apiName"
import { DatabaseService } from "@/lib/database/database-service"
import { sendWorkflowEmail } from "@/lib/email"
import { decryptStoredSmtpPass } from "@/lib/workflow/email-secrets"

export type WorkflowAction = "Create" | "Edit" | "Create or Edit" | "Delete"

interface TriggerInput {
  moduleName: string
  action: WorkflowAction
  organizationId: string
  /**
   * Acting user. Optional — anonymous public-form submissions fire workflows
   * too (System / Email Notifications and Field Updates don't need a user
   * context). Function actions that require an actor will be skipped when
   * userId is absent.
   */
  userId?: string | null
  /**
   * The form whose submission triggered this run. Lets the System
   * Notification action's form-scope filter compare directly without
   * walking the 15 sharded record tables.
   */
  formId?: string
  recordId?: string
  recordData?: Record<string, any>
}

interface InstantActionEntry {
  type: string
  functionId?: string
  functionName?: string
  // For type === "Field Update"
  targetFieldId?: string
  targetValue?: string
  // For type === "Email Notification"
  emailName?: string
  /**
   * Field on the record whose value is the recipient email. Optional —
   * `emailToStatic` and `emailToRoleIds` are alternative recipient sources
   * that can be combined with this. At least one source must resolve to
   * a non-empty address for the email to dispatch.
   */
  emailToField?: string
  /** Comma- or semicolon-separated list of literal email addresses. */
  emailToStatic?: string
  /** Roles whose users will receive the email at their account email. */
  emailToRoleIds?: string[]
  emailSubject?: string
  emailBody?: string
  emailFrom?: string
  emailReplyTo?: string
  /**
   * SMTP credentials for the sender. Required so the email is authenticated
   * as the picked sender — otherwise relaying SMTP servers rewrite the
   * visible `From` to the env-level auth account. `emailSmtpUser` defaults
   * to `emailFrom` if absent on the rule.
   */
  emailSmtpUser?: string
  emailSmtpPass?: string
  /** Field IDs whose values get appended to the body, mirroring System Notification. */
  emailFieldIds?: string[]
  // For type === "System Notification"
  notifyName?: string
  notifyRoleIds?: string[]
  notifyFormId?: string
  notifyFieldIds?: string[]
  notifyTitle?: string
  notifyMessage?: string
  // For type === "Report Export" — generate an XLSX from a data source and
  // email it to the same recipient sources as Email Notification (minus
  // emailToField, since scheduled runs have no triggering record).
  reportName?: string
  reportDataSource?: string // "attendance" | "form-module"
  reportModuleName?: string // required for "form-module"
  reportPeriod?: string // "daily" | "weekly" | "monthly" | "all-time"
  reportTimezone?: string
  reportFieldIds?: string[]
  reportFormIds?: string[]
  reportFilters?: Array<{ field: string; operator: string; value?: string }>
  reportSortBy?: string
  reportSortDir?: string // "asc" | "desc"
  reportFilenameTemplate?: string
  reportMaxRows?: number
  reportSheetName?: string
}

function normalizeActions(raw: unknown): InstantActionEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry: any): InstantActionEntry | null => {
      if (typeof entry === "string") return { type: entry }
      if (entry && typeof entry === "object" && typeof entry.type === "string") {
        return {
          type: entry.type,
          functionId: typeof entry.functionId === "string" ? entry.functionId : undefined,
          functionName: typeof entry.functionName === "string" ? entry.functionName : undefined,
          targetFieldId: typeof entry.targetFieldId === "string" ? entry.targetFieldId : undefined,
          targetValue: typeof entry.targetValue === "string" ? entry.targetValue : undefined,
          emailName: typeof entry.emailName === "string" ? entry.emailName : undefined,
          emailToField: typeof entry.emailToField === "string" ? entry.emailToField : undefined,
          emailToStatic: typeof entry.emailToStatic === "string" ? entry.emailToStatic : undefined,
          emailToRoleIds: Array.isArray(entry.emailToRoleIds)
            ? entry.emailToRoleIds.filter((x: any) => typeof x === "string")
            : undefined,
          emailSubject: typeof entry.emailSubject === "string" ? entry.emailSubject : undefined,
          emailBody: typeof entry.emailBody === "string" ? entry.emailBody : undefined,
          emailFrom: typeof entry.emailFrom === "string" ? entry.emailFrom : undefined,
          emailReplyTo: typeof entry.emailReplyTo === "string" ? entry.emailReplyTo : undefined,
          emailSmtpUser: typeof entry.emailSmtpUser === "string" ? entry.emailSmtpUser : undefined,
          emailSmtpPass: typeof entry.emailSmtpPass === "string" ? entry.emailSmtpPass : undefined,
          emailFieldIds: Array.isArray(entry.emailFieldIds)
            ? entry.emailFieldIds.filter((x: any) => typeof x === "string")
            : undefined,
          notifyName: typeof entry.notifyName === "string" ? entry.notifyName : undefined,
          notifyRoleIds: Array.isArray(entry.notifyRoleIds)
            ? entry.notifyRoleIds.filter((x: any) => typeof x === "string")
            : undefined,
          notifyFormId: typeof entry.notifyFormId === "string" ? entry.notifyFormId : undefined,
          notifyFieldIds: Array.isArray(entry.notifyFieldIds)
            ? entry.notifyFieldIds.filter((x: any) => typeof x === "string")
            : undefined,
          notifyTitle: typeof entry.notifyTitle === "string" ? entry.notifyTitle : undefined,
          notifyMessage: typeof entry.notifyMessage === "string" ? entry.notifyMessage : undefined,
          reportName: typeof entry.reportName === "string" ? entry.reportName : undefined,
          reportDataSource: typeof entry.reportDataSource === "string" ? entry.reportDataSource : undefined,
          reportModuleName: typeof entry.reportModuleName === "string" ? entry.reportModuleName : undefined,
          reportPeriod: typeof entry.reportPeriod === "string" ? entry.reportPeriod : undefined,
          reportTimezone: typeof entry.reportTimezone === "string" ? entry.reportTimezone : undefined,
          reportFieldIds: Array.isArray(entry.reportFieldIds)
            ? entry.reportFieldIds.filter((x: any) => typeof x === "string")
            : undefined,
          reportFormIds: Array.isArray(entry.reportFormIds)
            ? entry.reportFormIds.filter((x: any) => typeof x === "string")
            : undefined,
          reportFilters: Array.isArray(entry.reportFilters)
            ? entry.reportFilters
                .filter(
                  (f: any) =>
                    f && typeof f.field === "string" && typeof f.operator === "string",
                )
                .map((f: any) => ({
                  field: f.field,
                  operator: f.operator,
                  value: typeof f.value === "string" ? f.value : "",
                }))
            : undefined,
          reportSortBy: typeof entry.reportSortBy === "string" ? entry.reportSortBy : undefined,
          reportSortDir:
            entry.reportSortDir === "asc" || entry.reportSortDir === "desc"
              ? entry.reportSortDir
              : undefined,
          reportFilenameTemplate:
            typeof entry.reportFilenameTemplate === "string" ? entry.reportFilenameTemplate : undefined,
          reportMaxRows:
            typeof entry.reportMaxRows === "number" && Number.isFinite(entry.reportMaxRows)
              ? entry.reportMaxRows
              : undefined,
          reportSheetName:
            typeof entry.reportSheetName === "string" ? entry.reportSheetName : undefined,
        }
      }
      return null
    })
    .filter((a): a is InstantActionEntry => a !== null)
}

/**
 * Read a single field's value from a record regardless of storage shape.
 * Records come in either flat ({ fieldId: value }) or structured
 * ({ sections: { [sid]: { fields: { [fid]: value | { value } } } } }) form.
 *
 * Also searches subforms — both top-level (recordData.subforms) and
 * section-nested (recordData.sections[sid].subforms). Without this an
 * Email Notification's "To" field that lives inside a subform was always
 * resolving to undefined and the email got silently skipped.
 */
function getRecordFieldValue(
  recordData: Record<string, any> | undefined,
  fieldId: string
): any {
  if (!recordData) return undefined
  const unwrap = (v: any) =>
    v && typeof v === "object" && "value" in v ? v.value : v

  if (Object.prototype.hasOwnProperty.call(recordData, fieldId)) {
    return unwrap((recordData as any)[fieldId])
  }

  // 1) Sections + per-section subforms
  const sections = (recordData as any).sections
  if (sections && typeof sections === "object") {
    for (const s of Object.values(sections) as any[]) {
      const f = s?.fields?.[fieldId]
      if (f !== undefined) return unwrap(f)
      const sectionSubforms = s?.subforms
      if (sectionSubforms && typeof sectionSubforms === "object") {
        for (const sf of Object.values(sectionSubforms) as any[]) {
          const sff = sf?.fields?.[fieldId]
          if (sff !== undefined) return unwrap(sff)
        }
      }
    }
  }

  // 2) Top-level subforms (older records put subforms here, not under sections)
  const subforms = (recordData as any).subforms
  if (subforms && typeof subforms === "object") {
    for (const sf of Object.values(subforms) as any[]) {
      const sff = sf?.fields?.[fieldId]
      if (sff !== undefined) return unwrap(sff)
      // Subform rows — grab the first row's value if a repeating subform
      // has multiple entries; better than returning undefined.
      const rows = sf?.rows
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const rowField = row?.fields?.[fieldId]
          if (rowField !== undefined) return unwrap(rowField)
        }
      }
    }
  }

  return undefined
}

/**
 * Substitute {{api_name}} / {{Field Label}} / {{fieldId}} placeholders in a
 * subject or body string using the module's field map + the record's current
 * values. Unknown placeholders render as an empty string — matches the
 * permissive philosophy of the condition evaluator (a misspelled placeholder
 * shouldn't block the email from going out).
 */
function renderEmailTemplate(
  template: string,
  recordData: Record<string, any> | undefined,
  fieldMap: Map<string, string>
): string {
  if (!template) return ""
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, rawKey) => {
    const key = String(rawKey).trim()
    const fieldId = fieldMap.get(key)
    if (!fieldId) return ""
    const v = getRecordFieldValue(recordData, fieldId)
    return v == null ? "" : String(v)
  })
}

/**
 * Load every field (sections + subforms) for every form in a module and stamp
 * stable API Names on them. Used to resolve a Function action's return keys
 * (e.g. `{ Result: "Hello" }`) into the `fieldId` we need for the DB write.
 *
 * Cached per-trigger-run by the caller — cheap enough to query once per rule
 * and reuse for every action.
 */
async function loadModuleFieldMap(
  moduleName: string,
  organizationId: string
): Promise<Map<string, string>> {
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
              subforms: {
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
      },
    },
  })
  const flat: Array<{ id: string; label: string }> = []
  for (const f of mod?.forms || []) {
    for (const s of f.sections) {
      for (const fld of s.fields) flat.push({ id: fld.id, label: fld.label })
      for (const sf of s.subforms) for (const fld of sf.fields) flat.push({ id: fld.id, label: fld.label })
    }
  }
  const withApi = attachApiNames(flat)
  // Map both apiName and label to fieldId so scripts can return either key.
  const map = new Map<string, string>()
  for (const f of withApi) {
    if (f.apiName) map.set(f.apiName, f.id)
    if (f.label) map.set(f.label, f.id)
    map.set(f.id, f.id) // allow scripts that return raw fieldIds too
  }
  return map
}

/**
 * Load a record's current `recordData` regardless of which storage table it
 * lives in. Records are sharded across `form_records_unified` and fifteen
 * legacy `form_records_N` tables (see DatabaseRecords.createFormRecord); this
 * walks them in order and returns the first hit.
 */
async function loadRecordData(recordId: string): Promise<any | null> {
  try {
    const r = await prisma.formRecord.findUnique({
      where: { id: recordId },
      select: { recordData: true },
    })
    if (r) return r.recordData
  } catch {}
  for (let i = 1; i <= 15; i++) {
    const t = `formRecord${i}`
    try {
      const r = await (prisma as any)[t].findUnique({
        where: { id: recordId },
        select: { recordData: true },
      })
      if (r) return r.recordData
    } catch {}
  }
  return null
}

/**
 * Apply any number of field updates to a record in a single DB write.
 * `updates` is keyed by fieldId. Unknown fieldIds silently skipped so a
 * misnamed return key doesn't error out the whole rule.
 *
 * Writes via `DatabaseService.updateFormRecord` which routes to the correct
 * numbered table (plus mirrors to the unified table via dual-write). Writing
 * through raw `prisma.formRecord.update` would only patch the unified table
 * and the records list — which reads from the numbered table — would never
 * reflect the change. That's the bug this helper fixes.
 */
async function patchRecordFields(
  recordId: string,
  updates: Record<string, any>
): Promise<void> {
  if (Object.keys(updates).length === 0) return

  const current = await loadRecordData(recordId)
  if (current == null) return

  const data: any = typeof current === "object" && current !== null ? current : {}
  if (!data.sections || typeof data.sections !== "object") data.sections = {}

  // For each fieldId, find its owning section and overwrite; if no section
  // owns it, drop into a synthetic `__workflow` bucket so the value still
  // round-trips into recordData (visible in the table via fallback lookup).
  for (const [fieldId, value] of Object.entries(updates)) {
    let patched = false
    for (const s of Object.values(data.sections) as any[]) {
      const fields = s?.fields
      if (fields && typeof fields === "object" && fieldId in fields) {
        const existing = fields[fieldId]
        if (existing && typeof existing === "object" && "value" in existing) {
          fields[fieldId] = { ...existing, value }
        } else {
          fields[fieldId] = value
        }
        patched = true
        break
      }
    }
    if (!patched) {
      if (!data.sections.__workflow) data.sections.__workflow = { fields: {} }
      data.sections.__workflow.fields[fieldId] = value
    }
  }

  await DatabaseService.updateFormRecord(recordId, { recordData: data } as any)
}

function actionMatchesRule(ruleAction: string | null | undefined, fired: WorkflowAction): boolean {
  if (!ruleAction) return false
  if (ruleAction === fired) return true
  if (ruleAction === "Create or Edit" && (fired === "Create" || fired === "Edit")) return true
  return false
}

/**
 * Very small condition evaluator. Conditions reference fields by id within
 * `recordData`. Until the rule UI lets users pick rich operators per field
 * type, we keep it permissive: unknown operators short-circuit to "match".
 */
function evaluateConditions(
  conditionType: string,
  conditions: any[] | null | undefined,
  recordData: Record<string, any> | undefined
): boolean {
  if (conditionType === "all" || !conditions || conditions.length === 0) return true
  if (!recordData) return false

  return conditions.every((c: any) => {
    if (!c?.field || !c?.operator) return true
    const left = getRecordFieldValue(recordData, c.field)
    const right = c.value
    switch (c.operator) {
      case "is":
      case "equals":
      case "=":
        return String(left ?? "") === String(right ?? "")
      case "is not":
      case "!=":
        return String(left ?? "") !== String(right ?? "")
      case "contains":
        return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase())
      case "is empty":
        return left === undefined || left === null || left === ""
      case "is not empty":
        return !(left === undefined || left === null || left === "")
      default:
        // Unknown operator → treat as match so we don't silently drop firings.
        return true
    }
  })
}

export async function triggerWorkflowsForRecord(input: TriggerInput): Promise<void> {
  try {
    const { moduleName, action, organizationId, userId, formId, recordId, recordData } = input

    const rules = await prisma.workflowRule.findMany({
      where: {
        organizationId,
        moduleName,
        active: true,
        executeBasedOn: "record-action",
      },
      select: {
        id: true,
        name: true,
        recordAction: true,
        conditionType: true,
        conditions: true,
        instantActions: true,
      },
    })

    console.log(
      `[workflow] trigger fired — module="${moduleName}" action="${action}" formId=${formId || "?"} recordId=${recordId || "?"} userId=${userId || "(anonymous)"} → ${rules.length} active rule(s)`
    )

    // Resolve the module's field map once per trigger pass. Cheap enough to
    // reuse across every rule + every Function action below.
    let fieldMapPromise: Promise<Map<string, string>> | null = null
    const getFieldMap = () => {
      if (!fieldMapPromise) {
        fieldMapPromise = loadModuleFieldMap(moduleName, organizationId).catch(() => new Map())
      }
      return fieldMapPromise
    }

    for (const rule of rules) {
      if (!actionMatchesRule(rule.recordAction, action)) {
        console.log(
          `[workflow] rule "${rule.name}" skipped — recordAction="${rule.recordAction}" does not match fired="${action}"`
        )
        continue
      }
      const conds = (rule.conditions as any[]) || null
      if (!evaluateConditions(rule.conditionType, conds, recordData)) {
        console.log(`[workflow] rule "${rule.name}" skipped — conditions not satisfied`)
        continue
      }

      const actions = normalizeActions(rule.instantActions)
      console.log(
        `[workflow] rule "${rule.name}" matched — running ${actions.length} action(s): ${actions.map((a) => a.type).join(", ") || "(none)"}`
      )
      for (const act of actions) {
        // Field Update — patch a single field on the record in-place. Runs
        // even for anonymous users (workflow is server-side, no auth gate).
        if (act.type === "Field Update") {
          if (!recordId || !act.targetFieldId) continue
          try {
            await patchRecordFields(recordId, {
              [act.targetFieldId]: act.targetValue ?? "",
            })
          } catch (err) {
            console.error(
              `[workflow] rule "${rule.name}" field update failed`,
              err
            )
          }
          continue
        }

        // System Notification — fan-out one in-app notification per user
        // assigned to any of the chosen roles. Title/body templates accept
        // {{field}} placeholders the same way Email Notification does. The
        // selected fields are stored as structured data on each row so the
        // bell's detail dialog can render them as a clean table.
        if (act.type === "System Notification") {
          if (!act.notifyRoleIds || act.notifyRoleIds.length === 0) {
            console.warn(
              `[workflow] rule "${rule.name}" system notification skipped — no roles configured`
            )
            continue
          }
          // notifyFormId scopes the notification to a specific form within
          // the module. The trigger now gets the form id directly from the
          // caller (see submit/route.ts), so we just compare — no fragile
          // walk through the 15 sharded record tables.
          if (act.notifyFormId && formId && formId !== act.notifyFormId) {
            continue
          }

          try {
            const fieldMap = await getFieldMap()
            const title =
              renderEmailTemplate(act.notifyTitle || "", recordData, fieldMap) ||
              act.notifyName ||
              `${moduleName} — ${action}`

            // Inverse maps (fieldId → label, fieldId → apiName) for the
            // structured payload the detail popup renders as a table.
            const idToLabel = new Map<string, string>()
            const idToApiName = new Map<string, string>()
            for (const [k, v] of fieldMap.entries()) {
              if (k === v) continue // raw fieldId entry
              // First key seen for a given fieldId tends to be the apiName
              // (loadModuleFieldMap adds apiName before label). The label
              // pass overwrites apiName, so track both separately.
              if (!idToApiName.has(v)) idToApiName.set(v, k)
              idToLabel.set(v, k)
            }

            // Structured field payload — admin-selected fields with their
            // current values on this record. Only fields that have a value
            // make it through; empty ones are skipped to keep the popup tidy.
            const fieldsPayload: Array<{ label: string; apiName: string; value: any }> = []
            for (const fid of act.notifyFieldIds || []) {
              const v = getRecordFieldValue(recordData, fid)
              if (v === undefined || v === null || v === "") continue
              const label = idToLabel.get(fid) || fid
              const apiName = idToApiName.get(fid) || fid
              const safeValue = typeof v === "object" ? JSON.stringify(v) : String(v)
              fieldsPayload.push({ label, apiName, value: safeValue })
            }

            // Body now stores ONLY the rendered message template — the field
            // summary lives in `data.fields` so the detail popup can render
            // it as a definition list. Bell list previews still get a useful
            // one-liner from the message.
            const body = renderEmailTemplate(act.notifyMessage || "", recordData, fieldMap)

            // Resolve recipients — every user in the org with a unit
            // assignment under any of the chosen roles. Distinct so a user
            // assigned the same role across multiple units only gets one row.
            // Org owners are also included even if they don't have a row in
            // user_unit_assignments — otherwise an "Admin"-targeted rule
            // misses the owner who created the org.
            const [assignments, orgOwners] = await Promise.all([
              prisma.userUnitAssignment.findMany({
                where: {
                  roleId: { in: act.notifyRoleIds },
                  user: { organizationId },
                },
                select: { userId: true },
              }),
              prisma.role.findMany({
                where: { id: { in: act.notifyRoleIds }, isAdmin: true },
                select: { id: true },
              }).then(async (adminRoles) => {
                if (adminRoles.length === 0) return [] as Array<{ id: string }>
                const org = await prisma.organization.findUnique({
                  where: { id: organizationId },
                  select: { ownerId: true },
                })
                return org?.ownerId ? [{ id: org.ownerId }] : []
              }),
            ])
            const recipientIds = Array.from(
              new Set([
                ...assignments.map((a) => a.userId),
                ...orgOwners.map((u) => u.id),
              ])
            )
            if (recipientIds.length === 0) {
              console.warn(
                `[workflow] rule "${rule.name}" system notification — no users found for roles ${JSON.stringify(act.notifyRoleIds)} in org ${organizationId}`
              )
              continue
            }

            // Build a deep link to the originating record when we know the
            // module + record. The dynamic route is /[module_name]/[module_Id]/...
            // — without the moduleId we still have a useful module-level link.
            let link: string | null = null
            try {
              const mod = await prisma.formModule.findFirst({
                where: { name: moduleName, organizationId },
                select: { id: true },
              })
              if (mod?.id) {
                const slug = encodeURIComponent(moduleName)
                link = recordId
                  ? `/${slug}/${mod.id}/${recordId}`
                  : `/${slug}/${mod.id}`
              }
            } catch {}

            // Bulk insert — createMany skips per-row hooks but is by far the
            // cheapest way to fan out to dozens/hundreds of users.
            const notificationData =
              fieldsPayload.length > 0 ? { fields: fieldsPayload } : null

            const buildRow = (uid: string, includeData: boolean) => ({
              recipientId: uid,
              organizationId,
              title,
              body: body || null,
              ...(includeData ? { data: notificationData } : {}),
              ruleId: rule.id,
              ruleName: rule.name,
              moduleName,
              formId: act.notifyFormId || formId || null,
              recordId: recordId || null,
              link,
            })

            // First attempt with the structured `data` payload. If the
            // running Prisma client is stale (generated before the `data`
            // column was added to the schema) it will throw a validation
            // error rejecting the unknown argument. Retry once without
            // `data` so the notification still lands — losing the
            // per-field table is far better than losing the whole row.
            let writeResult: any = null
            try {
              writeResult = await (prisma as any).notification.createMany({
                data: recipientIds.map((uid: string) => buildRow(uid, true)),
                skipDuplicates: true,
              })
            } catch (validationErr: any) {
              const msg = String(validationErr?.message || validationErr || "")
              const looksLikeUnknownDataArg =
                msg.includes("Unknown arg") ||
                msg.includes("Unknown argument") ||
                msg.includes("data")
              if (!looksLikeUnknownDataArg) throw validationErr
              console.warn(
                `[workflow] rule "${rule.name}" system notification — Prisma client appears stale (run \`npx prisma generate && npx prisma db push\`). Retrying without structured \`data\` payload.`
              )
              writeResult = await (prisma as any).notification.createMany({
                data: recipientIds.map((uid: string) => buildRow(uid, false)),
                skipDuplicates: true,
              })
            }
            console.log(
              `[workflow] rule "${rule.name}" system notification dispatched — ${writeResult?.count ?? recipientIds.length} row(s) for ${recipientIds.length} recipient(s)`
            )
          } catch (err: any) {
            console.error(
              `[workflow] rule "${rule.name}" system notification failed:`,
              err?.message || err,
              err?.stack ? `\n${err.stack}` : ""
            )
          }
          continue
        }

        // Email Notification — render {{api_name}} placeholders against the
        // record and send via SMTP. Recipients are the union of three
        // configurable sources: a record field (emailToField), a literal
        // address list (emailToStatic), and the email addresses of every
        // user assigned any of the chosen roles (emailToRoleIds). At least
        // one source must resolve to a non-empty address.
        if (act.type === "Email Notification") {
          try {
            const fieldMap = await getFieldMap()

            // Collect recipients from every source.
            const recipientSet = new Set<string>()

            const isEmailish = (s: string) => /\S+@\S+\.\S+/.test(s)

            if (act.emailToField) {
              const rawTo = getRecordFieldValue(recordData, act.emailToField)
              const value = typeof rawTo === "string" ? rawTo : rawTo == null ? "" : String(rawTo)
              for (const part of value.split(/[,;\s]+/)) {
                const t = part.trim()
                if (t && isEmailish(t)) recipientSet.add(t)
              }
            }

            if (act.emailToStatic) {
              for (const part of act.emailToStatic.split(/[,;\s]+/)) {
                const t = part.trim()
                if (t && isEmailish(t)) recipientSet.add(t)
              }
            }

            if (act.emailToRoleIds && act.emailToRoleIds.length > 0) {
              const [assignments, orgOwners] = await Promise.all([
                prisma.userUnitAssignment.findMany({
                  where: {
                    roleId: { in: act.emailToRoleIds },
                    user: { organizationId },
                  },
                  select: { user: { select: { email: true } } },
                }),
                prisma.role.findMany({
                  where: { id: { in: act.emailToRoleIds }, isAdmin: true },
                  select: { id: true },
                }).then(async (adminRoles) => {
                  if (adminRoles.length === 0) return [] as Array<{ email: string | null }>
                  const org = await prisma.organization.findUnique({
                    where: { id: organizationId },
                    select: { owner: { select: { email: true } } },
                  })
                  return org?.owner ? [{ email: org.owner.email }] : []
                }),
              ])
              for (const a of assignments) {
                const e = (a.user?.email || "").trim()
                if (e && isEmailish(e)) recipientSet.add(e)
              }
              for (const u of orgOwners) {
                const e = (u.email || "").trim()
                if (e && isEmailish(e)) recipientSet.add(e)
              }
            }

            const toAddresses = Array.from(recipientSet)
            if (toAddresses.length === 0) {
              console.warn(
                `[workflow] rule "${rule.name}" email skipped — no recipients resolved (field=${act.emailToField || "—"}, static=${act.emailToStatic || "—"}, roles=${JSON.stringify(act.emailToRoleIds || [])})`
              )
              continue
            }

            const subject =
              renderEmailTemplate(act.emailSubject || "", recordData, fieldMap) ||
              act.emailName ||
              `Notification from ${moduleName}`
            const renderedBody = renderEmailTemplate(act.emailBody || "", recordData, fieldMap)

            // Append a "Field — Value" block when admin selected fields,
            // mirroring the System Notification UX so the recipient sees
            // the relevant record context inline. Empty values skipped.
            const idToLabel = new Map<string, string>()
            for (const [k, v] of fieldMap.entries()) {
              if (k === v) continue
              if (!idToLabel.has(v)) idToLabel.set(v, k)
            }
            const fieldLines: string[] = []
            for (const fid of act.emailFieldIds || []) {
              const v = getRecordFieldValue(recordData, fid)
              if (v === undefined || v === null || v === "") continue
              const label = idToLabel.get(fid) || fid
              fieldLines.push(
                `${label}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`
              )
            }
            const bodyParts = [renderedBody, fieldLines.join("\n")].filter(Boolean)
            const body = bodyParts.join(bodyParts.length === 2 ? "\n\n" : "")

            // Send one email per recipient — keeps replies/bounces clean and
            // lets one bad address not block the rest. SMTP auth uses the
            // picked sender's credentials so the recipient sees the email
            // truly from that user (not the env-level relay account).
            const smtpUser = (act.emailSmtpUser || act.emailFrom || "").trim()
            // Stored ciphertext → plaintext for the SMTP transport. Returns
            // "" on failure; sendWorkflowEmail will then warn and skip.
            const smtpPass = decryptStoredSmtpPass(act.emailSmtpPass)
            let okCount = 0
            for (const to of toAddresses) {
              const result = await sendWorkflowEmail({
                to,
                subject,
                body,
                from: act.emailFrom || undefined,
                replyTo: act.emailReplyTo || undefined,
                smtpUser: smtpUser || undefined,
                smtpPass: smtpPass || undefined,
              })
              if (result.success) {
                okCount++
              } else {
                console.warn(
                  `[workflow] rule "${rule.name}" email to "${to}" failed: ${result.error}`
                )
              }
            }
            console.log(
              `[workflow] rule "${rule.name}" email dispatched — ${okCount}/${toAddresses.length} sent (subject="${subject}", auth=${smtpUser || "(none)"})`
            )
          } catch (err: any) {
            console.error(
              `[workflow] rule "${rule.name}" email send threw:`,
              err?.message || err,
              err?.stack ? `\n${err.stack}` : ""
            )
          }
          continue
        }

        if (act.type !== "Function") continue
        if (!act.functionId) continue
        // Function actions need an actor (userId is required by executeFunction).
        // For anonymous public-form submissions we don't have one — skip the
        // function but keep firing the rest of the rule's actions.
        if (!userId) {
          console.warn(
            `[workflow] rule "${rule.name}" function action skipped — no acting user (anonymous submission)`
          )
          continue
        }
        try {
          const fn = await prisma.crmFunction.findFirst({
            where: { id: act.functionId, organizationId },
            select: { id: true, script: true, displayName: true },
          })
          if (!fn || !fn.script) continue

          const result = await executeFunction({
            script: fn.script,
            organizationId,
            userId,
            input: {
              triggerSource: "workflow",
              ruleId: rule.id,
              ruleName: rule.name,
              moduleName,
              action,
              recordId,
              recordData,
            },
            persistAs: { functionId: fn.id, trigger: "workflow" },
          })
          if (!result.success) {
            console.warn(
              `[workflow] rule "${rule.name}" function "${fn.displayName}" failed: ${result.error}`
            )
            continue
          }

          // Auto-apply the function's return value to the record — matches
          // the behaviour of function bindings with auto-mode. If the script
          // returned `{ <API_Name>: value, ... }`, resolve each key to a
          // fieldId in this module and persist. Keys that don't map to any
          // field are silently skipped (so a helper key like `ok` doesn't
          // cause errors). Callers who want side-effects only can simply
          // `return null` or `return { ok: true }` (neither matches a field).
          const returned = result.result
          if (recordId && returned && typeof returned === "object" && !Array.isArray(returned)) {
            try {
              const fieldMap = await getFieldMap()
              const updates: Record<string, any> = {}
              for (const [key, value] of Object.entries(returned)) {
                if (key === "ok" || key === "error") continue
                const fieldId = fieldMap.get(key)
                if (fieldId) updates[fieldId] = value
              }
              if (Object.keys(updates).length > 0) {
                await patchRecordFields(recordId, updates)
              }
            } catch (err) {
              console.error(
                `[workflow] rule "${rule.name}" function "${fn.displayName}" write-back failed`,
                err
              )
            }
          }
        } catch (fnErr) {
          console.error(`[workflow] failed to invoke function for rule ${rule.id}`, fnErr)
        }
      }
    }
  } catch (err) {
    // Trigger failures must NEVER bubble — they could break the record save.
    console.error("[workflow] triggerWorkflowsForRecord failed", err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule / manual rule execution
//
// runWorkflowRule(ruleId, trigger) is what the workflow scheduler and the
// "Run now" admin endpoint call. It loads the rule, executes every action
// that makes sense without a triggering record (Email Notification, System
// Notification, Report Export, Function), and writes a WorkflowExecution row
// for the admin's history view.
//
// This deliberately does NOT reuse triggerWorkflowsForRecord — that path is
// tightly coupled to a current record (field-value resolution, Field Update,
// per-record placeholders). Scheduled runs have a different shape:
//   - no recordData → {{field}} placeholders render empty
//   - emailToField recipient source is skipped (no record to read from)
//   - Field Update actions are skipped (nothing to update)
//   - Report Export is the headline use case
// ─────────────────────────────────────────────────────────────────────────────

const isEmailish = (s: string) => /\S+@\S+\.\S+/.test(s)

/**
 * Substitute metadata placeholders (date, period, module, rule, organization,
 * recipient) into a subject or body template. Used by both the Report Export
 * action and the schedule-time Email Notification action.
 *
 * Field placeholders like {{Field Label}} / {{api_name}} are NOT touched here
 * — they're handled by `renderEmailTemplate` in the event-based path where a
 * recordData + fieldMap exist. Scheduled runs have no triggering record, so
 * {{Field Label}} resolves to empty.
 *
 * Case-insensitive, whitespace-tolerant: {{ Organization }} works the same as
 * {{Organization}} or {{organization}}. Unknown placeholders are left untouched
 * so an admin can always spot a typo by searching the rendered email for "{{".
 */
function renderMetaPlaceholders(
  template: string,
  ctx: {
    date?: string
    from?: string
    to?: string
    period?: string
    moduleName?: string
    ruleName?: string
    organizationName?: string
    recipient?: string
  },
): string {
  if (!template) return ""
  const map: Record<string, string> = {
    date: ctx.date || "",
    from: ctx.from || ctx.date || "",
    to: ctx.to || ctx.date || "",
    period: ctx.period || "",
    module: ctx.moduleName || "",
    module_name: ctx.moduleName || "",
    rule: ctx.ruleName || "",
    rule_name: ctx.ruleName || "",
    organization: ctx.organizationName || "",
    org: ctx.organizationName || "",
    org_name: ctx.organizationName || "",
    recipient: ctx.recipient || "",
    recipient_email: ctx.recipient || "",
  }
  return template.replace(/\{\{\s*([\w\s]+?)\s*\}\}/g, (whole, rawKey) => {
    const key = String(rawKey).trim().toLowerCase().replace(/\s+/g, "_")
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key]
    return whole // leave unknown placeholders alone (typos stay visible)
  })
}

async function resolveStaticAndRoleEmails(
  emailToStatic: string | undefined,
  emailToRoleIds: string[] | undefined,
  organizationId: string,
): Promise<string[]> {
  const set = new Set<string>()

  if (emailToStatic) {
    for (const part of emailToStatic.split(/[,;\s]+/)) {
      const t = part.trim()
      if (t && isEmailish(t)) set.add(t)
    }
  }

  if (emailToRoleIds && emailToRoleIds.length > 0) {
    const [assignments, orgOwners] = await Promise.all([
      prisma.userUnitAssignment.findMany({
        where: {
          roleId: { in: emailToRoleIds },
          user: { organizationId },
        },
        select: { user: { select: { email: true } } },
      }),
      prisma.role
        .findMany({
          where: { id: { in: emailToRoleIds }, isAdmin: true },
          select: { id: true },
        })
        .then(async (adminRoles) => {
          if (adminRoles.length === 0) return [] as Array<{ email: string | null }>
          const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { owner: { select: { email: true } } },
          })
          return org?.owner ? [{ email: org.owner.email }] : []
        }),
    ])
    for (const a of assignments) {
      const e = (a.user?.email || "").trim()
      if (e && isEmailish(e)) set.add(e)
    }
    for (const u of orgOwners) {
      const e = (u.email || "").trim()
      if (e && isEmailish(e)) set.add(e)
    }
  }

  return Array.from(set)
}

interface ScheduledActionResult {
  type: string
  ok: boolean
  detail?: any
  error?: string
}

export type WorkflowTriggerKind =
  | "schedule"
  | "manual"
  | "record-create"
  | "record-edit"
  | "record-delete"

/**
 * Execute every action on a single rule without a triggering record. Used by
 * the scheduler and the manual "Run now" admin endpoint. Always writes a
 * WorkflowExecution row capturing per-action results.
 */
export async function runWorkflowRule(
  ruleId: string,
  trigger: WorkflowTriggerKind = "manual",
): Promise<{
  success: boolean
  status: "success" | "partial" | "failed" | "skipped"
  results: ScheduledActionResult[]
  error?: string
}> {
  const startedAt = new Date()
  const results: ScheduledActionResult[] = []
  let recipientCount = 0
  let topLevelError: string | undefined

  let rule: any = null
  try {
    rule = await (prisma as any).workflowRule.findUnique({
      where: { id: ruleId },
      select: {
        id: true,
        name: true,
        active: true,
        moduleName: true,
        organizationId: true,
        instantActions: true,
        scheduleTimezone: true,
      },
    })
  } catch (err: any) {
    topLevelError = err?.message || String(err)
  }

  if (!rule) {
    console.warn(`[workflow] runWorkflowRule(${ruleId}) — rule not found`)
    return { success: false, status: "failed", results, error: topLevelError || "rule not found" }
  }
  if (!rule.active) {
    console.log(`[workflow] runWorkflowRule(${ruleId}) — rule inactive, skipping`)
    return { success: true, status: "skipped", results, error: "rule inactive" }
  }

  const actions = normalizeActions(rule.instantActions)
  console.log(
    `[workflow] runWorkflowRule "${rule.name}" (${rule.id}) trigger=${trigger} → ${actions.length} action(s)`,
  )

  // Resolve org name once so {{Organization}} placeholders in templates can
  // render. Falls back to the org id if the lookup fails — better than an
  // empty signoff that says "Best regards, ".
  let organizationName = ""
  try {
    const org = await prisma.organization.findUnique({
      where: { id: rule.organizationId },
      select: { name: true },
    })
    organizationName = org?.name || ""
  } catch {
    /* leave empty */
  }

  // Lazy-load report-builder + email-secrets only when the relevant action
  // type is actually present. Keeps the scheduler boot path light.
  let buildReport: typeof import("@/lib/workflow/report-builder").buildReport | null = null
  let decryptSmtp: typeof import("@/lib/workflow/email-secrets").decryptStoredSmtpPass | null = null

  for (const act of actions) {
    try {
      // ── Email Notification (no record → no field placeholders) ──────────
      if (act.type === "Email Notification") {
        const recipients = await resolveStaticAndRoleEmails(
          act.emailToStatic,
          act.emailToRoleIds,
          rule.organizationId,
        )
        if (recipients.length === 0) {
          results.push({
            type: act.type,
            ok: false,
            error: "no recipients resolved (no static addresses or role users)",
          })
          continue
        }

        if (!decryptSmtp) {
          decryptSmtp = (await import("@/lib/workflow/email-secrets")).decryptStoredSmtpPass
        }
        const smtpUser = (act.emailSmtpUser || act.emailFrom || "").trim() || undefined
        const smtpPass = decryptSmtp(act.emailSmtpPass) || undefined

        // Per-template placeholder substitution. Each recipient gets the
        // same body, but {{recipient}} resolves to that recipient's address
        // so a personalised greeting still works.
        const baseCtx = {
          date: new Date().toISOString().slice(0, 10),
          period: "",
          moduleName: rule.moduleName,
          ruleName: rule.name,
          organizationName,
        }
        const subjectTpl = act.emailSubject || act.emailName || `Workflow: ${rule.name}`
        const bodyTpl = act.emailBody || ""

        let okCount = 0
        for (const to of recipients) {
          const ctx = { ...baseCtx, recipient: to }
          const r = await sendWorkflowEmail({
            to,
            subject: renderMetaPlaceholders(subjectTpl, ctx),
            body: renderMetaPlaceholders(bodyTpl, ctx),
            isHtml: /<[a-z][\s\S]*>/i.test(bodyTpl),
            from: act.emailFrom || undefined,
            replyTo: act.emailReplyTo || undefined,
            smtpUser,
            smtpPass,
          })
          if (r.success) okCount++
        }
        recipientCount += okCount
        results.push({
          type: act.type,
          ok: okCount > 0,
          detail: { sent: okCount, total: recipients.length },
        })
        continue
      }

      // ── Report Export ───────────────────────────────────────────────────
      if (act.type === "Report Export") {
        if (!buildReport) {
          buildReport = (await import("@/lib/workflow/report-builder")).buildReport
        }
        if (!decryptSmtp) {
          decryptSmtp = (await import("@/lib/workflow/email-secrets")).decryptStoredSmtpPass
        }

        const recipients = await resolveStaticAndRoleEmails(
          act.emailToStatic,
          act.emailToRoleIds,
          rule.organizationId,
        )
        if (recipients.length === 0) {
          results.push({
            type: act.type,
            ok: false,
            error: "no recipients resolved",
          })
          continue
        }

        const dataSource = (act.reportDataSource as any) || "form-module"
        const period = (act.reportPeriod as any) || "daily"
        const timezone = act.reportTimezone || rule.scheduleTimezone || null

        let report: any
        try {
          report = await buildReport(
            {
              dataSource,
              moduleName: act.reportModuleName || rule.moduleName,
              period,
              timezone,
              fieldIds: act.reportFieldIds,
              formIds: act.reportFormIds,
              filters: act.reportFilters,
              sortBy: act.reportSortBy,
              sortDir: act.reportSortDir as any,
              filenameTemplate: act.reportFilenameTemplate,
              maxRows: act.reportMaxRows,
              sheetName: act.reportSheetName,
            },
            rule.organizationId,
          )
        } catch (err: any) {
          results.push({
            type: act.type,
            ok: false,
            error: `report build failed: ${err?.message || err}`,
          })
          continue
        }

        const smtpUser = (act.emailSmtpUser || act.emailFrom || "").trim() || undefined
        const smtpPass = decryptSmtp(act.emailSmtpPass) || undefined

        // Resolve placeholders against the actual report context so
        // {{from}}, {{to}}, {{date}}, {{period}}, {{module}}, {{Organization}}
        // become their real values instead of literally appearing in the
        // recipient's inbox. {{recipient}} is per-send.
        const baseCtx = {
          date: new Date().toISOString().slice(0, 10),
          from: report.summary.from,
          to: report.summary.to,
          period,
          moduleName: act.reportModuleName || rule.moduleName,
          ruleName: rule.name,
          organizationName,
        }

        const subjectTpl =
          act.emailSubject ||
          act.reportName ||
          `[${rule.name}] ${report.summary.label}`
        const bodyTpl = `${act.emailBody || ""}${report.htmlSummary || ""}`

        let okCount = 0
        for (const to of recipients) {
          const ctx = { ...baseCtx, recipient: to }
          const r = await sendWorkflowEmail({
            to,
            subject: renderMetaPlaceholders(subjectTpl, ctx),
            body: renderMetaPlaceholders(bodyTpl, ctx),
            isHtml: true,
            from: act.emailFrom || undefined,
            replyTo: act.emailReplyTo || undefined,
            smtpUser,
            smtpPass,
            attachments: [
              {
                filename: report.filename,
                content: report.buffer,
                contentType: report.contentType,
              },
            ],
          })
          if (r.success) okCount++
        }
        recipientCount += okCount
        results.push({
          type: act.type,
          ok: okCount > 0,
          detail: {
            sent: okCount,
            total: recipients.length,
            rowCount: report.summary.rowCount,
            filename: report.filename,
          },
        })
        continue
      }

      // ── System Notification (works without a record — no formId scope) ──
      if (act.type === "System Notification") {
        if (!act.notifyRoleIds || act.notifyRoleIds.length === 0) {
          results.push({
            type: act.type,
            ok: false,
            error: "no roles configured",
          })
          continue
        }

        const [assignments, orgOwners] = await Promise.all([
          prisma.userUnitAssignment.findMany({
            where: {
              roleId: { in: act.notifyRoleIds },
              user: { organizationId: rule.organizationId },
            },
            select: { userId: true },
          }),
          prisma.role
            .findMany({
              where: { id: { in: act.notifyRoleIds }, isAdmin: true },
              select: { id: true },
            })
            .then(async (adminRoles) => {
              if (adminRoles.length === 0) return [] as Array<{ id: string }>
              const org = await prisma.organization.findUnique({
                where: { id: rule.organizationId },
                select: { ownerId: true },
              })
              return org?.ownerId ? [{ id: org.ownerId }] : []
            }),
        ])
        const recipientIds = Array.from(
          new Set([
            ...assignments.map((a) => a.userId),
            ...orgOwners.map((u) => u.id),
          ]),
        )
        if (recipientIds.length === 0) {
          results.push({
            type: act.type,
            ok: false,
            error: "no users found for roles",
          })
          continue
        }

        const title = act.notifyTitle || act.notifyName || `Scheduled: ${rule.name}`
        const body = act.notifyMessage || null

        try {
          await (prisma as any).notification.createMany({
            data: recipientIds.map((uid: string) => ({
              recipientId: uid,
              organizationId: rule.organizationId,
              title,
              body,
              ruleId: rule.id,
              ruleName: rule.name,
              moduleName: rule.moduleName,
            })),
            skipDuplicates: true,
          })
        } catch (err: any) {
          results.push({
            type: act.type,
            ok: false,
            error: err?.message || String(err),
          })
          continue
        }

        recipientCount += recipientIds.length
        results.push({
          type: act.type,
          ok: true,
          detail: { recipients: recipientIds.length },
        })
        continue
      }

      // ── Function (no record context — script gets `triggerSource: "scheduled"`)
      if (act.type === "Function") {
        if (!act.functionId) {
          results.push({ type: act.type, ok: false, error: "no functionId" })
          continue
        }
        const fn = await prisma.crmFunction.findFirst({
          where: { id: act.functionId, organizationId: rule.organizationId },
          select: { id: true, script: true, displayName: true },
        })
        if (!fn || !fn.script) {
          results.push({ type: act.type, ok: false, error: "function not found" })
          continue
        }
        // executeFunction needs a userId. For scheduled runs we use the org
        // owner — matches what the rule's createdBy would imply but is more
        // resilient to a creator being deleted.
        const org = await prisma.organization.findUnique({
          where: { id: rule.organizationId },
          select: { ownerId: true },
        })
        if (!org?.ownerId) {
          results.push({
            type: act.type,
            ok: false,
            error: "org has no owner — function actor unavailable",
          })
          continue
        }
        const r = await executeFunction({
          script: fn.script,
          organizationId: rule.organizationId,
          userId: org.ownerId,
          input: {
            triggerSource: "scheduled",
            ruleId: rule.id,
            ruleName: rule.name,
            moduleName: rule.moduleName,
            trigger,
          },
          persistAs: { functionId: fn.id, trigger: "scheduled" },
        })
        results.push({
          type: act.type,
          ok: r.success,
          error: r.success ? undefined : r.error,
        })
        continue
      }

      // ── Field Update has no meaning without a record — record skipped ──
      if (act.type === "Field Update") {
        results.push({
          type: act.type,
          ok: false,
          error: "field update requires a triggering record — skipped on schedule",
        })
        continue
      }

      results.push({ type: act.type, ok: false, error: "unknown action type" })
    } catch (err: any) {
      results.push({
        type: act.type,
        ok: false,
        error: err?.message || String(err),
      })
    }
  }

  const finishedAt = new Date()
  const okCount = results.filter((r) => r.ok).length
  const status: "success" | "partial" | "failed" =
    okCount === results.length && results.length > 0
      ? "success"
      : okCount === 0
        ? "failed"
        : "partial"

  try {
    await (prisma as any).workflowExecution.create({
      data: {
        ruleId: rule.id,
        organizationId: rule.organizationId,
        trigger,
        status: results.length === 0 ? "skipped" : status,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        actionsRun: results.length,
        recipientCount: recipientCount || null,
        error: topLevelError || results.find((r) => !r.ok)?.error || null,
        details: results as any,
      },
    })
  } catch (err) {
    console.error(`[workflow] runWorkflowRule(${ruleId}) — execution-log write failed:`, err)
  }

  return {
    success: status === "success" || status === "partial",
    status: results.length === 0 ? "skipped" : status,
    results,
  }
}
