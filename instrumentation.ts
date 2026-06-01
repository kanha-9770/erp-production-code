/**
 * Next.js instrumentation hook. Runs once when the Node server starts —
 * the only safe place to register long-lived background workers and to
 * pre-warm cold infrastructure before the first user request lands.
 *
 * What runs here, in order:
 *   1. Prisma pool warm-up   — fires `SELECT 1` so the first real query
 *                              doesn't pay the ~100-200ms TCP+TLS+auth cost.
 *   2. Redis ping fan-out    — touches every configured namespace so the
 *                              lazy clients actually open their TCP+TLS
 *                              connection now rather than on the first cache
 *                              read in user-land.
 *   3. Workflow scheduler    — generic scheduled-rule engine (existing).
 *   4. Optional cache warmup — when WARM_CACHE_ON_BOOT=1, runs the globals
 *                              warmer in the background so the FIRST user
 *                              after a deploy gets cached data, not a DB miss.
 *
 * Every step is wrapped in its own try/catch — a failure in one MUST NOT
 * block boot. Logs go to stdout so you can spot regressions in your
 * platform's startup log without instrumenting anything else.
 *
 * Guarded by the runtime check so the file is a no-op in the Edge runtime
 * (no node-cron, no Prisma there). Set DISABLE_WORKFLOW_SCHEDULER=1 on every
 * replica but one when scaling horizontally to avoid duplicate fires.
 */
export async function register() {
  // The positive `if (NEXT_RUNTIME === "nodejs")` check (instead of an early
  // `return` guard) is load-bearing: webpack's DefinePlugin replaces the env
  // var with a literal at compile time, so the entire block — including the
  // dynamic import target — is dead-code-eliminated from the Edge bundle.
  // An early-return guard collapses the function body but webpack still emits
  // the import()'d chunk, dragging Prisma + scheduler deps into middleware.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // ── 1. Prisma pool warm-up ────────────────────────────────────────────
    // Run sequentially before Redis so the DB is provably available before
    // any cache loader could fall through to it.
    try {
      const t0 = Date.now()
      const { prisma } = await import("@/lib/prisma")
      await prisma.$queryRaw`SELECT 1`
      console.log(`[instrumentation] prisma pool warm (${Date.now() - t0}ms)`)
    } catch (err) {
      console.error("[instrumentation] prisma warm-up failed:", err)
    }

    // ── 2. Redis ping fan-out ─────────────────────────────────────────────
    // Parallel — each namespace has its own TCP connection (de-duped by URL
    // inside getRedis), so pinging them concurrently lets boot time be set
    // by the slowest single ping, not their sum.
    try {
      const t0 = Date.now()
      const { redisPing } = await import("@/lib/redis")
      const namespaces = ["default", "auth", "forms", "hr"] as const
      const results = await Promise.all(
        namespaces.map(async (ns) => [ns, await redisPing(ns)] as const)
      )
      const summary = results.map(([n, ok]) => `${n}=${ok ? "ok" : "DOWN"}`).join(" ")
      console.log(`[instrumentation] redis: ${summary} (${Date.now() - t0}ms)`)
    } catch (err) {
      console.error("[instrumentation] redis warm-up failed:", err)
    }

    // ── 3. Workflow scheduler ─────────────────────────────────────────────
    if (process.env.DISABLE_WORKFLOW_SCHEDULER === "1") {
      console.log("[instrumentation] workflow scheduler disabled via env")
    } else {
      try {
        const { startWorkflowScheduler } = await import("@/lib/workflow/scheduler")
        await startWorkflowScheduler()
      } catch (err) {
        console.error("[instrumentation] workflow scheduler boot failed:", err)
      }

      // Per-employee, shift-aware check-in reminder ticker. Gated by the same
      // DISABLE_WORKFLOW_SCHEDULER env as the workflow scheduler so a multi-
      // replica deploy fires reminders from a single replica only.
      try {
        const { startCheckInReminderScheduler } = await import(
          "@/lib/hr/checkin-reminder"
        )
        startCheckInReminderScheduler()
      } catch (err) {
        console.error("[instrumentation] check-in reminder boot failed:", err)
      }
    }

    // ── 4. Optional cache warmup ──────────────────────────────────────────
    // Opt-in via WARM_CACHE_ON_BOOT=1. Runs in the BACKGROUND — never blocks
    // boot, never crashes the process. On a deploy where the warmup script
    // already ran in CI, this is just a no-op refresh (idempotent).
    if (process.env.WARM_CACHE_ON_BOOT === "1") {
      // Fire-and-forget. The scheduler above (#3) already returned, so the
      // server is accepting traffic by the time this resolves — which is fine,
      // since `cached()` falls through to Postgres on a miss anyway.
      ;(async () => {
        try {
          const t0 = Date.now()
          const { warmCaches } = await import("@/lib/cache-warmup")
          const scope =
            process.env.WARM_CACHE_SCOPE === "all" ? "all" : "globals-only"
          const report = await warmCaches({
            scope,
            includeFormStructures: process.env.WARM_CACHE_FORMS === "1",
          })
          console.log(
            `[instrumentation] cache warm: scope=${scope} elapsed=${Date.now() - t0}ms errors=${report.errors.length}`
          )
          if (report.errors.length > 0) {
            for (const e of report.errors) {
              console.warn(`  [warm] ${e.scope}: ${e.message}`)
            }
          }
        } catch (err) {
          console.error("[instrumentation] cache warm-up failed:", err)
        }
      })()
    }
  }
}
