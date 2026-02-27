// app/api/auth/verify-otp/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createSession } from "@/lib/auth"
import { VerifyOTPSchema } from "@/lib/validations"

export async function POST(request: NextRequest) {
  try {
    console.log("OTP Verification API called")
    const body = await request.json()
    console.log("Request body:", body)

    // Validate input
    const { otp } = VerifyOTPSchema.parse(body)
    const { userId, type: typeParam = "registration" } = body

    console.log("Parsed data:", { otp, userId, typeParam })

    // Convert string type to enum
    let type: "REGISTRATION" | "LOGIN" | "PASSWORD_RESET"

    if (typeParam === "registration") {
      type = "REGISTRATION"
    } else if (typeParam === "login") {
      type = "LOGIN"
    } else if (typeParam === "password_reset") {
      type = "PASSWORD_RESET"
    } else {
      type = "REGISTRATION" // default fallback
    }

    console.log("Converted type:", type)

    if (!userId) {
      console.log("Missing userId")
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Find the OTP
    console.log("Looking for OTP with:", { userId, code: otp, type })
    const otpRecord = await prisma.oTPCode.findFirst({
      where: {
        userId,
        code: otp,
        type,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    })

    console.log("OTP record found:", !!otpRecord)

    if (!otpRecord) {
      console.log("OTP not found or invalid, incrementing attempts")
      await prisma.oTPCode.updateMany({
        where: {
          userId,
          type,
          used: false,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      })

      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 })
    }

    console.log("Marking OTP as used")
    // Mark OTP as used
    await prisma.oTPCode.update({
      where: { id: otpRecord.id },
      data: {
        used: true,
        verified: true,
      },
    })

    let updatedUser = otpRecord.user

    // Only verify email and activate for REGISTRATION or PASSWORD_RESET
    if (type === "REGISTRATION" || type === "PASSWORD_RESET") {
      console.log(`Verifying email and activating user for ${type}`)
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          email_verified: true,
          status: "ACTIVE",
        },
        select: {
          id: true,
          email: true,
          email_verified: true,
          status: true,
        },
      })
    } else {
      console.log("LOGIN flow — no email verification change")
      // For LOGIN: do NOT change email_verified or status
      // Just create session
    }

    console.log("Creating session for user:", userId)
    const session = await createSession(
      userId,
      request.headers.get("x-forwarded-for") || "unknown",
      request.headers.get("user-agent") || "unknown",
    )

    const userWithOrg = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    })

    const needsOrganization = type === "REGISTRATION" && !userWithOrg?.organizationId

    console.log("OTP verification successful")

    const response = NextResponse.json({
      success: true,
      message: type === "LOGIN" 
        ? "Login successful" 
        : "Email verified successfully",
      needsOrganization,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        email_verified: updatedUser.email_verified,
        status: updatedUser.status,
      },
    })

    // Set authentication cookie
    response.cookies.set("auth-token", session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    })

    return response
  } catch (error: any) {
    console.error("OTP verification error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}