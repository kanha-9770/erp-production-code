export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

/**
 * GET /api/route-permissions/access?routeId=...
 * Returns role and user access for a specific route permission.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const routeId = searchParams.get("routeId")

    if (!routeId) {
      return NextResponse.json({ error: "routeId is required" }, { status: 400 })
    }

    const [roleAccess, userAccess] = await Promise.all([
      prisma.routeRoleAccess.findMany({
        where: { routePermissionId: routeId },
        select: { id: true, roleId: true, granted: true },
      }),
      prisma.routeUserAccess.findMany({
        where: { routePermissionId: routeId },
        select: { id: true, userId: true, granted: true },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: { roleAccess, userAccess },
    })
  } catch (error) {
    console.error("[GET /api/route-permissions/access]", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch access data" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/route-permissions/access
 * Batch update role and user access for a route.
 * Body: { routeId, roleUpdates: [{roleId, granted}], userUpdates: [{userId, granted}] }
 */
export async function PUT(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const body = await request.json()
    const { routeId, roleUpdates, userUpdates } = body as {
      routeId: string
      roleUpdates?: Array<{ roleId: string; granted: boolean }>
      userUpdates?: Array<{ userId: string; granted: boolean }>
    }

    if (!routeId) {
      return NextResponse.json({ error: "routeId is required" }, { status: 400 })
    }

    // Verify route belongs to org
    const route = await prisma.routePermission.findFirst({
      where: { id: routeId, organizationId: authUser.organizationId },
    })
    if (!route) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      // Process role updates — upsert granted value (true or false)
      // Keeping granted:false records ensures the route stays restricted
      // (deleting all records would make the route open to everyone)
      if (roleUpdates?.length) {
        for (const update of roleUpdates) {
          await tx.routeRoleAccess.upsert({
            where: {
              routePermissionId_roleId: {
                routePermissionId: routeId,
                roleId: update.roleId,
              },
            },
            update: { granted: update.granted },
            create: {
              routePermissionId: routeId,
              roleId: update.roleId,
              granted: update.granted,
            },
          })
        }
      }

      // Process user updates — upsert granted value (true or false)
      if (userUpdates?.length) {
        for (const update of userUpdates) {
          await tx.routeUserAccess.upsert({
            where: {
              routePermissionId_userId: {
                routePermissionId: routeId,
                userId: update.userId,
              },
            },
            update: { granted: update.granted },
            create: {
              routePermissionId: routeId,
              userId: update.userId,
              granted: update.granted,
            },
          })
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[PUT /api/route-permissions/access]", error)
    return NextResponse.json(
      { success: false, error: "Failed to update access" },
      { status: 500 }
    )
  }
}
