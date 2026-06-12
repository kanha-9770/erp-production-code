/**
 * End-to-end check for HIERARCHY-SCOPED approval eligibility.
 *
 * Proves the rule the user asked for: when a stage's role approver is
 * hierarchy-scoped, a holder of that role may act ONLY on requests raised by
 * someone whose role sits strictly below theirs in the org role tree.
 *
 * It builds a throwaway slice of org data (a Head→Dept role pair, a peer Head,
 * three users, one unit, one process), exercises the engine, asserts the gate,
 * then deletes everything it created. Safe to run against a live org.
 *
 *   npx tsx scripts/verify-hierarchy-approval.ts --org "Nessco Groupo"
 */

import { prisma } from "@/lib/prisma";
import {
  submitForApproval,
  applyDecision,
  listInbox,
  stageEligibility,
  buildRoleParentMap,
  isDescendantRole,
} from "@/lib/approvals/engine";
import type { ApprovalProcess } from "@prisma/client";

const TAG = `hiertest-${Date.now()}`;
const noopAdapter = { onSettled: async () => {} };

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra?: string) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

async function main() {
  const orgArgIdx = process.argv.indexOf("--org");
  const orgName = orgArgIdx >= 0 ? process.argv[orgArgIdx + 1] : null;

  const org = orgName
    ? await prisma.organization.findFirst({ where: { name: orgName } })
    : await prisma.organization.findFirst({ where: { roles: { some: {} } } });
  if (!org) throw new Error(`Organization not found${orgName ? ` ("${orgName}")` : ""}`);
  console.log(`\nOrg: ${org.name} (${org.id})\n`);

  // Track created ids for teardown.
  const created = {
    requestRecordIds: [] as string[],
    processId: null as string | null,
    userIds: [] as string[],
    roleIds: [] as string[],
    unitId: null as string | null,
  };

  try {
    // ── Fixtures: a 3-role tree slice + users + unit ─────────────────────────
    const unit = await prisma.organizationUnit.create({
      data: { name: `${TAG}-unit`, organizationId: org.id, isActive: true },
    });
    created.unitId = unit.id;

    const head = await prisma.role.create({
      data: { name: `${TAG}-Head`, organizationId: org.id, level: 0, isActive: true },
    });
    const dept = await prisma.role.create({
      data: { name: `${TAG}-Dept`, organizationId: org.id, parentId: head.id, level: 1, isActive: true },
    });
    const peerHead = await prisma.role.create({
      data: { name: `${TAG}-PeerHead`, organizationId: org.id, level: 0, isActive: true },
    });
    created.roleIds.push(head.id, dept.id, peerHead.id);

    async function mkUser(suffix: string, roleId: string) {
      const u = await prisma.user.create({
        data: { email: `${TAG}-${suffix}@example.invalid`, organizationId: org!.id, first_name: suffix },
      });
      await prisma.userUnitAssignment.create({ data: { userId: u.id, unitId: unit.id, roleId } });
      created.userIds.push(u.id);
      return u;
    }
    const headUser = await mkUser("head", head.id);
    const deptUser = await mkUser("dept", dept.id);
    const peerUser = await mkUser("peer", peerHead.id);

    // ── A purchase process: single ANY stage, role=Head, hierarchy-scoped ────
    const process = await prisma.approvalProcess.create({
      data: {
        organizationId: org.id,
        module: "purchase",
        submodule: "pr",
        name: `${TAG}-process`,
        isActive: true,
        trigger: "CREATE",
        criteria: { matchMode: "ALL", rules: [] },
        stages: [{ name: "Head approval", mode: "ANY", approverUserIds: [], approverRoleIds: [head.id], hierarchyScoped: true }],
        adminUserIds: [],
      },
    });
    created.processId = process.id;

    // ── Submit three requests (by dept member, by peer head, by the head) ────
    async function submit(recordId: string, requestedById: string) {
      created.requestRecordIds.push(recordId);
      return prisma.$transaction(async (tx) => {
        const { requestId } = await submitForApproval(tx, {
          organizationId: org!.id,
          module: "purchase",
          submodule: "pr",
          recordId,
          requestedById,
          trigger: "CREATE",
          process: process as ApprovalProcess,
        });
        return requestId;
      });
    }
    const reqDept = await submit(`${TAG}-rec-dept`, deptUser.id);
    const reqPeer = await submit(`${TAG}-rec-peer`, peerUser.id);
    const reqHead = await submit(`${TAG}-rec-head`, headUser.id);

    // ── 1. requester roles frozen on the request ─────────────────────────────
    const reqDeptRow = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: reqDept } });
    check("Requester's role is frozen onto the request", reqDeptRow.requesterRoleIds.includes(dept.id),
      `got [${reqDeptRow.requesterRoleIds.join(",")}]`);

    // ── 2. pure tree logic ───────────────────────────────────────────────────
    const parentById = await buildRoleParentMap(prisma, org.id);
    check("Dept is a descendant of Head", isDescendantRole(dept.id, head.id, parentById));
    check("PeerHead is NOT a descendant of Head", !isDescendantRole(peerHead.id, head.id, parentById));
    check("Head is NOT a descendant of itself (peers excluded)", !isDescendantRole(head.id, head.id, parentById));

    // ── 3. stageEligibility gate (the head acting via the Head role) ─────────
    const stage = (process.stages as any[])[0];
    const headRoles = [head.id];
    const eligDept = stageEligibility(stage, headUser.id, headRoles, false,
      { requesterRoleIds: reqDeptRow.requesterRoleIds, parentById });
    const eligPeer = stageEligibility(stage, headUser.id, headRoles, false,
      { requesterRoleIds: (await prisma.approvalRequest.findUniqueOrThrow({ where: { id: reqPeer } })).requesterRoleIds, parentById });
    const eligHead = stageEligibility(stage, headUser.id, headRoles, false,
      { requesterRoleIds: (await prisma.approvalRequest.findUniqueOrThrow({ where: { id: reqHead } })).requesterRoleIds, parentById });
    check("Head CAN approve a Dept-raised request", eligDept.eligible && eligDept.viaRoleId === head.id);
    check("Head CANNOT approve a PeerHead-raised request", !eligPeer.eligible);
    check("Head CANNOT approve their own peer-level request", !eligHead.eligible);

    // ── 4. inbox only surfaces the in-scope request ──────────────────────────
    const inbox = await listInbox({ organizationId: org.id, module: "purchase", userId: headUser.id, userRoleIds: headRoles });
    const mine = new Set(inbox.map((r) => r.recordId));
    check("Inbox shows the Dept request", mine.has(`${TAG}-rec-dept`));
    check("Inbox hides the PeerHead request", !mine.has(`${TAG}-rec-peer`));
    check("Inbox hides the peer Head request", !mine.has(`${TAG}-rec-head`));

    // ── 5. applyDecision enforces the same gate ──────────────────────────────
    const decided = await applyDecision({
      organizationId: org.id, userId: headUser.id, requestId: reqDept,
      decision: "APPROVE", isAdmin: false, userRoleIds: headRoles, adapter: noopAdapter,
    });
    check("Approving the Dept request settles it APPROVED", decided.status === "APPROVED");

    let blocked = false;
    try {
      await applyDecision({
        organizationId: org.id, userId: headUser.id, requestId: reqPeer,
        decision: "APPROVE", isAdmin: false, userRoleIds: headRoles, adapter: noopAdapter,
      });
    } catch (e: any) {
      blocked = e?.forbidden === true || /eligib/i.test(e?.message ?? "");
    }
    check("Approving the out-of-hierarchy request is rejected (403)", blocked);

    // ── 6. admin force still bypasses the gate ───────────────────────────────
    const forced = await applyDecision({
      organizationId: org.id, userId: headUser.id, requestId: reqPeer,
      decision: "APPROVE", isAdmin: true, userRoleIds: headRoles, adapter: noopAdapter,
    });
    check("Org admin can force-approve regardless of hierarchy", forced.status === "APPROVED");
  } finally {
    // ── Teardown (children first) ────────────────────────────────────────────
    if (created.requestRecordIds.length) {
      const reqs = await prisma.approvalRequest.findMany({
        where: { recordId: { in: created.requestRecordIds } }, select: { id: true },
      });
      const ids = reqs.map((r) => r.id);
      if (ids.length) {
        await prisma.approvalAction.deleteMany({ where: { requestId: { in: ids } } });
        await prisma.approvalRequest.deleteMany({ where: { id: { in: ids } } });
      }
    }
    if (created.processId) await prisma.approvalProcess.deleteMany({ where: { id: created.processId } });
    await prisma.userUnitAssignment.deleteMany({ where: { userId: { in: created.userIds } } });
    if (created.userIds.length) await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
    if (created.roleIds.length) await prisma.role.deleteMany({ where: { id: { in: created.roleIds } } });
    if (created.unitId) await prisma.organizationUnit.deleteMany({ where: { id: created.unitId } });
    console.log("\n  (cleanup complete)");
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
