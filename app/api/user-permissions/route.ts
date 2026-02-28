// app/api/user-permissions/route.ts
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import {
  getUserPermissions,
  updateUserPermissions,
  type UserPermissionUpdate,
} from "@/lib/database";

const VIEW_PERMISSION_ID = "1"; // ← Change to your actual VIEW permission ID
const CREATE_PERMISSION_ID = "2"; // ← Change to your actual IDs
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
      `[GET] Successfully retrieved ${userPermissions.length} user permissions for userId: ${userId || "all"}`,
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
    console.error("[GET] Failed to fetch user permissions:", error);
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
    console.log("[PUT] Raw request body:", JSON.stringify(body, null, 2));

    if (!Array.isArray(body)) {
      console.log("[PUT] Invalid request body: must be an array");
      return NextResponse.json(
        { success: false, error: "Request body must be an array" },
        { status: 400 },
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Group updates by (userId, formId/moduleId) to enforce VIEW-only rule
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
          "[PUT] Skipping invalid update: missing userId or permissionId",
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

    // ────────────────────────────────────────────────────────────────
    // Enforce VIEW-only rule per scope
    // ────────────────────────────────────────────────────────────────
    for (const [scope, updates] of Object.entries(groupedUpdates)) {
      console.log(
        `[PUT] Processing scope: ${scope} (${updates.length} permissions)`,
      );

      const hasView = updates.some(
        (u) => u.permissionId === VIEW_PERMISSION_ID && u.granted,
      );
      const hasWrite = updates.some(
        (u) => WRITE_PERMISSIONS.includes(u.permissionId) && u.granted,
      );

      if (hasView && hasWrite) {
        // Option 1: Strict rejection (recommended for security)
        console.warn(
          `[PUT] Rejected: VIEW + WRITE permissions cannot coexist in scope ${scope}`,
        );
        return NextResponse.json(
          {
            success: false,
            error:
              "Cannot grant VIEW together with CREATE/EDIT/DELETE permissions",
            details:
              "Admin tried to assign multiple permissions including VIEW + write access",
          },
          { status: 400 },
        );

        // Option 2: Auto-disable write permissions (less strict - uncomment if preferred)
        /*
        console.warn(`[PUT] Auto-correcting: disabling write permissions because VIEW is granted in scope ${scope}`);
        updates.forEach(u => {
          if (WRITE_PERMISSIONS.includes(u.permissionId)) {
            u.granted = false;
          }
        });
        */
      }

      finalUpdates.push(...updates);
    }

    if (finalUpdates.length === 0) {
      console.log("[PUT] No valid updates after validation");
      return NextResponse.json(
        { success: false, error: "No valid updates provided after validation" },
        { status: 400 },
      );
    }

    console.log(`[PUT] Final validated updates count: ${finalUpdates.length}`);
    console.log("[PUT] Final updates:", JSON.stringify(finalUpdates, null, 2));

    const success = await updateUserPermissions(finalUpdates);
    console.log("[PUT] updateUserPermissions result:", success);

    return NextResponse.json({
      success: true,
      message: `Updated ${finalUpdates.length} user permissions (VIEW-only rule enforced)`,
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
