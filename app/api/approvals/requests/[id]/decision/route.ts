export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { ApprovalHandlers } from "@/lib/api-handlers/approval-handlers";

// POST /api/approvals/requests/[id]/decision  body { decision: "APPROVE"|"REJECT", comment? }
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const body = await request.json();
    const decision = body?.decision === "REJECT" ? "REJECT" : body?.decision === "APPROVE" ? "APPROVE" : null;
    if (!decision) return fail("decision must be APPROVE or REJECT", 400);
    const data = await ApprovalHandlers.decide(auth.ctx, id, decision, body?.comment);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals decision POST]", e);
    const msg = e?.message || "Failed to record decision";
    const status = e?.forbidden ? 403 : e?.conflict ? 409 : /not found/i.test(msg) ? 404 : 500;
    return fail(msg, status);
  }
}
