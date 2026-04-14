import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { resourceType: string; resourceId: string } }
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      console.error("[Permissions GET] User not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { resourceType, resourceId } = params;
    console.log("[Permissions GET] resourceType:", resourceType, "resourceId:", resourceId);

    if (!resourceId) {
      return NextResponse.json({ error: "Resource ID is required" }, { status: 400 });
    }

    // Get all roles in organization
    const allRoles = await prisma.role.findMany({
      where: { organizationId: authUser.organizationId },
      orderBy: { sortOrder: "asc" },
    });

    console.log("[Permissions GET] All roles:", allRoles.length);
    allRoles.forEach((r) => {
      console.log("[Permissions GET] Role:", r.id, r.name, "isActive:", r.isActive, "isAdmin:", r.isAdmin);
    });

    // Filter to active, non-admin roles
    const roles = allRoles.filter((r) => r.isActive && !r.isAdmin);
    console.log("[Permissions GET] Filtered roles (active, non-admin):", roles.length);

    // Get assignments based on resource type (include permission details)
    let assignments: any[] = [];

    if (resourceType === "field") {
      assignments = await prisma.rolePermission.findMany({
        where: { formFieldId: resourceId, granted: true },
        include: { permission: { select: { id: true, name: true, category: true } } },
      });
      console.log("[Permissions GET] Field assignments:", assignments.length);
    } else if (resourceType === "section" || resourceType === "sections") {
      assignments = await prisma.rolePermission.findMany({
        where: { sectionId: resourceId, formFieldId: null, granted: true },
        include: { permission: { select: { id: true, name: true, category: true } } },
      });
      console.log("[Permissions GET] Section assignments:", assignments.length);
    }

    // Get available permissions
    const availablePermissions = await prisma.permission.findMany({
      select: { id: true, name: true, category: true },
    });

    console.log("[Permissions GET] Available permissions:", availablePermissions.length);

    // ── Nested users per role (via unit assignments) ────────────────────
    // Admin roles/users are excluded — admins always have full access.
    const roleIds = roles.map((r) => r.id);

    const unitAssignments = await prisma.userUnitAssignment.findMany({
      where: { roleId: { in: roleIds } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    // Users who also hold an admin role anywhere → exclude everywhere
    const adminRoleIds = allRoles.filter((r) => r.isAdmin).map((r) => r.id);
    const adminUserIds = new Set(
      adminRoleIds.length
        ? (
            await prisma.userUnitAssignment.findMany({
              where: { roleId: { in: adminRoleIds } },
              select: { userId: true },
            })
          ).map((a) => a.userId)
        : []
    );

    const userResourceType =
      resourceType === "sections" ? "section" : resourceType;

    const userPermRecords = await prisma.userPermission.findMany({
      where: {
        resourceType: userResourceType,
        resourceId,
        isActive: true,
        permissionId: { not: null },
      },
      select: { userId: true, permissionId: true },
    });
    // One user may now have multiple rows (multi-permission).
    const userPermMap = new Map<string, string[]>();
    for (const rec of userPermRecords) {
      if (!rec.permissionId) continue;
      const arr = userPermMap.get(rec.userId) ?? [];
      arr.push(rec.permissionId);
      userPermMap.set(rec.userId, arr);
    }

    // Map profiles — return ALL granted permissions per role + nested users
    const profiles = roles.map((role) => {
      const roleAssignments = assignments.filter((a) => a.roleId === role.id);
      const firstAssigned = roleAssignments[0];
      const permissionNames = roleAssignments.map(
        (a) => a.permission?.name || a.permissionId
      );
      const permissionIds = roleAssignments.map((a) => a.permissionId);

      // Users assigned to this role (deduped, active, non-admin)
      const seen = new Set<string>();
      const usersInRole = unitAssignments
        .filter(
          (ua) =>
            ua.roleId === role.id &&
            ua.user &&
            ua.user.status === "ACTIVE" &&
            !adminUserIds.has(ua.user.id)
        )
        .reduce<
          {
            id: string;
            name: string;
            email: string;
            avatar: string | null;
            permission: string;
            permissionIds: string[];
          }[]
        >((acc, ua) => {
          const u = ua.user!;
          if (seen.has(u.id)) return acc;
          seen.add(u.id);
          const fullName =
            `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email;
          const ids = userPermMap.get(u.id) ?? [];
          acc.push({
            id: u.id,
            name: fullName,
            email: u.email,
            avatar: u.avatar,
            permission: ids[0] || "NONE",
            permissionIds: ids,
          });
          return acc;
        }, []);

      return {
        id: role.id,
        name: role.name,
        permission: firstAssigned?.permissionId || "NONE",
        permissions: permissionNames,
        permissionIds,
        users: usersInRole,
      };
    });

    console.log("[Permissions GET] Profiles:", profiles.length);
    return NextResponse.json({ profiles, availablePermissions });
  } catch (error: any) {
    console.error("[Permissions GET Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: any }
) {
  return POST(request, context);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { resourceType: string; resourceId: string } }
) {
  try {
    const body = await request.json();
    const { roleId, userId, permissionId, permissionIds } = body;
    const { resourceType, resourceId } = params;

    // Normalize both role and user writes to an array of permission ids.
    const targetPermissionIds: string[] = Array.isArray(permissionIds)
      ? permissionIds.filter((p: string) => p && p !== "NONE")
      : permissionId && permissionId !== "NONE"
        ? [permissionId]
        : [];

    console.log(
      "[Permissions POST] resourceType:",
      resourceType,
      "resourceId:",
      resourceId,
      "roleId:",
      roleId,
      "userId:",
      userId,
      "permissionId:",
      permissionId,
      "permissionIds:",
      permissionIds
    );

    if (!resourceId || (!roleId && !userId)) {
      return NextResponse.json(
        { error: "Resource ID and either Role ID or User ID are required" },
        { status: 400 }
      );
    }

    // Verify all permissions exist (batch)
    if (targetPermissionIds.length > 0) {
      const existingPerms = await prisma.permission.findMany({
        where: { id: { in: targetPermissionIds } },
        select: { id: true },
      });
      if (existingPerms.length !== targetPermissionIds.length) {
        const missing = targetPermissionIds.filter(
          (id) => !existingPerms.find((p) => p.id === id)
        );
        return NextResponse.json(
          { error: "One or more permissions not found", missing },
          { status: 404 }
        );
      }
    }

    // ── USER-LEVEL permission write (multi-permission) ──────────────────
    if (userId) {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!userExists) {
        return NextResponse.json(
          { error: "User not found", userId },
          { status: 404 }
        );
      }

      const userResourceType =
        resourceType === "sections" ? "section" : resourceType;

      await prisma.$transaction(async (tx) => {
        // Wipe only the permission-scoped rows; preserve any flag-style rows
        // (permissionId=null) owned by module/form grants so we don't trample
        // DatabaseRoles.grantUserPermission's writes.
        await tx.userPermission.deleteMany({
          where: {
            userId,
            resourceType: userResourceType,
            resourceId,
            permissionId: { not: null },
          },
        });

        if (targetPermissionIds.length > 0) {
          await tx.userPermission.createMany({
            data: targetPermissionIds.map((pid) => ({
              userId,
              permissionId: pid,
              resourceType: userResourceType,
              resourceId,
              granted: true,
              isActive: true,
              reason: `Direct ${userResourceType} assignment`,
            })),
          });
          console.log(
            "[Permissions POST] Created user permissions:",
            targetPermissionIds.length
          );
        }
      });

      return NextResponse.json({ success: true });
    }

    // ── ROLE-LEVEL permission write ──────────────────────────────────────
    const roleExists = await prisma.role.findUnique({
      where: { id: roleId },
    });

    console.log("[Permissions POST] role found:", !!roleExists);

    if (!roleExists) {
      console.error("[Permissions POST] Role not found:", roleId);
      return NextResponse.json({ error: "Role not found", roleId }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (resourceType === "field") {
        // For fields: delete and recreate field-level permissions (one row per permission)
        await tx.rolePermission.deleteMany({
          where: {
            roleId,
            formFieldId: resourceId,
          },
        });

        if (targetPermissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: targetPermissionIds.map((pid) => ({
              roleId,
              permissionId: pid,
              granted: true,
              formFieldId: resourceId,
            })),
          });
          console.log(
            "[Permissions POST] Created field permissions:",
            targetPermissionIds.length
          );
        }
      } else if (resourceType === "section") {
        // For sections: delete and recreate section-level permissions
        await tx.rolePermission.deleteMany({
          where: {
            roleId,
            sectionId: resourceId,
            formFieldId: null,
          },
        });

        if (targetPermissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: targetPermissionIds.map((pid) => ({
              roleId,
              permissionId: pid,
              granted: true,
              sectionId: resourceId,
              formFieldId: null,
            })),
          });
          console.log(
            "[Permissions POST] Created section permissions:",
            targetPermissionIds.length
          );
        }
      }
    });

    console.log("[Permissions POST] Success");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Permissions POST Error]:", error);
    return NextResponse.json(
      { error: "Failed to update", details: error?.message },
      { status: 500 }
    );
  }
}