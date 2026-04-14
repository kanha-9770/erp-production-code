// app/api/field-user-permissions/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

/**
 * GET /api/field-user-permissions?fieldId=xxx
 *
 * Returns active user-level permission overrides for the given field.
 * Stored in UserPermission with resourceType="field" + resourceId=fieldId.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const fieldId = request.nextUrl.searchParams.get("fieldId");
    if (!fieldId) {
      return NextResponse.json({ error: "fieldId query parameter is required" }, { status: 400 });
    }

    const userPermissions = await prisma.userPermission.findMany({
      where: {
        resourceType: "field",
        resourceId: fieldId,
        isActive: true,
        permissionId: { not: null },
      },
      select: {
        id: true,
        userId: true,
        permissionId: true,
        resourceType: true,
        resourceId: true,
        granted: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: userPermissions,
      count: userPermissions.length,
    });
  } catch (error) {
    console.error("[GET /api/field-user-permissions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch field user permissions", details: String(error) },
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
 * PUT/PATCH /api/field-user-permissions
 *
 * Body: Array of { userId, fieldId, permissionId, granted }
 */
async function handleUpdate(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json({ error: "Body must be a non-empty array" }, { status: 400 });
    }

    const validItems: Array<{
      userId: string
      permissionId: string
      fieldId: string
      granted: boolean
    }> = [];
    const skipped: any[] = [];

    for (const [index, item] of body.entries()) {
      const { userId, permissionId, fieldId, granted } = item;

      if (!userId || !permissionId || !fieldId) {
        skipped.push({ index, reason: "missing userId, permissionId, or fieldId" });
        continue;
      }

      validItems.push({ userId, permissionId, fieldId, granted: Boolean(granted) });
    }

    if (validItems.length === 0) {
      return NextResponse.json({
        success: true,
        updatedCount: 0,
        skippedCount: skipped.length,
        skippedItems: skipped.length > 0 ? skipped : undefined,
      });
    }

    // Always write an explicit row so a field-level deny can override
    // an inherited form/section grant.
    await prisma.$transaction(async (tx) => {
      for (const item of validItems) {
        await tx.userPermission.deleteMany({
          where: {
            userId: item.userId,
            permissionId: item.permissionId,
            resourceType: "field",
            resourceId: item.fieldId,
          },
        });

        await tx.userPermission.create({
          data: {
            userId: item.userId,
            permissionId: item.permissionId,
            resourceType: "field",
            resourceId: item.fieldId,
            granted: item.granted,
            isActive: true,
            reason: "Manual field override",
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      updatedCount: validItems.length,
      skippedCount: skipped.length,
      skippedItems: skipped.length > 0 ? skipped : undefined,
    });
  } catch (error) {
    console.error("[PUT /api/field-user-permissions] Critical error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process field user permission updates",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
