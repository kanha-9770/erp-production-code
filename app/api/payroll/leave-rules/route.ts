export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { cached } from "@/lib/cache";
import { LEAVE_RULES_KEY, LEAVE_RULES_TTL_S } from "@/lib/hr/leave-cache";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    // Fetch leave types with their rules (cached)
    const leaveTypes = await cached("hr", LEAVE_RULES_KEY, LEAVE_RULES_TTL_S, () =>
      prisma.leaveType.findMany({
        include: { leaveRules: true },
        orderBy: { name: "asc" },
      })
    );

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
