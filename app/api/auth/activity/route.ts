/**
 * GET /api/auth/activity — recent login activity for the current user.
 *   Query: ?limit=50 (default 50, max 200)
 *
 * Reads from LoginHistory which is already populated on every auth attempt.
 * Returns both successes and failures so users can spot brute-force attempts
 * against their own account.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

function err(status: number, message: string) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err(401, "Not authenticated");

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);

  const rows = await prisma.loginHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      reason: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
  });

  const events = rows.map((r) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ success: true, events }, { headers: NO_STORE });
}
