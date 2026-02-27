// app/api/admin/permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. Reuse your existing /api/auth/me logic
    const meResponse = await fetch(
      new URL("/api/auth/me", request.url).toString(),
      {
        method: "GET",
        headers: {
          cookie: request.headers.get("cookie") || "",
        },
      }
    );

    if (!meResponse.ok) {
      return NextResponse.json(
        { error: "Unauthorized or invalid session" },
        { status: 401 }
      );
    }

    const meData = await meResponse.json();

    if (!meData.success || !meData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const currentUser = meData.user;

    // 2. Check if user belongs to organization
    if (!currentUser.organization?.id) {
      return NextResponse.json(
        { error: "User not part of any organization" },
        { status: 403 }
      );
    }

    // 3. Fetch the current user with necessary relations
    const user = await prisma.user.findUnique({
      where: {
        id: currentUser.id,
      },
      select: {
        id: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        avatar: true,
        status: true,
        department: true,
        joinDate: true,
        createdAt: true,

        // Unit + Role assignments
        unitAssignments: {
          select: {
            unit: {
              select: {
                id: true,
                name: true,
                description: true,
                level: true,
              },
            },
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                isAdmin: true,
                level: true,
              },
            },
            notes: true,
          },
          orderBy: {
            unit: { sortOrder: "asc" },
          },
        },

        // Permission overrides (active only)
        permissionOverrides: {
          where: {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } },
            ],
          },
          select: {
            granted: true,
            reason: true,
            permissionId: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 4. Check if user has at least one admin role
    const hasAdminRole = user.unitAssignments.some((assignment: any) => {
      const roleName = assignment.role?.name?.toLowerCase() || "";
      return roleName.includes("admin") || assignment.role?.isAdmin;
    });

    console.log("Has admin role:", hasAdminRole);
    if (!hasAdminRole) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // 5. Get role IDs
    const roleIds = user.unitAssignments.map((ua: any) => ua.role.id);

    // 6. Fetch role permissions (FIX: Add moduleId and formId to select for scoping)
    const rolePermissions = roleIds.length > 0
      ? await prisma.rolePermission.findMany({
          where: {
            roleId: { in: roleIds },
            granted: true,
          },
          select: {
            permissionId: true,
            canDelegate: true,
            moduleId: true,  // Added: For scoping
            formId: true,    // Added: For scoping
          },
        })
      : [];

    // 7. Collect all permission IDs
    const rolePermissionIds = rolePermissions.map((rp: any) => rp.permissionId);
    const overridePermissionIds = user.permissionOverrides.map((po: any) => po.permissionId);
    const allPermissionIdsSet = new Set([...rolePermissionIds, ...overridePermissionIds]);
    const allPermissionIds = Array.from(allPermissionIdsSet);

    let permissionsMap = new Map<string, any>();
    let moduleMap = new Map<string, string>();
    let formMap = new Map<string, string>();

    if (allPermissionIds.length > 0) {
      // Fetch all relevant permissions (FIX: Remove moduleId and formId— they don't exist on Permission)
      const allPermissions = await prisma.permission.findMany({
        where: {
          id: { in: allPermissionIds },
        },
        select: {
          id: true,
          name: true,
          category: true,
          resource: true,
        },
      });

      permissionsMap = new Map(allPermissions.map((p: any) => [p.id, p]));

      // (FIX: Collect module/form IDs from rolePermissions, not allPermissions)
      const moduleIdsSet = new Set<string>();
      const formIdsSet = new Set<string>();
      rolePermissions.forEach((rp: any) => {  // Only from rolePermissions (overrides lack scoping)
        if (rp.moduleId) moduleIdsSet.add(rp.moduleId);
        if (rp.formId) formIdsSet.add(rp.formId);
      });

      const moduleIds = Array.from(moduleIdsSet);
      const formIds = Array.from(formIdsSet);

      // Fetch modules (FIX: Use prisma.formModule, not prisma.module)
      if (moduleIds.length > 0) {
        const modules = await prisma.formModule.findMany({
          where: {
            id: { in: moduleIds },
          },
          select: {
            id: true,
            name: true,
          },
        });
        moduleMap = new Map(modules.map((m: any) => [m.id, m.name]));
      }

      // Fetch forms
      if (formIds.length > 0) {
        const forms = await prisma.form.findMany({
          where: {
            id: { in: formIds },
          },
          select: {
            id: true,
            name: true,
          },
        });
        formMap = new Map(forms.map((f: any) => [f.id, f.name]));
      }
    }

    // 8. Combine role permissions + overrides (override wins if conflicting)
    const permissionMap = new Map<string, any>();

    // Add role permissions
    rolePermissions.forEach((rp: any) => {
      const perm = permissionsMap.get(rp.permissionId);
      if (perm && !permissionMap.has(perm.id)) {
        permissionMap.set(perm.id, {
          id: perm.id,
          name: perm.name,
          category: perm.category,
          resource: perm.resource,
          source: "role",
          canDelegate: rp.canDelegate,
          module: {
            id: rp.moduleId || "",  // FIX: Use rp.moduleId (from RolePermission)
            name: moduleMap.get(rp.moduleId || "") || "",
          },
          form: {
            id: rp.formId || "",   // FIX: Use rp.formId (from RolePermission)
            name: formMap.get(rp.formId || "") || "",
          },
        });
      }
    });

    // Apply overrides (they take precedence)
    user.permissionOverrides.forEach((override: any) => {
      const perm = permissionsMap.get(override.permissionId);
      if (override.granted && perm) {
        permissionMap.set(perm.id, {
          id: perm.id,
          name: perm.name,
          category: perm.category,
          resource: perm.resource,
          source: "override",
          canDelegate: false,
          reason: override.reason,
          module: {              // FIX: Overrides lack scoping—set empty
            id: "",
            name: "",
          },
          form: {
            id: "",
            name: "",
          },
        });
      } else if (!override.granted && perm) {
        permissionMap.delete(perm.id); // explicitly denied
      }
    });

    const enrichedUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      fullName: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || user.email,
      avatar: user.avatar,
      status: user.status,
      department: user.department,
      joinDate: user.joinDate,
      createdAt: user.createdAt,

      unitsAndRoles: user.unitAssignments.map((ua: any) => ({
        unit: ua.unit,
        role: ua.role,
        notes: ua.notes,
      })),

      permissions: Array.from(permissionMap.values()),

      // Clean up raw fields
      unitAssignments: undefined,
      permissionOverrides: undefined,
    };

    return NextResponse.json({
      success: true,
      data: enrichedUser,
    });

  } catch (error) {
    console.error("Error in /api/admin/permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}