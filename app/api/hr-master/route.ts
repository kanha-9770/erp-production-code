export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { HrMasterHandlers } from "@/lib/api-handlers/hr-master";

// GET /api/hr-master → this org's HR master registry (seeds on first load).
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const data = await HrMasterHandlers.loadMasters(auth.ctx);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[hr-master GET]", e);
    return fail(e?.message || "Failed to load HR masters");
  }
}

// PUT /api/hr-master → replace the whole HR master registry.
export async function PUT(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const body = await request.json();
    if (!Array.isArray(body?.masters)) return fail("masters[] is required", 400);
    const data = await HrMasterHandlers.saveMasters(auth.ctx, body.masters);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[hr-master PUT]", e);
    return fail(e?.message || "Failed to save HR masters");
  }
}
