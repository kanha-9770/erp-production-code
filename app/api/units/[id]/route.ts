export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeOrgAdmin } from "@/lib/tenant"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const unitId = params.id

    const unit = await prisma.organizationUnit.findUnique({
      where: { id: unitId },
      select: { id: true, organizationId: true },
    })

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
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
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    // ✅ Return the full data instead of the basic one
    return NextResponse.json(full)
  } catch (error) {
    console.error("Error fetching unit:", error)
    return NextResponse.json({ error: "Failed to fetch unit" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    return NextResponse.json({ error: "Failed to update unit" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const unitId = params.id

    // ✅ Use iterative deletion instead of deep recursion to avoid stack overflows
    const queue = [unitId]

    while (queue.length > 0) {
      const currentId = queue.pop()!
      const children = await prisma.organizationUnit.findMany({
        where: { parentId: currentId },
        select: { id: true },
      })

      queue.push(...children.map(c => c.id))

      await prisma.organizationUnit.delete({
        where: { id: currentId },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting unit:", error)
    return NextResponse.json({ error: "Failed to delete unit" }, { status: 500 })
  }
}
