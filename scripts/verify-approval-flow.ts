/**
 * End-to-end smoke test for the approval engine (PURCHASE module), run against
 * the real DB via the actual handlers. Creates clearly-named test data and
 * deletes it at the end. Read-only to your real records.
 *
 *   npx tsx scripts/verify-approval-flow.ts --org "Your Org"
 */

import { prisma } from "@/lib/prisma";
import { ApprovalHandlers } from "@/lib/api-handlers/approval-handlers";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let pass = 0;
let fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
}

async function resolveAdminCtx() {
  const orgId = arg("--orgId");
  const orgName = arg("--org");
  const org = orgId
    ? await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, ownerId: true } })
    : orgName
      ? await prisma.organization.findFirst({ where: { name: orgName }, select: { id: true, name: true, ownerId: true } })
      : await prisma.organization.findFirst({ select: { id: true, name: true, ownerId: true } });
  if (!org) throw new Error("No organization found (pass --org or --orgId).");

  let userId = org.ownerId ?? null;
  if (!userId) {
    const ua = await prisma.userUnitAssignment.findFirst({
      where: {
        user: { organizationId: org.id },
        OR: [{ role: { isAdmin: true } }, { role: { name: { contains: "admin", mode: "insensitive" } } }],
      },
      select: { userId: true },
    });
    userId = ua?.userId ?? null;
  }
  if (!userId) {
    const anyUser = await prisma.user.findFirst({ where: { organizationId: org.id }, select: { id: true } });
    userId = anyUser?.id ?? null;
  }
  if (!userId) throw new Error(`No usable user found in org "${org.name}".`);
  return { ctx: { organizationId: org.id, userId }, org };
}

async function getPo(id: string) {
  const row = await prisma.purchaseRecord.findUnique({ where: { id }, select: { status: true, data: true } });
  const data = (row?.data as any) ?? {};
  return { statusCol: row?.status ?? null, data, approval: data._approval as any };
}

async function main() {
  console.log("=".repeat(64));
  console.log("  Approval engine — end-to-end smoke test (PURCHASE)");
  console.log("=".repeat(64));
  const { ctx, org } = await resolveAdminCtx();
  console.log(`Org: ${org.name} (${org.id})  ·  actor userId: ${ctx.userId}\n`);

  const created: { records: string[]; processes: string[] } = { records: [], processes: [] };

  try {
    // ── Test 1: CREATE process, 2-stage approval lifecycle ──
    console.log("Test 1 — CREATE trigger, 2 stages, onApprove setStatus");
    const p1 = await ApprovalHandlers.createProcess(ctx, "purchase", {
      name: "ZZZ Smoketest CREATE",
      submodule: "po",
      trigger: "BOTH",
      criteria: { matchMode: "ALL", rules: [{ field: "remarks", op: "equals", value: "SMK1" }] },
      scope: { type: "record" },
      stages: [
        { name: "S1", mode: "ANY", approverUserIds: [ctx.userId], approverRoleIds: [] },
        { name: "S2", mode: "ANY", approverUserIds: [ctx.userId], approverRoleIds: [] },
      ],
      onApprove: { setStatus: "APPROVED" },
      adminUserIds: [ctx.userId],
    });
    created.processes.push(p1.id);

    const a = await PurchaseHandlers.createRecord(ctx, "po", {
      remarks: "SMK1",
      itemName: "Smoke Item A",
      rate: 10,
      amount: 10,
      status: "DRAFT",
    });
    created.records.push(a.id as string);
    check((a as any)._approval?.status === "PENDING", "matching PO create → held PENDING");
    const reqId = (a as any)._approval?.requestId as string;

    const inbox = await ApprovalHandlers.listInbox(ctx);
    check(inbox.some((r) => r.id === reqId), "request appears in approver inbox");

    const afterS1 = await ApprovalHandlers.decide(ctx, reqId, "APPROVE");
    check(afterS1.status === "PENDING" && afterS1.currentStage === 1, "approve stage 1 → advances to stage 2");

    const afterS2 = await ApprovalHandlers.decide(ctx, reqId, "APPROVE");
    check(afterS2.status === "APPROVED", "approve stage 2 → request APPROVED");

    const aFinal = await getPo(a.id as string);
    check(aFinal.approval?.status === "APPROVED", "record _approval = APPROVED");
    check(aFinal.data.status === "APPROVED" && aFinal.statusCol === "APPROVED", "onApprove setStatus applied (status=APPROVED)");

    // ── Test 2: EDIT scope (section) ──
    console.log("\nTest 2 — EDIT trigger scoped to section 'Line'");
    const p2 = await ApprovalHandlers.createProcess(ctx, "purchase", {
      name: "ZZZ Smoketest EDIT-SCOPE",
      submodule: "po",
      trigger: "EDIT",
      criteria: { matchMode: "ALL", rules: [{ field: "remarks", op: "equals", value: "SMK2" }] },
      scope: { type: "section", sections: ["Line"] },
      stages: [{ name: "S1", mode: "ANY", approverUserIds: [ctx.userId], approverRoleIds: [] }],
      onApprove: { setStatus: "APPROVED" },
      adminUserIds: [ctx.userId],
    });
    created.processes.push(p2.id);

    const b = await PurchaseHandlers.createRecord(ctx, "po", {
      remarks: "SMK2",
      itemName: "Smoke Item B",
      rate: 5,
      amount: 5,
      status: "DRAFT",
    });
    created.records.push(b.id as string);
    check(!(b as any)._approval, "create does NOT fire the EDIT process");

    // Edit a field OUTSIDE the scoped section → applies directly (no approval).
    const bEditOutside = await PurchaseHandlers.updateRecord(ctx, b.id as string, "po", { rfqRef: "ORD-X" });
    check(
      (bEditOutside as any)._approval?.status !== "PENDING" && (bEditOutside as any).rfqRef === "ORD-X",
      "edit outside scope (Order field) applies directly",
    );

    // Edit a field INSIDE the scoped section → parked for approval.
    const bEditInside = await PurchaseHandlers.updateRecord(ctx, b.id as string, "po", { rate: 999 });
    check((bEditInside as any)._approval?.status === "PENDING", "edit inside scope (Line field) → held PENDING");
    check(Number((bEditInside as any).rate) === 5, "pending edit is PARKED (record still shows old value 5)");

    // ── Test 3: recall ──
    console.log("\nTest 3 — recall a pending request");
    const bReqId = (bEditInside as any)._approval?.requestId as string;
    const recalled = await ApprovalHandlers.recall(ctx, bReqId);
    check(recalled.status === "RECALLED", "recall → request RECALLED");
    const bAfter = await getPo(b.id as string);
    check(bAfter.approval?.status === "RECALLED" && bAfter.statusCol !== "PENDING_APPROVAL", "record unlocked after recall");
  } finally {
    // ── Cleanup ──
    console.log("\nCleanup…");
    for (const id of created.records) {
      try {
        await PurchaseHandlers.deleteRecord(ctx, id);
      } catch (e: any) {
        console.warn(`  ⚠ could not delete record ${id}: ${e?.message}`);
      }
    }
    for (const id of created.processes) {
      try {
        await ApprovalHandlers.deleteProcess(ctx, "purchase", id);
      } catch (e: any) {
        console.warn(`  ⚠ could not delete process ${id}: ${e?.message}`);
      }
    }
    console.log("  cleaned up test data.");
  }

  console.log("\n" + "=".repeat(64));
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  console.log("=".repeat(64));
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\n✗ Smoke test crashed:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
