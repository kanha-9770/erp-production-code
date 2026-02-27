// app/api/admin/users/route.ts
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

    // 3. Check if user has at least one admin role
    const hasAdminRole = currentUser.unitAssignments.some(
      (assignment: any) => assignment.role?.name === "Admin" || assignment.role?.isAdmin
    );

    if (!hasAdminRole) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    const organizationId = currentUser.organization.id;

    // 4. Fetch all users in the same organization
    const users = await prisma.user.findMany({
      where: {
        organizationId,
        status: { notIn: ["PENDING", "PENDING_VERIFICATION"] }, // optional filter
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
            permission: {
              select: {
                id: true,
                name: true,
                category: true,
                resource: true,
              },
            },
          },
        },
      },
      orderBy: {
        first_name: "asc",
      },
    });

    // 5. Enrich each user with effective permissions
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const roleIds = user.unitAssignments.map((ua) => ua.role.id);

        const rolePermissions = roleIds.length > 0
          ? await prisma.rolePermission.findMany({
              where: {
                roleId: { in: roleIds },
                granted: true,
              },
              select: {
                permission: {
                  select: {
                    id: true,
                    name: true,
                    category: true,
                    resource: true,
                  },
                },
                canDelegate: true,
                module: { select: { id: true, name: true } },
                form: { select: { id: true, name: true } },
              },
            })
          : [];

        // Combine role permissions + overrides (override wins if conflicting)
        const permissionMap = new Map<string, any>();

        // Add role permissions
        rolePermissions.forEach((rp) => {
          if (!permissionMap.has(rp.permission.id)) {
            permissionMap.set(rp.permission.id, {
              ...rp.permission,
              source: "role",
              canDelegate: rp.canDelegate,
              module: rp.module,
              form: rp.form,
            });
          }
        });

        // Apply overrides (they take precedence)
        user.permissionOverrides.forEach((override) => {
          if (override.granted) {
            permissionMap.set(override.permission.id, {
              ...override.permission,
              source: "override",
              reason: override.reason,
            });
          } else {
            permissionMap.delete(override.permission.id); // explicitly denied
          }
        });

        return {
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

          unitsAndRoles: user.unitAssignments.map((ua) => ({
            unit: ua.unit,
            role: ua.role,
            notes: ua.notes,
          })),

          permissions: Array.from(permissionMap.values()),

          // Clean up raw fields
          unitAssignments: undefined,
          permissionOverrides: undefined,
        };
      })
    );

    return NextResponse.json({
      success: true,
      count: enrichedUsers.length,
      data: enrichedUsers,
    });

  } catch (error) {
    console.error("Error in /api/admin/users:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}