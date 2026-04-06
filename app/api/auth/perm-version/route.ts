export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateSession } from "@/lib/auth"

/**
 * GET /api/auth/perm-version
 *
 * Lightweight endpoint that returns the latest route-permission change
 * timestamp for the current user's organization. Used by the client-side
 * RoutePermissionGuard to detect when permissions have been updated by
 * an admin so it can refresh the auth-meta cookie automatically.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const session = await validateSession(token)
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 })
    }

    const orgId = session.user.organizationId
    if (!orgId) {
      return NextResponse.json({ success: true, data: { version: 0 } })
    }

    // Get the latest updatedAt across both role-access and user-access tables
    // for this organization's route permissions.
    const [roleAccessLatest, userAccessLatest] = await Promise.all([
      prisma.routeRoleAccess.findFirst({
        where: {
          routePermission: { organizationId: orgId },
        },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.routeUserAccess.findFirst({
        where: {
          routePermission: { organizationId: orgId },
        },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ])

    const timestamps = [
      roleAccessLatest?.updatedAt?.getTime() ?? 0,
      userAccessLatest?.updatedAt?.getTime() ?? 0,
    ]
    const version = Math.max(...timestamps)

    return NextResponse.json({ success: true, data: { version } })
  } catch (error) {
    console.error("[GET /api/auth/perm-version]", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
