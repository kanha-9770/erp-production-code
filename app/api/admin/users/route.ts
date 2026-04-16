import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getAuthenticatedUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { organizationId } = currentUser

    if (!organizationId) {
      return NextResponse.json(
        { error: 'User is not associated with any organization' },
        { status: 403 }
      )
    }

    // 2. Fetch ONLY users from this organization
    const users = await prisma.user.findMany({
      where: {
        organizationId,  // ← THIS IS THE CRITICAL FIX
      },
      select: {
        id: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        department: true,
        avatar: true,
        status: true,
        phone: true,
        mobile: true,
        location: true,
        joinDate: true,
        createdAt: true,
        unitAssignments: {
          include: {
            unit: { select: { name: true } },
            role: { select: { id: true, name: true, isAdmin: true } },
          },
        },
        employee: {
          select: {
            employeeEngagementTeamName: true,
          },
        },
      },
      orderBy: [
        { first_name: 'asc' },
        { last_name: 'asc' },
      ],
    })

    const data = users.map((u) => {
      const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.username || u.email
      const unitsAndRoles = (u.unitAssignments || [])
        .filter((ua) => ua.unit && ua.role)
        .map((ua) => ({
          unit: { name: ua.unit!.name },
          role: { name: ua.role!.name, isAdmin: ua.role!.isAdmin || false },
        }))
      return {
        ...u,
        fullName,
        unitsAndRoles,
        employeeEngagementTeamName: u.employee?.employeeEngagementTeamName || null,
      }
    })

    return NextResponse.json({
      success: true,
      data,
      meta: {
        count: data.length,
        organizationId,
      }
    })
  } catch (error) {
    console.error('[v0] Failed to fetch users:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch users',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}