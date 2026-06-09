export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { InventoryHandlers } from "@/lib/api-handlers/inventory-system";

// PUT /api/inventory-system/movements/[id] → edit a movement; body { patch }
// (re-balances the linked item's stock: reverse old effect, apply new)
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const { patch } = await request.json();
    const result = await InventoryHandlers.updateMovement(auth.ctx, id, patch ?? {});
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    console.error("[inventory-system/movements PUT]", e);
    const status = e?.forbidden ? 403 : /not found/i.test(e?.message || "") ? 404 : /invalid/i.test(e?.message || "") ? 400 : 500;
    return fail(e?.message || "Failed to update movement", status);
  }
}

// DELETE /api/inventory-system/movements/[id] → delete + reverse its stock effect
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const result = await InventoryHandlers.deleteMovement(auth.ctx, id);
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    console.error("[inventory-system/movements DELETE]", e);
    return fail(e?.message || "Failed to delete movement", e?.forbidden ? 403 : 500);
  }
}
