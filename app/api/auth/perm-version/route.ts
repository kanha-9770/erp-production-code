export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateSession } from "@/lib/auth"
import { buildKey, cachedSWR } from "@/lib/cache"

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

    // This endpoint is POLLED by every open tab (see RoutePermissionGuard), so
    // each org's `version` is cached in Redis. cachedSWR serves the cached
    // value for `fresh` seconds and refreshes in the background (de-duped per
    // key) — collapsing N tabs × M users into ~1 DB read per org per window,
    // instead of 2 ordered queries per poll per tab. Permission changes are
    // rare and the client polls at 60s, so a 10s cache adds no meaningful
    // detection delay.
    const version = await cachedSWR(
      "auth",
      buildKey("auth", "perm-version", orgId),
      10, // fresh seconds
      60, // retained (stale) seconds
      async () => {
        const [roleAccessLatest, userAccessLatest] = await Promise.all([
          prisma.routeRoleAccess.findFirst({
            where: { routePermission: { organizationId: orgId } },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true },
          }),
          prisma.routeUserAccess.findFirst({
            where: { routePermission: { organizationId: orgId } },
            orderBy: { updatedAt: "desc" },
            select: { updatedAt: true },
          }),
        ])
        return Math.max(
          roleAccessLatest?.updatedAt?.getTime() ?? 0,
          userAccessLatest?.updatedAt?.getTime() ?? 0,
        )
      },
    )

    return NextResponse.json({ success: true, data: { version } })
  } catch (error) {
    console.error("[GET /api/auth/perm-version]", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
