// pages/api/permissions.ts
import { getPermissions } from "@/lib/database";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    console.log("[v0] GET /api/permissions - Starting request");

    const permissions = await getPermissions();
    console.log(`[v0] Retrieved ${permissions.length} permissions from database`);

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