export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

/**
 * GET /api/notifications/unread-count
 * Lightweight count for the bell badge — polled on a short interval.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const count = await (prisma as any).notification.count({
      where: { recipientId: authUser.id, isRead: false },
    })

    return NextResponse.json({ success: true, data: { count } })
  } catch (error) {
    console.error("[GET /api/notifications/unread-count]", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch unread count" },
      { status: 500 }
    )
  }
}
