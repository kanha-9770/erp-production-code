// app/api/user-permissions/route.ts
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import {
  getUserPermissions,
  updateUserPermissions,
  type UserPermissionUpdate,
} from "@/lib/database";

const VIEW_PERMISSION_ID = "1"; // ← your actual VIEW permission ID
const CREATE_PERMISSION_ID = "2"; // ← your actual IDs
const EDIT_PERMISSION_ID = "3";
const DELETE_PERMISSION_ID = "4";

const WRITE_PERMISSIONS = [
  CREATE_PERMISSION_ID,
  EDIT_PERMISSION_ID,
  DELETE_PERMISSION_ID,
];

export async function GET(request: NextRequest) {
  try {
    console.log("[GET /api/user-permissions] Starting request");

    const userId = request.nextUrl.searchParams.get("userId");

    if (userId && typeof userId !== "string") {
      console.log("[GET] Invalid userId parameter:", userId);
      return NextResponse.json(
        { success: false, error: "Invalid userId parameter" },
        { status: 400 },
      );
    }

    const userPermissions = await getUserPermissions(userId || undefined);
    console.log(
      `[GET] Retrieved ${userPermissions.length} permissions for userId: ${userId || "all"}`,
    );

    return NextResponse.json({
      success: true,
      data: userPermissions,
      meta: {
        userId: userId || null,
        permissionCount: userPermissions.length,
      },
    });
  } catch (error) {
    console.error("[GET] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch user permissions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    console.log("[PUT /api/user-permissions] Starting request");

    const body = await request.json();
    console.log("[PUT] Raw body:", JSON.stringify(body, null, 2));

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: "Request body must be an array" },
        { status: 400 },
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Group updates by scope to make processing / logging clearer
    // ────────────────────────────────────────────────────────────────
    const groupedUpdates: Record<string, UserPermissionUpdate[]> = {};

    for (const raw of body) {
      const {
        userId,
        permissionId,
        moduleId = null,
        formId = null,
        granted,
        ...rest
      } = raw;

      if (!userId || !permissionId) {
        console.warn(
          "[PUT] Skipping invalid update → missing userId/permissionId",
          raw,
        );
        continue;
      }

      const scopeKey = `${userId}|${formId || "module"}|${moduleId || "global"}`;
      if (!groupedUpdates[scopeKey]) {
        groupedUpdates[scopeKey] = [];
      }

      groupedUpdates[scopeKey].push({
        userId,
        permissionId,
        moduleId,
        formId,
        granted: Boolean(granted),
        reason: rest.reason || "Manual assignment",
        grantedBy: rest.grantedBy || null,
        expiresAt: rest.expiresAt ? new Date(rest.expiresAt) : null,
        isActive: Boolean(rest.isActive ?? true),
      });
    }

    const finalUpdates: UserPermissionUpdate[] = [];

    for (const [scope, updates] of Object.entries(groupedUpdates)) {
      console.log(`[PUT] Processing scope ${scope} (${updates.length} perms)`);

      // ───────────────────────────────────────
      // Previously here: VIEW + WRITE rejection
      // Now removed → VIEW + CREATE/EDIT/DELETE allowed
      // ───────────────────────────────────────

      finalUpdates.push(...updates);
    }

    if (finalUpdates.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid permission updates after validation",
        },
        { status: 400 },
      );
    }

    console.log(`[PUT] Applying ${finalUpdates.length} validated updates`);
    const success = await updateUserPermissions(finalUpdates);

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${finalUpdates.length} permission records`,
      updatedCount: finalUpdates.length,
    });
  } catch (error) {
    console.error("[PUT] Critical error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update user permissions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
