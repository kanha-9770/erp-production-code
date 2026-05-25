import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { getDateRange } from "@/lib/utils/date-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/summary
 *
 * Lightweight first-paint payload for the user landing page. Returns just
 * the user identity card plus the four headline counts (submissions,
 * attendance, activities, logins). Heavy data (modules tree, time series,
 * recent activity feed) is split into separate endpoints that the client
 * fetches lazily — see /api/dashboard/modules, /time-series, /recent-activity.
 *
 * Query params:
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
    const dateRange = url.searchParams.get("dateRange") || "30days";
    const { startDate, endDate } = getDateRange(dateRange);

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        employee: {
          select: {
            employeeName: true,
            department: true,
            designation: true,
            status: true,
            dateOfJoining: true,
          },
        },
        unitAssignments: {
          include: {
            role: { select: { id: true, name: true, isActive: true } },
            unit: { select: { id: true, name: true, isActive: true } },
          },
        },
      },
    });

    // Stat counts run in parallel — these are the only DB queries on the
    // critical path for the first paint. Each is a single COUNT().
    const [myAttendance, myActivityCount, myLoginCount] = await Promise.all([
      prisma.attendance.count({
        where: { userId: authUser.id, createdAt: { gte: startDate, lte: endDate } },
      }),
      prisma.auditLog.count({
        where: { userId: authUser.id, createdAt: { gte: startDate, lte: endDate } },
      }),
      prisma.loginHistory.count({
        where: {
          userId: authUser.id,
          status: "Success",
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    // Submissions span 15 partition tables. We skip them on first paint
    // and return 0 — the client can either show "—" or trigger the
    // /api/dashboard/submissions-count endpoint when the user actually
    // looks at that card. Keeps this route O(few-ms) instead of O(15-counts).
    const mySubmissions = 0;

    return NextResponse.json({
      success: true,
      user: {
        name:
          [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
          user?.username ||
          user?.email ||
          "",
        email: user?.email || "",
        department: user?.employee?.department || user?.department || "-",
        designation: user?.employee?.designation || "-",
        status: user?.employee?.status || user?.status || "-",
        dateOfJoining: user?.employee?.dateOfJoining?.toLocaleDateString() || "-",
        roles:
          user?.unitAssignments.map((ua) => ({
            roleName: ua.role.name,
            unitName: ua.unit.name,
          })) || [],
      },
      stats: {
        mySubmissions,
        myAttendance,
        myActivityCount,
        myLoginCount,
      },
    });
  } catch (error) {
    console.error("[dashboard/summary] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load dashboard summary" },
      { status: 500 },
    );
  }
}
