export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";

// POST /api/purchase-system/records → create one record; body { submodule, data }
export async function POST(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { submodule, data } = await request.json();
    const rec = await PurchaseHandlers.createRecord(auth.ctx, submodule, data ?? {});
    return NextResponse.json({ success: true, data: rec }, { status: 201 });
  } catch (e: any) {
    console.error("[purchase-system/records POST]", e);
    return fail(e?.message || "Failed to create record", /not found|invalid/i.test(e?.message || "") ? 400 : 500);
  }
}
