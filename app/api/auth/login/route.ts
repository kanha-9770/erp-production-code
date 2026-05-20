// app/api/auth/login/route.ts

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword, createSession, generateOTP } from "@/lib/auth"
import { sendOTPEmail } from "@/lib/email"
import { LoginSchema } from "@/lib/utils/validations"
import { getRequestMeta, logAudit } from "@/lib/api-helpers"
import { computeRouteMeta } from "@/lib/auth/route-meta"
import {
  checkIpRate,
  clearIpFailures,
  checkAccountLockout,
  rateLimitResponse,
} from "@/lib/auth/rate-limit"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Capture early for consistent logging
    const { ipAddress, userAgent } = getRequestMeta(request)

    // Layer 1: per-IP rate limit. Stops obvious brute force before any work.
    const ipGate = checkIpRate(ipAddress, "login")
    if (!ipGate.allowed) return rateLimitResponse(ipGate)

    // Validate input
    const validation = LoginSchema.safeParse(body)
    if (!validation.success) {
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
        performedBy: email,
        action: "Login Failed",
        module: "Authentication",
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

    // Layer 2: per-account lockout. Counts recent Failed rows in LoginHistory.
    const acctGate = await checkAccountLockout({ email })
    if (!acctGate.allowed) {
      await logAudit({
        performedBy: email,
        action: "Login Blocked",
        module: "Authentication",
        details: `Account locked: ${acctGate.message}`,
        ipAddress,
        userAgent,
      })
      return rateLimitResponse(acctGate)
    }

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
        organizationId: true,
        login_attempts: true,
      },
    })

    if (!user) {
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
        performedBy: email,
        action: "Login Failed",
        module: "Authentication",
        details: "User not found",
        ipAddress,
        userAgent,
      })

      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Email not verified
    if (!user.email_verified) {
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
        performedBy: email,
        action: "Login Failed",
        module: "Authentication",
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
          performedBy: email,
          action: "Login Failed",
          module: "Authentication",
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
          performedBy: email,
          action: "Login Failed",
          module: "Authentication",
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
        performedBy: email,
        action: "Login",
        module: "Authentication",
        details: "Successful password login",
        ipAddress,
        userAgent,
      })
    } else {
      // Passwordless: Send OTP
      try {
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
          await logAudit({
            userId: user.id,
            organizationId: user.organizationId,
            performedBy: email,
            action: "OTP Send Failed",
            module: "Authentication",
            details: "Failed to send login code email",
            ipAddress,
            userAgent,
          })

          return NextResponse.json({ error: "Failed to send login code" }, { status: 500 })
        }

        // CREATE TEMPORARY SESSION FOR OTP FLOW
        const tempSession = await createSession(user.id, ipAddress, userAgent)

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
          performedBy: email,
          action: "Login Code Sent",
          module: "Authentication",
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
          performedBy: email,
          action: "OTP Send Failed",
          module: "Authentication",
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

    // Honest user — drop the per-IP counter so a typo earlier doesn't carry over.
    clearIpFailures(ipAddress, "login")

    // Create session
    const session = await createSession(user.id, ipAddress, userAgent)

    // Fetch user roles for auth-meta cookie (lightweight permission data for middleware)
    const userWithRoles = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        organizationId: true,
        organization: { select: { selectedModules: true } },
        unitAssignments: {
          select: {
            role: { select: { id: true, name: true, isAdmin: true } },
          },
        },
      },
    })

    const isAdmin = userWithRoles?.unitAssignments?.some(
      (ua) => ua.role.isAdmin || (ua.role.name ?? "").toLowerCase().includes("admin")
    ) ?? false
    const roleNames = userWithRoles?.unitAssignments?.map((ua) => ua.role.name) ?? []
    const roleIds = userWithRoles?.unitAssignments?.map((ua) => ua.role.id) ?? []

    // Compute route + module access from DB permissions
    const { deniedRoutes, allowedRoutes, allowedModuleIds } = isAdmin
      ? { deniedRoutes: [], allowedRoutes: [], allowedModuleIds: [] }
      : await computeRouteMeta(user.id, userWithRoles?.organizationId ?? null, roleIds)

    // ERP modules the org has opted into — drives sidebar/middleware gating.
    const selectedModules: string[] = Array.isArray(userWithRoles?.organization?.selectedModules)
      ? (userWithRoles!.organization!.selectedModules as string[])
      : []

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

    // Set auth-meta cookie for lightweight middleware permission checks
    response.cookies.set(
      "auth-meta",
      JSON.stringify({ v: 2, ts: Date.now(), isAdmin, roleNames, deniedRoutes, allowedRoutes, allowedModuleIds, selectedModules }),
      {
        httpOnly: false, // Client-side RoutePermissionGuard needs to read this
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: "/",
      }
    )

    console.log(
      `[login] auth-meta set for user=${user.email} isAdmin=${isAdmin} roles=[${roleNames}] allowedModules=${allowedModuleIds.length} denied=[${deniedRoutes}]`
    )

    return response
  } catch (error) {
    console.error("Unexpected login error:", error)

    const { ipAddress, userAgent } = getRequestMeta(request)
    const fallbackEmail = (await request.json().catch(() => ({}))).email || "unknown"

    await logAudit({
      performedBy: fallbackEmail,
      action: "Login Error",
      module: "Authentication",
      details: "Unexpected server error during login",
      ipAddress,
      userAgent,
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
