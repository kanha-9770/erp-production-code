export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { getPurchasePermissions } from "@/lib/permissions/purchase-permissions";
import { getSectionAccess } from "@/lib/permissions/section-permissions";

// GET /api/purchase-system/permissions → the logged-in user's purchase capability
// flags + per-form-section edit access. Lightweight (batched permission checks, no
// record load) so the client can re-read capabilities after a grant change on the
// Approvals page without re-fetching every document. Resolved live — no caching.
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const [permissions, sectionAccess] = await Promise.all([
      getPurchasePermissions(auth.ctx.userId),
      getSectionAccess(auth.ctx.userId, auth.ctx.organizationId, "purchase"),
    ]);
    return NextResponse.json({ success: true, data: { permissions, sectionAccess } });
  } catch (e: any) {
    console.error("[purchase-system/permissions]", e);
    return fail(e?.message || "Failed to load permissions");
  }
}
