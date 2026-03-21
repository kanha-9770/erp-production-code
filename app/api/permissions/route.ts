// pages/api/permissions.ts
import { getPermissions } from "@/lib/database/database";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const permissions = await getPermissions();
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