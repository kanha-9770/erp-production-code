/**
 * Manual / external trigger for a workflow rule.
 *
 *   POST /api/workflow-rules/:id/run
 *   Body: {} (no payload required)
 *   Auth: either an admin session in the rule's org, OR an `x-cron-secret`
 *         header that matches process.env.CRON_SECRET (for an external
 *         scheduler when running horizontally).
 *
 * Runs every instant action attached to the rule and returns a summary of
 * per-action results. The same WorkflowExecution row the cron path writes is
 * also written here, so the admin "history" panel surfaces manual runs too.
 *
 * GET on the same path returns the rule's recent execution history (last 25)
 * for the admin UI.
 */

export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers"
import { runWorkflowRule } from "@/lib/workflow/trigger"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const ruleId = params.id
  if (!ruleId) {
    return NextResponse.json(
      { success: false, error: "rule id is required" },
      { status: 400 },
    )
  }

  // Auth path A — external scheduler with shared secret.
  const headerSecret = request.headers.get("x-cron-secret") ?? ""
  const expected = process.env.CRON_SECRET ?? ""
  const secretOk = expected.length > 0 && headerSecret === expected

  if (!secretOk) {
    // Auth path B — in-app admin session.
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      )
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not a member of any organization" },
        { status: 403 },
      )
    }
    const rule = await (prisma as any).workflowRule.findUnique({
      where: { id: ruleId },
      select: { id: true, organizationId: true },
    })
    if (!rule) {
      return NextResponse.json(
        { success: false, error: "rule not found" },
        { status: 404 },
      )
    }
    // Tenants can't fire each other's rules. Admin-only — workflow execution
    // can send emails / update records / write notifications.
    if (rule.organizationId !== authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "rule belongs to a different organization" },
        { status: 403 },
      )
    }
    const admin = await isUserAdmin(authUser.id, authUser.organizationId)
    if (!admin) {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 },
      )
    }
  }

  try {
    const result = await runWorkflowRule(ruleId, "manual")
    return NextResponse.json({
      success: result.success,
      status: result.status,
      results: result.results,
      error: result.error,
    })
  } catch (err: any) {
    console.error(`[POST /api/workflow-rules/${ruleId}/run]`, err)
    return NextResponse.json(
      { success: false, error: err?.message || "internal error" },
      { status: 500 },
    )
  }
}

/**
 * Recent execution history for a rule — for the admin UI's "Last runs" panel.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const ruleId = params.id
  const authUser = await getAuthenticatedUser(request)
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    )
  }
  const rule = await (prisma as any).workflowRule.findUnique({
    where: { id: ruleId },
    select: { organizationId: true },
  })
  if (!rule || rule.organizationId !== authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: "rule not found" },
      { status: 404 },
    )
  }
  const executions = await (prisma as any).workflowExecution.findMany({
    where: { ruleId, organizationId: authUser.organizationId },
    orderBy: { startedAt: "desc" },
    take: 25,
    select: {
      id: true,
      trigger: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      actionsRun: true,
      recipientCount: true,
      error: true,
      details: true,
    },
  })
  return NextResponse.json({ success: true, data: executions })
}
