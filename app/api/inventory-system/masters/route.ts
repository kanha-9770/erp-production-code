export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { InventoryHandlers } from "@/lib/api-handlers/inventory-system";

// GET /api/inventory-system/masters → just the master registry (cheap mount load)
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const data = await InventoryHandlers.loadMasters(auth.ctx);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[inventory-system/masters GET]", e);
    return fail(e?.message || "Failed to load masters");
  }
}

// PUT /api/inventory-system/masters → replace the whole master registry
export async function PUT(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const body = await request.json();
    if (!Array.isArray(body?.masters)) return fail("masters[] is required", 400);
    const data = await InventoryHandlers.saveMasters(auth.ctx, body.masters);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[inventory-system/masters]", e);
    return fail(e?.message || "Failed to save masters");
  }
}
