// app/api/audit-log/route.ts

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    if (!authUser.organizationId) {
      return NextResponse.json(
        { error: "User not associated with any organization" },
        { status: 403 }
      )
    }

    // Check if user has admin-level access via role assignments
    const userWithRoles = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        unitAssignments: {
          select: { role: { select: { isAdmin: true } } },
        },
      },
    })

    const isOrgAdmin = userWithRoles?.unitAssignments.some(
      (ua) => ua.role.isAdmin === true
    ) ?? false

    // Build query: base filter by organization; non-admins see only their own logs
    const where = isOrgAdmin
      ? { organizationId: authUser.organizationId }
      : { organizationId: authUser.organizationId, userId: authUser.id }

    const logs = await prisma.auditLog.findMany({
      where,
      take: 500,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            first_name: true,
            last_name: true,
            email: true,
            avatar: true,
          },
        },
      },
    })

    const formattedLogs = logs.map((log) => {
      const fullName = log.user
        ? `${log.user.first_name || ""} ${log.user.last_name || ""}`.trim() || log.performedBy
        : log.performedBy

      return {
        id: log.id,
        performedBy: log.performedBy,
        userFullName: fullName,
        avatar: log.user?.avatar || null,
        action: log.action,
        module: log.module,
        record: log.recordName || log.recordId || "-",
        details: log.details || "No additional details",
        ipAddress: log.ipAddress || "-",
        userAgent: log.userAgent || "-",
        timestamp: log.createdAt.toISOString(),
      }
    })

    return NextResponse.json(formattedLogs)
  } catch (error) {
    console.error("Audit log fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    )
  }
}
