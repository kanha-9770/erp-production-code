import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeOrgAdmin } from "@/lib/tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; slug: string } } // ← Changed: id = orgId, unitId = unit
) {
  try {
    const organizationId = params.id;
    const unitId = params.slug;
    console.log(`GET organization/${organizationId}/units/${unitId}`);
    // Quick existence + ownership check
    const unit = await prisma.organizationUnit.findUnique({
      where: { id: unitId },
      select: { id: true, organizationId: true },
    });

    if (!unit) {
      console.log(`Unit not found: ${unitId}`);
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    if (unit.organizationId !== organizationId) {
      console.log(
        `Unauthorized - unit belongs to ${unit.organizationId}, requested ${organizationId}`
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await authorizeOrgAdmin(request, organizationId);

    const fullUnit = await prisma.organizationUnit.findUnique({
      where: { id: unitId },
      include: {
        parent: true,
        children: true,
        unitRoles: { include: { role: true } },
        userAssignments: { include: { user: true, role: true } },
      },
    });

    if (!fullUnit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    return NextResponse.json(fullUnit);
  } catch (error) {
    console.error("Error fetching unit:", error);
    return NextResponse.json(
      { error: "Failed to fetch unit" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; unitId: string } }
) {
  try {
    const organizationId = params.id;
    const unitId = params.unitId;

    console.log(`PUT organization/${organizationId}/units/${unitId}`);

    const body = await request.json();
    const { name, description, assignedRoles, assignedUsers } = body;

    const unit = await prisma.organizationUnit.findUnique({
      where: { id: unitId },
      select: { organizationId: true },
    });

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    if (unit.organizationId !== organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await authorizeOrgAdmin(request, organizationId);

    const result = await prisma.$transaction(async (tx) => {
      // Update basic info
      const updatedUnit = await tx.organizationUnit.update({
        where: { id: unitId },
        data: {
          name,
          description: description ?? "",
        },
      });

      // Roles replacement (if provided)
      if (assignedRoles !== undefined) {
        await tx.unitRoleAssignment.deleteMany({
          where: { unitId },
        });

        if (Array.isArray(assignedRoles) && assignedRoles.length > 0) {
          await tx.unitRoleAssignment.createMany({
            data: assignedRoles.map((roleId: string) => ({
              unitId,
              roleId,
            })),
            skipDuplicates: true,
          });
        }
      }

      // User assignments replacement (if provided)
      if (assignedUsers !== undefined) {
        await tx.userUnitAssignment.deleteMany({
          where: { unitId },
        });

        if (Array.isArray(assignedUsers) && assignedUsers.length > 0) {
          await tx.userUnitAssignment.createMany({
            data: assignedUsers.map(
              (assignment: { userId: string; roleId: string }) => ({
                userId: assignment.userId,
                unitId,
                roleId: assignment.roleId,
              })
            ),
            skipDuplicates: true,
          });
        }
      }

      // Return fresh data
      return await tx.organizationUnit.findUnique({
        where: { id: unitId },
        include: {
          unitRoles: { include: { role: true } },
          userAssignments: { include: { user: true, role: true } },
          children: true,
          parent: true,
        },
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating unit:", error);
    return NextResponse.json(
      { error: "Failed to update unit" },
      { status: 500 }
    );
  }
}
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; slug: string } }
) {
  const organizationId = params.id?.trim();
  const unitId = params.slug?.trim();

  console.log(`[UNIT-DELETE] Request started`, {
    organizationId,
    unitId,
    timestamp: new Date().toISOString(),
    method: request.method,
  });

  if (!organizationId || !unitId) {
    console.error("[UNIT-DELETE] Missing required parameters", {
      organizationId,
      unitId,
    });
    return NextResponse.json(
      { error: "Missing organization ID or unit ID" },
      { status: 400 }
    );
  }

  try {
    // 1. Find the unit and verify ownership
    const unit = await prisma.organizationUnit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        name: true,
        organizationId: true,
        parentId: true,
        children: { select: { id: true } },
      },
    });

    if (!unit) {
      console.log(`[UNIT-DELETE] Unit not found`, { unitId });
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    if (unit.organizationId !== organizationId) {
      console.warn("[UNIT-DELETE] Organization mismatch", {
        requested: organizationId,
        actual: unit.organizationId,
      });
      return NextResponse.json(
        { error: "Unauthorized - unit does not belong to this organization" },
        { status: 403 }
      );
    }

    console.log(`[UNIT-DELETE] Unit verified`, {
      name: unit.name,
      hasChildren: !!unit.children?.length,
      childrenCount: unit.children?.length ?? 0,
    });

   

    // 3. Perform recursive delete
    let deletedCount = 0;

    const deleteUnitRecursively = async (
      currentId: string,
      depth = 0
    ): Promise<void> => {
      const indent = "  ".repeat(depth);
      console.log(`${indent}[UNIT-DELETE] Processing unit: ${currentId}`);

      // Get children
      const children = await prisma.organizationUnit.findMany({
        where: { parentId: currentId },
        select: { id: true },
      });

      console.log(`${indent}└─ Found ${children.length} children`);

      // Delete children first (depth-first)
      for (const child of children) {
        await deleteUnitRecursively(child.id, depth + 1);
      }

      // Clean up relations
      console.log(`${indent}└─ Cleaning assignments`);
      await prisma.unitRoleAssignment.deleteMany({
        where: { unitId: currentId },
      });
      await prisma.userUnitAssignment.deleteMany({
        where: { unitId: currentId },
      });

      // Delete the unit itself
      console.log(`${indent}└─ Deleting unit ${currentId}`);
      await prisma.organizationUnit.delete({
        where: { id: currentId },
      });

      deletedCount++;
    };

    await deleteUnitRecursively(unitId);

    console.log(`[UNIT-DELETE] Successfully completed`, {
      deletedUnits: deletedCount,
      rootUnit: unit.name,
    });

    return NextResponse.json({
      success: true,
      message: "Unit and all descendants deleted successfully",
      deletedCount,
    });
  } catch (error: any) {
    const errorPayload = {
      message: error.message || "Unknown error",
      code: error.code,
      meta: error.meta ? JSON.stringify(error.meta) : null,
      stack: error.stack?.substring(0, 600) || null,
      prismaErrorCode: error.code,
    };

    console.error("[UNIT-DELETE] FAILED", errorPayload);

    return NextResponse.json(
      {
        error: "Failed to delete unit",
        message: error.message || "Server error during deletion",
        code: error.code || "UNKNOWN",
        details: error.meta ? JSON.stringify(error.meta) : undefined,
      },
      { status: 500 }
    );
  }
}
