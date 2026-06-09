/**
 * Organization API Handlers
 * Centralized business logic for: Org Units, Roles, Employee Permissions
 *
 * Usage in route files:
 *   import { OrganizationHandlers as H } from "@/lib/api-handlers/organization"
 *   export const GET = (req) => H.getOrgUnits(req)
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DatabaseRoles } from "@/lib/database/DatabaseRoles";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { moveToTrash } from "@/lib/trash";

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
  async deleteRole(request: NextRequest, roleId: string): Promise<NextResponse> {
    return handle(async () => {
      const user = await requireAuth(request);
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true, name: true, organizationId: true, isAdmin: true, parentId: true },
      });

      if (!role)
        return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });

      if (role.isAdmin)
        return NextResponse.json({ success: false, error: "Admin roles are protected and cannot be deleted" }, { status: 403 });

      // ── "Delete & promote children" mode (?promoteChildren=true) ───────────
      // Remove ONLY this role and lift its direct children (with their whole
      // subtrees) up to this role's parent, shifting their level up by one —
      // the inverse of "insert between". The role itself still goes to the
      // recycle bin; its descendants are preserved in place, just one level
      // higher. The default (no flag) path below still deletes the whole
      // subtree, so existing behaviour is unchanged.
      const promoteChildren =
        new URL(request.url).searchParams.get("promoteChildren") === "true";
      if (promoteChildren) {
        const orgId = role.organizationId;
        const movedCount = await prisma.$transaction(async (tx) => {
          // Snapshot the role's CURRENT direct children before re-parenting.
          const children = await tx.role.findMany({
            where: { parentId: roleId, organizationId: orgId },
            select: { id: true },
          });
          const childIds = children.map((c) => c.id);

          if (childIds.length > 0) {
            // Re-parent the children onto this role's parent (null → top-level).
            await tx.role.updateMany({
              where: { id: { in: childIds }, organizationId: orgId },
              data: { parentId: role.parentId },
            });

            // Shift level -1 across the promoted subtree (children + all of
            // their descendants). Recursive CTE keeps a deep tree to one query;
            // depth capped at 50 as a cycle safety net. GREATEST guards against
            // ever producing a negative level. Mirrors insertRoleBetween's
            // cascade, in reverse.
            await tx.$executeRaw`
              WITH RECURSIVE subtree AS (
                SELECT id, 0 AS depth
                FROM roles
                WHERE id IN (${Prisma.join(childIds)})
                  AND organization_id = ${orgId}
                  AND is_active = true
                UNION ALL
                SELECT r.id, s.depth + 1
                FROM roles r
                JOIN subtree s ON r.parent_id = s.id
                WHERE r.organization_id = ${orgId}
                  AND r.is_active = true
                  AND s.depth < 50
              )
              UPDATE roles
              SET level = GREATEST(level - 1, 0), updated_at = NOW()
              WHERE id IN (SELECT id FROM subtree)
            `;
          }

          // Drop the role's own dependent rows so the single-row trash delete
          // below can't hit an FK violation (same rows the subtree path clears).
          await tx.rolePermission.deleteMany({ where: { roleId } });
          await tx.unitRoleAssignment.deleteMany({ where: { roleId } });
          await tx.userUnitAssignment.deleteMany({ where: { roleId } });

          return childIds.length;
        });

        // Snapshot + delete just this one role (children are already detached).
        await moveToTrash("Role", roleId, {
          userId: user.id,
          userName: user.email,
          organizationId: user.organizationId,
        });

        return NextResponse.json({
          success: true,
          message:
            movedCount > 0
              ? "Role moved to recycle bin; its sub-roles were promoted one level up"
              : "Role moved to recycle bin",
          promotedCount: movedCount,
        });
      }

      // Walk descendants first, then snapshot each role into TrashBin (leaves
      // first so each snapshot's parentId still resolves) and hard-delete.
      // Permission/assignment rows are NOT snapshotted — restoring a role
      // brings the role back, but admins must reassign users and reapply
      // permissions.
      const allRoleIds = await prisma.$transaction((tx) => collectDescendants(tx, roleId));
      if (allRoleIds.length === 0) throw new Error("No roles found to delete");

      // Drop dependent rows first to avoid FK violations during snapshot delete.
      await prisma.rolePermission.deleteMany({ where: { roleId: { in: allRoleIds } } });
      await prisma.unitRoleAssignment.deleteMany({ where: { roleId: { in: allRoleIds } } });
      await prisma.userUnitAssignment.deleteMany({ where: { roleId: { in: allRoleIds } } });

      // Order leaves-first by reversing depth-first traversal. collectDescendants
      // returns parents before children, so reversing puts leaves at the front.
      for (const id of [...allRoleIds].reverse()) {
        await moveToTrash("Role", id, {
          userId: user.id,
          userName: user.email,
          organizationId: user.organizationId,
        });
      }

      return NextResponse.json({
        success: true,
        message: "Role and all descendants moved to recycle bin",
        deletedCount: allRoleIds.length,
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
