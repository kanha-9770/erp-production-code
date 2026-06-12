// app/api/role-permissions/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const organizationId = authUser.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "No organization context" }, { status: 403 });
    }

    const roleId = request.nextUrl.searchParams.get("roleId");
    // Comma-separated batch form. usePermissions fans this in to replace its
    // old N+1 (one fetch per role) with a single call: a user with 5 roles
    // used to cost 5 round-trips, now 1.
    const roleIdsParam = request.nextUrl.searchParams.get("roleIds");
    let formId = request.nextUrl.searchParams.get("formId");
    // Static-page scoping. `scope=page` returns only page-scoped rows
    // (pagePath set); an explicit `pagePath=/x` narrows to a single page.
    const scope = request.nextUrl.searchParams.get("scope");
    const pagePathParam = request.nextUrl.searchParams.get("pagePath");

    if (formId === "" || formId === "null" || formId === "undefined") {
      formId = null;
    }

    const whereClause: any = {
      role: { organizationId },
      // Only return module/form/page-level permissions, not section/field-level
      sectionId: null,
      formFieldId: null,
    };

    if (pagePathParam) {
      whereClause.pagePath = pagePathParam;
    } else if (scope === "page") {
      whereClause.pagePath = { not: null };
    }

    if (roleIdsParam) {
      const ids = roleIdsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) {
        // `in` covers both the single-id and many-ids case; the role.organizationId
        // filter above still guarantees cross-tenant isolation.
        whereClause.roleId = { in: ids };
      }
    } else if (roleId) {
      whereClause.roleId = roleId;
    }

    // Filter by formId directly — each form has its own permissions
    if (formId) {
      whereClause.formId = formId;
    }

    const rolePermissions = await prisma.rolePermission.findMany({
      where: whereClause,
      select: {
        id: true,
        roleId: true,
        permissionId: true,
        moduleId: true,
        formId: true,
        pagePath: true,
        granted: true,
        canDelegate: true,
        permission: {
          select: {
            name: true,
            resource: true,
            category: true,
            description: true,
          },
        },
        module: {
          select: {
            name: true,
            path: true,
          },
        },
        form: {
          select: {
            name: true,
            description: true,
          },
        },
      },
      orderBy: [
        { permission: { name: "asc" } },
      ],
    });

    return NextResponse.json({
      success: true,
      organizationId,
      queriedRoleId: roleId || null,
      queriedFormId: formId || null,
      count: rolePermissions.length,
      data: rolePermissions,
    });
  } catch (error) {
    console.error("[GET /api/role-permissions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch role permissions", details: String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  return handleUpdate(request);
}

export async function PUT(request: NextRequest) {
  return handleUpdate(request);
}

/**
 * PUT/PATCH — saves form-level role permissions.
 *
 * Uses delete+create inside a transaction so each form gets its own
 * independent permission records (no more module-level sharing).
 */
async function handleUpdate(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = authUser.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json({ error: "Body must be a non-empty array" }, { status: 400 });
    }

    // Validate items
    const validItems: Array<{
      roleId: string;
      permissionId: string;
      moduleId: string | null;
      formId: string | null;
      pagePath: string | null;
      granted: boolean;
      canDelegate: boolean;
    }> = [];
    const skipped: any[] = [];

    const uniqueRoleIds = new Set<string>();

    for (const [index, item] of body.entries()) {
      const {
        roleId,
        permissionId,
        moduleId = null,
        formId = null,
        pagePath = null,
        granted,
        canDelegate = false,
      } = item;

      if (!roleId || !permissionId) {
        skipped.push({ index, reason: "missing roleId or permissionId" });
        continue;
      }

      uniqueRoleIds.add(roleId);
      validItems.push({
        roleId,
        permissionId,
        moduleId: moduleId ?? null,
        formId: formId ?? null,
        pagePath: pagePath ?? null,
        granted: Boolean(granted),
        canDelegate: Boolean(canDelegate),
      });
    }

    // Batch verify roles
    const orgRoles = await prisma.role.findMany({
      where: { id: { in: Array.from(uniqueRoleIds) }, organizationId },
      select: { id: true },
    });
    const validRoleIds = new Set(orgRoles.map((r) => r.id));

    // Batch verify permissions exist. Without this a stale/deleted permissionId
    // would fail the whole createMany transaction with a cryptic foreign-key
    // 500 instead of being cleanly skipped with a reason.
    const uniquePermissionIds = new Set(validItems.map((i) => i.permissionId));
    const existingPerms = await prisma.permission.findMany({
      where: { id: { in: Array.from(uniquePermissionIds) } },
      select: { id: true },
    });
    const validPermissionIds = new Set(existingPerms.map((p) => p.id));

    const finalItems = validItems.filter((item) => {
      if (!validRoleIds.has(item.roleId)) {
        skipped.push({ reason: "role not in organization", roleId: item.roleId });
        return false;
      }
      if (!validPermissionIds.has(item.permissionId)) {
        skipped.push({ reason: "permission does not exist", permissionId: item.permissionId });
        return false;
      }
      return true;
    });

    if (finalItems.length === 0) {
      return NextResponse.json({
        success: true,
        updatedCount: 0,
        skippedCount: skipped.length,
        skippedItems: skipped.length > 0 ? skipped : undefined,
      });
    }

    // Batch delete + create in a transaction for efficiency.
    // Group by (roleId, formId) to issue fewer, broader deletes.
    await prisma.$transaction(
      async (tx) => {
        // Collect all unique (roleId, permissionId, formId, pagePath) combos to
        // delete. Including pagePath keeps a page-scoped save from wiping a
        // sibling page's rows (all page rows share formId=null), and keeps a
        // module/form save (pagePath=null) from touching page rows.
        const deleteFilters = finalItems.map((item) => ({
          roleId: item.roleId,
          permissionId: item.permissionId,
          formId: item.formId,
          pagePath: item.pagePath,
          sectionId: null as string | null,
          formFieldId: null as string | null,
        }));

        // Batch delete: one query per item but using OR for all at once
        await tx.rolePermission.deleteMany({
          where: {
            OR: deleteFilters,
          },
        });

        // Batch create all granted items at once
        const toCreate = finalItems
          .filter((item) => item.granted)
          .map((item) => ({
            roleId: item.roleId,
            permissionId: item.permissionId,
            moduleId: item.moduleId,
            formId: item.formId,
            pagePath: item.pagePath,
            sectionId: null as string | null,
            formFieldId: null as string | null,
            granted: true,
            canDelegate: item.canDelegate,
          }));

        if (toCreate.length > 0) {
          await tx.rolePermission.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
        }
      },
      // `timeout` alone leaves maxWait at Prisma's 2s default, so under the
      // Supabase pooler the connection-acquire step times out (P2028). Set both.
      { maxWait: 15_000, timeout: 30_000 },
    );

    return NextResponse.json({
      success: true,
      updatedCount: finalItems.length,
      skippedCount: skipped.length,
      skippedItems: skipped.length > 0 ? skipped : undefined,
    });
  } catch (error) {
    console.error("[PUT /api/role-permissions] Critical error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process permission updates",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
