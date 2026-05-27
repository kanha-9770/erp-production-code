// app/api/auth/change-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getRequestMeta, logAudit } from "@/lib/api-helpers";
import { invalidateAllSessionsForUser } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { assertStrongPassword } from "@/lib/auth/password-policy";
import { checkIpRate, rateLimitResponse } from "@/lib/auth/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { ipAddress, userAgent } = getRequestMeta(request);

    // Throttle even authenticated change-password — guards the case where a
    // session token leaks and an attacker tries password rotation.
    const ipGate = checkIpRate(ipAddress, "change-password");
    if (!ipGate.allowed) return rateLimitResponse(ipGate);

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Both current and new password are required" },
        { status: 400 }
      );
    }

    // Enforce the shared password policy (length + classes + not-common).
    try {
      assertStrongPassword(newPassword);
    } catch (e: any) {
      return NextResponse.json(
        { error: e.message, code: "WEAK_PASSWORD", details: e.errors },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must differ from the current one" },
        { status: 400 }
      );
    }

    // Fetch user with password
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { password: true, organizationId: true, email: true },
    });

    if (!user?.password) {
      return NextResponse.json(
        { error: "No password set for this account" },
        { status: 400 }
      );
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      // Log the failed verify so the lockout layer can see it across sessions.
      await prisma.loginHistory.create({
        data: {
          userId: authUser.id,
          email: user.email,
          ipAddress,
          userAgent,
          status: "Failed",
          reason: "Wrong current password (change-password)",
        },
      }).catch(() => null);

      await logAudit({
        userId: authUser.id,
        organizationId: user.organizationId,
        performedBy: user.email,
        action: "Change Password Failed",
        module: "Authentication",
        details: "Wrong current password supplied",
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: authUser.id },
      data: { password: hashedPassword },
    });

    // Optional: revoke other sessions when the password changes — a leaked
    // session can no longer be silently kept alive. We keep the current one.
    const currentToken = request.cookies.get("auth-token")?.value;
    if (currentToken) {
      // Invalidate Redis cache for ALL sessions of this user BEFORE the DB
      // delete, while the tokens are still readable. Cache entries for the
      // current token will be repopulated on the next request — cheap.
      await invalidateAllSessionsForUser(authUser.id).catch(() => null);
      await prisma.userSession.deleteMany({
        where: { userId: authUser.id, NOT: { token: currentToken } },
      }).catch(() => null);
    }

    await logAudit({
      userId: authUser.id,
      organizationId: user.organizationId,
      performedBy: user.email,
      action: "Password Changed",
      module: "Authentication",
      details: "Password rotated; other sessions revoked",
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
