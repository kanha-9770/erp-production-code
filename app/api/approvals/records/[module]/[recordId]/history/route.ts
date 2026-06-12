export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { ApprovalHandlers } from "@/lib/api-handlers/approval-handlers";

// GET /api/approvals/records/[module]/[recordId]/history → this record's approval history
export async function GET(request: NextRequest, props: { params: Promise<{ module: string; recordId: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { recordId } = await props.params;
    const data = await ApprovalHandlers.recordHistory(auth.ctx, recordId);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals record history GET]", e);
    return fail(e?.message || "Failed to load approval history");
  }
}
