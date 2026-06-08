export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";

// GET /api/purchase-system/load → full snapshot (masters + records by submodule)
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const data = await PurchaseHandlers.load(auth.ctx);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[purchase-system/load]", e);
    return fail(e?.message || "Failed to load purchase data");
  }
}
