export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { ApprovalHandlers } from "@/lib/api-handlers/approval-handlers";

function moduleOf(request: NextRequest, body?: any): string {
  return body?.module ?? request.nextUrl.searchParams.get("module") ?? "inventory";
}

// GET /api/approvals/processes/[id]?module= → one process (admin)
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const data = await ApprovalHandlers.getProcess(auth.ctx, moduleOf(request), id);
    if (!data) return fail("Approval process not found", 404);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals/processes GET by id]", e);
    return fail(e?.message || "Failed to load approval process", e?.forbidden ? 403 : 500);
  }
}

// PUT /api/approvals/processes/[id]  body { module, ... } → update (admin)
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const body = await request.json();
    const data = await ApprovalHandlers.updateProcess(auth.ctx, moduleOf(request, body), id, body ?? {});
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals/processes PUT]", e);
    const msg = e?.message || "Failed to update approval process";
    const status = e?.forbidden ? 403 : /not found/i.test(msg) ? 404 : /required|at least|invalid/i.test(msg) ? 400 : 500;
    return fail(msg, status);
  }
}

// PATCH /api/approvals/processes/[id]  body { module, isActive } → toggle (admin)
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const body = await request.json();
    const data = await ApprovalHandlers.setProcessActive(auth.ctx, moduleOf(request, body), id, !!body?.isActive);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[approvals/processes PATCH]", e);
    const msg = e?.message || "Failed to update approval process";
    return fail(msg, e?.forbidden ? 403 : /not found/i.test(msg) ? 404 : 500);
  }
}

// DELETE /api/approvals/processes/[id]?module= (admin)
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    await ApprovalHandlers.deleteProcess(auth.ctx, moduleOf(request), id);
    return NextResponse.json({ success: true, deleted: true });
  } catch (e: any) {
    console.error("[approvals/processes DELETE]", e);
    return fail(e?.message || "Failed to delete approval process", e?.forbidden ? 403 : 500);
  }
}
