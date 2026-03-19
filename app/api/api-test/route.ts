// app/api/api-test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getAuthenticatedUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized or invalid session" },
        { status: 401 }
      );
    }

    if (!currentUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "User not part of any organization" },
        { status: 403 }
      );
    }

    const userCount = await prisma.user.count({
      where: { organizationId: currentUser.organizationId },
    });

    return NextResponse.json({
      success: true,
      data: {
        organizationId: currentUser.organizationId,
        userCount,
      },
    });
  } catch (error) {
    console.error("Error in /api/api-test:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
