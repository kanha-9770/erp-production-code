import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, props: { params: Promise<{ sectionId: string }> }) {
  const params = await props.params;
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sectionId } = params;
    console.log("[SectionPerm GET] sectionId:", sectionId);

    if (!sectionId) {
      return NextResponse.json({ error: "Section ID is required" }, { status: 400 });
    }

    // Verify section exists (check both FormSection and Subform tables)
    const [sectionExists, subformExists] = await Promise.all([
      prisma.formSection.findUnique({
        where: { id: sectionId },
        select: { id: true, formId: true },
      }),
      prisma.subform.findUnique({
        where: { id: sectionId },
        select: { id: true, formId: true },
      }).catch(() => null),
    ]);

    const resourceExists = sectionExists || subformExists;
    console.log("[SectionPerm GET] section found:", !!sectionExists, "subform found:", !!subformExists);

    if (!resourceExists) {
      // Not a section or subform — return empty profiles so the caller
      // treats it as "no restrictions" rather than an error
      console.log("[SectionPerm GET] Section/subform not found:", sectionId, "— returning empty profiles");
      return NextResponse.json({ profiles: [], availablePermissions: [] });
    }

    // The parent form ID — used to inherit form-level grants for permissions
    // that don't have an explicit section-level row.
    const parentFormId = sectionExists?.formId ?? subformExists?.formId ?? null;

    // Get all roles for this organization
    const allRoles = await prisma.role.findMany({
      where: { organizationId: authUser.organizationId! },
      orderBy: { sortOrder: "asc" },
    });

    // Filter to active, non-admin roles
    const roles = allRoles.filter((r) => r.isActive && !r.isAdmin);

    // Fetch the IDs of all fields that belong to this section/subform — used
    // to scope user-level field overrides by `resourceId`.
    const sectionFields = await prisma.formField.findMany({
      where: {
        OR: [{ sectionId: sectionId }, { subformId: sectionId }],
      },
      select: { id: true },
    });
    const sectionFieldIds = sectionFields.map((f) => f.id);

    // Look up the calling user's primary role so we can compute their
    // effective permissions (role + user-level overrides).
    const userAssignments = await prisma.userUnitAssignment.findMany({
      where: { userId: authUser.id },
      select: { roleId: true },
    });
    const primaryUserRoleId = userAssignments[0]?.roleId ?? null;

    // Fetch section-level assignments (formFieldId IS null), field-level
    // assignments (formFieldId IS NOT null), form-level assignments, and
    // per-user overrides (form/section/field scope) in parallel. We fetch
    // BOTH granted=true and granted=false rows everywhere so that explicit
    // denies at any layer can override grants higher up the chain.
    const [
      sectionAssignments,
      fieldAssignments,
      formAssignments,
      userFormOverrides,
      userSectionOverrides,
      userFieldOverrides,
      availablePerms,
    ] = await Promise.all([
      prisma.rolePermission.findMany({
        where: { sectionId, formFieldId: null },
        include: { permission: { select: { id: true, name: true, category: true } } },
      }),
      prisma.rolePermission.findMany({
        where: { sectionId, formFieldId: { not: null } },
        include: { permission: { select: { id: true, name: true, category: true } } },
      }),
      parentFormId
        ? prisma.rolePermission.findMany({
            where: {
              formId: parentFormId,
              sectionId: null,
              formFieldId: null,
            },
            include: { permission: { select: { id: true, name: true, category: true } } },
          })
        : Promise.resolve([] as any[]),
      parentFormId
        ? prisma.userPermission.findMany({
            where: {
              userId: authUser.id,
              formId: parentFormId,
              resourceType: null,
              resourceId: null,
              isActive: true,
            },
            include: { permission: { select: { id: true, name: true } } },
          })
        : Promise.resolve([] as any[]),
      prisma.userPermission.findMany({
        where: {
          userId: authUser.id,
          resourceType: "section",
          resourceId: sectionId,
          isActive: true,
        },
        include: { permission: { select: { id: true, name: true } } },
      }),
      sectionFieldIds.length > 0
        ? prisma.userPermission.findMany({
            where: {
              userId: authUser.id,
              resourceType: "field",
              resourceId: { in: sectionFieldIds },
              isActive: true,
            },
            include: { permission: { select: { id: true, name: true } } },
          })
        : Promise.resolve([] as any[]),
      prisma.permission.findMany({
        select: { id: true, name: true, category: true },
      }),
    ]);

    console.log("[SectionPerm GET] roles:", roles.length,
      "sectionAssignments:", sectionAssignments.length,
      "fieldAssignments:", fieldAssignments.length,
      "formAssignments:", formAssignments.length,
      "parentFormId:", parentFormId);

    // Build profiles with effective section permissions (form-level inherited,
    // section-level explicit overrides) AND field permissions per role.
    const profiles = roles.map((role) => {
      // Effective permission state per permission name.
      // Baseline = form-level grants; overlay = explicit section-level rows
      // (true or false). An explicit section row always wins over the
      // inherited form-level grant.
      const effective = new Map<string, { id: string; granted: boolean }>();

      formAssignments
        .filter((a: any) => a.roleId === role.id)
        .forEach((a: any) => {
          const name = a.permission?.name;
          if (name) effective.set(name, { id: a.permissionId, granted: a.granted });
        });

      const roleSectionAssigns = sectionAssignments.filter(
        (a: any) => a.roleId === role.id,
      );
      roleSectionAssigns.forEach((a: any) => {
        const name = a.permission?.name;
        if (name) effective.set(name, { id: a.permissionId, granted: a.granted });
      });

      const grantedEntries = Array.from(effective.entries()).filter(
        ([, v]) => v.granted,
      );
      const permissionNames = grantedEntries.map(([name]) => name);
      const firstPermissionId = grantedEntries[0]?.[1]?.id;

      // True when the admin explicitly touched the Section Permissions matrix
      // for this role on this section (granted OR denied row exists). Used by
      // the runtime to decide whether field-level grants should act as an
      // allow-list: when the admin hasn't configured anything at section
      // level, a field-level grant for ONE field in the section hides the
      // siblings that weren't granted.
      const hasExplicitSectionGrant = roleSectionAssigns.length > 0;

      // Field-level permissions for this role — one entry per field that has
      // ANY explicit row (granted OR denied). The value is the full list of
      // effective granted permission names for that field after overlaying
      // explicit field rows onto the section-level baseline stored in
      // `effective`. An empty array means the admin denied every permission
      // for the field (hidden on the client). The array shape lets the
      // client do mode-aware readonly checks (CREATE in create mode, EDIT
      // in edit mode) — a field with ["VIEW","CREATE"] is editable when
      // creating but read-only when editing an existing record.
      const fieldAssignsByField = new Map<string, any[]>();
      fieldAssignments
        .filter((a: any) => a.roleId === role.id)
        .forEach((a: any) => {
          if (!a.formFieldId) return;
          const list = fieldAssignsByField.get(a.formFieldId) || [];
          list.push(a);
          fieldAssignsByField.set(a.formFieldId, list);
        });

      const fieldPermissions: Record<string, string[]> = {};
      fieldAssignsByField.forEach((rows, fieldId) => {
        const fieldState = new Map<string, boolean>();
        effective.forEach((v, name) => fieldState.set(name, v.granted));
        rows.forEach((a: any) => {
          const name = a.permission?.name;
          if (name) fieldState.set(name, a.granted);
        });

        fieldPermissions[fieldId] = Array.from(fieldState.entries())
          .filter(([, g]) => g)
          .map(([n]) => n);
      });

      return {
        id: role.id,
        name: role.name,
        permission: firstPermissionId || "NONE",
        permissions: permissionNames,
        hasExplicitSectionGrant,
        fieldPermissions,
      };
    });

    console.log("[SectionPerm GET] profiles:", JSON.stringify(profiles.map(p => ({
      role: p.name, perms: p.permissions, fields: p.fieldPermissions,
    }))));

    // ── Compute the calling user's EFFECTIVE permissions ────────────────────
    // Layered merge, in order (later layers override earlier ones):
    //   1. Form-level role rows (for the user's primary role)
    //   2. Section-level role rows
    //   3. Form-level user overrides
    //   4. Section-level user overrides
    // Per-field state starts from section effective and then applies role
    // field rows, then user field rows. This gives the public form the exact
    // per-user effective state including all user-level overrides.
    const currentUserSectionState = new Map<string, boolean>();

    if (primaryUserRoleId) {
      formAssignments
        .filter((a: any) => a.roleId === primaryUserRoleId)
        .forEach((a: any) => {
          const name = a.permission?.name;
          if (name) currentUserSectionState.set(name, a.granted);
        });
      sectionAssignments
        .filter((a: any) => a.roleId === primaryUserRoleId)
        .forEach((a: any) => {
          const name = a.permission?.name;
          if (name) currentUserSectionState.set(name, a.granted);
        });
    }
    userFormOverrides.forEach((a: any) => {
      const name = a.permission?.name;
      if (name) currentUserSectionState.set(name, a.granted);
    });
    userSectionOverrides.forEach((a: any) => {
      const name = a.permission?.name;
      if (name) currentUserSectionState.set(name, a.granted);
    });

    const currentUserPermissions = Array.from(currentUserSectionState.entries())
      .filter(([, g]) => g)
      .map(([n]) => n);

    const currentUserHasExplicitSectionGrant =
      (primaryUserRoleId
        ? sectionAssignments.some((a: any) => a.roleId === primaryUserRoleId)
        : false) || userSectionOverrides.length > 0;

    // Field-level effective per field for the calling user. We iterate every
    // field that has ANY explicit row (role or user) so the response covers
    // all fields the admin explicitly configured for this user's scope.
    const currentUserFieldState = new Map<string, Map<string, boolean>>();

    const ensureFieldState = (fieldId: string) => {
      let st = currentUserFieldState.get(fieldId);
      if (!st) {
        st = new Map<string, boolean>();
        // baseline: section effective for the current user
        currentUserSectionState.forEach((v, k) => st!.set(k, v));
        currentUserFieldState.set(fieldId, st);
      }
      return st;
    };

    if (primaryUserRoleId) {
      fieldAssignments
        .filter((a: any) => a.roleId === primaryUserRoleId && a.formFieldId)
        .forEach((a: any) => {
          const name = a.permission?.name;
          if (!name) return;
          ensureFieldState(a.formFieldId).set(name, a.granted);
        });
    }
    userFieldOverrides.forEach((a: any) => {
      const name = a.permission?.name;
      if (!name || !a.resourceId) return;
      ensureFieldState(a.resourceId).set(name, a.granted);
    });

    const currentUserFieldPermissions: Record<string, string[]> = {};
    currentUserFieldState.forEach((state, fieldId) => {
      currentUserFieldPermissions[fieldId] = Array.from(state.entries())
        .filter(([, g]) => g)
        .map(([n]) => n);
    });

    const currentUserEffective = {
      permissions: currentUserPermissions,
      hasExplicitSectionGrant: currentUserHasExplicitSectionGrant,
      fieldPermissions: currentUserFieldPermissions,
    };

    console.log(
      "[SectionPerm GET] currentUserEffective:",
      JSON.stringify({
        userId: authUser.id,
        primaryUserRoleId,
        ...currentUserEffective,
      }),
    );

    return NextResponse.json({
      profiles,
      availablePermissions: availablePerms,
      currentUserEffective,
    });
  } catch (error: any) {
    console.error("[SectionPerm GET Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ sectionId: string }> }
) {
  return POST(request, context);
}

export async function POST(request: NextRequest, props: { params: Promise<{ sectionId: string }> }) {
  const params = await props.params;
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      console.error("[Section Permissions POST] User not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { roleId, permissionId } = await request.json();
    const { sectionId } = params;

    console.log("[Section Permissions POST] sectionId:", sectionId, "roleId:", roleId, "permissionId:", permissionId);

    if (!roleId || !sectionId) {
      return NextResponse.json({ error: "Role ID and Section ID are required" }, { status: 400 });
    }

    // 1. Verify section exists
    const sectionExists = await prisma.formSection.findUnique({
      where: { id: sectionId },
    });

    console.log("[Section Permissions POST] section found:", !!sectionExists);

    if (!sectionExists) {
      console.error("[Section Permissions POST] Section not found:", sectionId);
      return NextResponse.json({ error: "Section not found", sectionId }, { status: 404 });
    }

    // 2. Verify role exists
    const roleExists = await prisma.role.findUnique({
      where: { id: roleId },
    });

    console.log("[Section Permissions POST] role found:", !!roleExists);

    if (!roleExists) {
      console.error("[Section Permissions POST] Role not found:", roleId);
      return NextResponse.json({ error: "Role not found", roleId }, { status: 404 });
    }

    // 3. Verify permission exists
    if (permissionId !== "NONE") {
      const permissionExists = await prisma.permission.findUnique({
        where: { id: permissionId },
      });

      console.log("[Section Permissions POST] permission found:", !!permissionExists);

      if (!permissionExists) {
        console.error("[Section Permissions POST] Permission not found:", permissionId);
        return NextResponse.json({ error: "Permission not found", permissionId }, { status: 404 });
      }
    }

    // 4. Update permission
    await prisma.$transaction(async (tx) => {
      // Delete existing section-level record
      await tx.rolePermission.deleteMany({
        where: {
          roleId,
          sectionId,
          formFieldId: null,
        },
      });

      // Create new permission if not NONE
      if (permissionId !== "NONE") {
        await tx.rolePermission.create({
          data: {
            roleId,
            permissionId,
            granted: true,
            sectionId,
            formFieldId: null,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Section Permissions POST Error]:", error);
    return NextResponse.json(
      { error: "Failed to save section permission", details: error?.message },
      { status: 500 }
    );
  }
}
   