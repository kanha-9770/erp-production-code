export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";
import type { GateEntryAdvanceAction } from "@/lib/purchase-system/gate-entry-workflow";

const ACTIONS: GateEntryAdvanceAction[] = ["COMPLETE", "REJECT", "SEND_BACK"];

// POST /api/purchase-system/gate-entry/[id]/advance-stage
// Moves a gate entry through its receiving workflow (Complete & forward / Reject
// / Send back). Body: { action, toStage?, note? }.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { id } = await props.params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action as GateEntryAdvanceAction;
    if (!ACTIONS.includes(action)) return fail("Invalid workflow action.", 400);
    const result = await PurchaseHandlers.advanceStage(auth.ctx, id, action, {
      toStage: typeof body?.toStage === "string" ? body.toStage : undefined,
      note: typeof body?.note === "string" ? body.note : undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    console.error("[purchase-system/gate-entry advance-stage]", e);
    const status =
      e?.status ?? (e?.forbidden ? 403 : /not found/i.test(e?.message || "") ? 404 : 500);
    return fail(e?.message || "Failed to advance the gate-entry stage", status);
  }
}
