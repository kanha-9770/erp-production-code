export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { InventoryHandlers } from "@/lib/api-handlers/inventory-system";

// GET /api/inventory-system/load → full snapshot (masters + items by submodule)
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const data = await InventoryHandlers.load(auth.ctx);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[inventory-system/load]", e);
    return fail(e?.message || "Failed to load inventory");
  }
}
