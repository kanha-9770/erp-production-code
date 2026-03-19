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
      return NextResponse.json(
        { error: "No organization context" },
        { status: 403 },
      );
    }

    const roleId = request.nextUrl.searchParams.get("roleId");
    let formId = request.nextUrl.searchParams.get("formId");

    // Normalize: treat empty / "null" string as no filter on formId
    if (formId === "" || formId === "null" || formId === "undefined") {
      formId = null;
    }

    const whereClause: any = {
      role: {
        organizationId,
      },
    };

    if (roleId) {
      whereClause.roleId = roleId;
    }

    // Only apply formId filter if explicitly provided
    if (formId !== null && formId !== undefined) {
      whereClause.formId = formId;
    }
    // ── IMPORTANT CHANGE ──
    // If no formId is sent → do NOT force formId = null
    // → show both module-level (null) and form-level permissions

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
        { module: { sortOrder: "asc" } },
        { form: { name: "asc" } },
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
  return handleUpdate(request, "PATCH");
}

export async function PUT(request: NextRequest) {
  return handleUpdate(request, "PUT");
}

async function handleUpdate(request: NextRequest, method: "PATCH" | "PUT") {
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
      return NextResponse.json(
        { error: "Body must be a non-empty array" },
        { status: 400 },
      );
    }

    const updated = [];
    const skipped = [];

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
        skipped.push({ index, reason: "missing roleId or permissionId", item });
        continue;
      }

      const role = await prisma.role.findFirst({
        where: { id: roleId, organizationId },
        select: { id: true, name: true },
      });

      if (!role) {
        skipped.push({ index, reason: "role not in organization", roleId });
        continue;
      }

      try {
        const result = await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId_moduleId: {
              roleId,
              permissionId,
              moduleId: moduleId ?? null,
            },
          },
          update: {
            granted: Boolean(granted),
            canDelegate: Boolean(canDelegate),
            formId: formId ?? null,
          },
          create: {
            roleId,
            permissionId,
            moduleId: moduleId ?? null,
            formId: formId ?? null,
            granted: Boolean(granted),
            canDelegate: Boolean(canDelegate),
          },
        });

        updated.push(result);
      } catch (upsertError) {
        console.error(
          `Upsert failed for role=${roleId} perm=${permissionId}:`,
          upsertError,
        );
        skipped.push({
          index,
          reason: "upsert failed",
          error:
            upsertError instanceof Error
              ? upsertError.message
              : String(upsertError),
          item,
        });
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      method,
      skippedItems: skipped.length > 0 ? skipped : undefined,
    });
  } catch (error) {
    console.error(`[${method} /api/role-permissions] Critical error:`, error);
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

