/**
 * /api/auth/preferences — best-effort preferences endpoint.
 *
 * Today: a stub. Returns the (currently empty) saved blob and acknowledges
 * writes. The UI persists to localStorage; this endpoint exists so the
 * UI's network-write codepath is exercised end-to-end and future swap to
 * a DB-backed `User.preferences` JSON column is a single-line change in
 * the body of the handler.
 *
 * Whenever you're ready to make this stick, add a `preferences Json?`
 * column to the User model, run prisma migrate, and replace the in-memory
 * read/write below with `prisma.user.update({ data: { preferences: ... }})`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

function err(status: number, message: string) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err(401, "Not authenticated");

  // Future: read prisma.user.findUnique({ select: { preferences: true } }).
  return NextResponse.json(
    { success: true, preferences: {}, notifications: {} },
    { headers: NO_STORE },
  );
}

export async function PUT(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return err(401, "Not authenticated");

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return err(400, "Invalid JSON");
  }

  // Validate shape lightly — we don't want this to be a sink for arbitrary blobs.
  const allowedTopKeys = new Set(["preferences", "notifications"]);
  const filtered: Record<string, any> = {};
  for (const k of Object.keys(body)) {
    if (allowedTopKeys.has(k) && body[k] && typeof body[k] === "object") {
      filtered[k] = body[k];
    }
  }

  // Future: persist via Prisma. Today: just confirm receipt so the UI's
  // write path is wired and observable in DevTools / server logs.
  console.log("[/api/auth/preferences] PUT", user.id, Object.keys(filtered));

  return NextResponse.json({ success: true, ...filtered }, { headers: NO_STORE });
}
