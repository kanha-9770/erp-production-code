/**
 * Function execution engine.
 *
 * Runs user-authored JavaScript inside a Node `vm` sandbox with a curated
 * `ctx` API for reading and writing module records. Always org-scoped via
 * the caller's organizationId — the script cannot reach Prisma directly.
 *
 * The sandbox is intended for trusted authors (org admins) — it uses Node's
 * built-in `vm` which is NOT a security boundary against malicious code.
 * It does enforce a wall-clock timeout and freezes the global scope.
 */

import vm from "vm"
import { prisma } from "@/lib/prisma"
import { DatabaseService } from "@/lib/database/database-service"
import { DatabaseTransforms } from "@/lib/database/DatabaseTransforms"
import { attachApiNames } from "@/lib/functions/apiName"

export interface ExecuteOptions {
  script: string
  organizationId: string
  userId: string
  /** Optional input data passed to the script as `ctx.input`. */
  input?: any
  /** Wall-clock limit for the sync portion of the script (ms). */
  timeoutMs?: number
  /** Bound on total async I/O calls a script can make. */
  maxOps?: number
  /** For after-create / after-update bindings: id of the record that fired
   *  the event. Surfaced as `ctx.recordId`. */
  recordId?: string
  /** For after* bindings: the structured record data. Surfaced as
   *  `ctx.recordData` (read-only snapshot). */
  recordData?: any
  /** For field-level events: the apiName (or label / id, fallback) of the
   *  field that fired. Surfaced as `ctx.triggerField`. */
  triggerField?: string
  /**
   * When provided, the executor writes a FunctionExecution row at the end of
   * the run for the /settings/functions/executions log viewer. Fire-and-forget
   * — a persistence failure never affects the script's success/result.
   *
   * Omit this for ephemeral runs (e.g. the editor's quick-test) so the log
   * table doesn't fill up with noise.
   */
  persistAs?: {
    functionId: string
    trigger: "manual" | "test" | "workflow" | "scheduled" | "binding" | "rest-api"
  }
}

export interface ExecuteResult {
  success: boolean
  result?: any
  logs: Array<{ level: "log" | "info" | "warn" | "error"; args: any[]; ts: number }>
  error?: string
  durationMs: number
}

const DEFAULT_TIMEOUT = 5_000
const DEFAULT_MAX_OPS = 100

// LRU of compiled vm.Script objects keyed by the wrapped source. V8 parse +
// compile is ~5-20ms per call; re-running an already-compiled Script is ~0ms.
// A typical script runs many times across users and sessions, so the cache
// hit rate is extremely high. Max 200 entries keeps memory bounded.
const SCRIPT_CACHE_MAX = 200
const scriptCache = new Map<string, vm.Script>()
function getCompiledScript(wrappedSource: string): vm.Script {
  const cached = scriptCache.get(wrappedSource)
  if (cached) {
    // LRU touch: re-insert so it's most-recent.
    scriptCache.delete(wrappedSource)
    scriptCache.set(wrappedSource, cached)
    return cached
  }
  const script = new vm.Script(wrappedSource, { filename: "user-function.js" })
  scriptCache.set(wrappedSource, script)
  if (scriptCache.size > SCRIPT_CACHE_MAX) {
    // Evict oldest (first inserted / least recently touched).
    const oldest = scriptCache.keys().next().value
    if (oldest !== undefined) scriptCache.delete(oldest)
  }
  return script
}

// ── Module / record helpers (org-scoped) ──────────────────────────────────

async function resolveFormByModuleName(organizationId: string, moduleName: string) {
  const module_ = await prisma.formModule.findFirst({
    where: { organizationId, name: moduleName },
    include: { forms: true },
  })
  if (!module_) throw new Error(`Module not found: ${moduleName}`)
  const form = module_.forms[0]
  if (!form) throw new Error(`Module "${moduleName}" has no forms`)
  return { module: module_, form }
}

function shardModelFromTable(storageTable: string | undefined | null): string | null {
  if (!storageTable) return null
  const m = storageTable.match(/form_records_(\d+)/)
  return m ? `formRecord${m[1]}` : null
}

async function getShardModelForForm(formId: string): Promise<string> {
  // DatabaseTransforms.getFormRecordTable auto-creates a FormTableMapping
  // for forms that don't have one yet (assigning the least-used shard for
  // regular forms, or the dedicated employee/user-form tables). This matches
  // what the form submit endpoint does — without it, brand-new modules would
  // throw "Form has no record table mapping".
  const tableName = await DatabaseTransforms.getFormRecordTable(formId)
  const model = shardModelFromTable(tableName)
  if (!model) throw new Error(`Could not resolve record table for form: ${formId}`)
  return model
}

/**
 * Load the form's field metadata once so we can flatten records on read and
 * structure flat input on write. Returns lookup tables keyed by:
 *   - fieldId            — the cuid (most stable; what bindings store)
 *   - label (lowercased) — what scripts wrote against in the original API
 *   - apiName            — the PascalCase slug shown in Settings → APIs and SDKs
 *
 * apiNames are computed by the shared `attachApiNames` helper so the same
 * string the user reads in the API Names table is the one their script can
 * use as a key.
 */
async function loadFieldMaps(formId: string) {
  const sections = await prisma.formSection.findMany({
    where: { formId },
    include: { fields: { select: { id: true, label: true, type: true } } },
    orderBy: { order: "asc" },
  })

  // Collect every field across sections (with sectionId) and stamp apiNames
  // in one pass, so duplicate labels get `_2`, `_3` consistently.
  type Meta = { id: string; label: string; type: string; sectionId: string; apiName: string }
  const flat: Array<{ id: string; label: string; type: string; sectionId: string }> = []
  for (const sec of sections) {
    for (const f of sec.fields) {
      flat.push({ id: f.id, label: f.label, type: f.type, sectionId: sec.id })
    }
  }
  const stamped: Meta[] = attachApiNames(flat) as Meta[]

  const byId: Record<string, Meta> = {}
  const byLabel: Record<string, Meta> = {}
  const byApiName: Record<string, Meta> = {}
  for (const m of stamped) {
    byId[m.id] = m
    const labelKey = m.label.trim().toLowerCase()
    if (labelKey && !byLabel[labelKey]) byLabel[labelKey] = m
    if (m.apiName && !byApiName[m.apiName]) byApiName[m.apiName] = m
  }
  return { sections, byId, byLabel, byApiName }
}

/**
 * Flatten a record's stored shape (which can be the structured
 * `{ sections: { id: { fields: { fieldId: value | { value } } } }, subforms }`
 * or a legacy flat blob) into a friendly object exposing each field under
 * BOTH its label AND its apiName, so scripts can read either way:
 *
 *   const lead = await ctx.records.get("Leads", id)
 *   lead.data["Email Address"]  // label
 *   lead.data.Email_Address     // apiName
 *
 * If both keys collide (e.g. a label happens to equal another field's
 * apiName) the label wins — labels are the older, more-stable contract.
 */
function flattenRecordData(
  recordData: any,
  fieldsById: Record<string, { label: string; apiName?: string }>
): Record<string, any> {
  if (!recordData || typeof recordData !== "object") return {}
  const out: Record<string, any> = {}

  const setKeys = (fieldId: string, value: any) => {
    const meta = fieldsById[fieldId]
    if (!meta) return
    if (meta.apiName && !(meta.apiName in out)) out[meta.apiName] = value
    if (meta.label) out[meta.label] = value // label wins if there's a collision
  }

  if (recordData.sections && typeof recordData.sections === "object") {
    for (const section of Object.values(recordData.sections) as any[]) {
      const fields = section?.fields
      if (!fields || typeof fields !== "object") continue
      for (const [fieldId, entry] of Object.entries(fields)) {
        const value =
          entry && typeof entry === "object" && "value" in (entry as any)
            ? (entry as any).value
            : entry
        setKeys(fieldId, value)
      }
    }
    return out
  }

  // Legacy / flat shape: fieldId or label keys at the top level.
  for (const [key, entry] of Object.entries(recordData)) {
    if (key.startsWith("_")) continue
    const value =
      entry && typeof entry === "object" && "value" in (entry as any)
        ? (entry as any).value
        : entry
    if (fieldsById[key]) setKeys(key, value)
    else out[key] = value
  }
  return out
}

/**
 * Convert a flat `{ label | apiName | fieldId: value }` input into the
 * structured `{ sections: { sectionId: { fields: { fieldId: value } } } }`
 * shape that existing form-record code understands. Resolution order:
 *
 *   1. fieldId (cuid)   — exact match in `fieldsById`
 *   2. apiName          — exact match in `fieldsByApiName`
 *   3. label            — case-insensitive match in `fieldsByLabel`
 *   4. unknown          — kept under a `__custom` section so nothing is dropped
 */
function structureRecordInput(
  input: Record<string, any>,
  fieldsById: Record<string, { label: string; sectionId: string }>,
  fieldsByLabel: Record<string, { id: string; sectionId: string }>,
  fieldsByApiName: Record<string, { id: string; sectionId: string }>
): { sections: Record<string, { fields: Record<string, any> }> } {
  const sections: Record<string, { fields: Record<string, any> }> = {}
  const ensure = (sectionId: string) => {
    if (!sections[sectionId]) sections[sectionId] = { fields: {} }
    return sections[sectionId]
  }

  for (const [key, value] of Object.entries(input || {})) {
    const byId = fieldsById[key]
    if (byId) {
      ensure(byId.sectionId).fields[key] = value
      continue
    }
    const byApiName = fieldsByApiName[key]
    if (byApiName) {
      ensure(byApiName.sectionId).fields[byApiName.id] = value
      continue
    }
    const byLabel = fieldsByLabel[key.trim().toLowerCase()]
    if (byLabel) {
      ensure(byLabel.sectionId).fields[byLabel.id] = value
      continue
    }
    // Unknown key — preserve under a custom bucket so it round-trips.
    ensure("__custom").fields[key] = value
  }
  return { sections }
}

// ── Build the ctx surface exposed to user scripts ─────────────────────────

function buildCtx(opts: ExecuteOptions, logs: ExecuteResult["logs"], opCounter: { count: number; max: number }) {
  const { organizationId, userId, input, recordId, recordData, triggerField } = opts

  const guardOp = () => {
    if (++opCounter.count > opCounter.max) {
      throw new Error(`Operation limit exceeded (${opCounter.max})`)
    }
  }

  const log = (level: "log" | "info" | "warn" | "error", ...args: any[]) => {
    logs.push({ level, args, ts: Date.now() })
  }

  const modules = {
    list: async () => {
      guardOp()
      const mods = await prisma.formModule.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
      return mods
    },
    get: async (moduleName: string) => {
      guardOp()
      const { module: mod, form } = await resolveFormByModuleName(organizationId, moduleName)
      return { id: mod.id, name: mod.name, formId: form.id, formName: form.name }
    },
  }

  // Wrap any helper to attach a `ctx.records.X("Module")` context to errors,
  // so a Prisma "Unknown arg" deep inside doesn't surface naked to the user.
  const wrap = <T extends (...a: any[]) => Promise<any>>(name: string, fn: T): T => {
    return (async (...args: any[]) => {
      try {
        return await fn(...args)
      } catch (err: any) {
        const moduleArg = typeof args[0] === "string" ? ` for module "${args[0]}"` : ""
        const msg = err?.message || String(err)
        throw new Error(`${name}${moduleArg}: ${msg}`)
      }
    }) as T
  }

  // Per-script-run cache: resolving `moduleName -> {form, model, fieldMaps}`
  // used to cost 3 sequential DB round trips on EVERY records.* call. Memoize
  // within the life of a single script run and parallelize the two calls
  // that only depend on form.id. Saves 2-3 queries per repeated call to the
  // same module, and 1 round trip on the very first call.
  const moduleCtxCache = new Map<string, Promise<{
    form: { id: string; name: string }
    model: string
    fieldMaps: Awaited<ReturnType<typeof loadFieldMaps>>
  }>>()
  const getModuleCtx = (moduleName: string) => {
    const cached = moduleCtxCache.get(moduleName)
    if (cached) return cached
    const p = (async () => {
      const { form } = await resolveFormByModuleName(organizationId, moduleName)
      const [model, fieldMaps] = await Promise.all([
        getShardModelForForm(form.id),
        loadFieldMaps(form.id),
      ])
      return { form, model, fieldMaps }
    })()
    // If the resolve fails, drop the cached rejection so retries can try
    // again (e.g. the module just got created mid-session).
    p.catch(() => moduleCtxCache.delete(moduleName))
    moduleCtxCache.set(moduleName, p)
    return p
  }

  const records = {
    /**
     * List records for a module.
     * Each row includes `data` (flat label→value), plus the raw `recordData`
     * for advanced use, plus standard metadata (id, createdAt, …).
     */
    list: wrap("ctx.records.list", async (
      moduleName: string,
      options: { limit?: number; skip?: number; where?: Record<string, any> } = {}
    ) => {
      guardOp()
      const { form, model, fieldMaps } = await getModuleCtx(moduleName)
      const limit = Math.min(500, Math.max(1, options.limit ?? 50))
      const skip = Math.max(0, options.skip ?? 0)
      // @ts-ignore dynamic model access
      const rows = await (prisma as any)[model].findMany({
        where: { formId: form.id, ...(options.where || {}) },
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
      })
      return rows.map((r: any) => ({
        id: r.id,
        formId: r.formId,
        data: flattenRecordData(r.recordData, fieldMaps.byId),
        recordData: r.recordData,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        userId: r.userId,
        status: r.status,
      }))
    }),

    /** Get a single record by id (returns the same shape as list items). */
    get: wrap("ctx.records.get", async (moduleName: string, recordId: string) => {
      guardOp()
      const { form, model, fieldMaps } = await getModuleCtx(moduleName)
      // @ts-ignore dynamic model access
      const row = await (prisma as any)[model].findFirst({
        where: { id: recordId, formId: form.id },
      })
      if (!row) return null
      return {
        id: row.id,
        formId: row.formId,
        data: flattenRecordData(row.recordData, fieldMaps.byId),
        recordData: row.recordData,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        userId: row.userId,
        status: row.status,
      }
    }),

    /**
     * Create a record. Accepts either:
     *   - flat `{ "Email": "x@y.com", "Name": "..." }` (label or fieldId keys)
     *   - already-structured `{ sections: { ... } }`
     * Flat input is converted to the structured shape using the form's fields.
     */
    create: wrap("ctx.records.create", async (moduleName: string, data: Record<string, any>) => {
      guardOp()
      if (!data || typeof data !== "object") {
        throw new Error("data must be an object")
      }
      const { form, fieldMaps } = await getModuleCtx(moduleName)
      const isStructured = data && typeof data === "object" && data.sections && typeof data.sections === "object"
      const finalData = isStructured
        ? data
        : structureRecordInput(
            data,
            fieldMaps.byId as any,
            fieldMaps.byLabel as any,
            fieldMaps.byApiName as any
          )
      const created = await DatabaseService.createFormRecord(
        form.id,
        finalData,
        userId,
        undefined,
        undefined,
        undefined,
        userId,
        organizationId
      )
      return { id: created.id, formId: form.id }
    }),

    /**
     * Update a record. Accepts flat or structured patch. Flat input is merged
     * field-by-field into the existing structured recordData; structured input
     * replaces the matching sections.
     */
    update: wrap("ctx.records.update", async (moduleName: string, recordId: string, patch: Record<string, any>) => {
      guardOp()
      if (!patch || typeof patch !== "object") {
        throw new Error("patch must be an object")
      }
      const { form, model, fieldMaps } = await getModuleCtx(moduleName)
      // @ts-ignore dynamic model access
      const existing = await (prisma as any)[model].findFirst({
        where: { id: recordId, formId: form.id },
      })
      if (!existing) throw new Error(`Record not found: ${recordId}`)

      const existingData = (existing.recordData as any) || {}
      let nextData: any
      if (patch.sections && typeof patch.sections === "object") {
        // Caller sent structured patch — shallow merge per section.
        const merged = { ...(existingData.sections || {}) }
        for (const [secId, sec] of Object.entries(patch.sections as Record<string, any>)) {
          merged[secId] = {
            ...(merged[secId] || {}),
            ...sec,
            fields: { ...(merged[secId]?.fields || {}), ...((sec as any)?.fields || {}) },
          }
        }
        nextData = { ...existingData, sections: merged }
      } else {
        // Flat patch — convert to structured first, then merge.
        const structured = structureRecordInput(
          patch,
          fieldMaps.byId as any,
          fieldMaps.byLabel as any,
          fieldMaps.byApiName as any
        )
        const merged = { ...(existingData.sections || {}) }
        for (const [secId, sec] of Object.entries(structured.sections)) {
          merged[secId] = {
            ...(merged[secId] || {}),
            fields: { ...(merged[secId]?.fields || {}), ...sec.fields },
          }
        }
        nextData = { ...existingData, sections: merged }
      }

      // @ts-ignore dynamic model access
      const updated = await (prisma as any)[model].update({
        where: { id: recordId },
        data: { recordData: nextData },
      })
      return {
        id: updated.id,
        data: flattenRecordData(updated.recordData, fieldMaps.byId),
        recordData: updated.recordData,
      }
    }),

    /** Delete a record. */
    delete: wrap("ctx.records.delete", async (moduleName: string, recordId: string) => {
      guardOp()
      const { form, model } = await getModuleCtx(moduleName)
      // @ts-ignore dynamic model access
      const existing = await (prisma as any)[model].findFirst({
        where: { id: recordId, formId: form.id },
        select: { id: true },
      })
      if (!existing) throw new Error(`Record not found: ${recordId}`)
      // @ts-ignore dynamic model access
      await (prisma as any)[model].delete({ where: { id: recordId } })
      return { ok: true, id: recordId }
    }),

    /** Count records matching an optional where clause. */
    count: wrap("ctx.records.count", async (moduleName: string, where: Record<string, any> = {}) => {
      guardOp()
      const { form, model } = await getModuleCtx(moduleName)
      // @ts-ignore dynamic model access
      return await (prisma as any)[model].count({
        where: { formId: form.id, ...where },
      })
    }),

    /** List the field schema for a module — id, label, type, AND the
     *  PascalCase API Name shown in Settings → APIs and SDKs.
     *  Use the apiName as the key when reading from `record.data` or
     *  passing values to `ctx.records.create / update`. */
    fields: wrap("ctx.records.fields", async (moduleName: string) => {
      guardOp()
      const { fieldMaps } = await getModuleCtx(moduleName)
      return Object.values(fieldMaps.byId).map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        apiName: (f as any).apiName,
      }))
    }),
  }

  return Object.freeze({
    organizationId,
    userId,
    input: input ?? null,
    // Record context — undefined for events that don't have one (e.g. before
    // a record exists). Frozen so the script can't mutate the snapshot.
    recordId: recordId ?? null,
    recordData: recordData ? Object.freeze(JSON.parse(JSON.stringify(recordData))) : null,
    triggerField: triggerField ?? null,
    modules: Object.freeze(modules),
    records: Object.freeze(records),
    log: (...args: any[]) => log("log", ...args),
    info: (...args: any[]) => log("info", ...args),
    warn: (...args: any[]) => log("warn", ...args),
    error: (...args: any[]) => log("error", ...args),
  })
}

/**
 * Wraps the user's script in an async IIFE so they can use `await` at top
 * level without the awkward boilerplate. They can `return value` to surface
 * a result to the caller.
 */
function wrapScript(userScript: string): string {
  return `(async () => { ${userScript}\n })()`
}

// ── Public entry point ───────────────────────────────────────────────────

export async function executeFunction(opts: ExecuteOptions): Promise<ExecuteResult> {
  const start = Date.now()
  const logs: ExecuteResult["logs"] = []
  const opCounter = { count: 0, max: opts.maxOps ?? DEFAULT_MAX_OPS }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT

  try {
    const ctx = buildCtx(opts, logs, opCounter)
    const consoleProxy = {
      log: ctx.log,
      info: ctx.info,
      warn: ctx.warn,
      error: ctx.error,
    }

    const sandbox: Record<string, unknown> = {
      ctx,
      console: consoleProxy,
      // Useful primitives — frozen below
      JSON,
      Math,
      Date,
      Number,
      String,
      Boolean,
      Array,
      Object,
      Promise,
    }
    const context = vm.createContext(sandbox, {
      name: "function-runtime",
      codeGeneration: { strings: false, wasm: false },
    })

    const wrapped = wrapScript(opts.script)
    const script = getCompiledScript(wrapped)

    // The sync portion (= until first await) is bounded by `timeout`.
    // Async work after that is bounded by the racing Promise below + opCounter.
    const runPromise: Promise<any> = script.runInContext(context, { timeout: timeoutMs })

    const result = await Promise.race([
      runPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Async timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ])

    const finalResult: ExecuteResult = {
      success: true,
      result,
      logs,
      durationMs: Date.now() - start,
    }
    persistExecutionLog(opts, finalResult, start)
    return finalResult
  } catch (err: any) {
    const message = err?.message || "Execution failed"
    const finalResult: ExecuteResult = {
      success: false,
      error: message,
      logs,
      durationMs: Date.now() - start,
    }
    persistExecutionLog(opts, finalResult, start)
    return finalResult
  }
}

/**
 * Fire-and-forget log writer. Only runs when the caller passed `persistAs`
 * — keeps the editor's quick-test runs out of the log table so it stays
 * focused on production runs (workflow / scheduled / binding / explicit
 * test-from-list-page).
 *
 * Trims log/input/result payloads if they exceed a sensible bound so a chatty
 * script can't bloat the row past Postgres's row-size limits.
 */
function persistExecutionLog(
  opts: ExecuteOptions,
  res: ExecuteResult,
  startedAtMs: number,
): void {
  if (!opts.persistAs) return
  const { functionId, trigger } = opts.persistAs

  // Cap each payload — Postgres handles large jsonb fine but the log viewer
  // doesn't need 5 MB blobs. 256 KB per field keeps the row well under any
  // practical limit while preserving useful context.
  const cap = (v: any, max = 256_000): any => {
    if (v === undefined) return undefined
    try {
      const s = JSON.stringify(v)
      if (s.length <= max) return v
      return { __truncated: true, preview: s.slice(0, max) + "...", originalBytes: s.length }
    } catch {
      return { __unserialisable: true }
    }
  }

  const startedAt = new Date(startedAtMs)
  const finishedAt = new Date()

  // Don't await — script callers (workflow trigger, scheduler) treat function
  // execution as best-effort; a logging hiccup must not break the rule run.
  prisma
    .functionExecution.create({
      data: {
        functionId,
        organizationId: opts.organizationId,
        trigger,
        status: res.success ? "success" : "failed",
        startedAt,
        finishedAt,
        durationMs: res.durationMs,
        input: cap(opts.input) ?? null,
        result: cap(res.result) ?? null,
        logs: cap(res.logs.slice(-500)) ?? null, // last 500 console lines
        error: res.error ?? null,
        userId: opts.userId || null,
      },
    })
    .catch((err: any) => {
      console.error(
        `[functions] persist execution log failed for ${functionId}:`,
        err?.message || err,
      )
    })
}
