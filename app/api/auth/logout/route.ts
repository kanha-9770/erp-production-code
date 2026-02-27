// export const dynamic = 'force-dynamic';
// import { NextRequest, NextResponse } from 'next/server'
// import { deleteSession } from '@/lib/auth'

// export async function POST(request: NextRequest) {
//   try {
//     const token = request.cookies.get('auth-token')?.value

//     if (token) {
//       await deleteSession(token)
//     }

//     const response = NextResponse.json({
//       success: true,
//       message: 'Logged out successfully',
//     })

//     // Clear authentication cookie
//     response.cookies.delete('auth-token')

//     return response
//   } catch (error) {
//     console.error('Logout error:', error)
//     return NextResponse.json(
//       { error: 'Internal server error' },
//       { status: 500 }
//     )
//   }
// }

// app/api/auth/logout/route.ts

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Fixed audit log helper — now accepts organizationId explicitly
async function logAudit({
  userId,
  organizationId,      // ← Added
  performedBy,
  action,
  details,
  ipAddress,
  userAgent,
}: {
  userId?: string
  organizationId?: string | null   // ← Critical for multi-tenant
  performedBy: string
  action: string
  details?: string
  ipAddress: string
  userAgent: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        organizationId: organizationId || null,  // ← Now correctly saved
        performedBy,
        action,
        module: "Authentication",
        details: details || null,
        ipAddress,
        userAgent,
      },
    })
    console.log(`Audit log: ${action} by ${performedBy}`)
  } catch (error) {
    console.error("Failed to create audit log on logout:", error)
    // Never break logout flow
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

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
              organizationId: true,  // ← Fetch this!
            },
          },
        },
      })

      if (session?.user) {
        performedBy = session.user.email
        userId = session.userId
        organizationId = session.user.organizationId  // ← Save it
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

      // Log successful logout with correct organizationId
      await logAudit({
        userId,
        organizationId,           // ← Now passed correctly
        performedBy,
        action: "Logout",
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
    response.cookies.delete('auth-token', { path: '/' })

    return response
  } catch (error) {
    console.error('Logout error:', error)

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    // Best-effort error logging
    await logAudit({
      organizationId: null,
      performedBy: "unknown@user.com",
      action: "Logout Failed",
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