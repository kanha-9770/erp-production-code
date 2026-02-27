import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateSession } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const session = await validateSession(token)

    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 })
    }

    const userId = session.user.id

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    })

    if (existingUser?.organizationId) {
      return NextResponse.json({ error: "User already belongs to an organization" }, { status: 400 })
    }

    // Get organization data from request
    const body = await request.json()
    const { name } = body

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: "Organization name must be at least 2 characters" }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create the organization
      const organization = await tx.organization.create({
        data: {
          name: name.trim(),
        },
      })

      // Create the root organization unit with level 0
      const rootUnit = await tx.organizationUnit.create({
        data: {
          name: `${name} - Root`,
          description: "Root organizational unit",
          organizationId: organization.id,
          level: 0,
          sortOrder: 0,
        },
      })

      // Create the ADMIN role for this organization
      const adminRole = await tx.role.create({
        data: {
          name: "ADMIN",
          description: "Administrator with full access to the organization",
          organizationId: organization.id,
        },
      })

      // Update user with organization
      await tx.user.update({
        where: { id: userId },
        data: {
          organizationId: organization.id,
        },
      })

      // Assign user to root unit with ADMIN role
      await tx.userUnitAssignment.create({
        data: {
          userId: userId,
          unitId: rootUnit.id,
          roleId: adminRole.id,
          notes: "Organization creator and administrator",
        },
      })

      return {
        organization,
        rootUnit,
        adminRole,
      }
    })

    return NextResponse.json({
      success: true,
      message: "Organization created successfully",
      organization: {
        id: result.organization.id,
        name: result.organization.name,
      },
    })
  } catch (error: any) {
    console.error("Organization creation error:", error)
    return NextResponse.json({ error: "Failed to create organization", details: error.message }, { status: 500 })
  }
}
