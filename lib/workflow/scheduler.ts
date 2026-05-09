/**
 * Generic in-process scheduler for WorkflowRules with executeBasedOn = "schedule".
 *
 * Boots once from instrumentation.ts. Loads every active scheduled rule, builds
 * the appropriate cron expression from its cadence + time fields (or uses a
 * raw cron string when cadence = "custom"), and registers a node-cron job per
 * rule. When a job fires it calls `runWorkflowRule(ruleId, "schedule")` which
 * runs every instant action attached to the rule (Email Notification, System
 * Notification, Report Export, Function, etc.) and writes a WorkflowExecution
 * row for visibility.
 *
 * Hot-reload: workflow-rules CRUD calls `syncWorkflowRule(ruleId)` after every
 * write so the scheduler reflects the new state without a server restart.
 *
 * IMPORTANT (single-process assumption): jobs run in-process. If the app is
 * scaled horizontally (multiple PM2 instances, Docker replicas, k8s pods) every
 * replica will fire its own copy. Either run with a single replica, set
 * DISABLE_WORKFLOW_SCHEDULER=1 on all-but-one, or migrate to an external
 * scheduler hitting POST /api/workflow-rules/:id/run with x-cron-secret.
 */

import cron, { type ScheduledTask } from "node-cron"
import { prisma } from "@/lib/prisma"
import { runWorkflowRule } from "@/lib/workflow/trigger"

const jobsByRule = new Map<string, ScheduledTask>()
let started = false

export type ScheduleCadence = "daily" | "weekly" | "monthly" | "custom"

interface ScheduleSpec {
  cadence: ScheduleCadence | null
  cron: string | null
  hour: number | null
  minute: number | null
  dayOfWeek: number | null
  dayOfMonth: number | null
  timezone: string | null
  enabled: boolean
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.floor(n)))

function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

/**
 * Build a 5-field cron expression from a rule's schedule fields. Returns null
 * if the rule isn't a scheduled rule, isn't enabled, or has invalid inputs.
 *
 * Cadences:
 *  - daily   : `M H * * *`
 *  - weekly  : `M H * * D`     (D = 0..6, Sun=0)
 *  - monthly : `M H DOM * *`   (DOM = 1..31)
 *  - custom  : raw `scheduleCron` string passed straight through
 */
export function buildCronExpression(spec: ScheduleSpec): string | null {
  if (!spec.enabled) return null

  if (spec.cadence === "custom") {
    const expr = (spec.cron || "").trim()
    if (!expr) return null
    if (!cron.validate(expr)) return null
    return expr
  }

  const minute = clamp(spec.minute ?? 0, 0, 59)
  const hour = clamp(spec.hour ?? 9, 0, 23)

  switch (spec.cadence) {
    case "daily":
      return `${minute} ${hour} * * *`
    case "weekly": {
      const dow = clamp(spec.dayOfWeek ?? 1, 0, 6) // default Monday
      return `${minute} ${hour} * * ${dow}`
    }
    case "monthly": {
      const dom = clamp(spec.dayOfMonth ?? 1, 1, 31)
      return `${minute} ${hour} ${dom} * *`
    }
    default:
      return null
  }
}

function specFromRule(r: any): ScheduleSpec {
  return {
    cadence: (r.scheduleCadence as ScheduleCadence | null) ?? null,
    cron: r.scheduleCron ?? null,
    hour: r.scheduleHour ?? null,
    minute: r.scheduleMinute ?? null,
    dayOfWeek: r.scheduleDayOfWeek ?? null,
    dayOfMonth: r.scheduleDayOfMonth ?? null,
    timezone: r.scheduleTimezone ?? null,
    enabled: r.scheduleEnabled !== false,
  }
}

function teardownRule(ruleId: string) {
  const existing = jobsByRule.get(ruleId)
  if (!existing) return
  try {
    existing.stop()
  } catch {
    /* ignore */
  }
  jobsByRule.delete(ruleId)
}

/**
 * Re-register (or remove) the cron job for a single rule. Idempotent — calling
 * this after every CRUD write is the supported way to apply changes without a
 * server restart.
 */
export async function syncWorkflowRule(ruleId: string): Promise<void> {
  const rule = await (prisma as any).workflowRule.findUnique({
    where: { id: ruleId },
    select: {
      id: true,
      name: true,
      active: true,
      executeBasedOn: true,
      scheduleCadence: true,
      scheduleCron: true,
      scheduleHour: true,
      scheduleMinute: true,
      scheduleDayOfWeek: true,
      scheduleDayOfMonth: true,
      scheduleTimezone: true,
      scheduleEnabled: true,
    },
  })

  teardownRule(ruleId)

  if (!rule) return // deleted
  if (!rule.active) return
  if (rule.executeBasedOn !== "schedule") return

  const spec = specFromRule(rule)
  const expr = buildCronExpression(spec)
  if (!expr) {
    console.warn(
      `[workflow-scheduler] rule "${rule.name}" (${rule.id}) has an invalid or missing schedule — not registered`,
    )
    return
  }

  const tz = isValidTimezone(spec.timezone) ? spec.timezone : undefined

  try {
    const task = cron.schedule(
      expr,
      () => {
        runWorkflowRule(rule.id, "schedule").catch((err) => {
          console.error(
            `[workflow-scheduler] rule ${rule.id} threw:`,
            err?.message || err,
          )
        })
      },
      tz ? { timezone: tz } : undefined,
    )
    jobsByRule.set(rule.id, task)
    console.log(
      `[workflow-scheduler] registered rule "${rule.name}" (${rule.id}) \`${expr}\`${tz ? ` (${tz})` : ""}`,
    )
  } catch (err: any) {
    console.error(
      `[workflow-scheduler] failed to register rule "${rule.name}" (${rule.id}):`,
      err?.message || err,
    )
  }
}

export async function startWorkflowScheduler(): Promise<void> {
  if (started) return
  started = true
  try {
    const rules = await (prisma as any).workflowRule.findMany({
      where: {
        active: true,
        executeBasedOn: "schedule",
      },
      select: { id: true },
    })
    for (const r of rules) {
      await syncWorkflowRule(r.id)
    }
    console.log(
      `[workflow-scheduler] started — ${jobsByRule.size} active scheduled rule(s)`,
    )
  } catch (err) {
    console.error("[workflow-scheduler] start failed:", err)
    started = false
  }
}

/** Test/diagnostic helper. */
export function activeRuleCount(): number {
  return jobsByRule.size
}
