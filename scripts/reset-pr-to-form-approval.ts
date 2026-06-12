/**
 * One-off: switch PR approval to the native FORM flow (Production Approval field
 * gated by APPROVE_PURCHASE_REQUISITION), removing the approval-PROCESS conflict.
 *
 *   - Deactivates active PR approval-processes (so edits to the Approval/Status
 *     section stop getting parked).
 *   - Recalls any open PR approval requests so those records unlock.
 *
 *   npx tsx scripts/reset-pr-to-form-approval.ts --org "Nessco Groupo" [--dry]
 */

import { prisma } from "@/lib/prisma";
import { recallRequest } from "@/lib/approvals/engine";
import { getAdapter } from "@/lib/approvals/registry";

async function main() {
  const i = process.argv.indexOf("--org");
  const orgName = i >= 0 ? process.argv[i + 1] : "Nessco Groupo";
  const dry = process.argv.includes("--dry");
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) throw new Error(`Org "${orgName}" not found`);
  console.log(`\nOrg: ${org.name}${dry ? "  [DRY RUN]" : ""}`);

  const active = await prisma.approvalProcess.findMany({
    where: { organizationId: org.id, module: "purchase", submodule: "pr", isActive: true },
    select: { id: true, name: true },
  });
  console.log(`\nActive PR processes to deactivate: ${active.map((p) => `"${p.name}"`).join(", ") || "(none)"}`);
  if (!dry && active.length) {
    await prisma.approvalProcess.updateMany({ where: { id: { in: active.map((p) => p.id) } }, data: { isActive: false } });
  }

  const open = await prisma.approvalRequest.findMany({
    where: { organizationId: org.id, module: "purchase", submodule: "pr", status: "PENDING" },
    select: { id: true, recordId: true, requestedById: true },
  });
  console.log(`Open PR requests to recall: ${open.length}`);
  for (const r of open) {
    if (dry) { console.log(`   would recall ${r.id} (record ${r.recordId})`); continue; }
    await recallRequest({
      organizationId: org.id, userId: r.requestedById, requestId: r.id,
      isAdmin: true, adapter: getAdapter("purchase"), comment: "Switched PR to direct form approval",
    });
    console.log(`   ✓ recalled ${r.id} — record ${r.recordId} unlocked`);
  }

  console.log(`\nDone. Production Head can now set "Production Approval = Approved" directly on a PR (after re-login).\n`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
