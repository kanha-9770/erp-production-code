/**
 * GET  /api/users/[id]/permission-matrix
 * PUT  /api/users/[id]/permission-matrix
 *
 * One endpoint for the per-user override sheet in /settings/permission/roles.
 *
 * GET — returns ONE payload with everything the sheet needs:
 *   {
 *     user:        { id, name, email, status, organizationId }
 *     roles:       Array<{ id, name, isAdmin }>          // every role the user holds
 *     permissions: Array<{ id, name, description, category, resource }>
 *     modules:     Array<{ id, name }>                   // org's modules (for scope picker)
 *     rolePerms:   Array<{ permissionId, moduleId, formId, granted }>
 *                                                       // unioned from all roles the user holds
 *     overrides:   Array<{ id, permissionId, moduleId, formId, granted, isActive }>
 *                                                       // the user's UserPermission rows
 *   }
 *
 * The page joins rolePerms (inherited) + overrides on the client to compute
 * the tri-state: inherit | grant | deny. Single round-trip, no waterfall.
 *
 * PUT — replaces the user's overrides with a new set in one transaction.
 *   Body: { upserts: Array<{ permissionId, moduleId, formId, granted }>,
 *           removeIds: string[] }
 *   - `upserts` is a full snapshot of every override the user should have
 *     after the call. Existing rows matching the (permissionId, moduleId,
 *     formId) tuple are updated; new ones inserted.
 *   - `removeIds` lists override IDs the admin explicitly cleared (back to
 *     "inherit"). They're soft-deactivated (isActive=false) so audit history
 *     stays intact; the read path filters on isActive.
 *
 * Cross-tenant safety: both methods verify the target user belongs to the
 * caller's organization before reading or writing anything.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "No organization context" },
        { status: 403 },
      );
    }

    const userId = params.id;

    // Cross-tenant guard + load the user.
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId: authUser.organizationId },
      select: {
        id: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        status: true,
        organizationId: true,
        unitAssignments: {
          select: {
            role: { select: { id: true, name: true, isAdmin: true } },
          },
        },
      },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    const roleIds = Array.from(
      new Set(user.unitAssignments.map((ua) => ua.role.id)),
    );

    // Five independent reads — fire in parallel so the slowest sets the wall
    // time, not the sum.
    const [permissions, modules, rolePerms, overrides] = await Promise.all([
      prisma.permission.findMany({
        where: { organizationId: authUser.organizationId, isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          resource: true,
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.formModule.findMany({
        where: { organizationId: authUser.organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      roleIds.length > 0
        ? prisma.rolePermission.findMany({
            where: {
              roleId: { in: roleIds },
              granted: true,
              sectionId: null,
              formFieldId: null,
            },
            select: {
              permissionId: true,
              moduleId: true,
              formId: true,
              granted: true,
            },
          })
        : Promise.resolve([] as Array<{
            permissionId: string;
            moduleId: string | null;
            formId: string | null;
            granted: boolean;
          }>),
      prisma.userPermission.findMany({
        where: {
          userId,
          isActive: true,
          resourceType: null,
          resourceId: null,
        },
        select: {
          id: true,
          permissionId: true,
          moduleId: true,
          formId: true,
          granted: true,
          isActive: true,
        },
      }),
    ]);

    // De-dup rolePerms across multiple roles — a permission granted at the
    // same scope by two different roles is just one effective grant.
    const dedupKey = (p: {
      permissionId: string;
      moduleId: string | null;
      formId: string | null;
    }) => `${p.permissionId}|${p.moduleId ?? ""}|${p.formId ?? ""}`;
    const seen = new Set<string>();
    const inheritedPerms = rolePerms.filter((p) => {
      const k = dedupKey(p);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const fullName =
      [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
      user.username ||
      user.email;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: fullName,
        email: user.email,
        username: user.username,
        status: user.status,
        organizationId: user.organizationId,
      },
      roles: user.unitAssignments.map((ua) => ua.role),
      permissions,
      modules,
      rolePerms: inheritedPerms,
      overrides,
    });
  } catch (error: any) {
    console.error("[GET /api/users/[id]/permission-matrix]", error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Failed to fetch matrix" },
      { status: 500 },
    );
  }
}

// ─── PUT ─────────────────────────────────────────────────────────────────────

interface UpsertItem {
  permissionId: string;
  moduleId: string | null;
  formId: string | null;
  granted: boolean;
}

interface PutBody {
  upserts?: UpsertItem[];
  removeIds?: string[];
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "No organization context" },
        { status: 403 },
      );
    }
    if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
      return NextResponse.json(
        { success: false, error: "Admin only" },
        { status: 403 },
      );
    }

    const userId = params.id;

    // Target-user tenancy check.
    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: authUser.organizationId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    let body: PutBody;
    try {
      body = (await request.json()) as PutBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    const upserts = Array.isArray(body.upserts) ? body.upserts : [];
    const removeIds = Array.isArray(body.removeIds) ? body.removeIds : [];

    // Validate every permissionId / moduleId / formId still exists in the
    // caller's org so a stale client can't smuggle in cross-tenant FKs.
    const permIds = Array.from(new Set(upserts.map((u) => u.permissionId)));
    const moduleIds = Array.from(
      new Set(upserts.map((u) => u.moduleId).filter(Boolean) as string[]),
    );
    const formIds = Array.from(
      new Set(upserts.map((u) => u.formId).filter(Boolean) as string[]),
    );

    const [validPerms, validModules, validForms] = await Promise.all([
      permIds.length > 0
        ? prisma.permission.findMany({
            where: {
              id: { in: permIds },
              organizationId: authUser.organizationId,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      moduleIds.length > 0
        ? prisma.formModule.findMany({
            where: {
              id: { in: moduleIds },
              organizationId: authUser.organizationId,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      formIds.length > 0
        ? prisma.form.findMany({
            where: {
              id: { in: formIds },
              module: { organizationId: authUser.organizationId },
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    const validPermSet = new Set(validPerms.map((p) => p.id));
    const validModuleSet = new Set(validModules.map((m) => m.id));
    const validFormSet = new Set(validForms.map((f) => f.id));

    // Filter upserts down to entries that survive the FK / tenancy check.
    const safeUpserts = upserts.filter((u) => {
      if (!validPermSet.has(u.permissionId)) return false;
      if (u.moduleId && !validModuleSet.has(u.moduleId)) return false;
      if (u.formId && !validFormSet.has(u.formId)) return false;
      return true;
    });

    // Single transaction: deactivate removed rows, then upsert the new set.
    // Using a transaction means a partial write never escapes — either every
    // change lands or none does.
    const result = await prisma.$transaction(async (tx) => {
      let removed = 0;
      if (removeIds.length > 0) {
        // Verify each ID belongs to THIS user before flipping it inactive.
        const owned = await tx.userPermission.findMany({
          where: { id: { in: removeIds }, userId },
          select: { id: true },
        });
        const ownedIds = owned.map((o) => o.id);
        if (ownedIds.length > 0) {
          const r = await tx.userPermission.updateMany({
            where: { id: { in: ownedIds } },
            data: { isActive: false },
          });
          removed = r.count;
        }
      }

      let upserted = 0;
      for (const u of safeUpserts) {
        // Locate an existing row at this scope (active OR previously soft-deleted).
        const existing = await tx.userPermission.findFirst({
          where: {
            userId,
            permissionId: u.permissionId,
            moduleId: u.moduleId,
            formId: u.formId,
            resourceType: null,
            resourceId: null,
          },
          select: { id: true },
        });

        if (existing) {
          await tx.userPermission.update({
            where: { id: existing.id },
            data: { granted: u.granted, isActive: true },
          });
        } else {
          await tx.userPermission.create({
            data: {
              userId,
              permissionId: u.permissionId,
              moduleId: u.moduleId,
              formId: u.formId,
              granted: u.granted,
              canView: false,
              canCreate: false,
              canEdit: false,
              canDelete: false,
              isActive: true,
            },
          });
        }
        upserted++;
      }

      return { upserted, removed };
    });

    return NextResponse.json({
      success: true,
      ...result,
      skipped: upserts.length - safeUpserts.length,
    });
  } catch (error: any) {
    console.error("[PUT /api/users/[id]/permission-matrix]", error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Failed to save matrix" },
      { status: 500 },
    );
  }
}
