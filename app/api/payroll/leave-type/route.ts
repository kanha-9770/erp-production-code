import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

// GET - Fetch all leave types
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })

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
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })

    const userWithRoles = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { unitAssignments: { include: { role: { select: { isAdmin: true, name: true } } } } },
    });
    const isAdmin = userWithRoles?.unitAssignments.some(
      (ua: any) => ua.role?.isAdmin || ua.role?.name?.toLowerCase().includes("admin")
    ) ?? false;

    if (!isAdmin) {
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
