/**
 * DELETE /api/auth/sessions/:id — revoke a single session by id.
 *
 * Only the session owner can revoke. Revoking the current session also
 * clears the auth cookies (treated as a self-logout).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getRequestMeta, logAudit } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

function err(status: number, message: string) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err(401, "Not authenticated");

  const target = await prisma.userSession.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, token: true },
  });
  if (!target || target.userId !== user.id) return err(404, "Session not found");

  await prisma.userSession.delete({ where: { id: target.id } });

  const { ipAddress, userAgent } = getRequestMeta(request);
  await logAudit({
    userId: user.id,
    organizationId: user.organizationId ?? null,
    performedBy: user.email,
    action: "Session Revoked",
    module: "Authentication",
    details: `Revoked session ${target.id}`,
    ipAddress,
    userAgent,
  });

  const currentToken = request.cookies.get("auth-token")?.value;
  const isSelf = !!currentToken && currentToken === target.token;

  const response = NextResponse.json(
    { success: true, isSelf },
    { headers: NO_STORE },
  );

  // Self-revoke = sign-out. Clear auth cookies so the next request 401s cleanly.
  if (isSelf) {
    response.cookies.set("auth-token", "", { path: "/", maxAge: 0 });
    response.cookies.set("auth-meta", "", { path: "/", maxAge: 0 });
  }

  return response;
}
