export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { ApprovalHandlers } from "@/lib/api-handlers/approval-handlers";

// GET /api/approvals/inbox → every request awaiting MY action, across all modules.
// Data-gated by eligibility (no named permission); applyDecision re-checks.
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const data = await ApprovalHandlers.listInbox(auth.ctx);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals/inbox GET]", e);
    return fail(e?.message || "Failed to load approval inbox");
  }
}
