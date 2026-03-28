// app/api/admin/permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { getUserPermissions } from "@/lib/database/database"; // ← NEW IMPORT

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // ─────────────────────────────────────────────────────────
    // STAGE 1: Auth / Session
    // ─────────────────────────────────────────────────────────
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!authUser.organizationId) {
      return NextResponse.json(
        { error: "User not part of any organization" },
        { status: 403 },
      );
    }

    // ─────────────────────────────────────────────────────────
    // Read context (formId / moduleId) from query params
    // ─────────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get("formId") || undefined;
    const moduleId = searchParams.get("moduleId") || undefined;

    // ─────────────────────────────────────────────────────────
    // STAGE 2: Fetch user + role assignments (no more permissionOverrides here)
    // ─────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
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

        unitAssignments: {
          select: {
            unit: {
              select: { id: true, name: true, description: true, level: true },
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
          orderBy: { unit: { sortOrder: "asc" } },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─────────────────────────────────────────────────────────
    // NEW: Use the SAME function that your admin UI uses
    // ─────────────────────────────────────────────────────────
    const allUserOverrides = await getUserPermissions(authUser.id);

    // Filter active + form/module specific
    const activeOverrides = allUserOverrides.filter((o) => {
      const isNotExpired = !o.expiresAt || new Date(o.expiresAt) >= new Date();
      const matchesForm = !formId || o.formId === formId;
      const matchesModule = !moduleId || o.moduleId === moduleId;
      return isNotExpired && matchesForm && matchesModule;
    });

    const grantedOverrides = activeOverrides.filter((o) => o.granted === true);
    const deniedOverrides = activeOverrides.filter((o) => o.granted === false);

    // ─────────────────────────────────────────────────────────
    // STAGE 3: Role-based permissions
    // ─────────────────────────────────────────────────────────
    const roleIds = user.unitAssignments.map((ua) => ua.role.id);

    // Build where clause: exclude section/field permissions, optionally scope to form
    const rpWhere: any = {
      roleId: { in: roleIds },
      granted: true,
      sectionId: null,
      formFieldId: null,
    };
    // If a formId is provided, return permissions for that specific form
    // (plus any module-level ones that have no formId — those apply to all forms)
    if (formId) {
      rpWhere.OR = [
        { formId },
        { formId: null },
      ];
    }

    const rolePermissions =
      roleIds.length > 0
        ? await prisma.rolePermission.findMany({
            where: rpWhere,
            include: {
              permission: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                  resource: true,
                },
              },
              module: { select: { id: true, name: true } },
              form: { select: { id: true, name: true } },
            },
          })
        : [];

    // ─────────────────────────────────────────────────────────
    // STAGE 4: Prepare override permission details
    // ─────────────────────────────────────────────────────────
    const grantedOverridePermIds = grantedOverrides.map((o) => o.permissionId);
    const deniedOverridePermIds = deniedOverrides.map((o) => o.permissionId);

    const allOverridePermIds = [
      ...new Set([...grantedOverridePermIds, ...deniedOverridePermIds]),
    ];

    const overridePermissionDetails =
      allOverridePermIds.length > 0
        ? await prisma.permission.findMany({
            where: { id: { in: allOverridePermIds } },
            select: { id: true, name: true, category: true, resource: true },
          })
        : [];

    const overridePermMap = new Map(
      overridePermissionDetails.map((p) => [p.id, p]),
    );

    // ─────────────────────────────────────────────────────────
    // STAGE 5: Build unified permissions array
    // ─────────────────────────────────────────────────────────
    type PermissionItem = {
      id: string;
      name: string;
      category: string;
      resource: string;
      canDelegate: boolean;
      source: "role" | "user";
      module: { id: string; name: string };
      form: { id: string; name: string };
      grantedBy: string;
      grantedTo: string;
      reason?: string;
      expiresAt?: string | null;
    };

    const permissions: PermissionItem[] = [];

    // 5a: Role permissions (skip denied)
    const deniedPermIdSet = new Set(deniedOverridePermIds);
    for (const rp of rolePermissions) {
      if (deniedPermIdSet.has(rp.permission.id)) continue;

      permissions.push({
        id: rp.permission.id,
        name: rp.permission.name,
        category: rp.permission.category,
        resource: rp.permission.resource,
        canDelegate: rp.canDelegate ?? false,
        source: "role",
        module: rp.module
          ? { id: rp.module.id, name: rp.module.name }
          : { id: "", name: "" },
        form: rp.form
          ? { id: rp.form.id, name: rp.form.name }
          : { id: "", name: "" },
        grantedBy: "role",
        grantedTo: user.id,
      });
    }

    // 5b: Apply user overrides (upgrade or add)
    for (const override of grantedOverrides) {
      const perm = overridePermMap.get(override.permissionId);
      if (!perm) {
        continue;
      }

      const existingIndex = permissions.findIndex((p) => p.id === perm.id);

      const overrideEntry: PermissionItem = {
        id: perm.id,
        name: perm.name,
        category: perm.category,
        resource: perm.resource,
        canDelegate: false,
        source: "user",
        module: override.moduleId
          ? { id: override.moduleId, name: "" }
          : { id: "", name: "" },
        form: override.formId
          ? { id: override.formId, name: "" }
          : { id: "", name: "" },
        grantedBy: "admin",
        grantedTo: user.id,
        reason: override.reason ?? "Direct user override",
        expiresAt: override.expiresAt
          ? new Date(override.expiresAt).toISOString()
          : null,
      };

      if (existingIndex !== -1) {
        permissions[existingIndex] = overrideEntry;
      } else {
        permissions.push(overrideEntry);
      }
    }

    // ─────────────────────────────────────────────────────────
    // STAGE 6: isAdmin flag
    // ─────────────────────────────────────────────────────────
    const isAdminByRole = user.unitAssignments.some(
      (ua) => ua.role.isAdmin || /admin/i.test(ua.role.name || ""),
    );
    const isAdminByOverride = permissions.some(
      (p) =>
        p.source === "user" &&
        /admin/i.test(p.name || p.category || p.resource || ""),
    );
    const isAdmin = isAdminByRole || isAdminByOverride;

    // ─────────────────────────────────────────────────────────
    // STAGE 7: Return enriched user
    // ─────────────────────────────────────────────────────────
    const enrichedUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      fullName:
        `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
        user.username ||
        user.email,
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

      permissions,
      isAdmin,

      permissionSummary: {
        total: permissions.length,
        fromRole: permissions.filter((p) => p.source === "role").length,
        fromUser: permissions.filter((p) => p.source === "user").length,
        denied: deniedOverrides.length,
      },
    };

    return NextResponse.json({ success: true, data: enrichedUser });
  } catch (error) {
    console.error("[ERROR] /api/admin/permissions:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    );
  }
}
