/**
 * Verify purchase APPROVAL gating against the REAL handler (under engine-only).
 *
 * Every privileged purchase FIELD is reserved to its named permission even with
 * setup.approvals.engineOnly = true — engine-only no longer unlocks any approval
 * field (it only relaxes the role-hierarchy gate). A no-permission user is blocked
 * from: PR Production Approval + Item Location Kept, PO Approval, payment status
 * (Approved/Paid) and GRN stock-posting.
 *
 * The payment status SPLITS by target value:
 *   - Approve / Hold / Reject  → APPROVE_PAYMENT_REQUEST (admin / a given user)
 *   - mark PAID                → RAISE_PAYMENT_REQUEST   (the account manager)
 * so an approver-only user can Approve but not Pay, and a raise-only user (account
 * manager) can Pay an approved request but not Approve.
 *
 * Creates throwaway records + scoped users, exercises updateRecord, cleans up.
 * Leaves the org with engineOnly = true.
 *
 *   npx tsx scripts/verify-engine-only-approvals.ts --org "Nessco Groupo"
 */
import { prisma } from "@/lib/prisma";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";
import {
  approvalsEngineOnly,
  APPROVE_PAYMENT_REQUEST,
  RAISE_PAYMENT_REQUEST,
} from "@/lib/permissions/purchase-permissions";

const TAG = `engonly-${Date.now()}`;
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `  — ${extra}`}`); };

async function setEngineOnly(orgId: string, on: boolean) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { setup: true } });
  const setup = ((org?.setup ?? {}) as Record<string, unknown>);
  setup.approvals = { ...((setup.approvals as Record<string, unknown>) ?? {}), engineOnly: on, purchaseHierarchyScoped: false };
  await prisma.organization.update({ where: { id: orgId }, data: { setup: setup as any } });
}

/** Grant a named permission to a user via an override. False if the perm is absent. */
async function grantPerm(orgId: string, userId: string, name: string): Promise<boolean> {
  const perm = await prisma.permission.findFirst({ where: { organizationId: orgId, name }, select: { id: true } });
  if (!perm) return false;
  await prisma.userPermissionOverride.create({ data: { userId, permissionId: perm.id, granted: true, reason: "engine-only verification" } });
  return true;
}

async function main() {
  const i = process.argv.indexOf("--org");
  const orgName = i >= 0 ? process.argv[i + 1] : "Nessco Groupo";
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) throw new Error(`Org "${orgName}" not found`);
  console.log(`\n=== ${org.name} — purchase approval gating (engine-only) ===\n`);

  await setEngineOnly(org.id, true);
  check("Org flag engineOnly is ON", await approvalsEngineOnly(org.id));

  const activeProc = await prisma.approvalProcess.count({ where: { organizationId: org.id, module: "purchase", submodule: { in: ["pr", "po", "payment"] }, isActive: true } });
  check("No active PR/PO/payment process (so nothing parks the edit)", activeProc === 0, `found ${activeProc}`);

  const created: string[] = [];
  const users: string[] = [];
  const mkPayment = async (uid: string, status: string) => {
    const r = await prisma.purchaseRecord.create({
      data: { organizationId: org.id, submodule: "payment", status, createdById: uid,
        data: { docNo: `${TAG}-PAY-${status}-${created.length}`, status } },
    });
    created.push(r.id);
    return r.id;
  };
  try {
    const u = await prisma.user.create({ data: { email: `${TAG}@example.invalid`, organizationId: org.id, first_name: "NoPerms" } });
    users.push(u.id);
    const ctx = { organizationId: org.id, userId: u.id };

    // ── No-permission user is BLOCKED from every approval field ──────────────
    const payA = await mkPayment(u.id, "REQUESTED");
    try {
      await PurchaseHandlers.updateRecord(ctx, payA, "payment", { status: "APPROVED" });
      check("No-permission user is BLOCKED from approving a payment", false, "was allowed");
    } catch (e: any) {
      check("No-permission user is BLOCKED from approving a payment", e?.forbidden === true, `${e?.name}: ${e?.message}`);
    }
    const payB = await mkPayment(u.id, "APPROVED");
    try {
      await PurchaseHandlers.updateRecord(ctx, payB, "payment", { status: "PAID" });
      check("No-permission user is BLOCKED from marking a payment paid", false, "was allowed");
    } catch (e: any) {
      check("No-permission user is BLOCKED from marking a payment paid", e?.forbidden === true, `${e?.name}: ${e?.message}`);
    }

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

    // ── Payment SPLIT: approver can Approve (not Pay); account manager can Pay
    //    an approved request (not Approve) ───────────────────────────────────
    const approver = await prisma.user.create({ data: { email: `${TAG}-appr@example.invalid`, organizationId: org.id, first_name: "Approver" } });
    users.push(approver.id);
    const acct = await prisma.user.create({ data: { email: `${TAG}-acct@example.invalid`, organizationId: org.id, first_name: "AcctMgr" } });
    users.push(acct.id);
    const gotApprove = await grantPerm(org.id, approver.id, APPROVE_PAYMENT_REQUEST);
    const gotRaise = await grantPerm(org.id, acct.id, RAISE_PAYMENT_REQUEST);

    if (!gotApprove || !gotRaise) {
      check("Payment split — named permissions present in org", false, `approve=${gotApprove} raise=${gotRaise} (run setup-purchase-approvals first)`);
    } else {
      const approverCtx = { organizationId: org.id, userId: approver.id };
      const acctCtx = { organizationId: org.id, userId: acct.id };

      const p1 = await mkPayment(u.id, "REQUESTED");
      try {
        const r: any = await PurchaseHandlers.updateRecord(approverCtx, p1, "payment", { status: "APPROVED" });
        check("Approver (APPROVE_PAYMENT_REQUEST) CAN approve a payment", r?.status === "APPROVED", `got ${JSON.stringify(r?.status)}`);
      } catch (e: any) {
        check("Approver (APPROVE_PAYMENT_REQUEST) CAN approve a payment", false, `${e?.name}: ${e?.message}`);
      }
      const p2 = await mkPayment(u.id, "APPROVED");
      try {
        await PurchaseHandlers.updateRecord(approverCtx, p2, "payment", { status: "PAID" });
        check("Approver (no RAISE) is BLOCKED from marking paid", false, "was allowed");
      } catch (e: any) {
        check("Approver (no RAISE) is BLOCKED from marking paid", e?.forbidden === true, `${e?.name}: ${e?.message}`);
      }
      const p3 = await mkPayment(u.id, "APPROVED");
      try {
        const r: any = await PurchaseHandlers.updateRecord(acctCtx, p3, "payment", { status: "PAID" });
        check("Account manager (RAISE_PAYMENT_REQUEST) CAN mark an approved payment paid", r?.status === "PAID", `got ${JSON.stringify(r?.status)}`);
      } catch (e: any) {
        check("Account manager (RAISE_PAYMENT_REQUEST) CAN mark an approved payment paid", false, `${e?.name}: ${e?.message}`);
      }
      const p4 = await mkPayment(u.id, "REQUESTED");
      try {
        await PurchaseHandlers.updateRecord(acctCtx, p4, "payment", { status: "APPROVED" });
        check("Account manager (no APPROVE) is BLOCKED from approving", false, "was allowed");
      } catch (e: any) {
        check("Account manager (no APPROVE) is BLOCKED from approving", e?.forbidden === true, `${e?.name}: ${e?.message}`);
      }
    }
  } finally {
    if (created.length) await prisma.purchaseRecord.deleteMany({ where: { id: { in: created } } });
    if (users.length) {
      await prisma.userPermissionOverride.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await setEngineOnly(org.id, true); // leave engine-only ON
    console.log("\n  (temp data cleaned up; org left in engine-only mode)");
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
