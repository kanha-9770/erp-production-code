export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { ApprovalHandlers } from "@/lib/api-handlers/approval-handlers";

// GET /api/approvals/requests?module=&scope=mine|all&status=&submodule=&page=&pageSize=
//   → paginated request history (scope=all is admin-only; others see their own).
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const sp = request.nextUrl.searchParams;
    const data = await ApprovalHandlers.listRequests(auth.ctx, {
      module: sp.get("module") ?? undefined,
      scope: sp.get("scope") ?? "mine",
      status: sp.get("status") ?? undefined,
      submodule: sp.get("submodule") ?? undefined,
      page: parseInt(sp.get("page") ?? "0", 10) || 0,
      pageSize: parseInt(sp.get("pageSize") ?? "50", 10) || 50,
    });
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals/requests GET]", e);
    return fail(e?.message || "Failed to load approval requests");
  }
}
