import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { validateSession } from "@/lib/auth"

const prisma = new PrismaClient()

// GET - Fetch all leave types
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const session = await validateSession(token)

    if (!session) {
      return NextResponse.json({ success: false, error: "Invalid session" }, { status: 401 })
    }

    const leaveTypes = await prisma.leaveType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    })

    return NextResponse.json({ success: true, leaveTypes })
  } catch (error) {
    console.error("[v0] Error fetching leave types:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch leave types" }, { status: 500 })
  }
}

// POST - Create or update leave type (Admin only)
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const session = await validateSession(token)

    if (!session) {
      return NextResponse.json({ success: false, error: "Invalid session" }, { status: 401 })
    }

    const hasAdminRole = session.user.unitAssignments.some((ua: any) => ua.role.name.toLowerCase().includes("admin"))

    if (!hasAdminRole) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Only admins can manage leave types." },
        { status: 403 },
      )
    }

    const body = await request.json()
    const { id, ...typeData } = body

    let leaveType
    if (id) {
      leaveType = await prisma.leaveType.update({
        where: { id },
        data: typeData,
      })
    } else {
      leaveType = await prisma.leaveType.create({
        data: typeData,
      })
    }

    return NextResponse.json({ success: true, leaveType })
  } catch (error) {
    console.error("[v0] Error saving leave type:", error)
    return NextResponse.json({ success: false, error: "Failed to save leave type" }, { status: 500 })
  }
}
