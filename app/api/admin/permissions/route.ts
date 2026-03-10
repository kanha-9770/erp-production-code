// app/api/admin/permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log("[DEBUG] Starting GET /api/admin/permissions");
  
  try {
    // 1. Directly validate session from cookies (replaces internal /api/auth/me call)
    console.log("[DEBUG] Stage 1: Extracting auth token from cookies");
    const token = request.cookies.get("auth-token")?.value;
    console.log("[DEBUG] Token present:", !!token);

    if (!token) {
      console.log("[DEBUG] No token found, returning 401");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    console.log("[DEBUG] Stage 2: Validating session with token");
    const session = await validateSession(token);
    console.log("this is the session data", session);

    if (!session) {
      console.log("[DEBUG] Invalid session, returning 401");
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    console.log("[DEBUG] Stage 3: Session validated, extracting currentUser");
    const currentUser = session.user;
    console.log("[DEBUG] Current user ID:", currentUser.id);

    // 2. Check organization
    console.log("[DEBUG] Stage 4: Checking organization membership");
    if (!currentUser.organization?.id) {
      console.log("[DEBUG] No organization found for user, returning 403");
      return NextResponse.json(
        { error: "User not part of any organization" },
        { status: 403 },
      );
    }
    console.log("[DEBUG] Organization ID:", currentUser.organization.id);

    // 3. Fetch the current user with necessary relations (full details for permissions logic)
    console.log("[DEBUG] Stage 5: Fetching user details from Prisma");
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

        // Unit + Role assignments (full details)
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

    console.log("[DEBUG] User fetched from Prisma:", !!user);

    if (!user) {
      console.log("[DEBUG] User not found in DB, returning 404");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ────────────────────────────────────────────────
    // TEMPORARILY COMMENTED OUT - so you can test even without admin role
    // Uncomment when you want to enforce admin-only access again
    // ────────────────────────────────────────────────
    /*
    console.log("[DEBUG] Stage 6: Checking for admin role");
    const hasAdminRole = user.unitAssignments.some((assignment) => {
      const roleName = assignment.role?.name?.toLowerCase() || "";
      return roleName.includes("admin") || assignment.role?.isAdmin;
    });

    console.log("Has admin role:", hasAdminRole);
    if (!hasAdminRole) {
      console.log("[DEBUG] No admin role, returning 403");
      return NextResponse.json(
        { error: "Insufficient permissions - admin role required" },
        { status: 403 }
      );
    }
    console.log("[DEBUG] Admin role confirmed");
    */

    // 4. Get role IDs from assignments
    console.log("[DEBUG] Stage 7: Extracting role IDs from unit assignments");
    const roleIds = user.unitAssignments.map((ua) => ua.role.id);

    console.log("[DEBUG] User:", user.id, user.email);
    console.log("[DEBUG] Unit assignments count:", user.unitAssignments.length);
    console.log("[DEBUG] Role IDs:", roleIds);

    // 5. Fetch role-based permissions
    console.log("[DEBUG] Stage 8: Fetching role-based permissions");
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
    if (rolePermissions.length > 0) {
      console.log("[DEBUG] Sample role permission:", JSON.stringify(rolePermissions[0], null, 2));
    }

    // 6. Fetch overrides (for reference)
    console.log("[DEBUG] Stage 9: Logging permission overrides count");
    console.log(
      "[DEBUG] Permission overrides count:",
      user.permissionOverrides.length,
    );
    if (user.permissionOverrides.length > 0) {
      console.log("[DEBUG] Sample override:", JSON.stringify(user.permissionOverrides[0], null, 2));
    }

    // 7. Build final permissions array (shape your frontend expects)
    console.log("[DEBUG] Stage 10: Building permissions array");
    // Define a type for better TypeScript safety (optional)
    type PermissionItem = {
      id: string;
      name: string;
      category: string;
      resource: string;
      canDelegate: boolean;
      source: "role" | "override";
      module: { id: string; name: string };
      form: { id: string; name: string };
      grantedBy: string;
      grantedTo: string;
      reason?: string;
    };

    const permissions: PermissionItem[] = [];
    console.log("[DEBUG] Initial permissions array empty");

    // ── From roles ───────────────────────────────────────
    console.log("[DEBUG] Stage 10.1: Adding permissions from roles");
    let rolePermCount = 0;
    rolePermissions.forEach((rp) => {
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
      rolePermCount++;
    });
    console.log("[DEBUG] Permissions added from roles:", rolePermCount);

    // ── From overrides (batched query to avoid N+1) ───────
    console.log("[DEBUG] Stage 10.2: Processing override permissions");
    const overridePermissionIds = user.permissionOverrides
      .filter((override) => override.granted)
      .map((override) => override.permissionId);

    console.log("[DEBUG] Override permission IDs:", overridePermissionIds);

    let overridePermCount = 0;
    const overridePermissions =
      overridePermissionIds.length > 0
        ? await prisma.permission.findMany({
            where: {
              id: { in: overridePermissionIds },
            },
            select: {
              id: true,
              name: true,
              category: true,
              resource: true,
            },
          })
        : [];

    console.log("[DEBUG] Override permissions fetched:", overridePermissions.length);
    if (overridePermissions.length > 0) {
      console.log("[DEBUG] Sample override permission:", JSON.stringify(overridePermissions[0], null, 2));
    }

    // Map overrides to permissions
    console.log("[DEBUG] Stage 10.3: Mapping overrides to permissions");
    for (const override of user.permissionOverrides) {
      if (!override.granted) continue;

      const perm = overridePermissions.find(
        (p) => p.id === override.permissionId,
      );

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
          overridePermCount++;
        } else {
          console.log("[DEBUG] Override permission already exists from role, skipping:", perm.id);
        }
      } else {
        console.log("[DEBUG] No matching permission found for override ID:", override.permissionId);
      }
    }
    console.log("[DEBUG] New permissions added from overrides:", overridePermCount);

    console.log("[DEBUG] Final permissions count:", permissions.length);
    if (permissions.length > 0) {
      console.log(
        "[DEBUG] First permission sample:",
        JSON.stringify(permissions[0], null, 2),
      );
    }

    // 8. Build enriched user object (merges session basics with queried relations)
    console.log("[DEBUG] Stage 11: Building enriched user object");
    const enrichedUser = {
      id: user.id || currentUser.id,
      email: user.email || currentUser.email,
      username: user.username || currentUser.username,
      first_name: user.first_name || currentUser.first_name,
      last_name: user.last_name || currentUser.last_name,
      fullName:
        `${(user.first_name || currentUser.first_name) || ""} ${(user.last_name || currentUser.last_name) || ""}`.trim() ||
        (user.username || currentUser.username) ||
        (user.email || currentUser.email),
      avatar: user.avatar || currentUser.avatar,
      status: user.status || currentUser.status,
      department: user.department || currentUser.department,
      joinDate: user.joinDate || currentUser.joinDate,
      createdAt: user.createdAt || currentUser.createdAt,

      unitsAndRoles: user.unitAssignments?.map((ua) => ({
        unit: ua.unit,
        role: ua.role,
        notes: ua.notes,
      })) || currentUser.unitAssignments?.map((ua: any) => ({
        unit: ua.unit,
        role: ua.role,
        notes: ua.notes,
      })) || [],

      permissions, // ← this is what your frontend needs

      // Clean up internal fields
      unitAssignments: undefined,
      permissionOverrides: undefined,
    };

    console.log("[DEBUG] Enriched user built, unitsAndRoles count:", enrichedUser.unitsAndRoles.length);

    console.log("[DEBUG] Stage 12: Returning success response");
    return NextResponse.json({
      success: true,
      data: enrichedUser,
    });
  } catch (error) {
    console.error("[DEBUG] Stage ERROR: Caught error in /api/admin/permissions:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    );
  }
}