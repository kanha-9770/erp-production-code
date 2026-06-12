export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { ApprovalHandlers } from "@/lib/api-handlers/approval-handlers";

// GET /api/approvals/processes?module=inventory|purchase → list (admin)
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const module = request.nextUrl.searchParams.get("module") ?? "inventory";
    const data = await ApprovalHandlers.listProcesses(auth.ctx, module);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals/processes GET]", e);
    return fail(e?.message || "Failed to load approval processes", e?.forbidden ? 403 : 500);
  }
}

// POST /api/approvals/processes  body { module, ...process } → create (admin)
export async function POST(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const body = await request.json();
    const module = body?.module ?? "inventory";
    const data = await ApprovalHandlers.createProcess(auth.ctx, module, body ?? {});
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e: any) {
    console.error("[approvals/processes POST]", e);
    const msg = e?.message || "Failed to create approval process";
    return fail(msg, e?.forbidden ? 403 : /required|at least|invalid|unknown/i.test(msg) ? 400 : 500);
  }
}
