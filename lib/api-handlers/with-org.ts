/**
 * Shared auth/org guard for the inventory-system & purchase-system routes.
 * Returns the org-scoped context or a ready-to-return error response.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export type OrgCtx = { organizationId: string; userId: string };

export async function getOrgCtx(
  request: NextRequest,
): Promise<{ ok: true; ctx: OrgCtx } | { ok: false; res: NextResponse }> {
  const u = await getAuthenticatedUser(request);
  if (!u) {
    return { ok: false, res: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  if (!u.organizationId) {
    return { ok: false, res: NextResponse.json({ success: false, error: "User is not associated with any organization" }, { status: 403 }) };
  }
  return { ok: true, ctx: { organizationId: u.organizationId, userId: u.id } };
}

export function fail(error: string, status = 500): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}
