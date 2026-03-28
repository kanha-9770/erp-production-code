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
 * Body: Array of { roleId, permissionId, sectionId, granted, moduleId? }
 *
 * Uses the unique constraint (roleId, permissionId, moduleId, sectionId) to upsert.
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

    const updated = [];
    const skipped = [];

    for (const [index, item] of body.entries()) {
      const {
        roleId,
        permissionId,
        sectionId,
        moduleId = null,
        granted,
        canDelegate = false,
      } = item;

      if (!roleId || !permissionId || !sectionId) {
        skipped.push({ index, reason: "missing roleId, permissionId, or sectionId", item });
        continue;
      }

      // Verify role belongs to the organization
      const role = await prisma.role.findFirst({
        where: { id: roleId, organizationId },
        select: { id: true },
      });

      if (!role) {
        skipped.push({ index, reason: "role not in organization", roleId });
        continue;
      }

      try {
        const result = await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId_moduleId_sectionId: {
              roleId,
              permissionId,
              moduleId: moduleId ?? null,
              sectionId,
            },
          },
          update: {
            granted: Boolean(granted),
            canDelegate: Boolean(canDelegate),
          },
          create: {
            roleId,
            permissionId,
            sectionId,
            moduleId: moduleId ?? null,
            formFieldId: null,
            granted: Boolean(granted),
            canDelegate: Boolean(canDelegate),
          },
        });

        updated.push(result);
      } catch (upsertError) {
        console.error(
          `[section-role-permissions] Upsert failed for role=${roleId} perm=${permissionId} section=${sectionId}:`,
          upsertError,
        );
        skipped.push({
          index,
          reason: "upsert failed",
          error: upsertError instanceof Error ? upsertError.message : String(upsertError),
          item,
        });
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: updated.length,
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
