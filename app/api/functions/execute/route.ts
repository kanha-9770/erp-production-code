export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import { executeFunction } from "@/lib/functions/executor"

/**
 * POST /api/functions/execute
 * Body: { id?: string, script?: string, input?: any, timeoutMs?: number }
 *
 * Either provide `id` (executes the saved script) or `script` (ad-hoc test).
 * The user must be authenticated and the function (if id is provided) must
 * belong to their organization.
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({} as any))
    const {
      id,
      script: rawScript,
      input,
      timeoutMs,
      maxOps,
      // Opt-in flag — when true and `id` is provided, the run is persisted
      // to function_executions for the log viewer. Defaults to false so the
      // editor's quick-test runs stay ephemeral as they always have.
      persist,
    } = body || {}

    let script = typeof rawScript === "string" ? rawScript : ""

    if (id) {
      const fn = await prisma.crmFunction.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { script: true },
      })
      if (!fn) {
        return NextResponse.json(
          { success: false, error: "Function not found" },
          { status: 404 }
        )
      }
      if (!script) {
        script = fn.script || ""
      }
    }

    if (!script.trim()) {
      return NextResponse.json(
        { success: false, error: "Script is empty" },
        { status: 400 }
      )
    }

    const result = await executeFunction({
      script,
      organizationId: authUser.organizationId,
      userId: authUser.id,
      input,
      timeoutMs: typeof timeoutMs === "number" ? Math.min(30_000, timeoutMs) : undefined,
      maxOps: typeof maxOps === "number" ? Math.min(10_000, Math.max(1, maxOps)) : undefined,
      // Persistence is opt-in via `persist:true` in the body, AND requires
      // a saved function id (we won't write log rows for ad-hoc untitled
      // scripts pasted into the editor — those have no function to relate to).
      ...(persist && id
        ? {
            persistAs: {
              functionId: id,
              trigger: "test" as const,
            },
          }
        : {}),
    })

    return NextResponse.json({ ...result })
  } catch (err: any) {
    console.error("[POST /api/functions/execute]", err)
    return NextResponse.json(
      { success: false, error: err?.message || "Execution failed" },
      { status: 500 }
    )
  }
}
