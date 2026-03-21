export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { DatabaseRoles } from "@/lib/database/DatabaseRoles";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. Get current user's organization
    const organizationId = authUser.organizationId;

    if (!organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      );
    }

    // 3. Fetch roles for this organization
    const rolesWithCount = await DatabaseRoles.getRolesForOrganization(organizationId);

    return NextResponse.json({
      success: true,
      data: rolesWithCount,
      meta: {
        count: rolesWithCount.length,
        organizationId,
      },
    });
  } catch (error) {
    console.error("[GET /api/roles] Failed to fetch roles:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch roles",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
