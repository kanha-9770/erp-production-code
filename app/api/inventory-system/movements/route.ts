export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { InventoryHandlers } from "@/lib/api-handlers/inventory-system";

// GET /api/inventory-system/movements → every goods movement for the org
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const data = await InventoryHandlers.listMovements(auth.ctx);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[inventory-system/movements GET]", e);
    return fail(e?.message || "Failed to list movements");
  }
}

// POST /api/inventory-system/movements → post a movement; body { data }
// (server mints the IN-/OUT- code and adjusts the linked item's stock)
export async function POST(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { data } = await request.json();
    const result = await InventoryHandlers.createMovement(auth.ctx, data ?? {});
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (e: any) {
    console.error("[inventory-system/movements POST]", e);
    return fail(e?.message || "Failed to post movement", e?.forbidden ? 403 : /not found|invalid/i.test(e?.message || "") ? 400 : 500);
  }
}
