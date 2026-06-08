export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";

// PUT /api/purchase-system/masters → replace the whole master registry
export async function PUT(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const body = await request.json();
    if (!Array.isArray(body?.masters)) return fail("masters[] is required", 400);
    const data = await PurchaseHandlers.saveMasters(auth.ctx, body.masters);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[purchase-system/masters]", e);
    return fail(e?.message || "Failed to save masters");
  }
}
