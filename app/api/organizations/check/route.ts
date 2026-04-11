export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const userId = authUser.id

    // Check if user has an organization
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        unitAssignments: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const hasOrganization = !!user.organizationId
    const isAdmin = user.unitAssignments.some(
      (assignment) =>
        assignment.role.isAdmin ||
        (assignment.role.name ?? "").toLowerCase().includes("admin"),
    )

    return NextResponse.json({
      hasOrganization,
      isAdmin,
      organization: user.organization,
    })
  } catch (error: any) {
    console.error("Check organization error:", error)
    return NextResponse.json({ error: "Failed to check organization", details: error.message }, { status: 500 })
  }
}
