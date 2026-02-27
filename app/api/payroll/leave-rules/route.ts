export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = await validateSession(token);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    // Fetch leave types with their rules
    const leaveTypes = await prisma.leaveType.findMany({
      include: {
        leaveRules: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      leaveTypes,
    });
  } catch (error) {
    console.error("[v0] Error fetching leave rules:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch leave rules" },
      { status: 500 }
    );
  }
}
