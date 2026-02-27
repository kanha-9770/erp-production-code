import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[v0] GET /api/users - Starting request')

    // 1. Validate session & get current user's organization
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      console.warn('[v0] GET /api/users - No auth token')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await validateSession(token)
    if (!session || !session.user) {
      console.warn('[v0] GET /api/users - Invalid session')
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Extract organizationId (try common paths)
    const organizationId =
      session.user?.organizationId ||
      session.user?.organization?.id ||
      session.user?.orgId ||
      session.user?.tenantId

    console.log('[v0] GET /api/users - Session user:', {
      userId: session.user.id,
      email: session.user.email,
      organizationId: organizationId || 'MISSING'
    })

    if (!organizationId) {
      console.warn('[v0] GET /api/users - No organizationId in session')
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
        first_name: true,
        last_name: true,
        department: true,
        avatar: true,
        status: true,
        unitAssignments: {
          include: {
            unit: { select: { name: true } },
            role: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { first_name: 'asc' },
        { last_name: 'asc' },
      ],
    })

    console.log(`[v0] GET /api/users - Successfully retrieved ${users.length} users for organization ${organizationId}`)

    return NextResponse.json({
      success: true,
      data: users,
      meta: {
        count: users.length,
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