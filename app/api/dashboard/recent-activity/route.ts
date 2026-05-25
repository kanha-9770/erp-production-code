import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { getDateRange } from "@/lib/utils/date-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/recent-activity
 *
 * Returns the most recent N audit-log rows for the signed-in user. The
 * dashboard skips this on first paint and pulls it when the activity
 * panel is opened.
 *
 * Query params:
 *   - limit: how many rows to return (default 10, max 50)
 *   - dateRange: any value accepted by getDateRange (defaults to "30days")
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1),
      50,
    );
    const dateRange = url.searchParams.get("dateRange") || "30days";
    const { startDate, endDate } = getDateRange(dateRange);

    const rows = await prisma.auditLog.findMany({
      where: {
        userId: authUser.id,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        module: true,
        recordName: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      activity: rows.map((a) => ({
        id: a.id,
        action: a.action,
        module: a.module,
        recordName: a.recordName,
        timestamp: a.createdAt.toLocaleString(),
      })),
    });
  } catch (error) {
    console.error("[dashboard/recent-activity] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load recent activity" },
      { status: 500 },
    );
  }
}
