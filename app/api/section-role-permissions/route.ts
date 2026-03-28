// app/api/section-role-permissions/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

/**
 * GET /api/section-role-permissions?sectionId=xxx
 *
 * Fetches role permissions scoped to a specific form section.
 * Returns records from `rolePermission` where sectionId matches
 * and formFieldId is null (section-level, not field-level).
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

    const sectionId = request.nextUrl.searchParams.get("sectionId");
    if (!sectionId) {
      return NextResponse.json({ error: "sectionId query parameter is required" }, { status: 400 });
    }

    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        sectionId,
        formFieldId: null,
        role: { organizationId },
      },
      select: {
        id: true,
        roleId: true,
        permissionId: true,
        moduleId: true,
        sectionId: true,
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
    console.error("[GET /api/section-role-permissions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch section role permissions", details: String(error) },
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
 * PUT/PATCH /api/section-role-permissions
 *
 * Body: Array of { roleId, permissionId, sectionId, granted }
 *
 * Uses a delete-then-create approach inside a transaction to avoid
 * constraint name mismatches with Prisma's generated client.
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

    // Validate all items first
    const validItems: Array<{
      roleId: string
      permissionId: string
      sectionId: string
      granted: boolean
    }> = [];
    const skipped: any[] = [];

    // Collect unique roleIds for org verification
    const uniqueRoleIds = new Set<string>();

    for (const [index, item] of body.entries()) {
      const { roleId, permissionId, sectionId, granted } = item;

      if (!roleId || !permissionId || !sectionId) {
        skipped.push({ index, reason: "missing roleId, permissionId, or sectionId" });
        continue;
      }

      uniqueRoleIds.add(roleId);
      validItems.push({ roleId, permissionId, sectionId, granted: Boolean(granted) });
    }

    // Batch verify roles belong to the organization
    const orgRoles = await prisma.role.findMany({
      where: { id: { in: Array.from(uniqueRoleIds) }, organizationId },
      select: { id: true },
    });
    const validRoleIds = new Set(orgRoles.map((r) => r.id));

    // Filter out items with invalid roles
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

    // Group items by (roleId + sectionId) for efficient bulk operations
    await prisma.$transaction(async (tx) => {
      for (const item of finalItems) {
        // Delete existing record for this exact combination
        await tx.rolePermission.deleteMany({
          where: {
            roleId: item.roleId,
            permissionId: item.permissionId,
            sectionId: item.sectionId,
            formFieldId: null,
          },
        });

        // Create new record if granted
        if (item.granted) {
          await tx.rolePermission.create({
            data: {
              roleId: item.roleId,
              permissionId: item.permissionId,
              sectionId: item.sectionId,
              formFieldId: null,
              granted: true,
              canDelegate: false,
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
    console.error("[PUT /api/section-role-permissions] Critical error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process section permission updates",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
