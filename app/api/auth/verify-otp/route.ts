// app/api/auth/verify-otp/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createSession } from "@/lib/auth"
import { VerifyOTPSchema } from "@/lib/utils/validations"
import { computeRouteMeta } from "@/lib/auth/route-meta"
import { signAuthMeta } from "@/lib/auth/auth-meta-cookie"
import { getRequestMeta } from "@/lib/api-helpers"
import {
  checkIpRate,
  checkAccountLockout,
  clearIpFailures,
  rateLimitResponse,
} from "@/lib/auth/rate-limit"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { ipAddress } = getRequestMeta(request)

    // Per-IP throttle for OTP verification — guards against 6-digit guess attacks.
    const ipGate = checkIpRate(ipAddress, "verify-otp")
    if (!ipGate.allowed) return rateLimitResponse(ipGate)

    // Validate input
    const { otp } = VerifyOTPSchema.parse(body)
    const { userId, type: typeParam = "registration" } = body

    // Per-account lockout — same threshold as login. We treat repeated bad OTPs
    // as bad-faith access attempts on the account.
    if (userId) {
      const acctGate = await checkAccountLockout({ userId })
      if (!acctGate.allowed) return rateLimitResponse(acctGate)
    }

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

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Find the OTP
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

    if (!otpRecord) {
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

      // Record the bad OTP as a failed login so the lockout layer can see it.
      // Without this, OTP attempts would be invisible to checkAccountLockout.
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      })
      if (u) {
        await prisma.loginHistory.create({
          data: {
            userId,
            email: u.email,
            ipAddress,
            userAgent: request.headers.get("user-agent") || "unknown",
            status: "Failed",
            reason: `Invalid OTP (${type})`,
          },
        }).catch(() => null)
      }

      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 })
    }

    // OTP accepted — clear the per-IP fail counter for this endpoint.
    clearIpFailures(ipAddress, "verify-otp")

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
      // For LOGIN: do NOT change email_verified or status
      // Just create session
    }

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

    // Set HMAC-signed auth-meta cookie for middleware route permission checks.
    // Include selectedModules so the middleware's module-gate (step 4c) works
    // for users who land here via the OTP flow instead of password login.
    const userWithRoles = await prisma.user.findUnique({
      where: { id: userId },
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
    const selectedModules: string[] = Array.isArray(userWithRoles?.organization?.selectedModules)
      ? (userWithRoles!.organization!.selectedModules as string[])
      : []

    const { deniedRoutes, allowedRoutes, allowedModuleIds } = isAdmin
      ? { deniedRoutes: [], allowedRoutes: [], allowedModuleIds: [] }
      : await computeRouteMeta(userId, userWithRoles?.organizationId ?? null, roleIds)

    const signedMeta = await signAuthMeta({
      v: 2,
      ts: Date.now(),
      isAdmin,
      roleNames,
      deniedRoutes,
      allowedRoutes,
      allowedModuleIds,
      selectedModules,
    })
    response.cookies.set("auth-meta", signedMeta, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    })

    console.log(
      `[verify-otp] auth-meta set for user=${userId} isAdmin=${isAdmin} roles=[${roleNames}] allowedModules=${allowedModuleIds.length} denied=[${deniedRoutes}]`
    )

    return response
  } catch (error: any) {
    console.error("OTP verification error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}