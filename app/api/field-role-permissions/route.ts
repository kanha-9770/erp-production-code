// app/api/field-role-permissions/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

/**
 * GET /api/field-role-permissions?fieldId=xxx
 *
 * Fetches role permissions scoped to a specific form field.
 * Returns records from `rolePermission` where formFieldId matches.
 */
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

    const fieldId = request.nextUrl.searchParams.get("fieldId");
    if (!fieldId) {
      return NextResponse.json({ error: "fieldId query parameter is required" }, { status: 400 });
    }

    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        formFieldId: fieldId,
        role: { organizationId },
      },
      select: {
        id: true,
        roleId: true,
        permissionId: true,
        moduleId: true,
        sectionId: true,
        formFieldId: true,
        granted: true,
        canDelegate: true,
      },
      orderBy: { permission: { name: "asc" } },
    });

    return NextResponse.json({
      success: true,
      data: rolePermissions,
      count: rolePermissions.length,
    });
  } catch (error) {
    console.error("[GET /api/field-role-permissions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch field role permissions", details: String(error) },
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
 * PUT/PATCH /api/field-role-permissions
 *
 * Body: Array of { roleId, permissionId, sectionId, fieldId, granted }
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

    const validItems: Array<{
      roleId: string
      permissionId: string
      sectionId: string
      fieldId: string
      granted: boolean
    }> = [];
    const skipped: any[] = [];

    const uniqueRoleIds = new Set<string>();

    for (const [index, item] of body.entries()) {
      const { roleId, permissionId, sectionId, fieldId, granted } = item;

      if (!roleId || !permissionId || !sectionId || !fieldId) {
        skipped.push({ index, reason: "missing roleId, permissionId, sectionId, or fieldId" });
        continue;
      }

      uniqueRoleIds.add(roleId);
      validItems.push({
        roleId,
        permissionId,
        sectionId,
        fieldId,
        granted: Boolean(granted),
      });
    }

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

    // Always write an explicit row (granted true OR false) so field rows can
    // override an inherited form/section grant.
    await prisma.$transaction(async (tx) => {
      for (const item of finalItems) {
        await tx.rolePermission.deleteMany({
          where: {
            roleId: item.roleId,
            permissionId: item.permissionId,
            sectionId: item.sectionId,
            formFieldId: item.fieldId,
          },
        });

        await tx.rolePermission.create({
          data: {
            roleId: item.roleId,
            permissionId: item.permissionId,
            sectionId: item.sectionId,
            formFieldId: item.fieldId,
            granted: item.granted,
            canDelegate: false,
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      updatedCount: finalItems.length,
      skippedCount: skipped.length,
      skippedItems: skipped.length > 0 ? skipped : undefined,
    });
  } catch (error) {
    console.error("[PUT /api/field-role-permissions] Critical error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process field permission updates",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
