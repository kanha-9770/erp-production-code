export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { InventoryHandlers } from "@/lib/api-handlers/inventory-system";

// POST /api/inventory-system/reset → wipe this org's inventory data + reseed
export async function POST(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const data = await InventoryHandlers.reset(auth.ctx);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[inventory-system/reset]", e);
    return fail(e?.message || "Failed to reset inventory");
  }
}
