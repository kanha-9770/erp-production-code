// app/api/attendance/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToday } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";

// This tells Next.js: "This API route MUST run at request time"
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");

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

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error: any) {
    console.error("[Attendance Status API] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch status" },
      { status: 500 }
    );
  }
}