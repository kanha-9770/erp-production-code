// pages/api/permissions.ts
import { getPermissions, getPagePermissions } from "@/lib/database/database";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // `?scope=page` returns the static-page permission set (standard 7 +
    // APPROVAL). Default scope keeps the form/module set (7, no APPROVAL).
    const scope = request.nextUrl.searchParams.get("scope");
    const permissions =
      scope === "page" ? await getPagePermissions() : await getPermissions();
    return NextResponse.json({
      success: true,
      data: permissions,
      meta: {
        permissionCount: permissions.length,
      },
    });
  } catch (error) {
    console.error("[v0] Failed to fetch permissions:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch permissions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}