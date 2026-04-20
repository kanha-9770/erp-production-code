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
    const { id, script: rawScript, input, timeoutMs } = body || {}

    let script = typeof rawScript === "string" ? rawScript : ""
    // True when we're falling back to the function's saved script (no inline
    // override from the editor). Only then do we honor the saved language —
    // when the caller sends a script body, trust it as JavaScript.
    let usingSavedScript = false

    if (id) {
      const fn = await prisma.crmFunction.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { script: true, language: true },
      })
      if (!fn) {
        return NextResponse.json(
          { success: false, error: "Function not found" },
          { status: 404 }
        )
      }
      if (!script) {
        usingSavedScript = true
        script = fn.script || ""
      }
      // Reject ONLY when running the saved script with a non-JS language
      // metadata. The editor's Run path always sends a script body, so it
      // is never blocked here even if the saved language is still "Deluge".
      if (
        usingSavedScript &&
        fn.language &&
        fn.language.toLowerCase() !== "javascript"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot execute ${fn.language} functions on the server. Open the function and set its language to JavaScript.`,
          },
          { status: 400 }
        )
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
