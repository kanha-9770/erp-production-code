export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";

// POST /api/purchase-system/reset → wipe this org's purchase data + reseed
export async function POST(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const data = await PurchaseHandlers.reset(auth.ctx);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[purchase-system/reset]", e);
    return fail(e?.message || "Failed to reset purchase data");
  }
}
