export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

/**
 * POST /api/route-permissions/sync
 * Body: { routes: string[] }
 *
 * Ensures a RoutePermission record exists for every route in the list.
 * Creates missing records without touching existing ones.
 * Returns the full list of RoutePermission records.
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const { routes } = (await request.json()) as { routes: string[] }

    if (!Array.isArray(routes)) {
      return NextResponse.json({ error: "routes must be an array" }, { status: 400 })
    }

    const orgId = authUser.organizationId

    // Get existing route patterns for this org
    const existing = await prisma.routePermission.findMany({
      where: { organizationId: orgId },
      select: { pattern: true },
    })
    const existingPatterns = new Set(existing.map((r) => r.pattern))

    // Create missing routes
    const toCreate = routes.filter((r) => !existingPatterns.has(r))

    if (toCreate.length > 0) {
      await prisma.routePermission.createMany({
        data: toCreate.map((pattern) => ({
          pattern,
          organizationId: orgId,
        })),
        skipDuplicates: true,
      })
    }

    // Return all routes
    const allRoutes = await prisma.routePermission.findMany({
      where: { organizationId: orgId },
      orderBy: { pattern: "asc" },
      include: {
        roleAccess: { select: { roleId: true, granted: true } },
        userAccess: { select: { userId: true, granted: true } },
      },
    })

    return NextResponse.json({
      success: true,
      data: allRoutes,
      meta: { created: toCreate.length, total: allRoutes.length },
    })
  } catch (error) {
    console.error("[POST /api/route-permissions/sync]", error)
    return NextResponse.json(
      { success: false, error: "Failed to sync routes" },
      { status: 500 }
    )
  }
}
