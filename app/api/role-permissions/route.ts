// app/api/role-permissions/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    console.log("[GET /api/role-permissions] Starting request");

    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const organizationId =
      session.user?.organizationId ||
      session.user?.organization?.id ||
      session.user?.orgId;

    if (!organizationId) {
      console.warn("[GET /api/role-permissions] No organizationId in session");
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

    console.log(
      `[GET] Query → roleId: ${roleId ?? "(any)"}, formId: ${formId ?? "(any / both module & form level)"}`,
    );

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
      console.log("[GET] Filtering for specific formId:", formId);
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

    console.log(
      `[GET /api/role-permissions] Found ${rolePermissions.length} records`,
    );

    if (rolePermissions.length > 0) {
      console.log(
        "[GET] First few:",
        rolePermissions.slice(0, 3).map((p) => ({
          perm: p.permission?.name || p.permissionId,
          module: p.module?.name || p.moduleId || "—",
          form: p.form?.name || p.formId || "—",
          granted: p.granted,
        })),
      );
    }

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
  console.log("[PATCH /api/role-permissions] Request received");
  return handleUpdate(request, "PATCH");
}

export async function PUT(request: NextRequest) {
  console.log(
    "[PUT /api/role-permissions] Request received - consider using PATCH instead",
  );
  return handleUpdate(request, "PUT");
}

async function handleUpdate(request: NextRequest, method: "PATCH" | "PUT") {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      console.log("[handleUpdate] No auth token");
      return unauthorized();
    }

    const session = await validateSession(token);
    if (!session || !session.user) {
      console.log("[handleUpdate] Invalid session");
      return unauthorized();
    }

    const organizationId =
      session.user?.organizationId ||
      session.user?.organization?.id ||
      session.user?.orgId;

    if (!organizationId) {
      console.log("[handleUpdate] No organizationId");
      return forbidden();
    }

    const body = await request.json();
    console.log(
      `[${method} /api/role-permissions] Body:`,
      JSON.stringify(body, null, 2),
    );

    if (!Array.isArray(body) || body.length === 0) {
      console.log(`[${method}] Invalid or empty body`);
      return NextResponse.json(
        { error: "Body must be a non-empty array" },
        { status: 400 },
      );
    }

    const updated = [];
    const skipped = [];

    for (const [index, item] of body.entries()) {
      console.log(
        `[${method}] Processing item ${index + 1}/${body.length}:`,
        item,
      );

      const {
        roleId,
        permissionId,
        moduleId = null,
        formId = null,
        granted,
        canDelegate = false,
      } = item;

      if (!roleId || !permissionId) {
        console.warn(
          `[${method}] Skipping item ${index + 1} - missing roleId or permissionId`,
        );
        skipped.push({ index, reason: "missing roleId or permissionId", item });
        continue;
      }

      const role = await prisma.role.findFirst({
        where: { id: roleId, organizationId },
        select: { id: true, name: true },
      });

      if (!role) {
        console.warn(
          `[${method}] Skipping - role ${roleId} not in org ${organizationId}`,
        );
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

        console.log(
          `[${method}] Upserted permission ${permissionId} for role ${roleId}`,
        );
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

    console.log(
      `[${method}] Finished. Updated: ${updated.length}, Skipped: ${skipped.length}`,
    );

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

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
