// app/api/auth/login/route.ts

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword, createSession, generateOTP } from "@/lib/auth"
import { sendOTPEmail } from "@/lib/email"
import { LoginSchema } from "@/lib/validations"

// Fixed audit log helper — now accepts organizationId explicitly
async function logAudit({
  userId,
  organizationId,     // ← Added: passed from user
  email,
  action,
  details,
  ipAddress,
  userAgent,
}: {
  userId?: string
  organizationId?: string | null   // ← Critical for multi-tenant
  email: string
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
        performedBy: email,
        action,
        module: "Authentication",
        details: details || null,
        ipAddress,
        userAgent,
      },
    })
    console.log(`Audit log: ${action} by ${email}`)
  } catch (error) {
    console.error("Failed to create audit log:", error)
    // Do not break login flow
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("Login API called")

    const body = await request.json()
    console.log("Request body:", body)

    // Capture early for consistent logging
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    // Validate input
    const validation = LoginSchema.safeParse(body)
    if (!validation.success) {
      console.log("Validation failed:", validation.error)

      const email = body.email || "unknown"

      await prisma.loginHistory.create({
        data: {
          email,
          ipAddress,
          userAgent,
          status: "Failed",
          reason: "Invalid input data",
        },
      })

      await logAudit({
        email,
        action: "Login Failed",
        details: "Invalid input data",
        ipAddress,
        userAgent,
      })

      return NextResponse.json(
        { error: "Invalid input data", details: validation.error.issues },
        { status: 400 }
      )
    }

    const { email, password } = validation.data
    console.log("Validated data:", { email, hasPassword: !!password })

    // Find user — include organizationId for audit logging
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        email_verified: true,
        first_name: true,
        last_name: true,
        avatar: true,
        organizationId: true,  // ← Needed for correct audit logs
        login_attempts: true,
      },
    })

    if (!user) {
      console.log("User not found:", email)

      await prisma.loginHistory.create({
        data: {
          email,
          ipAddress,
          userAgent,
          status: "Failed",
          reason: "Invalid email or password",
        },
      })

      await logAudit({
        email,
        action: "Login Failed",
        details: "User not found",
        ipAddress,
        userAgent,
      })

      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Email not verified
    if (!user.email_verified) {
      console.log("Email not verified:", email)

      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          email,
          ipAddress,
          userAgent,
          status: "Failed",
          reason: "Email not verified",
        },
      })

      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        email,
        action: "Login Failed",
        details: "Email not verified",
        ipAddress,
        userAgent,
      })

      return NextResponse.json({ error: "Please verify your email first" }, { status: 400 })
    }

    // Password-based login
    if (password) {
      if (!user.password) {
        await prisma.loginHistory.create({
          data: {
            userId: user.id,
            email,
            ipAddress,
            userAgent,
            status: "Failed",
            reason: "Password login not available",
          },
        })

        await logAudit({
          userId: user.id,
          organizationId: user.organizationId,
          email,
          action: "Login Failed",
          details: "Password login not available (social account?)",
          ipAddress,
          userAgent,
        })

        return NextResponse.json(
          { error: "Password login not available for this account" },
          { status: 400 }
        )
      }

      const isValidPassword = await verifyPassword(password, user.password)
      if (!isValidPassword) {
        console.log("Invalid password for user:", email)

        await prisma.loginHistory.create({
          data: {
            userId: user.id,
            email,
            ipAddress,
            userAgent,
            status: "Failed",
            reason: "Invalid password",
          },
        })

        await logAudit({
          userId: user.id,
          organizationId: user.organizationId,
          email,
          action: "Login Failed",
          details: "Invalid password",
          ipAddress,
          userAgent,
        })

        // Increment login attempts
        await prisma.user.update({
          where: { id: user.id },
          data: { login_attempts: (user.login_attempts || 0) + 1 },
        })

        return NextResponse.json({ error: "Invalid email or password" }, { status: 400 })
      }

      // SUCCESS: Password login
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          email,
          ipAddress,
          userAgent,
          status: "Success",
          reason: null,
        },
      })

      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        email,
        action: "Login",
        details: "Successful password login",
        ipAddress,
        userAgent,
      })
    } else {
      // Passwordless: Send OTP
      try {
        console.log("Sending OTP for passwordless login:", email)

        const otp = generateOTP()
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + 10)

        await prisma.oTPCode.upsert({
          where: { userId_type: { userId: user.id, type: "LOGIN" } },
          create: {
            userId: user.id,
            code: otp,
            type: "LOGIN",
            expiresAt,
          },
          update: {
            code: otp,
            expiresAt,
            used: false,
            attempts: 0,
          },
        })

        const emailResult = await sendOTPEmail(email, otp, "login")

        if (!emailResult.success) {
          console.log("Failed to send OTP email:", emailResult.error)

          await logAudit({
            userId: user.id,
            organizationId: user.organizationId,
            email,
            action: "OTP Send Failed",
            details: "Failed to send login code email",
            ipAddress,
            userAgent,
          })

          return NextResponse.json({ error: "Failed to send login code" }, { status: 500 })
        }

        // CREATE TEMPORARY SESSION FOR OTP FLOW
        const tempSession = await createSession(user.id, ipAddress, userAgent)

        console.log("OTP sent + temporary session created for user:", email)

        const response = NextResponse.json({
          success: true,
          message: "Login code sent to your email",
          userId: user.id,
          requiresOTP: true,
        })

        // Set temporary cookie (valid for OTP verification phase)
        response.cookies.set("auth-token", tempSession.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 10 * 60, // 10 minutes — enough for OTP entry
          path: "/",
        })

        await logAudit({
          userId: user.id,
          organizationId: user.organizationId,
          email,
          action: "Login Code Sent",
          details: "Passwordless login code sent + temporary auth-token issued",
          ipAddress,
          userAgent,
        })

        return response
      } catch (error) {
        console.error("Passwordless login error:", error)

        await logAudit({
          userId: user.id,
          organizationId: user.organizationId,
          email,
          action: "OTP Send Failed",
          details: "Error during passwordless login",
          ipAddress,
          userAgent,
        })

        return NextResponse.json({ error: "Failed to send login code" }, { status: 500 })
      }
    }

    // Reset login attempts on success
    await prisma.user.update({
      where: { id: user.id },
      data: { login_attempts: 0 },
    })

    // Create session
    const session = await createSession(user.id, ipAddress, userAgent)

    console.log("Login successful for user:", email)

    const response = NextResponse.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        email_verified: user.email_verified,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar: user.avatar,
      },
    })

    response.cookies.set("auth-token", session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Unexpected login error:", error)

    const fallbackEmail = (await request.json().catch(() => ({}))).email || "unknown"

    await logAudit({
      email: fallbackEmail,
      action: "Login Error",
      details: "Unexpected server error during login",
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      userAgent: request.headers.get("user-agent") || "unknown",
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}