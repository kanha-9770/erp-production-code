// app/api/login-history/route.ts

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const history = await prisma.loginHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 500, // Increased a bit — adjust as needed
      include: {
        user: {
          select: {
            first_name: true,
            last_name: true,
            email: true,        // Useful to display even if user is deleted
            avatar: true,       // Optional: for showing profile pic
          },
        },
      },
    })

    // Optional: Format full name for frontend convenience
    const formattedHistory = history.map((entry) => ({
      ...entry,
      userFullName:
        entry.user
          ? `${entry.user.first_name || ""} ${entry.user.last_name || ""}`.trim() || entry.email
          : null,
    }))

    return NextResponse.json(formattedHistory)
  } catch (error) {
    console.error("Error fetching login history:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch login history" },
      { status: 500 }
    )
  }
}