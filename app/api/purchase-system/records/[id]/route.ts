export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";

// PUT /api/purchase-system/records/[id] → patch one record; body { submodule, patch }
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const { submodule, patch } = await request.json();
    const rec = await PurchaseHandlers.updateRecord(auth.ctx, id, submodule, patch ?? {});
    return NextResponse.json({ success: true, data: rec });
  } catch (e: any) {
    console.error("[purchase-system/records PUT]", e);
    const status = e?.forbidden ? 403 : /not found/i.test(e?.message || "") ? 404 : /invalid/i.test(e?.message || "") ? 400 : 500;
    return fail(e?.message || "Failed to update record", status);
  }
}

// DELETE /api/purchase-system/records/[id]
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    await PurchaseHandlers.deleteRecord(auth.ctx, id);
    return NextResponse.json({ success: true, deleted: true });
  } catch (e: any) {
    console.error("[purchase-system/records DELETE]", e);
    return fail(e?.message || "Failed to delete record", e?.forbidden ? 403 : 500);
  }
}
