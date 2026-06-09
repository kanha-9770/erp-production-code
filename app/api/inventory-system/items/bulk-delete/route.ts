export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { InventoryHandlers } from "@/lib/api-handlers/inventory-system";

// POST /api/inventory-system/items/bulk-delete → body { ids: string[] }
// Deletes all given items in a single org-scoped statement (one round-trip).
export async function POST(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids)) return fail("ids[] is required", 400);
    const res = await InventoryHandlers.bulkDelete(auth.ctx, ids);
    return NextResponse.json({ success: true, data: res });
  } catch (e: any) {
    console.error("[inventory-system/items bulk-delete]", e);
    return fail(e?.message || "Failed to delete items", e?.forbidden ? 403 : 500);
  }
}
