/**
 * Next.js instrumentation hook. Runs once when the Node server starts —
 * the only safe place to register long-lived background workers.
 *
 * Boots the generic workflow scheduler, which fires every active rule whose
 * `executeBasedOn = "schedule"`. The legacy attendance-only scheduler has
 * been retired in favour of this generic engine; its config is migrated to
 * scheduled WorkflowRules by scripts/migrate-attendance-schedules-to-workflows.ts.
 *
 * Guarded by the runtime check so the file is a no-op in the Edge runtime
 * (no node-cron, no Prisma there). Set DISABLE_WORKFLOW_SCHEDULER=1 on every
 * replica but one when scaling horizontally to avoid duplicate fires.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.DISABLE_WORKFLOW_SCHEDULER === "1") {
    console.log("[instrumentation] workflow scheduler disabled via env")
    return
  }
  try {
    const { startWorkflowScheduler } = await import("@/lib/workflow/scheduler")
    await startWorkflowScheduler()
  } catch (err) {
    console.error("[instrumentation] workflow scheduler boot failed:", err)
  }
}
