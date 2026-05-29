export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeOrgAdmin } from "@/lib/tenant"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import { moveToTrash } from "@/lib/trash"

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const unitId = params.id

    const unit = await prisma.organizationUnit.findUnique({
      where: { id: unitId },
      select: { id: true, organizationId: true },
    })

    if (!unit) {
      return NextResponse.json({ success: false, error: "Unit not found" }, { status: 404 })
    }

    await authorizeOrgAdmin(request, unit.organizationId)

    const full = await prisma.organizationUnit.findUnique({
      where: { id: unitId },
      include: {
        parent: true,
        children: true,
        unitRoles: { include: { role: true } },
        userAssignments: { include: { user: true, role: true } },
      },
    })

    if (!full) {
      return NextResponse.json({ success: false, error: "Unit not found" }, { status: 404 })
    }

    // ✅ Return the full data instead of the basic one
    return NextResponse.json(full)
  } catch (error) {
    console.error("Error fetching unit:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch unit" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const unitId = params.id
    const { name, description, assignedRoles, assignedUsers } = await request.json()

    // ✅ Use a longer timeout and simpler transaction logic
    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Update the main unit
      await tx.organizationUnit.update({
        where: { id: unitId },
        data: {
          name,
          description: description || "",
        },
      })

      // 2️⃣ Update roles (if provided)
      if (assignedRoles !== undefined) {
        await tx.unitRoleAssignment.deleteMany({ where: { unitId } })

        if (assignedRoles.length > 0) {
          const roleData = assignedRoles.map((roleId: string) => ({
            unitId,
            roleId,
          }))
          await tx.unitRoleAssignment.createMany({ data: roleData })
        }
      }

      // 3️⃣ Update user assignments (if provided)
      if (assignedUsers !== undefined) {
        await tx.userUnitAssignment.deleteMany({ where: { unitId } })

        if (assignedUsers.length > 0) {
          const userData = assignedUsers.map((a: { userId: string; roleId: string }) => ({
            userId: a.userId,
            unitId,
            roleId: a.roleId,
          }))
          await tx.userUnitAssignment.createMany({ data: userData })
        }
      }

      // 4️⃣ Return the updated record
      return tx.organizationUnit.findUnique({
        where: { id: unitId },
        include: {
          unitRoles: { include: { role: true } },
          userAssignments: { include: { user: true, role: true } },
          children: true,
          parent: true,
        },
      })
    }, {
      timeout: 15000, // ✅ allow up to 15s safely
      maxWait: 5000,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error updating unit:", error)
    return NextResponse.json({ success: false, error: "Failed to update unit" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const unitId = params.id
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    // Iteratively walk the unit subtree (post-order: deepest children first) so
    // each unit's trash snapshot has no dangling FK to a parent that's already
    // gone. Each leaf gets its own TrashBin row — restoring a parent does NOT
    // restore children automatically; they appear as separate restorable items
    // in the recycle bin.
    const stack: string[] = [unitId]
    const order: string[] = []

    while (stack.length > 0) {
      const currentId = stack.pop()!
      order.push(currentId)
      const children = await prisma.organizationUnit.findMany({
        where: { parentId: currentId },
        select: { id: true },
      })
      stack.push(...children.map(c => c.id))
    }

    // Delete in reverse discovery order = leaves first, root last.
    for (const id of order.reverse()) {
      await moveToTrash("OrganizationUnit", id, {
        userId: user.id,
        userName: user.email,
        organizationId: user.organizationId,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting unit:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to delete unit" }, { status: 500 })
  }
}
