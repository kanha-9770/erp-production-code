/**
 * Verify ENGINE-ONLY purchase approvals against the REAL handler.
 *
 * With setup.approvals.engineOnly = true, the legacy named-permission field gate
 * is OFF for the payment approval status: a user with NO approval permission can
 * set a Payment's status when no approval-process is configured (so the approval
 * pages are the sole control). EXCEPTIONS that stay gated regardless: GRN stock-
 * posting, the PR's approval (Production Approval / Item Location Kept) and the
 * PO's approval (Approval field), each reserved to its designated approver.
 * Toggling engineOnly off restores the payment gate too.
 *
 * Creates throwaway records + a no-permission user, exercises updateRecord, and
 * cleans up. Leaves the org with engineOnly = true.
 *
 *   npx tsx scripts/verify-engine-only-approvals.ts --org "Nessco Groupo"
 */
import { prisma } from "@/lib/prisma";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";
import { approvalsEngineOnly } from "@/lib/permissions/purchase-permissions";

const TAG = `engonly-${Date.now()}`;
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `  — ${extra}`}`); };

async function setEngineOnly(orgId: string, on: boolean) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { setup: true } });
  const setup = ((org?.setup ?? {}) as Record<string, unknown>);
  setup.approvals = { ...((setup.approvals as Record<string, unknown>) ?? {}), engineOnly: on, purchaseHierarchyScoped: false };
  await prisma.organization.update({ where: { id: orgId }, data: { setup: setup as any } });
}

async function main() {
  const i = process.argv.indexOf("--org");
  const orgName = i >= 0 ? process.argv[i + 1] : "Nessco Groupo";
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) throw new Error(`Org "${orgName}" not found`);
  console.log(`\n=== ${org.name} — engine-only approvals ===\n`);

  await setEngineOnly(org.id, true);
  check("Org flag engineOnly is ON", await approvalsEngineOnly(org.id));

  const activeProc = await prisma.approvalProcess.count({ where: { organizationId: org.id, module: "purchase", submodule: { in: ["pr", "po", "payment"] }, isActive: true } });
  check("No active PR/PO/payment process (so nothing parks the edit)", activeProc === 0, `found ${activeProc}`);

  const created: string[] = [];
  let userId = "";
  try {
    const u = await prisma.user.create({ data: { email: `${TAG}@example.invalid`, organizationId: org.id, first_name: "NoPerms" } });
    userId = u.id;
    const ctx = { organizationId: org.id, userId };

    // ENGINE-ONLY: a no-permission user CAN set a Payment's approval status
    // directly (the approval-process engine is the sole control; no process ⇒ open).
    const pay = await prisma.purchaseRecord.create({
      data: { organizationId: org.id, submodule: "payment", status: "REQUESTED", createdById: u.id,
        data: { docNo: `${TAG}-PAY`, status: "REQUESTED" } },
    });
    created.push(pay.id);
    try {
      const res: any = await PurchaseHandlers.updateRecord(ctx, pay.id, "payment", { status: "APPROVED" });
      check("No-permission user CAN set payment status (engine-only, no process)", res?.status === "APPROVED", `got ${JSON.stringify(res?.status)}`);
    } catch (e: any) {
      check("No-permission user CAN set payment status (engine-only, no process)", false, `${e?.name}: ${e?.message}`);
    }

    // PO approval is ALWAYS gated, even under engine-only: the Approval field is
    // reserved to the designated approver (APPROVE_PURCHASE_ORDER).
    const po = await prisma.purchaseRecord.create({
      data: { organizationId: org.id, submodule: "po", status: "DRAFT", createdById: u.id,
        data: { docNo: `${TAG}-PO`, status: "DRAFT", approvalStatus: "PENDING" } },
    });
    created.push(po.id);
    try {
      await PurchaseHandlers.updateRecord(ctx, po.id, "po", { approvalStatus: "APPROVED" });
      check("No-permission user is BLOCKED from PO approvalStatus (always gated)", false, "was allowed");
    } catch (e: any) {
      check("No-permission user is BLOCKED from PO approvalStatus (always gated)", e?.forbidden === true, `${e?.name}: ${e?.message}`);
    }

    // PR approval is ALWAYS gated (like GRN stock-posting), even under engine-only:
    // Production Approval and Item Location Kept are reserved to the production
    // head/manager (APPROVE_PURCHASE_REQUISITION).
    const pr = await prisma.purchaseRecord.create({
      data: { organizationId: org.id, submodule: "pr", status: "SUBMITTED", createdById: u.id,
        data: { docNo: `${TAG}-PR`, status: "SUBMITTED", productionApproval: "PENDING" } },
    });
    created.push(pr.id);
    try {
      await PurchaseHandlers.updateRecord(ctx, pr.id, "pr", { productionApproval: "APPROVED" });
      check("No-permission user is BLOCKED from PR productionApproval (always gated)", false, "was allowed");
    } catch (e: any) {
      check("No-permission user is BLOCKED from PR productionApproval (always gated)", e?.forbidden === true, `${e?.name}: ${e?.message}`);
    }
    try {
      await PurchaseHandlers.updateRecord(ctx, pr.id, "pr", { itemLocationKept: "Rack 5" });
      check("No-permission user is BLOCKED from PR itemLocationKept (always gated)", false, "was allowed");
    } catch (e: any) {
      check("No-permission user is BLOCKED from PR itemLocationKept (always gated)", e?.forbidden === true, `${e?.name}: ${e?.message}`);
    }

    // GRN stock-posting stays gated even under engine-only.
    const grn = await prisma.purchaseRecord.create({
      data: { organizationId: org.id, submodule: "grn", status: "RECEIVED", createdById: u.id,
        data: { docNo: `${TAG}-GRN`, status: "RECEIVED", stockUpdated: "NO" } },
    });
    created.push(grn.id);
    try {
      await PurchaseHandlers.updateRecord(ctx, grn.id, "grn", { stockUpdated: "YES" });
      check("GRN stock-posting still blocked for no-permission user", false, "was allowed");
    } catch (e: any) {
      check("GRN stock-posting still blocked for no-permission user", e?.forbidden === true, `${e?.name}: ${e?.message}`);
    }

    // LEGACY mode: flip engineOnly off → the payment gate returns too.
    await setEngineOnly(org.id, false);
    const pay2 = await prisma.purchaseRecord.create({
      data: { organizationId: org.id, submodule: "payment", status: "REQUESTED", createdById: u.id,
        data: { docNo: `${TAG}-PAY2`, status: "REQUESTED" } },
    });
    created.push(pay2.id);
    try {
      await PurchaseHandlers.updateRecord(ctx, pay2.id, "payment", { status: "APPROVED" });
      check("Legacy mode: no-permission user is BLOCKED on payment again", false, "was allowed");
    } catch (e: any) {
      check("Legacy mode: no-permission user is BLOCKED on payment again", e?.forbidden === true, `${e?.name}: ${e?.message}`);
    }
  } finally {
    if (created.length) await prisma.purchaseRecord.deleteMany({ where: { id: { in: created } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await setEngineOnly(org.id, true); // leave engine-only ON
    console.log("\n  (temp data cleaned up; org left in engine-only mode)");
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
