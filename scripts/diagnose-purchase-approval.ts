/**
 * Read-only diagnostic for "the approver can't act on PRs".
 *
 * Dumps, for an org: the purchase approval processes (stages + flags), the
 * approver roles with their members and subordinate roles, the live pending
 * requests with a REAL eligibility check per approver, and how many purchase
 * records actually carry a pending approval marker.
 *
 *   npx tsx scripts/diagnose-purchase-approval.ts --org "Nessco Groupo"
 */

import { prisma } from "@/lib/prisma";
import { stageEligibility, buildRoleParentMap, isDescendantRole } from "@/lib/approvals/engine";
import type { ApprovalStage, ProcessSnapshot } from "@/lib/approvals/types";

function line(s = "") { console.log(s); }

async function main() {
  const i = process.argv.indexOf("--org");
  const orgName = i >= 0 ? process.argv[i + 1] : null;
  const org = orgName
    ? await prisma.organization.findFirst({ where: { name: orgName } })
    : await prisma.organization.findFirst({ where: { roles: { some: {} } } });
  if (!org) throw new Error(`Org not found${orgName ? ` ("${orgName}")` : ""}`);
  line(`\n=== Org: ${org.name} (${org.id}) ===`);

  // ── Roles + tree ──────────────────────────────────────────────────────────
  const roles = await prisma.role.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, parentId: true, isActive: true, isAdmin: true },
  });
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const childrenOf = new Map<string, string[]>();
  for (const r of roles) if (r.parentId) (childrenOf.get(r.parentId) ?? childrenOf.set(r.parentId, []).get(r.parentId)!).push(r.id);
  const parentById = await buildRoleParentMap(prisma, org.id);
  const roleName = (id: string) => roleById.get(id)?.name ?? `(unknown ${id})`;

  // members of a role
  async function membersOf(roleId: string) {
    const rows = await prisma.userUnitAssignment.findMany({
      where: { roleId, role: { isActive: true }, unit: { isActive: true } },
      select: { userId: true, user: { select: { email: true, first_name: true, last_name: true } } },
    });
    return rows.map((r) => ({
      userId: r.userId,
      name: [r.user.first_name, r.user.last_name].filter(Boolean).join(" ") || r.user.email,
    }));
  }
  async function userRoleIds(userId: string) {
    const rows = await prisma.userUnitAssignment.findMany({
      where: { userId, role: { isActive: true }, unit: { isActive: true } },
      select: { roleId: true },
    });
    return [...new Set(rows.map((r) => r.roleId))];
  }

  // ── Processes ─────────────────────────────────────────────────────────────
  const procs = await prisma.approvalProcess.findMany({
    where: { organizationId: org.id, module: "purchase" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  line(`\n--- Purchase approval processes: ${procs.length} ---`);
  for (const p of procs) {
    const stages = (p.stages as unknown as ApprovalStage[]) ?? [];
    line(`\n• "${p.name}"  [${p.isActive ? "ACTIVE" : "INACTIVE"}]  submodule=${p.submodule ?? "(all)"}  trigger=${p.trigger}`);
    const crit = p.criteria as any;
    line(`  criteria: matchMode=${crit?.matchMode} rules=${(crit?.rules ?? []).length} scope=${JSON.stringify(crit?.scope ?? { type: "record" })}`);
    line(`  adminUserIds: ${((p.adminUserIds as string[]) ?? []).length}`);
    stages.forEach((s, idx) => {
      line(`  stage ${idx + 1}: mode=${s.mode} hierarchyScoped=${!!s.hierarchyScoped}`);
      line(`     approverUserIds: ${(s.approverUserIds ?? []).length}`);
      line(`     approverRoleIds: ${(s.approverRoleIds ?? []).map((r) => `${roleName(r)}`).join(", ") || "(none)"}`);
    });
  }

  // ── Approver role detail (members + subordinate roles) ────────────────────
  const approverRoleIds = [...new Set(procs.flatMap((p) => ((p.stages as unknown as ApprovalStage[]) ?? []).flatMap((s) => s.approverRoleIds ?? [])))];
  line(`\n--- Approver roles detail ---`);
  for (const rid of approverRoleIds) {
    const members = await membersOf(rid);
    const kids = (childrenOf.get(rid) ?? []).map(roleName);
    line(`\n• Role "${roleName(rid)}" (${rid})  active=${roleById.get(rid)?.isActive}`);
    line(`  members (${members.length}): ${members.map((m) => m.name).join(", ") || "(NONE — nobody holds this role!)"}`);
    line(`  direct sub-roles: ${kids.join(", ") || "(NONE — no roles report to it)"}`);
  }

  // ── Pending requests + eligibility ────────────────────────────────────────
  const pending = await prisma.approvalRequest.findMany({
    where: { organizationId: org.id, module: "purchase", status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  line(`\n--- Pending purchase approval requests: ${pending.length} ---`);
  for (const req of pending.slice(0, 15)) {
    const snap = (req.processSnapshot ?? {}) as unknown as ProcessSnapshot;
    const stage = (snap.stages ?? [])[req.currentStage];
    line(`\n• req ${req.id}  record=${req.recordId}  submodule=${req.submodule}  stage=${req.currentStage + 1}/${(snap.stages ?? []).length}`);
    line(`  requesterRoleIds: ${req.requesterRoleIds.map(roleName).join(", ") || "(EMPTY — raised before role-capture, or requester had no role)"}`);
    if (!stage) { line("  ⚠ no stage at currentStage"); continue; }
    line(`  stage approverRoles: ${(stage.approverRoleIds ?? []).map(roleName).join(", ") || "(none)"}  hierarchyScoped=${!!stage.hierarchyScoped}`);
    // Check each member of each approver role.
    for (const arid of stage.approverRoleIds ?? []) {
      const members = await membersOf(arid);
      for (const m of members) {
        const rids = await userRoleIds(m.userId);
        const elig = stageEligibility(stage, m.userId, rids, false, { requesterRoleIds: req.requesterRoleIds, parentById });
        const why = stage.hierarchyScoped
          ? ` (requester under "${roleName(arid)}"? ${req.requesterRoleIds.some((rr) => isDescendantRole(rr, arid, parentById))})`
          : "";
        line(`     approver ${m.name} via ${roleName(arid)} → eligible=${elig.eligible}${why}`);
      }
    }
  }

  // ── Records coverage ──────────────────────────────────────────────────────
  const prCount = await prisma.purchaseRecord.count({ where: { organizationId: org.id, submodule: "pr" } });
  const sampleP = await prisma.purchaseRecord.findMany({
    where: { organizationId: org.id, submodule: "pr" },
    orderBy: { createdAt: "desc" }, take: 50, select: { id: true, data: true, createdById: true },
  });
  const withPending = sampleP.filter((r) => (r.data as any)?._approval?.status === "PENDING").length;
  line(`\n--- PR records ---`);
  line(`  total PR records: ${prCount}`);
  line(`  of latest ${sampleP.length}: ${withPending} carry a PENDING _approval marker`);
  line(`\n(If pending requests = 0 but PR records > 0: existing PRs predate the process — approval only fires on NEW create/edit. They need a backfill/submit action to enter the flow.)`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
