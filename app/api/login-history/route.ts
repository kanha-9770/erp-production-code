// app/api/login-history/route.ts

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateSession } from "@/lib/auth2"

export async function GET(request: NextRequest) {
  try {
    // Authenticate the user
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const session = await validateSession(token)
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const currentUser = session.user
    const organizationId = currentUser.organizationId

    // Determine if the user is an admin/owner of their organization
    const isOrgOwner = currentUser.organization?.ownerId === currentUser.id
    const isSystemAdmin = currentUser.permissions?.some(
      (p: any) => p.isSystemAdmin && p.isActive && p.granted
    )
    const isRoleAdmin = currentUser.unitAssignments?.some(
      (a: any) => a.role?.isAdmin || a.role?.name?.toUpperCase() === "ADMIN"
    )
    const isAdmin = isOrgOwner || isSystemAdmin || isRoleAdmin

    // Build the where clause based on role
    let whereClause: any = {}

    if (isAdmin && organizationId) {
      // Admin: see all login history for users in their organization
      const orgUsers = await prisma.user.findMany({
        where: { organizationId },
        select: { id: true, email: true },
      })
      const userIds = orgUsers.map((u) => u.id)
      const userEmails = orgUsers.map((u) => u.email.toLowerCase())
      // Match by userId OR email to include failed logins without userId
      whereClause = {
        OR: [
          { userId: { in: userIds } },
          { userId: null, email: { in: userEmails } },
        ],
      }
    } else {
      // Regular user: see only their own login history
      whereClause = {
        OR: [
          { userId: currentUser.id },
          { userId: null, email: currentUser.email },
        ],
      }
    }

    const history = await prisma.loginHistory.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 500,
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

    const formattedHistory = history.map((entry) => ({
      ...entry,
      userFullName:
        entry.user
          ? `${entry.user.first_name || ""} ${entry.user.last_name || ""}`.trim() || entry.email
          : null,
    }))

    return NextResponse.json(formattedHistory)
  } catch (error) {
    console.error("Error fetching login history:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch login history" },
      { status: 500 }
    )
  }
}