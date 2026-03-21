/**
 * Organization API Handlers
 * Centralized business logic for: Org Units, Roles, Employee Permissions
 *
 * Usage in route files:
 *   import { OrganizationHandlers as H } from "@/lib/api-handlers/organization"
 *   export const GET = (req) => H.getOrgUnits(req)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DatabaseRoles } from "@/lib/database/DatabaseRoles";
import { getAuthenticatedUser } from "@/lib/api-helpers";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 }
    );
  return user;
}

async function handle(
  fn: () => Promise<NextResponse>,
  label: string
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[OrganizationHandlers] ${label}:`, e?.message);
    return NextResponse.json(
      { success: false, error: e?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORG UNIT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const OrganizationHandlers = {
  // GET /api/organization-units
  async getOrgUnits(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const user = await requireAuth(request);

      const units = await prisma.organizationUnit.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: {
          id: true, name: true, description: true,
          level: true, parentId: true, sortOrder: true,
        },
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      });

      const data = units.map((u) => ({
        id: u.id, name: u.name, level: u.level,
        parentId: u.parentId, description: u.description || undefined,
      }));

      return NextResponse.json({
        success: true, data, count: data.length,
        organizationId: user.organizationId,
      });
    }, "getOrgUnits");
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  // DELETE /api/roles/[id]  – cascade-deletes role and all descendants
  async deleteRole(_request: NextRequest, roleId: string): Promise<NextResponse> {
    return handle(async () => {
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true, name: true, organizationId: true },
      });

      if (!role)
        return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });

      const result = await prisma.$transaction(async (tx) => {
        const allRoleIds = await collectDescendants(tx, roleId);
        if (allRoleIds.length === 0) throw new Error("No roles found to delete");

        await tx.rolePermission.deleteMany({ where: { roleId: { in: allRoleIds } } });
        await tx.unitRoleAssignment.deleteMany({ where: { roleId: { in: allRoleIds } } });
        await tx.userUnitAssignment.deleteMany({ where: { roleId: { in: allRoleIds } } });
        await tx.role.deleteMany({ where: { id: { in: allRoleIds } } });

        return { deletedCount: allRoleIds.length };
      });

      return NextResponse.json({
        success: true,
        message: "Role and all descendants deleted successfully",
        deletedCount: result.deletedCount,
      });
    }, "deleteRole").catch((e: any) => {
      // Map Prisma FK / not-found errors to clean HTTP responses
      let status = 500;
      let error = "Failed to delete role";
      if (e?.code === "P2003") {
        status = 409;
        error = "Cannot delete this role because it is still used in permissions or assignments";
      } else if (e?.code === "P2025") {
        status = 404;
        error = "Role not found";
      }
      return NextResponse.json({ success: false, error, code: e?.code }, { status });
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EMPLOYEE PERMISSION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/employees/permissions
  async getEmployeePermissions(_request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const [employees, modules] = await Promise.all([
        DatabaseRoles.getEmployeesWithPermissions(),
        DatabaseRoles.getModulesWithSubmodules(),
      ]);
      return NextResponse.json({ success: true, data: { employees, modules } });
    }, "getEmployeePermissions");
  },

  // POST /api/employees/permissions
  async updateEmployeePermissions(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const body = await request.json();
      const { employeeId, batchUpdates } = body;

      if (!employeeId)
        return NextResponse.json({ success: false, error: "Employee ID is required" }, { status: 400 });
      if (!batchUpdates || !Array.isArray(batchUpdates))
        return NextResponse.json({ success: false, error: "Batch updates array is required" }, { status: 400 });

      const employee = await DatabaseRoles.getUserById(employeeId);
      if (!employee)
        return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });

      const permissionUpdates = batchUpdates.map((u: any) => ({
        permissionName: `${u.moduleId}:${u.submoduleId}:${u.permissionType}`,
        value: u.value,
      }));

      await DatabaseRoles.updateUserPermissionsBatch(employeeId, permissionUpdates);

      return NextResponse.json({
        success: true,
        message: `Successfully updated ${batchUpdates.length} permissions for employee ${employeeId}`,
        data: { employeeId, updatesCount: batchUpdates.length },
      });
    }, "updateEmployeePermissions");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal: recursively collect role + all descendants
// ─────────────────────────────────────────────────────────────────────────────
async function collectDescendants(
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
    ids.push(...(await collectDescendants(tx, id, visited)));
  }
  return ids;
}
