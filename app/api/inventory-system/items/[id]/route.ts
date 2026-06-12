export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { InventoryHandlers } from "@/lib/api-handlers/inventory-system";

// GET /api/inventory-system/items/[id] → the FULL record (incl. image/description)
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const rec = await InventoryHandlers.getItem(auth.ctx, id);
    if (!rec) return fail("Item not found", 404);
    return NextResponse.json({ success: true, data: rec });
  } catch (e: any) {
    console.error("[inventory-system/items GET by id]", e);
    return fail(e?.message || "Failed to load item");
  }
}

// PUT /api/inventory-system/items/[id] → patch one item; body { submodule, patch }
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const { submodule, patch } = await request.json();
    const rec = await InventoryHandlers.updateItem(auth.ctx, id, submodule, patch ?? {});
    return NextResponse.json({ success: true, data: rec });
  } catch (e: any) {
    console.error("[inventory-system/items PUT]", e);
    const status = e?.forbidden ? 403 : /not found/i.test(e?.message || "") ? 404 : /invalid/i.test(e?.message || "") ? 400 : 500;
    return fail(e?.message || "Failed to update item", status);
  }
}

// DELETE /api/inventory-system/items/[id]
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    await InventoryHandlers.deleteItem(auth.ctx, id);
    return NextResponse.json({ success: true, deleted: true });
  } catch (e: any) {
    console.error("[inventory-system/items DELETE]", e);
    return fail(e?.message || "Failed to delete item", e?.forbidden ? 403 : 500);
  }
}
