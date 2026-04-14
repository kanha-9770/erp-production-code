// app/api/section-user-permissions/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

/**
 * GET /api/section-user-permissions?sectionId=xxx
 *
 * Returns active user-level permission overrides for the given section.
 * Stored in UserPermission with resourceType="section" + resourceId=sectionId.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sectionId = request.nextUrl.searchParams.get("sectionId");
    if (!sectionId) {
      return NextResponse.json({ error: "sectionId query parameter is required" }, { status: 400 });
    }

    const userPermissions = await prisma.userPermission.findMany({
      where: {
        resourceType: "section",
        resourceId: sectionId,
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
    console.error("[GET /api/section-user-permissions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch section user permissions", details: String(error) },
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
 * PUT/PATCH /api/section-user-permissions
 *
 * Body: Array of { userId, sectionId, permissionId, granted }
 * Grants are inserted as UserPermission rows with resourceType="section".
 * Ungranted requests delete the matching row.
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
      sectionId: string
      granted: boolean
    }> = [];
    const skipped: any[] = [];

    for (const [index, item] of body.entries()) {
      const { userId, permissionId, sectionId, granted } = item;

      if (!userId || !permissionId || !sectionId) {
        skipped.push({ index, reason: "missing userId, permissionId, or sectionId" });
        continue;
      }

      validItems.push({ userId, permissionId, sectionId, granted: Boolean(granted) });
    }

    if (validItems.length === 0) {
      return NextResponse.json({
        success: true,
        updatedCount: 0,
        skippedCount: skipped.length,
        skippedItems: skipped.length > 0 ? skipped : undefined,
      });
    }

    // Always write an explicit row so a section-level deny can override
    // an inherited form-level grant.
    await prisma.$transaction(async (tx) => {
      for (const item of validItems) {
        await tx.userPermission.deleteMany({
          where: {
            userId: item.userId,
            permissionId: item.permissionId,
            resourceType: "section",
            resourceId: item.sectionId,
          },
        });

        await tx.userPermission.create({
          data: {
            userId: item.userId,
            permissionId: item.permissionId,
            resourceType: "section",
            resourceId: item.sectionId,
            granted: item.granted,
            isActive: true,
            reason: "Manual section override",
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
    console.error("[PUT /api/section-user-permissions] Critical error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process section user permission updates",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
