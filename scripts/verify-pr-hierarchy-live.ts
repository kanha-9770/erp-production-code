/**
 * Fix + prove the REAL "Purchase Requisition Approval" process under strict
 * hierarchy, end to end, against the live org.
 *
 *   1. Sets the process trigger to BOTH (so a PR that reaches SUBMITTED via an
 *      edit — not just at creation — actually enters the flow).
 *   2. Reports the real users who sit UNDER Production Head (who can raise a PR
 *      that routes to him).
 *   3. Simulates a production-subordinate raising a SUBMITTED PR, proves it
 *      enrols, lands in Production Head's inbox, is NOT visible to an outsider,
 *      and that Production Head can approve it. Cleans up everything temporary.
 *
 *   npx tsx scripts/verify-pr-hierarchy-live.ts --org "Nessco Groupo"
 */

import { prisma } from "@/lib/prisma";
import {
  findMatchingProcess, submitForApproval, applyDecision, listInbox,
  buildRoleParentMap, isDescendantRole, stageEligibility, APPROVAL_TX_OPTS,
} from "@/lib/approvals/engine";
import { getAdapter } from "@/lib/approvals/registry";
import { canonicalizePurchaseData } from "@/lib/purchase-system/approval-adapter";
import type { ApprovalProcess } from "@prisma/client";
import type { ApprovalStage } from "@/lib/approvals/types";

const TAG = `prhier-${Date.now()}`;
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `  — ${extra}`}`);
};

async function userRoleIds(userId: string) {
  const rows = await prisma.userUnitAssignment.findMany({
    where: { userId, role: { isActive: true }, unit: { isActive: true } }, select: { roleId: true },
  });
  return [...new Set(rows.map((r) => r.roleId))];
}

async function main() {
  const i = process.argv.indexOf("--org");
  const orgName = i >= 0 ? process.argv[i + 1] : "Nessco Groupo";
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) throw new Error(`Org "${orgName}" not found`);
  console.log(`\n=== ${org.name} (${org.id}) ===\n`);

  const proc = await prisma.approvalProcess.findFirst({
    where: { organizationId: org.id, module: "purchase", submodule: "pr", isActive: true },
  });
  if (!proc) throw new Error("No active PR approval process found");
  const stage0 = (proc.stages as unknown as ApprovalStage[])[0];
  const headRoleId = (stage0.approverRoleIds ?? [])[0];
  if (!headRoleId) throw new Error("Process stage 1 has no approver role");
  const headRole = await prisma.role.findUnique({ where: { id: headRoleId } });
  console.log(`Process: "${proc.name}"  approverRole="${headRole?.name}"  hierarchyScoped=${!!stage0.hierarchyScoped}\n`);

  // ── 1. Trigger fix (persisted) ───────────────────────────────────────────
  if (proc.trigger !== "BOTH") {
    await prisma.approvalProcess.update({ where: { id: proc.id }, data: { trigger: "BOTH" } });
    console.log(`Trigger: ${proc.trigger} → BOTH  (a PR that becomes SUBMITTED via edit now enters approval)\n`);
  } else {
    console.log(`Trigger: already BOTH\n`);
  }
  const liveProc = await prisma.approvalProcess.findUniqueOrThrow({ where: { id: proc.id } });

  // Production Head member (real approver)
  const headMembers = await prisma.userUnitAssignment.findMany({
    where: { roleId: headRoleId, role: { isActive: true }, unit: { isActive: true } },
    select: { userId: true, user: { select: { first_name: true, email: true } } },
  });
  if (headMembers.length === 0) throw new Error("Production Head role has no members — assign UDAY to it first.");
  const head = headMembers[0];
  console.log(`Approver (Production Head): ${head.user.first_name || head.user.email} (${head.userId})`);

  // ── 2. Real subordinates report ──────────────────────────────────────────
  const parentById = await buildRoleParentMap(prisma, org.id);
  const subRoleIds = [...parentById.keys()].filter((rid) => isDescendantRole(rid, headRoleId, parentById));
  const subUsers = await prisma.userUnitAssignment.findMany({
    where: { roleId: { in: subRoleIds }, role: { isActive: true }, unit: { isActive: true } },
    select: { user: { select: { first_name: true, email: true } }, role: { select: { name: true } } },
  });
  console.log(`Real users under Production Head (${subUsers.length}): ${
    subUsers.map((s) => `${s.user.first_name || s.user.email} [${s.role.name}]`).join(", ") || "(none yet — assign someone to a sub-role to test live)"
  }\n`);

  // ── 3. End-to-end proof with a temp subordinate + temp PR ────────────────
  const created = { unitId: "", subRoleId: "", subUserId: "", outsiderUserId: "", outsiderRoleId: "", recordId: "" };
  try {
    const unit = await prisma.organizationUnit.create({ data: { name: `${TAG}-unit`, organizationId: org.id, isActive: true } });
    created.unitId = unit.id;
    const subRole = await prisma.role.create({
      data: { name: `${TAG}-SubDesigner`, organizationId: org.id, parentId: headRoleId, level: (headRole?.level ?? 0) + 1, isActive: true },
    });
    created.subRoleId = subRole.id;
    const subUser = await prisma.user.create({ data: { email: `${TAG}-sub@example.invalid`, organizationId: org.id, first_name: "TestSub" } });
    created.subUserId = subUser.id;
    await prisma.userUnitAssignment.create({ data: { userId: subUser.id, unitId: unit.id, roleId: subRole.id } });

    // An outsider in a separate top-level role (must NOT see the PR).
    const outsiderRole = await prisma.role.create({ data: { name: `${TAG}-Outsider`, organizationId: org.id, level: 0, isActive: true } });
    created.outsiderRoleId = outsiderRole.id;
    const outsider = await prisma.user.create({ data: { email: `${TAG}-out@example.invalid`, organizationId: org.id, first_name: "TestOut" } });
    created.outsiderUserId = outsider.id;
    await prisma.userUnitAssignment.create({ data: { userId: outsider.id, unitId: unit.id, roleId: outsiderRole.id } });

    // A real PR raised by the subordinate, status SUBMITTED.
    const rec = await prisma.purchaseRecord.create({
      data: { organizationId: org.id, submodule: "pr", status: "SUBMITTED", createdById: subUser.id,
        data: { docNo: `${TAG}`, status: "SUBMITTED", itemName: "Test requisition" } },
    });
    created.recordId = rec.id;

    // It must match the process criteria (status = SUBMITTED).
    const norm = await canonicalizePurchaseData(org.id, "pr", rec.data as Record<string, unknown>);
    const matched = await findMatchingProcess(prisma, { organizationId: org.id, module: "purchase", submodule: "pr" }, "CREATE", norm);
    check("PR matches the process criteria", matched?.id === liveProc.id, `got ${matched?.id ?? "null"}`);

    // Enrol (as the create/edit handler would).
    const { requestId } = await prisma.$transaction(async (tx) => {
      const r = await submitForApproval(tx, {
        organizationId: org.id, module: "purchase", submodule: "pr", recordId: rec.id,
        requestedById: subUser.id, trigger: "CREATE", process: liveProc as ApprovalProcess, priorStatus: "SUBMITTED",
      });
      await tx.purchaseRecord.update({ where: { id: rec.id }, data: { data: { ...(rec.data as object), _approval: r.approvalMeta } as any } });
      return r;
    }, APPROVAL_TX_OPTS);

    const reqRow = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    check("Requester (sub-role) frozen on request", reqRow.requesterRoleIds.includes(subRole.id));

    // Eligibility + inbox. Rebuild the role tree so it includes the temp sub-role.
    const treeNow = await buildRoleParentMap(prisma, org.id);
    const headRoleIds = await userRoleIds(head.userId);
    const elig = stageEligibility(stage0, head.userId, headRoleIds, false, { requesterRoleIds: reqRow.requesterRoleIds, parentById: treeNow });
    check("Production Head is ELIGIBLE for the subordinate's PR", elig.eligible);

    const headInbox = await listInbox({ organizationId: org.id, module: "purchase", userId: head.userId, userRoleIds: headRoleIds });
    check("PR appears in Production Head's inbox", headInbox.some((r) => r.recordId === rec.id));

    const outInbox = await listInbox({ organizationId: org.id, module: "purchase", userId: outsider.id, userRoleIds: [outsiderRole.id] });
    check("PR is HIDDEN from an unrelated user's inbox", !outInbox.some((r) => r.recordId === rec.id));

    // Production Head approves.
    const decided = await applyDecision({
      organizationId: org.id, userId: head.userId, requestId, decision: "APPROVE",
      isAdmin: false, userRoleIds: headRoleIds, adapter: getAdapter("purchase"),
    });
    check("Production Head can APPROVE → settles APPROVED", decided.status === "APPROVED");
    const after = await prisma.purchaseRecord.findUniqueOrThrow({ where: { id: rec.id } });
    check("Record approval marker cleared to APPROVED", ((after.data as any)?._approval?.status) === "APPROVED");
  } finally {
    if (created.recordId) {
      const reqs = await prisma.approvalRequest.findMany({ where: { recordId: created.recordId }, select: { id: true } });
      const ids = reqs.map((r) => r.id);
      if (ids.length) { await prisma.approvalAction.deleteMany({ where: { requestId: { in: ids } } }); await prisma.approvalRequest.deleteMany({ where: { id: { in: ids } } }); }
      await prisma.purchaseRecord.deleteMany({ where: { id: created.recordId } });
    }
    await prisma.userUnitAssignment.deleteMany({ where: { userId: { in: [created.subUserId, created.outsiderUserId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [created.subUserId, created.outsiderUserId].filter(Boolean) } } });
    await prisma.role.deleteMany({ where: { id: { in: [created.subRoleId, created.outsiderRoleId].filter(Boolean) } } });
    if (created.unitId) await prisma.organizationUnit.deleteMany({ where: { id: created.unitId } });
    console.log("\n  (temp fixtures cleaned up)");
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
