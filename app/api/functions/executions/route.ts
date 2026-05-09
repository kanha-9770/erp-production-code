/**
 * GET /api/functions/executions
 *
 * Returns FunctionExecution rows for the caller's organization with optional
 * filters and a summary aggregation. Powers the /settings/functions/executions
 * page (and the per-function logs panel via ?functionId=).
 *
 * Query params (all optional):
 *   functionId — restrict to one function
 *   status     — "success" | "failed"
 *   trigger    — "manual" | "test" | "workflow" | "scheduled" | "binding" | "rest-api"
 *   since      — ISO date; default = 30 days ago
 *   until      — ISO date; default = now
 *   limit      — page size (1..200, default 100)
 *   offset     — pagination offset
 *
 * Response shape mirrors /api/workflow-rules/executions for symmetry — the UI
 * pages are nearly identical and share styling.
 */

export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

const VALID_STATUSES = new Set(["success", "failed"])
const VALID_TRIGGERS = new Set([
  "manual",
  "test",
  "workflow",
  "scheduled",
  "binding",
  "rest-api",
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
        summary: {
          total: 0,
          byStatus: {},
          byTrigger: {},
          lastRunAt: null,
          totalDurationMs: 0,
          windowFrom: null,
          windowTo: null,
        },
        data: [],
        pagination: { limit: 0, offset: 0, total: 0 },
      })
    }

    const { searchParams } = new URL(request.url)
    const functionId = searchParams.get("functionId") || undefined
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
    if (functionId) where.functionId = functionId
    if (status && VALID_STATUSES.has(status)) where.status = status
    if (trigger && VALID_TRIGGERS.has(trigger)) where.trigger = trigger

    const [rows, total, statusGroups, triggerGroups, latest, durationAgg] =
      await Promise.all([
        (prisma as any).functionExecution.findMany({
          where,
          orderBy: { startedAt: "desc" },
          skip: offset,
          take: limit,
          select: {
            id: true,
            functionId: true,
            trigger: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
            input: true,
            result: true,
            logs: true,
            error: true,
            userId: true,
            function: { select: { name: true, displayName: true, category: true } },
            user: { select: { id: true, email: true, first_name: true, last_name: true } },
          },
        }),
        (prisma as any).functionExecution.count({ where }),
        (prisma as any).functionExecution.groupBy({
          by: ["status"],
          where,
          _count: { _all: true },
        }),
        (prisma as any).functionExecution.groupBy({
          by: ["trigger"],
          where,
          _count: { _all: true },
        }),
        (prisma as any).functionExecution.findFirst({
          where,
          orderBy: { startedAt: "desc" },
          select: { startedAt: true },
        }),
        (prisma as any).functionExecution.aggregate({
          where,
          _sum: { durationMs: true },
          _avg: { durationMs: true },
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
        totalDurationMs: durationAgg?._sum?.durationMs ?? 0,
        avgDurationMs: Math.round(durationAgg?._avg?.durationMs ?? 0),
        windowFrom: since.toISOString(),
        windowTo: until.toISOString(),
      },
      data: rows,
      pagination: { limit, offset, total },
    })
  } catch (err: any) {
    console.error("[GET /api/functions/executions]", err)
    return NextResponse.json(
      { success: false, error: err?.message || "internal error" },
      { status: 500 },
    )
  }
}
