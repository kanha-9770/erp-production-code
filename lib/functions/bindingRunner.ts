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
import { attachApiNames } from "./apiName"

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

/** Slim field metadata used by the runner for auto-mapping resolution. */
interface FieldMeta {
  id: string
  label: string
  apiName: string
}

/**
 * Resolve the form id this binding is scoped to. Bindings can scope to a
 * form directly, to a field (in which case we walk up to its parent form),
 * or to a module (in which case we don't pick a single form — the explicit
 * scope.formId passed by the caller wins).
 */
async function resolveFormIdForBinding(
  binding: any,
  scope: { formId?: string; fieldId?: string; moduleId?: string }
): Promise<string | null> {
  if (scope.formId) return scope.formId
  if (binding.formId) return binding.formId
  if (binding.fieldId) {
    const f = await prisma.formField.findFirst({
      where: { id: binding.fieldId },
      select: {
        section: { select: { formId: true } },
        subform: { select: { formId: true } },
      },
    })
    return f?.section?.formId || f?.subform?.formId || null
  }
  return null
}

/**
 * Load the form's fields (id + label) and stamp apiNames so the runner can
 * auto-map without configuration. Cached on the request only — no module
 * reload needed.
 */
async function loadFormFields(formId: string): Promise<FieldMeta[]> {
  const sections = await prisma.formSection.findMany({
    where: { formId },
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
  })
  const flat: Array<{ id: string; label: string }> = []
  for (const s of sections) {
    for (const f of s.fields) flat.push({ id: f.id, label: f.label })
    for (const sf of s.subforms) for (const f of sf.fields) flat.push({ id: f.id, label: f.label })
  }
  return attachApiNames(flat) as FieldMeta[]
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
 * If `mapping` is empty `{}`, **auto-mode** kicks in: every field of the
 * binding's form is exposed in `ctx.input` keyed by its apiName (with the
 * label as a fallback alias). Most bindings need no mapping at all — the
 * script just reads `ctx.input.Email_Address`.
 *
 * If `mapping` has entries, only those are projected — the script sees
 * exactly what the binding author whitelisted. Mapping shape:
 *   `{ "<scriptInputKey>": "<source>" }`
 * where source is one of:
 *   - `"$recordId"` / `"$userId"` / `"$organizationId"` — context values
 *   - `"$formData"` / `"$recordData"` — pass the whole snapshot
 *   - `"$triggerFieldId"` — the fieldId that fired the event
 *   - `"<fieldId>"` — pluck that field from formData / recordData
 *   - any other string — treated as a literal constant
 */
function buildInput(
  mapping: Record<string, string>,
  ctx: BindingContext,
  formFields: FieldMeta[] | null
): Record<string, any> {
  const flatRecordData = flattenRecordDataByFieldId(ctx.recordData)
  const merged: Record<string, any> = { ...flatRecordData, ...(ctx.formData || {}) }

  // Auto-mode: empty mapping → expose every form field by apiName + label.
  // Cheaper than typing one row per field, and matches what scripts read in
  // the common case.
  const isEmpty = !mapping || Object.keys(mapping).length === 0
  if (isEmpty) {
    const input: Record<string, any> = {}
    if (formFields) {
      for (const f of formFields) {
        const v = merged[f.id]
        if (v === undefined) continue
        if (f.apiName && !(f.apiName in input)) input[f.apiName] = v
        if (f.label && !(f.label in input)) input[f.label] = v
      }
    }
    return input
  }

  // Explicit mode: project only the declared keys.
  const input: Record<string, any> = {}
  // Build an apiName/label → fieldId resolver so authors can use any of
  // those forms in the right-hand side.
  const aliasToId = new Map<string, string>()
  if (formFields) {
    for (const f of formFields) {
      aliasToId.set(f.id, f.id)
      if (f.apiName) aliasToId.set(f.apiName, f.id)
      if (f.label) aliasToId.set(f.label, f.id)
    }
  }

  for (const [key, source] of Object.entries(mapping)) {
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
    const resolvedId = aliasToId.get(source) ?? source
    if (resolvedId in merged) {
      input[key] = merged[resolvedId]
      continue
    }
    // Unknown source — treat as a literal constant so authors can pass
    // static params (e.g. `{ taxRate: "0.18" }`).
    input[key] = source
  }

  return input
}

/**
 * Project the script's return value through outputMapping into a
 * `{ fieldId: value }` patch the client can apply via setFieldValue.
 *
 * If `mapping` is empty `{}`, **auto-mode** kicks in: every key of the
 * return object is matched against the form's apiNames (then labels) and
 * applied to the matching field. Most output bindings need no mapping —
 * the script just `return { Email_Address: "...", City: "..." }`.
 *
 * If `mapping` has entries, only those are applied — the script's return
 * object can have other keys but they're ignored.
 *
 * If the result is not an object, the value is treated as a single field
 * write — picks the first explicit mapping target, or the first form field
 * in auto-mode (rare; mostly useful for "return one number" functions).
 */
function buildFieldUpdates(
  mapping: Record<string, string>,
  result: any,
  formFields: FieldMeta[] | null
): Record<string, any> {
  const isEmpty = !mapping || Object.keys(mapping).length === 0
  const updates: Record<string, any> = {}

  // Auto-mode: resolve keys as apiName → fieldId via the form's fields.
  if (isEmpty) {
    if (!formFields || !result || typeof result !== "object" || Array.isArray(result)) return {}
    const aliasToId = new Map<string, string>()
    for (const f of formFields) {
      aliasToId.set(f.id, f.id)
      if (f.apiName) aliasToId.set(f.apiName, f.id)
      if (f.label) aliasToId.set(f.label, f.id)
    }
    for (const [returnKey, value] of Object.entries(result)) {
      if (returnKey === "ok" || returnKey === "error") continue // beforeSubmit conv.
      const fieldId = aliasToId.get(returnKey)
      if (fieldId) updates[fieldId] = value
    }
    return updates
  }

  // Explicit mode: only declared output keys are applied. The mapping
  // value is the target fieldId — but we also accept apiName/label there
  // for hand-edited mappings.
  const targetResolver = new Map<string, string>()
  if (formFields) {
    for (const f of formFields) {
      targetResolver.set(f.id, f.id)
      if (f.apiName) targetResolver.set(f.apiName, f.id)
      if (f.label) targetResolver.set(f.label, f.id)
    }
  }

  if (result && typeof result === "object" && !Array.isArray(result)) {
    for (const [returnKey, target] of Object.entries(mapping)) {
      if (returnKey in result) {
        const fieldId = targetResolver.get(target) ?? target
        updates[fieldId] = (result as any)[returnKey]
      }
    }
    return updates
  }

  // Scalar / array result → first mapping entry wins.
  const firstTarget = Object.values(mapping)[0]
  if (firstTarget) {
    const fieldId = targetResolver.get(firstTarget) ?? firstTarget
    updates[fieldId] = result
  }
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

async function runOne(
  binding: any,
  ctx: BindingContext,
  scope: { formId?: string; fieldId?: string; moduleId?: string } = {}
): Promise<BindingRunResult> {
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

  // Resolve the form's fields once per run — used by both auto-input and
  // auto-output mapping. If we can't pin down a single form (e.g. a
  // module-only binding fired without form context), formFields stays null
  // and the runner falls back to behaving like the explicit mode required
  // values. Bindings stay strict in that case — better to be empty than to
  // expose unintended data.
  const resolvedFormId = await resolveFormIdForBinding(binding, scope).catch(() => null)
  const formFields = resolvedFormId ? await loadFormFields(resolvedFormId).catch(() => null) : null

  // Resolve triggerField (the apiName/label of the trigger) for ergonomics.
  let triggerField: string | undefined
  if (ctx.triggerFieldId && formFields) {
    const f = formFields.find((x) => x.id === ctx.triggerFieldId)
    triggerField = f?.apiName || f?.label || ctx.triggerFieldId
  }

  const input = buildInput(inputMapping, ctx, formFields)
  const exec = await executeFunction({
    script: fn.script,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    input,
    recordId: ctx.recordId,
    recordData: ctx.recordData,
    triggerField,
  })

  return {
    bindingId: binding.id,
    functionId: binding.functionId,
    functionName: fn.displayName ?? fn.name,
    ok: exec.success,
    fieldUpdates: exec.success ? buildFieldUpdates(outputMapping, exec.result, formFields) : {},
    result: exec.success ? exec.result : undefined,
    error: exec.success ? undefined : exec.error,
    logs: exec.logs,
    durationMs: exec.durationMs,
  }
}

/**
 * Execute a single binding by id (used by the form-aware client route).
 * Returns null if the binding isn't found / scoped wrong.
 *
 * `scope` is used as a *hint* for field resolution (which form's fields to
 * load for auto-mapping), not as a filter on the binding lookup itself.
 * A field-scoped binding has formId=null in the row even when its field
 * belongs to a form; filtering on formId would hide such bindings.
 */
export async function runBindingById(
  bindingId: string,
  ctx: BindingContext,
  scope: { formId?: string; fieldId?: string; moduleId?: string }
): Promise<BindingRunResult | null> {
  const binding = await (prisma as any).functionBinding.findFirst({
    where: {
      id: bindingId,
      organizationId: ctx.organizationId,
      active: true,
    },
    include: {
      function: {
        select: { id: true, name: true, displayName: true, language: true, script: true },
      },
    },
  })
  if (!binding) return null
  return runOne(binding, ctx, scope)
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
    results.push(await runOne(b, ctx, scope))
  }
  return results
}
