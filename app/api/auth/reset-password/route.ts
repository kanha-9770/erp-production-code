export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, createSession } from '@/lib/auth'
import { z } from 'zod'

const ResetPasswordSchema = z.object({
  userId: z.string(),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, otp, password } = ResetPasswordSchema.parse(body)

    // Find the OTP
    const otpRecord = await prisma.oTPCode.findFirst({
      where: {
        userId,
        code: otp,
        type: 'PASSWORD_RESET',
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    })

    if (!otpRecord) {
      // Increment attempts if OTP exists but is invalid/expired
      await prisma.oTPCode.updateMany({
        where: {
          userId,
          type: 'PASSWORD_RESET',
          used: false,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      })

      return NextResponse.json(
        { error: 'Invalid or expired reset code' },
        { status: 400 }
      )
    }

    // Hash the new password
    const hashedPassword = await hashPassword(password)

    // Update user password and mark OTP as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          login_attempts: 0, // Reset login attempts
        },
      }),
      prisma.oTPCode.update({
        where: { id: otpRecord.id },
        data: {
          used: true,
          verified: true,
        },
      }),
    ])

    // Create session to auto-login user
    const session = await createSession(
      userId,
      request.headers.get('x-forwarded-for') || 'unknown',
      request.headers.get('user-agent') || 'unknown'
    )

    const response = NextResponse.json({
      success: true,
      message: 'Password reset successfully',
      user: {
        id: otpRecord.user.id,
        email: otpRecord.user.email,
        email_verified: otpRecord.user.email_verified,
      },
    })

    // Set authentication cookie
    response.cookies.set('auth-token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })

    return response
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}