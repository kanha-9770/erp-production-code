/**
 * Backfill / enrol EXISTING records into an approval process.
 *
 * The engine only auto-submits a record when it is created/edited AFTER a
 * matching process exists. Records that already exist (or that reached the
 * matching state via a path the process's trigger didn't watch) never enter the
 * flow — so an approver has nothing to act on. This tool finds records that
 * match an active process's criteria and aren't already pending, and submits
 * them for approval (one open request per record, idempotent).
 *
 *   npx tsx scripts/enroll-approvals.ts --org "Nessco Groupo" --module purchase --submodule pr
 *   npx tsx scripts/enroll-approvals.ts --org "Nessco Groupo" --process <processId> --dry
 *
 * Flags: --org <name> | --orgId <id> | --module <m> (default purchase) |
 *        --submodule <s> | --process <id> (one process only) | --dry
 */

import { prisma } from "@/lib/prisma";
import { getAdapter } from "@/lib/approvals/registry";
import { findMatchingProcess, submitForApproval, APPROVAL_TX_OPTS } from "@/lib/approvals/engine";
import { evaluateCriteria } from "@/lib/approvals/criteria";
import type { ApprovalProcess } from "@prisma/client";
import type { Criteria } from "@/lib/approvals/types";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const orgName = arg("org");
  const orgId = arg("orgId");
  const module = arg("module") ?? "purchase";
  const onlySubmodule = arg("submodule");
  const onlyProcess = arg("process");
  const dry = has("dry");

  const org = orgId
    ? await prisma.organization.findUnique({ where: { id: orgId } })
    : orgName
      ? await prisma.organization.findFirst({ where: { name: orgName } })
      : await prisma.organization.findFirst({ where: { roles: { some: {} } } });
  if (!org) throw new Error("Organization not found");
  const adapter = getAdapter(module);
  console.log(`\nOrg: ${org.name} (${org.id})  module=${module}${dry ? "  [DRY RUN]" : ""}`);

  const processes = await prisma.approvalProcess.findMany({
    where: { organizationId: org.id, module, isActive: true, ...(onlyProcess ? { id: onlyProcess } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (processes.length === 0) { console.log("No active processes — nothing to enrol."); return done(0); }

  let enrolled = 0, alreadyPending = 0, unmatched = 0, noRequester = 0;

  for (const proc of processes) {
    const submodules = proc.submodule ? [proc.submodule] : adapter.submodules.map((s) => s.key);
    const scan = onlySubmodule ? submodules.filter((s) => s === onlySubmodule) : submodules;
    if (scan.length === 0) continue;
    const criteria = (proc.criteria ?? { matchMode: "ALL", rules: [] }) as unknown as Criteria;
    console.log(`\n• Process "${proc.name}"  submodules=[${scan.join(", ")}]  rules=${(criteria.rules ?? []).length}`);

    for (const submodule of scan) {
      const records =
        module === "inventory"
          ? await prisma.inventoryRecord.findMany({ where: { organizationId: org.id, submodule } })
          : await prisma.purchaseRecord.findMany({ where: { organizationId: org.id, submodule } });

      for (const rec of records as Array<{ id: string; data: unknown; status: string | null; createdById: string | null }>) {
        const data = (rec.data as Record<string, unknown>) ?? {};
        const meta = data._approval as { status?: string } | undefined;
        if (meta?.status === "PENDING") { alreadyPending++; continue; }

        const open = await prisma.approvalRequest.findFirst({
          where: { organizationId: org.id, recordId: rec.id, status: "PENDING" }, select: { id: true },
        });
        if (open) { alreadyPending++; continue; }

        const normalized = await adapter.canonicalizeData(org.id, submodule, data);
        if (!evaluateCriteria(criteria, normalized)) { unmatched++; continue; }
        if (!rec.createdById) { noRequester++; console.log(`   ⚠ ${rec.id} matches but has no creator — skipped (can't set requester).`); continue; }

        if (dry) { enrolled++; console.log(`   would enrol ${rec.id} (${(data.docNo as string) ?? submodule})`); continue; }

        await prisma.$transaction(async (tx) => {
          const { approvalMeta } = await submitForApproval(tx, {
            organizationId: org.id, module, submodule, recordId: rec.id,
            requestedById: rec.createdById!, trigger: "CREATE",
            process: proc as ApprovalProcess, priorStatus: rec.status ?? null,
          });
          const nextData = { ...data, _approval: approvalMeta };
          if (module === "inventory") {
            await tx.inventoryRecord.update({ where: { id: rec.id }, data: { data: nextData as any, status: "PENDING_APPROVAL" } });
          } else {
            await tx.purchaseRecord.update({ where: { id: rec.id }, data: { data: nextData as any } });
          }
        }, APPROVAL_TX_OPTS);
        enrolled++;
        console.log(`   ✓ enrolled ${rec.id} (${(data.docNo as string) ?? submodule})`);
      }
    }
  }

  console.log(`\nSummary: enrolled=${enrolled}  alreadyPending=${alreadyPending}  unmatched=${unmatched}  noCreator=${noRequester}`);
  return done(0);
}

async function done(code: number) { await prisma.$disconnect(); process.exit(code); }
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
