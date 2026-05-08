/**
 * GET /api/workflow-rules/executions
 *
 * Returns workflow execution rows for the caller's organization, with
 * optional filters and an aggregate summary block. Used by the
 * /settings/workflow-rules/executions admin page.
 *
 * Query params (all optional):
 *   ruleId   — restrict to one rule
 *   status   — "success" | "partial" | "failed" | "skipped"
 *   trigger  — "schedule" | "manual" | "record-create" | "record-edit" | "record-delete"
 *   since    — ISO date string; default = 30 days ago
 *   until    — ISO date string; default = now
 *   limit    — page size (1..200, default 100)
 *   offset   — pagination offset
 *
 * Response:
 *   {
 *     success: true,
 *     summary: { total, byStatus, byTrigger, lastRunAt, totalRecipients },
 *     data: WorkflowExecution[],
 *     pagination: { limit, offset, total }
 *   }
 *
 * Why a single endpoint with summary embedded — the page renders both side
 * by side and an admin almost never wants one without the other; saving a
 * round-trip keeps the UI snappy.
 */

export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

const VALID_STATUSES = new Set(["success", "partial", "failed", "skipped"])
const VALID_TRIGGERS = new Set([
  "schedule",
  "manual",
  "record-create",
  "record-edit",
  "record-delete",
])

function parseDate(s: string | null, fallback: Date): Date {
  if (!s) return fallback
  const d = new Date(s)
  return isNaN(d.getTime()) ? fallback : d
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      )
    }
    if (!authUser.organizationId) {
      return NextResponse.json({
        success: true,
        summary: emptySummary(),
        data: [],
        pagination: { limit: 0, offset: 0, total: 0 },
      })
    }

    const { searchParams } = new URL(request.url)
    const ruleId = searchParams.get("ruleId") || undefined
    const status = searchParams.get("status") || undefined
    const trigger = searchParams.get("trigger") || undefined
    const since = parseDate(
      searchParams.get("since"),
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    )
    const until = parseDate(searchParams.get("until"), new Date())
    const limitRaw = Number(searchParams.get("limit") ?? "100")
    const offsetRaw = Number(searchParams.get("offset") ?? "0")
    const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100))
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0)

    const where: any = {
      organizationId: authUser.organizationId,
      startedAt: { gte: since, lte: until },
    }
    if (ruleId) where.ruleId = ruleId
    if (status && VALID_STATUSES.has(status)) where.status = status
    if (trigger && VALID_TRIGGERS.has(trigger)) where.trigger = trigger

    // Fetch the rows + summary in parallel — both query the same indexed
    // (organizationId, startedAt) range so latency stays roughly that of
    // one query.
    const [rows, total, statusGroups, triggerGroups, latest, recipientAgg] =
      await Promise.all([
        (prisma as any).workflowExecution.findMany({
          where,
          orderBy: { startedAt: "desc" },
          skip: offset,
          take: limit,
          select: {
            id: true,
            ruleId: true,
            trigger: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
            actionsRun: true,
            recipientCount: true,
            error: true,
            details: true,
            rule: { select: { name: true, moduleName: true } },
          },
        }),
        (prisma as any).workflowExecution.count({ where }),
        (prisma as any).workflowExecution.groupBy({
          by: ["status"],
          where,
          _count: { _all: true },
        }),
        (prisma as any).workflowExecution.groupBy({
          by: ["trigger"],
          where,
          _count: { _all: true },
        }),
        (prisma as any).workflowExecution.findFirst({
          where,
          orderBy: { startedAt: "desc" },
          select: { startedAt: true },
        }),
        (prisma as any).workflowExecution.aggregate({
          where,
          _sum: { recipientCount: true },
        }),
      ])

    const byStatus: Record<string, number> = {}
    for (const g of statusGroups) byStatus[g.status] = g._count._all
    const byTrigger: Record<string, number> = {}
    for (const g of triggerGroups) byTrigger[g.trigger] = g._count._all

    return NextResponse.json({
      success: true,
      summary: {
        total,
        byStatus,
        byTrigger,
        lastRunAt: latest?.startedAt ?? null,
        totalRecipients: recipientAgg?._sum?.recipientCount ?? 0,
        windowFrom: since.toISOString(),
        windowTo: until.toISOString(),
      },
      data: rows,
      pagination: { limit, offset, total },
    })
  } catch (err: any) {
    console.error("[GET /api/workflow-rules/executions]", err)
    return NextResponse.json(
      { success: false, error: err?.message || "internal error" },
      { status: 500 },
    )
  }
}

function emptySummary() {
  return {
    total: 0,
    byStatus: {},
    byTrigger: {},
    lastRunAt: null,
    totalRecipients: 0,
    windowFrom: null,
    windowTo: null,
  }
}
