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
    let formId = request.nextUrl.searchParams.get("formId");

    if (formId === "" || formId === "null" || formId === "undefined") {
      formId = null;
    }

    const whereClause: any = {
      role: { organizationId },
      // Only return module/form-level permissions, not section/field-level
      sectionId: null,
      formFieldId: null,
    };

    if (roleId) {
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

    const finalItems = validItems.filter((item) => {
      if (!validRoleIds.has(item.roleId)) {
        skipped.push({ reason: "role not in organization", roleId: item.roleId });
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

    // Delete + create in a transaction — scoped per (roleId, permissionId, formId)
    // We delete by the FULL key (roleId, permissionId, moduleId, formId) to match
    // the unique constraint and avoid conflicts when multiple forms share a module.
    await prisma.$transaction(async (tx) => {
      for (const item of finalItems) {
        // Delete any existing record for this exact role+permission+module+form combo
        await tx.rolePermission.deleteMany({
          where: {
            roleId: item.roleId,
            permissionId: item.permissionId,
            moduleId: item.moduleId,
            formId: item.formId,
            sectionId: null,
            formFieldId: null,
          },
        });

        // Also clean up any old record that matches on (roleId, permissionId, formId)
        // but has a different moduleId (legacy data)
        await tx.rolePermission.deleteMany({
          where: {
            roleId: item.roleId,
            permissionId: item.permissionId,
            formId: item.formId,
            sectionId: null,
            formFieldId: null,
            moduleId: { not: item.moduleId ?? undefined },
          },
        });

        // Create new record if granted
        if (item.granted) {
          await tx.rolePermission.create({
            data: {
              roleId: item.roleId,
              permissionId: item.permissionId,
              moduleId: item.moduleId,
              formId: item.formId,
              sectionId: null,
              formFieldId: null,
              granted: true,
              canDelegate: item.canDelegate,
            },
          });
        }
      }
    });

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
