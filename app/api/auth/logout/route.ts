// app/api/auth/logout/route.ts

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRequestMeta, logAudit } from '@/lib/api-helpers'

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value

    const { ipAddress, userAgent } = getRequestMeta(request)

    let performedBy = "unknown@user.com"
    let userId: string | undefined = undefined
    let organizationId: string | null = null

    if (token) {
      // Fetch session + user info (including organizationId)
      const session = await prisma.userSession.findUnique({
        where: { token },
        select: {
          userId: true,
          user: {
            select: {
              email: true,
              organizationId: true,
            },
          },
        },
      })

      if (session?.user) {
        performedBy = session.user.email
        userId = session.userId
        organizationId = session.user.organizationId
      } else if (session?.userId) {
        // Fallback: fetch user separately
        const user = await prisma.user.findUnique({
          where: { id: session.userId },
          select: {
            email: true,
            organizationId: true,
          },
        })
        if (user) {
          performedBy = user.email
          organizationId = user.organizationId
        }
        userId = session.userId
      }

      // Delete the session
      await deleteSession(token)

      await logAudit({
        userId,
        organizationId,
        performedBy,
        action: "Logout",
        module: "Authentication",
        details: "Successful logout",
        ipAddress,
        userAgent,
      })
    } else {
      // No token provided
      await logAudit({
        organizationId: null,
        performedBy,
        action: "Logout Attempt",
        module: "Authentication",
        details: "No active session token found (possibly already logged out or expired)",
        ipAddress,
        userAgent,
      })
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    })

    // Clear cookie
    response.cookies.delete('auth-token')

    return response
  } catch (error) {
    console.error('Logout error:', error)

    const { ipAddress, userAgent } = getRequestMeta(request)

    // Best-effort error logging
    await logAudit({
      organizationId: null,
      performedBy: "unknown@user.com",
      action: "Logout Failed",
      module: "Authentication",
      details: `Server error during logout: ${error instanceof Error ? error.message : 'Unknown'}`,
      ipAddress,
      userAgent,
    })

    return NextResponse.json(
      { error: 'Internal server error during logout' },
      { status: 500 }
    )
  }
}
