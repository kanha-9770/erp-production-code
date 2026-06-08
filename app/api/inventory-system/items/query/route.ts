export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { InventoryHandlers, type ListItemsQuery } from "@/lib/api-handlers/inventory-system";

/**
 * POST /api/inventory-system/items/query
 *
 * Two cross-page selection helpers (server-side, so they span every page):
 *   { op: "ids",   query }       → string[]          (all matching ids — "Select all N")
 *   { op: "byIds", ids: [...] }  → InventoryItem[]   (lean records for export)
 */
export async function POST(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const body = await request.json();
    if (body?.op === "ids") {
      const data = await InventoryHandlers.listItemIds(auth.ctx, body.query as ListItemsQuery);
      return NextResponse.json({ success: true, data });
    }
    if (body?.op === "byIds") {
      if (!Array.isArray(body.ids)) return fail("ids[] is required", 400);
      const data = await InventoryHandlers.getItemsByIds(auth.ctx, body.ids);
      return NextResponse.json({ success: true, data });
    }
    return fail("Unknown op", 400);
  } catch (e: any) {
    console.error("[inventory-system/items/query]", e);
    return fail(e?.message || "Query failed", /invalid/i.test(e?.message || "") ? 400 : 500);
  }
}
