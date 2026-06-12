export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { getSectionAccess } from "@/lib/permissions/section-permissions";

// GET /api/inventory-system/permissions → the logged-in user's per-form-section
// edit access. Lightweight (batched permission checks, no record load) so the
// provider can fetch it at mount — and re-fetch after a grant change on the
// Approvals page — without pulling any inventory records. Resolved live.
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const sectionAccess = await getSectionAccess(
      auth.ctx.userId,
      auth.ctx.organizationId,
      "inventory",
    );
    return NextResponse.json({ success: true, data: { sectionAccess } });
  } catch (e: any) {
    console.error("[inventory-system/permissions]", e);
    return fail(e?.message || "Failed to load permissions");
  }
}
