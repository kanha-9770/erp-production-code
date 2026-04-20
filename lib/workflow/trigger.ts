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
        }
      }
      return null
    })
    .filter((a): a is InstantActionEntry => a !== null)
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

  const getValue = (fieldId: string): any => {
    // Records may store either flat { fieldId: value } or structured shapes.
    // Try the flat shape first, then dig into sections/subforms.
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

  return conditions.every((c: any) => {
    if (!c?.field || !c?.operator) return true
    const left = getValue(c.field)
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

    for (const rule of rules) {
      if (!actionMatchesRule(rule.recordAction, action)) continue
      const conds = (rule.conditions as any[]) || null
      if (!evaluateConditions(rule.conditionType, conds, recordData)) continue

      const actions = normalizeActions(rule.instantActions)
      for (const act of actions) {
        if (act.type !== "Function") continue
        if (!act.functionId) continue
        try {
          const fn = await prisma.crmFunction.findFirst({
            where: { id: act.functionId, organizationId },
            select: { id: true, script: true, language: true, displayName: true },
          })
          if (!fn || !fn.script) continue
          if (fn.language && fn.language.toLowerCase() !== "javascript") continue

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
