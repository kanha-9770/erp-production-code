export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

/**
 * GET /api/notifications?limit=20&unreadOnly=false
 * Returns the current user's notifications, newest first.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") || 20) || 20, 100)
    const unreadOnly = searchParams.get("unreadOnly") === "true"

    const where: any = { recipientId: authUser.id }
    if (unreadOnly) where.isRead = false

    const rows = await (prisma as any).notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return NextResponse.json({ success: true, data: rows })
  } catch (error) {
    console.error("[GET /api/notifications]", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch notifications" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/notifications
 * Body: { id?: string, ids?: string[], all?: boolean }
 * Marks notifications as read. `all=true` marks every unread row for the user.
 */
export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { id, ids, all } = body || {}

    const where: any = { recipientId: authUser.id, isRead: false }
    if (all) {
      // already filtered to user + unread
    } else if (Array.isArray(ids) && ids.length > 0) {
      where.id = { in: ids }
    } else if (typeof id === "string" && id) {
      where.id = id
    } else {
      return NextResponse.json(
        { success: false, error: "Provide id, ids, or all=true" },
        { status: 400 }
      )
    }

    const result = await (prisma as any).notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    })

    return NextResponse.json({ success: true, data: { updated: result.count } })
  } catch (error) {
    console.error("[PATCH /api/notifications]", error)
    return NextResponse.json(
      { success: false, error: "Failed to update notifications" },
      { status: 500 }
    )
  }
}
