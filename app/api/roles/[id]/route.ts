// app/api/roles/[id]/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // ← make sure this is your prisma client import

/**
 * Recursively collect ALL descendant role IDs (including the role itself)
 */
async function collectAllDescendantIds(
  tx: any,
  roleId: string,
  visited = new Set<string>()
): Promise<string[]> {
  if (visited.has(roleId)) return [];

  visited.add(roleId);
  const ids = [roleId];

  const children = await tx.role.findMany({
    where: { parentId: roleId },
    select: { id: true },
  });

  for (const { id } of children) {
    const descendants = await collectAllDescendantIds(tx, id, visited);
    ids.push(...descendants);
  }

  return ids;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const roleId = params.id;

  try {
    // 1. Quick existence check + basic info
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, organizationId: true },
    });

    if (!role) {
      return NextResponse.json(
        { success: false, error: "Role not found" },
        { status: 404 }
      );
    }

    // 2. Do everything in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const allRoleIds = await collectAllDescendantIds(tx, roleId);

      if (allRoleIds.length === 0) {
        throw new Error("No roles found to delete");
      }

      // 3. Clean up dependent records first (important order!)
      const perms = await tx.rolePermission.deleteMany({
        where: { roleId: { in: allRoleIds } },
      });

      const unitRoles = await tx.unitRoleAssignment.deleteMany({
        where: { roleId: { in: allRoleIds } },
      });

      const userAssignments = await tx.userUnitAssignment.deleteMany({
        where: { roleId: { in: allRoleIds } },
      });

      // 4. Finally delete the roles
      const rolesDeleted = await tx.role.deleteMany({
        where: { id: { in: allRoleIds } },
      });

      return { deletedCount: allRoleIds.length };
    });

    return NextResponse.json({
      success: true,
      message: "Role and all descendants deleted successfully",
      deletedCount: result.deletedCount,
    });

  } catch (error: any) {
    console.error(`[API] DELETE /roles/${roleId} - FAILED`, {
      message: error.message,
      code: error.code,
      meta: error.meta || "no meta",
      stack: error.stack?.substring(0, 300) + (error.stack?.length > 300 ? "..." : ""),
    });

    let status = 500;
    let userMessage = "Failed to delete role";

    if (error.code === "P2003") {
      status = 409;
      userMessage =
        "Cannot delete this role because it (or its children) is still used in permissions, user assignments or other records";
    } else if (error.code === "P2025") {
      status = 404;
      userMessage = "Role not found";
    }

    return NextResponse.json(
      {
        success: false,
        error: userMessage,
        code: error.code || "UNKNOWN_ERROR",
      },
      { status }
    );
  }
}