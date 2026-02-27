export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendOTPEmail } from '@/lib/email'
import { generateOTP } from '@/lib/auth'
import { z } from 'zod'

const ResendOTPSchema = z.object({
  userId: z.string(),
  type: z.enum(['registration', 'password_reset']),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, type } = ResendOTPSchema.parse(body)

    // Convert string type to enum
    const otpType = type === 'registration' ? 'REGISTRATION' : 'PASSWORD_RESET'

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 400 }
      )
    }

    // Check if there's a recent OTP request (rate limiting)
    const recentOTP = await prisma.oTPCode.findFirst({
      where: {
        userId,
        type: otpType,
        createdAt: {
          gt: new Date(Date.now() - 60000), // 1 minute ago
        },
      },
    })

    if (recentOTP) {
      return NextResponse.json(
        { error: 'Please wait 1 minute before requesting another code' },
        { status: 429 }
      )
    }

    // Generate new OTP
    const otp = generateOTP()
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 10) // 10 minutes expiry

    // Create or update OTP
    await prisma.oTPCode.upsert({
      where: {
        userId_type: {
          userId: user.id,
          type: otpType,
        },
      },
      create: {
        userId: user.id,
        code: otp,
        type: otpType,
        expiresAt,
      },
      update: {
        code: otp,
        expiresAt,
        used: false,
        attempts: 0,
      },
    })

    // Send OTP email
    const emailType = type === 'registration' ? 'registration' : 'password_reset'
    const emailResult = await sendOTPEmail(user.email, otp, emailType)

    if (!emailResult.success) {
      return NextResponse.json(
        { error: 'Failed to send verification email' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'New verification code sent to your email',
    })
  } catch (error) {
    console.error('Resend OTP error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}