import { NextRequest, NextResponse } from "next/server";
import { getToday } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { invalidatePayrollCache } from "@/lib/utils/payroll-live";
import { formatHHmm, orgTimezone } from "@/lib/hr/attendance-service";
import { getAttendanceConfig } from "@/lib/hr/attendance-config";

// Get attendance records

export const dynamic = 'force-dynamic';
export const revalidate = 0; // ← ADD THIS

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const _ = searchParams.get("_"); // ← cache buster (ignored)

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const today = getToday();

    const todayRecord = await prisma.attendance.findFirst({
      where: {
        userId,
        date: today,
      },
    });

    const status = {
      checkedIn: todayRecord?.checkedIn || false,
      checkedOut: todayRecord?.checkedOut || false,
      canCheckIn: !todayRecord?.checkedIn,
      canCheckOut: todayRecord?.checkedIn && !todayRecord?.checkedOut,
      checkInTime: todayRecord?.checkInTime,
      checkOutTime: todayRecord?.checkOutTime,
      todayRecord: todayRecord || null,
    };

    return NextResponse.json(
      { success: true, status },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  } catch (error: any) {
    console.error("[Attendance Status API] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch status" },
      { status: 500 }
    );
  }
}

// Create or update attendance record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, action } = body;
    if (!userId || !action) {
      return NextResponse.json(
        { success: false, error: "userId and action are required" },
        { status: 400 }
      );
    }

    const today = getToday();
    // Resolve the user's org once so we can render the HH:mm in the org's
    // configured timezone — otherwise the legacy endpoint stores UTC times
    // on a UTC-deployed server, which is what produced the wrong
    // notification times.
    const userForTz = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    const cfg = userForTz?.organizationId
      ? await getAttendanceConfig(userForTz.organizationId)
      : null;
    const currentTime = formatHHmm(new Date(), orgTimezone(cfg));

    let record;

    if (action === "checkin") {
      // Check if already checked in
      record = await prisma.attendance.findFirst({
        where: {
          userId,
          date: today,
        },
      });

      if (record?.checkedIn) {
        return NextResponse.json(
          { success: false, error: "Already checked in today" },
          { status: 400 }
        );
      }

      // Create or update attendance record
      if (record) {
        record = await prisma.attendance.update({
          where: { id: record.id },
          data: {
            checkedIn: true,
            checkInTime: currentTime,
          },
        });
      } else {
        record = await prisma.attendance.create({
          data: {
            userId,
            date: today,
            checkedIn: true,
            checkInTime: currentTime,
          },
        });
      }
    } else if (action === "checkout") {
      // Get today's record
      record = await prisma.attendance.findFirst({
        where: {
          userId,
          date: today,
        },
      });

      if (!record) {
        return NextResponse.json(
          { success: false, error: "No check-in record found for today" },
          { status: 400 }
        );
      }

      if (!record.checkedIn) {
        return NextResponse.json(
          { success: false, error: "Must check in first" },
          { status: 400 }
        );
      }

      if (record.checkedOut) {
        return NextResponse.json(
          { success: false, error: "Already checked out today" },
          { status: 400 }
        );
      }

      // Update record with check-out
      record = await prisma.attendance.update({
        where: { id: record.id },
        data: {
          checkedOut: true,
          checkOutTime: currentTime,
        },
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid action. Use 'checkin' or 'checkout'" },
        { status: 400 }
      );
    }

    // The legacy endpoint doesn't receive `organizationId`, so we reuse the
    // `userForTz` lookup above. Without this the live payroll cache would
    // stay stale until its TTL expired (5s) and the user would see a brief
    // "wrong" reading on the payroll page.
    if (record && userForTz?.organizationId) {
      try {
        invalidatePayrollCache(userForTz.organizationId);
      } catch (err) {
        // Cache invalidation is best-effort. The TTL inside the live
        // engine will catch up on its own within a few seconds.
        console.warn("[attendance/legacy] cache invalidation failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      record,
    });
  } catch (error: any) {
    console.error("[Attendance API] POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record attendance" },
      { status: 500 }
    );
  }
}
