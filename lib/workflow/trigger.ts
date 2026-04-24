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

export type WorkflowAction = "Create" | "Edit" | "Create or Edit" | "Delete"

interface TriggerInput {
  moduleName: string
  action: WorkflowAction
  organizationId: string
  userId: string
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
  emailToField?: string
  emailSubject?: string
  emailBody?: string
  emailFrom?: string
  emailReplyTo?: string
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
          emailSubject: typeof entry.emailSubject === "string" ? entry.emailSubject : undefined,
          emailBody: typeof entry.emailBody === "string" ? entry.emailBody : undefined,
          emailFrom: typeof entry.emailFrom === "string" ? entry.emailFrom : undefined,
          emailReplyTo: typeof entry.emailReplyTo === "string" ? entry.emailReplyTo : undefined,
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
 */
function getRecordFieldValue(
  recordData: Record<string, any> | undefined,
  fieldId: string
): any {
  if (!recordData) return undefined
  if (Object.prototype.hasOwnProperty.call(recordData, fieldId)) {
    const v = (recordData as any)[fieldId]
    return v && typeof v === "object" && "value" in v ? v.value : v
  }
  const sections = (recordData as any).sections
  if (sections && typeof sections === "object") {
    for (const s of Object.values(sections) as any[]) {
      const f = s?.fields?.[fieldId]
      if (f !== undefined) return f && typeof f === "object" && "value" in f ? f.value : f
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
    const { moduleName, action, organizationId, userId, recordId, recordData } = input

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
      if (!actionMatchesRule(rule.recordAction, action)) continue
      const conds = (rule.conditions as any[]) || null
      if (!evaluateConditions(rule.conditionType, conds, recordData)) continue

      const actions = normalizeActions(rule.instantActions)
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

        // Email Notification — render {{api_name}} placeholders against the
        // record and send via SMTP. Recipient comes from the user-picked
        // record field (emailToField). Missing/empty recipient = skip silently;
        // we don't want to noisily fail when e.g. an HR record is created
        // without an email address filled in yet.
        if (act.type === "Email Notification") {
          if (!act.emailToField) continue
          const rawTo = getRecordFieldValue(recordData, act.emailToField)
          const toAddress = typeof rawTo === "string" ? rawTo.trim() : ""
          if (!toAddress) {
            console.warn(
              `[workflow] rule "${rule.name}" email skipped — field "${act.emailToField}" empty on record`
            )
            continue
          }
          try {
            const fieldMap = await getFieldMap()
            const subject =
              renderEmailTemplate(act.emailSubject || "", recordData, fieldMap) ||
              act.emailName ||
              `Notification from ${moduleName}`
            const body = renderEmailTemplate(act.emailBody || "", recordData, fieldMap)
            const result = await sendWorkflowEmail({
              to: toAddress,
              subject,
              body,
              from: act.emailFrom || undefined,
              replyTo: act.emailReplyTo || undefined,
            })
            if (!result.success) {
              console.warn(
                `[workflow] rule "${rule.name}" email to "${toAddress}" failed: ${result.error}`
              )
            }
          } catch (err) {
            console.error(
              `[workflow] rule "${rule.name}" email send threw`,
              err
            )
          }
          continue
        }

        if (act.type !== "Function") continue
        if (!act.functionId) continue
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
