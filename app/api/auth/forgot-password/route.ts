// src/app/api/auth/forgot-password/route.ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendOTPEmail } from '@/lib/email'
import { generateOTP } from '@/lib/auth'
import { z } from 'zod'

// ✅ Schema for just an email
const EmailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

export async function POST(request: NextRequest) {
  try {
    // Parse and validate email only
    const { email } = EmailSchema.parse(await request.json())

    // Check if user exists and is verified
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email address' },
        { status: 400 }
      )
    }

    if (!user.email_verified) {
      return NextResponse.json(
        { error: 'Please verify your email first before resetting password' },
        { status: 400 }
      )
    }

    // Generate OTP and set 10-minute expiry
    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // Create or update OTP for password reset
    await prisma.oTPCode.upsert({
      where: {
        userId_type: {
          userId: user.id,
          type: 'PASSWORD_RESET',
        },
      },
      create: {
        userId: user.id,
        code: otp,
        type: 'PASSWORD_RESET',
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
    const emailResult = await sendOTPEmail(email, otp, 'password_reset')
    if (!emailResult.success) {
      return NextResponse.json(
        { error: 'Failed to send password reset email' },
        { status: 500 }
      )
    }

    // Success response
    return NextResponse.json({
      success: true,
      message: 'Password reset code sent to your email',
      userId: user.id,
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
