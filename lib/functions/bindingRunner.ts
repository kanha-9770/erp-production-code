/**
 * Function-binding runner.
 *
 * A FunctionBinding ties a CrmFunction to a Form / FormField / FormModule
 * with a trigger event and JSON I/O mappings. This module owns the runtime
 * "wiring" — load bindings for an event, project request data through each
 * binding's inputMapping, hand to the executor, then project the result
 * through the outputMapping.
 *
 * The script body itself stays generic — bindings are what make one
 * function reusable across many forms.
 */

import { prisma } from "@/lib/prisma"
import { executeFunction, type ExecuteResult } from "./executor"

export type BindingEvent =
  | "onFieldChange"
  | "onFieldBlur"
  | "beforeSubmit"
  | "afterCreate"
  | "afterUpdate"
  | "manual"

export interface BindingContext {
  organizationId: string
  userId: string
  /** Flat snapshot of the form's current values, keyed by fieldId. */
  formData?: Record<string, any>
  /** For after* events: the persisted recordId. */
  recordId?: string
  /** For after* events: the structured recordData stored on the row. */
  recordData?: any
  /** Optional fieldId that triggered an onFieldChange / onFieldBlur. */
  triggerFieldId?: string
}

export interface BindingRunResult {
  bindingId: string
  functionId: string
  functionName: string
  ok: boolean
  fieldUpdates: Record<string, any>
  result?: any
  error?: string
  logs: ExecuteResult["logs"]
  durationMs: number
}

const SPECIAL_INPUT_KEYS = new Set([
  "$recordId",
  "$userId",
  "$organizationId",
  "$formData",
  "$recordData",
  "$triggerFieldId",
])

/**
 * Project a binding's inputMapping into a concrete `ctx.input` object.
 *
 * Mapping shape: `{ "<scriptInputKey>": "<source>" }` where source is one of:
 *   - `"$recordId"` / `"$userId"` / `"$organizationId"` — context values
 *   - `"$formData"` / `"$recordData"` — pass the whole snapshot
 *   - `"$triggerFieldId"` — the fieldId that fired the event
 *   - `"<fieldId>"` — pluck that field from formData / recordData
 *   - any other string — treated as a literal constant
 *
 * Anything not declared in the mapping is invisible to the script — that's
 * the security win over passing the raw form snapshot.
 */
function buildInput(
  mapping: Record<string, string>,
  ctx: BindingContext
): Record<string, any> {
  const flatRecordData = flattenRecordDataByFieldId(ctx.recordData)
  const merged: Record<string, any> = { ...flatRecordData, ...(ctx.formData || {}) }
  const input: Record<string, any> = {}

  for (const [key, source] of Object.entries(mapping || {})) {
    if (typeof source !== "string") {
      input[key] = source
      continue
    }
    if (SPECIAL_INPUT_KEYS.has(source)) {
      switch (source) {
        case "$recordId": input[key] = ctx.recordId ?? null; break
        case "$userId": input[key] = ctx.userId; break
        case "$organizationId": input[key] = ctx.organizationId; break
        case "$formData": input[key] = ctx.formData ?? {}; break
        case "$recordData": input[key] = ctx.recordData ?? null; break
        case "$triggerFieldId": input[key] = ctx.triggerFieldId ?? null; break
      }
      continue
    }
    if (source in merged) {
      input[key] = merged[source]
      continue
    }
    // Unknown source — treat as a literal constant so authors can pass static
    // params (e.g. `{ taxRate: "0.18" }`).
    input[key] = source
  }

  return input
}

/**
 * Project the script's return value through outputMapping into a
 * `{ fieldId: value }` patch the client can apply via setFieldValue.
 *
 * If the result is not an object, we map the whole result under the first
 * outputMapping key — this lets a "return a single number" function work
 * without forcing the author to wrap it.
 */
function buildFieldUpdates(
  mapping: Record<string, string>,
  result: any
): Record<string, any> {
  if (!mapping || Object.keys(mapping).length === 0) return {}
  const updates: Record<string, any> = {}

  if (result && typeof result === "object" && !Array.isArray(result)) {
    for (const [returnKey, fieldId] of Object.entries(mapping)) {
      if (returnKey in result) updates[fieldId] = (result as any)[returnKey]
    }
    return updates
  }

  // Scalar / array result → first mapping entry wins.
  const firstFieldId = Object.values(mapping)[0]
  if (firstFieldId) updates[firstFieldId] = result
  return updates
}

/** Flatten the structured `{ sections: { id: { fields: { fieldId: value } } } }`
 *  shape down to `{ fieldId: value }`. Returns `{}` for any other shape. */
function flattenRecordDataByFieldId(recordData: any): Record<string, any> {
  if (!recordData || typeof recordData !== "object") return {}
  const out: Record<string, any> = {}
  const sections = recordData.sections
  if (!sections || typeof sections !== "object") return out
  for (const section of Object.values(sections) as any[]) {
    const fields = section?.fields
    if (!fields || typeof fields !== "object") continue
    for (const [fieldId, entry] of Object.entries(fields)) {
      out[fieldId] =
        entry && typeof entry === "object" && "value" in (entry as any)
          ? (entry as any).value
          : entry
    }
  }
  return out
}

/**
 * Optional condition check. For now we support a tiny equality DSL:
 *   { field: "<fieldId>", equals: <value> }
 * Anything more complex can be expressed inside the script itself.
 */
function passesCondition(condition: any, ctx: BindingContext): boolean {
  if (!condition) return true
  if (typeof condition !== "object") return true
  const merged = { ...flattenRecordDataByFieldId(ctx.recordData), ...(ctx.formData || {}) }
  if (typeof condition.field === "string" && "equals" in condition) {
    return merged[condition.field] === condition.equals
  }
  return true
}

interface LoadOpts {
  organizationId: string
  event: BindingEvent
  formId?: string
  fieldId?: string
  moduleId?: string
  bindingId?: string
}

/** Load active bindings matching the requested scope + event, ordered.
 *
 * If multiple scope keys are provided (e.g. formId AND moduleId for a submit
 * event) they are OR-ed — every binding scoped to ANY of those targets is
 * returned. This matches the "fire all bindings that target this record"
 * intent of submit-time events, where a binding may live at form OR module
 * level and both should run.
 */
async function loadBindings(opts: LoadOpts) {
  const where: Record<string, any> = {
    organizationId: opts.organizationId,
    active: true,
    event: opts.event,
  }
  if (opts.bindingId) where.id = opts.bindingId

  const scopeOr: Record<string, string>[] = []
  if (opts.fieldId) scopeOr.push({ fieldId: opts.fieldId })
  if (opts.formId) scopeOr.push({ formId: opts.formId })
  if (opts.moduleId) scopeOr.push({ moduleId: opts.moduleId })
  if (scopeOr.length === 1) Object.assign(where, scopeOr[0])
  else if (scopeOr.length > 1) where.OR = scopeOr

  return (prisma as any).functionBinding.findMany({
    where,
    include: {
      function: {
        select: { id: true, name: true, displayName: true, language: true, script: true },
      },
    },
    orderBy: { order: "asc" },
  }) as Promise<Array<any>>
}

async function runOne(binding: any, ctx: BindingContext): Promise<BindingRunResult> {
  const fn = binding.function
  if (!fn || !fn.script) {
    return {
      bindingId: binding.id,
      functionId: binding.functionId,
      functionName: fn?.displayName ?? fn?.name ?? "(missing)",
      ok: false,
      fieldUpdates: {},
      error: "Function has no script",
      logs: [],
      durationMs: 0,
    }
  }
  if (fn.language && fn.language.toLowerCase() !== "javascript") {
    return {
      bindingId: binding.id,
      functionId: binding.functionId,
      functionName: fn.displayName ?? fn.name,
      ok: false,
      fieldUpdates: {},
      error: `Cannot execute ${fn.language} functions on the server.`,
      logs: [],
      durationMs: 0,
    }
  }

  const inputMapping = (binding.inputMapping || {}) as Record<string, string>
  const outputMapping = (binding.outputMapping || {}) as Record<string, string>

  if (!passesCondition(binding.condition, ctx)) {
    return {
      bindingId: binding.id,
      functionId: binding.functionId,
      functionName: fn.displayName ?? fn.name,
      ok: true,
      fieldUpdates: {},
      result: null,
      logs: [],
      durationMs: 0,
    }
  }

  const input = buildInput(inputMapping, ctx)
  const exec = await executeFunction({
    script: fn.script,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    input,
  })

  return {
    bindingId: binding.id,
    functionId: binding.functionId,
    functionName: fn.displayName ?? fn.name,
    ok: exec.success,
    fieldUpdates: exec.success ? buildFieldUpdates(outputMapping, exec.result) : {},
    result: exec.success ? exec.result : undefined,
    error: exec.success ? undefined : exec.error,
    logs: exec.logs,
    durationMs: exec.durationMs,
  }
}

/**
 * Execute a single binding by id (used by the form-aware client route).
 * Returns null if the binding isn't found / scoped wrong.
 */
export async function runBindingById(
  bindingId: string,
  ctx: BindingContext,
  scope: { formId?: string; fieldId?: string; moduleId?: string }
): Promise<BindingRunResult | null> {
  const where: Record<string, any> = {
    id: bindingId,
    organizationId: ctx.organizationId,
    active: true,
  }
  if (scope.formId) where.formId = scope.formId
  if (scope.fieldId) where.fieldId = scope.fieldId
  if (scope.moduleId) where.moduleId = scope.moduleId

  const binding = await (prisma as any).functionBinding.findFirst({
    where,
    include: {
      function: {
        select: { id: true, name: true, displayName: true, language: true, script: true },
      },
    },
  })
  if (!binding) return null
  return runOne(binding, ctx)
}

/**
 * Execute every active binding matching scope + event. Used by submit-time
 * hooks (beforeSubmit, afterCreate, afterUpdate). Returns results in the
 * order they ran. The caller decides whether to await / short-circuit.
 */
export async function runBindings(
  event: BindingEvent,
  scope: { formId?: string; fieldId?: string; moduleId?: string },
  ctx: BindingContext
): Promise<BindingRunResult[]> {
  const bindings = await loadBindings({
    organizationId: ctx.organizationId,
    event,
    ...scope,
  })
  const results: BindingRunResult[] = []
  for (const b of bindings) {
    results.push(await runOne(b, ctx))
  }
  return results
}
