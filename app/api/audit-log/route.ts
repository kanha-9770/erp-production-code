// // app/api/audit-log/route.ts
// import { NextResponse } from "next/server"
// import { prisma } from "@/lib/prisma"

// export async function GET() {
//   try {
//     const logs = await prisma.auditLog.findMany({
//       take: 500,
//       orderBy: { createdAt: "desc" },
//       include: {
//         user: {
//           select: {
//             first_name: true,
//             last_name: true,
//             email: true,
//             avatar: true,
//           },
//         },
//       },
//     })

//     const formattedLogs = logs.map((log) => {
//       const fullName = log.user
//         ? `${log.user.first_name || ""} ${log.user.last_name || ""}`.trim() || log.performedBy
//         : log.performedBy

//       return {
//         id: log.id,
//         performedBy: log.performedBy,
//         userFullName: fullName,
//         avatar: log.user?.avatar || null,
//         action: log.action,
//         module: log.module,
//         record: log.recordName || log.recordId || "-",
//         details: log.details || "No additional details",
//         ipAddress: log.ipAddress || "-",
//         userAgent: log.userAgent || "-", // Full user agent like Zoho
//         timestamp: log.createdAt.toISOString(),
//       }
//     })

//     return NextResponse.json(formattedLogs)
//   } catch (error) {
//     console.error("Audit log fetch error:", error)
//     return NextResponse.json(
//       { error: "Failed to fetch audit logs" },
//       { status: 500 }
//     )
//   }
// }


// app/api/audit-log/route.ts

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    // 1. Get and validate session
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const session = await validateSession(token)
    if (!session || !session.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 })
    }

    const userId = session.user.id

    // 2. Fetch current user with organization and role/unit info
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        organizationId: true,
        // Check if user has admin-level access via role assignments
        unitAssignments: {
          select: {
            role: {
              select: {
                isAdmin: true,
              },
            },
          },
        },
        // Optional: check for direct permission overrides if you have system-wide admin flag
        // permissions: { ... }
      },
    })

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!currentUser.organizationId) {
      return NextResponse.json(
        { error: "User not associated with any organization" },
        { status: 403 }
      )
    }

    // 3. Determine if user is admin
    const isOrgAdmin = currentUser.unitAssignments.some(
      (ua) => ua.role.isAdmin === true
    )

    // Optional: You could also check for a specific "AUDIT_LOG_ADMIN" permission
    // const hasAuditPermission = await checkPermission(currentUser.id, "VIEW_ALL_AUDIT_LOGS")

    // 4. Build query: base filter by organization
    const baseWhere = {
      organizationId: currentUser.organizationId,
    }

    // 5. If not admin → restrict to only their own actions
    const where = isOrgAdmin
      ? baseWhere // Admin sees all in organization
      : {
          ...baseWhere,
          userId: currentUser.id, // Regular user sees only their own logs
        }

    // 6. Fetch logs
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

    // 7. Format response
    const formattedLogs = logs.map((log) => {
      const fullName = log.user
        ? `${log.user.first_name || ""} ${log.user.last_name || ""}`.trim() ||
          log.performedBy
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