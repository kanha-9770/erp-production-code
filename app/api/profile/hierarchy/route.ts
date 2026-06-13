export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { getScopedRoleHierarchyForUser } from "@/lib/database/roles";

/**
 * GET /api/profile/hierarchy
 *
 * Returns the authenticated user's OWN slice of the org role hierarchy:
 * the roles they report up to and the team that reports down to them, with
 * per-role head-counts. Available to every authenticated user — the response
 * is scoped server-side to the caller's reporting line, so it never leaks
 * roles/users from branches the caller isn't part of. Powers the "Hierarchy"
 * tab on /profile (see components/profile/HierarchyTab).
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 },
      );
    }

    const data = await getScopedRoleHierarchyForUser(
      authUser.id,
      authUser.organizationId,
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/profile/hierarchy] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load reporting hierarchy",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
