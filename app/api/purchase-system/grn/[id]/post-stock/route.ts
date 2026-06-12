export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";

// POST /api/purchase-system/grn/[id]/post-stock
// Posts a received GRN's quantities into Store Inventory (increment-or-create).
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const result = await PurchaseHandlers.postStock(auth.ctx, id);
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    console.error("[purchase-system/grn post-stock]", e);
    const status = e?.status ?? (e?.forbidden ? 403 : /not found/i.test(e?.message || "") ? 404 : /no received|invalid/i.test(e?.message || "") ? 400 : 500);
    return fail(e?.message || "Failed to post stock", status);
  }
}
