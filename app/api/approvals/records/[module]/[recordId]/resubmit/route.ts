export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { ApprovalHandlers } from "@/lib/api-handlers/approval-handlers";

// POST /api/approvals/records/[module]/[recordId]/resubmit
//   Re-submit a rejected/recalled record for approval (re-runs matching).
export async function POST(request: NextRequest, props: { params: Promise<{ module: string; recordId: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { module, recordId } = await props.params;
    const data = await ApprovalHandlers.resubmit(auth.ctx, module, recordId);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals record resubmit POST]", e);
    const msg = e?.message || "Failed to resubmit for approval";
    const status = e?.forbidden ? 403 : e?.conflict ? 409 : /not found/i.test(msg) ? 404 : /cannot/i.test(msg) ? 400 : 500;
    return fail(msg, status);
  }
}
