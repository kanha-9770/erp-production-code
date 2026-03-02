// app/api/admin/permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. Reuse your existing /api/auth/me logic to get current user
    const meResponse = await fetch(
      new URL("/api/auth/me", request.url).toString(),
      {
        method: "GET",
        headers: {
          cookie: request.headers.get("cookie") || "",
        },
      },
    );

    if (!meResponse.ok) {
      return NextResponse.json(
        { error: "Unauthorized or invalid session" },
        { status: 401 },
      );
    }

    const meData = await meResponse.json();

    if (!meData.success || !meData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const currentUser = meData.user;

    // 2. Check organization
    if (!currentUser.organization?.id) {
      return NextResponse.json(
        { error: "User not part of any organization" },
        { status: 403 },
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
            OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
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
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ────────────────────────────────────────────────
    // TEMPORARILY COMMENTED OUT - so you can test even without admin role
    // Uncomment when you want to enforce admin-only access again
    // ────────────────────────────────────────────────
    /*
    const hasAdminRole = user.unitAssignments.some((assignment: any) => {
      const roleName = assignment.role?.name?.toLowerCase() || "";
      return roleName.includes("admin") || assignment.role?.isAdmin;
    });

    console.log("Has admin role:", hasAdminRole);
    if (!hasAdminRole) {
      return NextResponse.json(
        { error: "Insufficient permissions - admin role required" },
        { status: 403 }
      );
    }
    */

    // 4. Get role IDs from assignments
    const roleIds = user.unitAssignments.map((ua: any) => ua.role.id);

    console.log("[DEBUG] User:", user.id, user.email);
    console.log("[DEBUG] Unit assignments count:", user.unitAssignments.length);
    console.log("[DEBUG] Role IDs:", roleIds);

    // 5. Fetch role-based permissions
    const rolePermissions =
      roleIds.length > 0
        ? await prisma.rolePermission.findMany({
            where: {
              roleId: { in: roleIds },
              granted: true,
            },
            include: {
              permission: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                  resource: true,
                },
              },
              module: {
                select: {
                  id: true,
                  name: true,
                },
              },
              form: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          })
        : [];

    console.log("[DEBUG] Role permissions found:", rolePermissions.length);

    // 6. Fetch overrides (for reference)
    console.log(
      "[DEBUG] Permission overrides count:",
      user.permissionOverrides.length,
    );

    // 7. Build final permissions array (shape your frontend expects)
    const permissions: any[] = [];

    // ── From roles ───────────────────────────────────────
    rolePermissions.forEach((rp: any) => {
      permissions.push({
        id: rp.permission.id,
        name: rp.permission.name,
        category: rp.permission.category,
        resource: rp.permission.resource,
        canDelegate: rp.canDelegate || false,
        source: "role",
        module: rp.module
          ? { id: rp.module.id, name: rp.module.name }
          : { id: "", name: "" },
        form: rp.form
          ? { id: rp.form.id, name: rp.form.name }
          : { id: "", name: "" },
        grantedBy: "role",
        grantedTo: "role",
      });
    });

    // ── From overrides (simplified - no scoping) ─────────
    for (const override of user.permissionOverrides) {
      if (!override.granted) continue;

      const perm = await prisma.permission.findUnique({
        where: { id: override.permissionId },
        select: { id: true, name: true, category: true, resource: true },
      });

      if (perm) {
        // Check if already added from role
        const alreadyExists = permissions.some((p) => p.id === perm.id);
        if (!alreadyExists) {
          permissions.push({
            id: perm.id,
            name: perm.name,
            category: perm.category,
            resource: perm.resource,
            canDelegate: false,
            source: "override",
            module: { id: "", name: "" },
            grantedBy: "user",
            grantedTo: "user",
            form: { id: "", name: "" },
            reason: override.reason || "Direct override",
          });
        }
      }
    }

    console.log("[DEBUG] Final permissions count:", permissions.length);
    if (permissions.length > 0) {
      console.log(
        "[DEBUG] First permission sample:",
        JSON.stringify(permissions[0], null, 2),
      );
    }

    // 8. Build enriched user object
    const enrichedUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      fullName:
        `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
        user.username ||
        user.email,
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

      permissions, // ← this is what your frontend needs

      // Clean up internal fields
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
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    );
  }
}
