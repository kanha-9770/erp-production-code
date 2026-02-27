export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { validateSession } from "@/lib/auth"

const prisma = new PrismaClient()

// GET - Fetch employees based on user role
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const session = await validateSession(token)

    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      )
    }

    const organizationId = user.organizationId
    const isAdmin = session.user.unitAssignments.some((ua: any) => ua.role.name.toLowerCase().includes("admin"))

    let employees

    if (isAdmin) {
      // Fetch admin user IDs to exclude
      const adminUserIdsResult = await prisma.$queryRaw`
        SELECT DISTINCT u.id
        FROM users u
        JOIN user_unit_assignments uua ON uua.user_id = u.id
        JOIN roles r ON r.id = uua.role_id
        WHERE u.organization_id = ${organizationId}
        AND r.name ILIKE '%admin%'
      `;
      const adminUserIds = (adminUserIdsResult as any[]).map((row: any) => row.id);

      // Admin can see all non-admin employees in their organization
      employees = await prisma.employee.findMany({
        where: {
          status: "ACTIVE",
          userId: {
            notIn: adminUserIds.length > 0 ? adminUserIds : undefined,
          },
          user: {
            organizationId: organizationId,
          },
        },
        select: {
          id: true,
          userId: true,
          employeeName: true,
          department: true,
          designation: true,
          totalSalary: true,
          givenSalary: true,
          bonusAmount: true,
          nightAllowance: true,
          overTime: true,
          oneHourExtra: true,
          status: true,
        },
        orderBy: {
          employeeName: "asc",
        },
      })
    } else {
      // Non-admin can only see their own employee record
      employees = await prisma.employee.findMany({
        where: {
          userId: session.user.id,
          status: "ACTIVE",
        },
        select: {
          id: true,
          userId: true,
          employeeName: true,
          department: true,
          designation: true,
          totalSalary: true,
          givenSalary: true,
          bonusAmount: true,
          nightAllowance: true,
          overTime: true,
          oneHourExtra: true,
          status: true,
        },
      })
    }

    return NextResponse.json({ success: true, employees, isAdmin })
  } catch (error) {
    console.error("[v0] Error fetching employees:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch employees" }, { status: 500 })
  }
}         