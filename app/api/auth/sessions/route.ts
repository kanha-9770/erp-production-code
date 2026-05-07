/**
 * GET    /api/auth/sessions          — list current user's active sessions
 * DELETE /api/auth/sessions          — revoke ALL other sessions (keeps current)
 *
 * UI consumes this on the security page so a user can see every device that's
 * signed in and force-out anything they don't recognise. Returning ipAddress
 * and userAgent is enough for a humanly readable "device" string; we don't
 * yet do geoip but the API leaves room for it later.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getRequestMeta, logAudit } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

function err(status: number, message: string) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err(401, "Not authenticated");

  const currentToken = request.cookies.get("auth-token")?.value ?? null;

  const rows = await prisma.userSession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
    },
    take: 50,
  });

  const sessions = rows.map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    isCurrent: !!currentToken && s.token === currentToken,
  }));

  return NextResponse.json({ success: true, sessions }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err(401, "Not authenticated");

  const currentToken = request.cookies.get("auth-token")?.value;
  if (!currentToken) return err(400, "No active session token");

  const { ipAddress, userAgent } = getRequestMeta(request);

  const result = await prisma.userSession.deleteMany({
    where: { userId: user.id, NOT: { token: currentToken } },
  });

  await logAudit({
    userId: user.id,
    organizationId: user.organizationId ?? null,
    performedBy: user.email,
    action: "Sessions Revoked",
    module: "Authentication",
    details: `Revoked ${result.count} other session(s)`,
    ipAddress,
    userAgent,
  });

  return NextResponse.json(
    { success: true, revoked: result.count },
    { headers: NO_STORE },
  );
}
