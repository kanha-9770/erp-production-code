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

  console.log(`[API] DELETE /roles/${roleId} - Started`);

  try {
    // 1. Quick existence check + basic info
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, organizationId: true },
    });

    if (!role) {
      console.log(`[API] DELETE /roles/${roleId} - Role not found`);
      return NextResponse.json(
        { success: false, error: "Role not found" },
        { status: 404 }
      );
    }

    console.log(`[API] DELETE /roles/${roleId} - Role found: "${role.name}"`);

    // 2. Do everything in one transaction
    const result = await prisma.$transaction(async (tx) => {
      console.log(`[TX] Collecting all descendant roles for ${roleId}...`);

      const allRoleIds = await collectAllDescendantIds(tx, roleId);

      if (allRoleIds.length === 0) {
        throw new Error("No roles found to delete");
      }

      console.log(`[TX] Found ${allRoleIds.length} roles to delete`);

      // 3. Clean up dependent records first (important order!)
      console.log(`[TX] Deleting role permissions...`);
      const perms = await tx.rolePermission.deleteMany({
        where: { roleId: { in: allRoleIds } },
      });
      console.log(`[TX] → Deleted ${perms.count} role permissions`);

      console.log(`[TX] Deleting unit role assignments...`);
      const unitRoles = await tx.unitRoleAssignment.deleteMany({
        where: { roleId: { in: allRoleIds } },
      });
      console.log(`[TX] → Deleted ${unitRoles.count} unit role assignments`);

      console.log(`[TX] Deleting user unit assignments...`);
      const userAssignments = await tx.userUnitAssignment.deleteMany({
        where: { roleId: { in: allRoleIds } },
      });
      console.log(`[TX] → Deleted ${userAssignments.count} user role assignments`);

      // 4. Finally delete the roles
      console.log(`[TX] Deleting roles themselves...`);
      const rolesDeleted = await tx.role.deleteMany({
        where: { id: { in: allRoleIds } },
      });

      console.log(`[TX] → Deleted ${rolesDeleted.count} roles`);

      return { deletedCount: allRoleIds.length };
    });

    console.log(`[API] DELETE /roles/${roleId} - SUCCESS - Deleted ${result.deletedCount} roles`);

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