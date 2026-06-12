export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { ApprovalHandlers } from "@/lib/api-handlers/approval-handlers";

// GET /api/approvals/requests/[id] → request + stages + timeline + record snapshot + capabilities
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const data = await ApprovalHandlers.getRequest(auth.ctx, id);
    if (!data) return fail("Approval request not found", 404);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals/requests GET by id]", e);
    return fail(e?.message || "Failed to load approval request");
  }
}
