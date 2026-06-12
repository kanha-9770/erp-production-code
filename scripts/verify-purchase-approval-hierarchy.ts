/**
 * Verify the server-side role-hierarchy gate on purchase approvals, using REAL
 * users from the org (read-only — no records are changed).
 *
 *   npx tsx scripts/verify-purchase-approval-hierarchy.ts --org "Nessco Groupo"
 */
import { prisma } from "@/lib/prisma";
import {
  assertApprovalWithinHierarchy,
  purchaseHierarchyEnforced,
  PurchaseHierarchyError,
} from "@/lib/permissions/purchase-permissions";
import { buildRoleParentMap, isDescendantRole } from "@/lib/approvals/engine";
import { isOrgAdmin } from "@/lib/permissions/has-permission";

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `  — ${extra}`}`); };

async function expectAllowed(label: string, actingUserId: string, creatorId: string | null, organizationId: string) {
  try { await assertApprovalWithinHierarchy({ actingUserId, creatorId, organizationId }); check(label, true); }
  catch (e: any) { check(label, false, `unexpected block: ${e?.message}`); }
}
async function expectBlocked(label: string, actingUserId: string, creatorId: string | null, organizationId: string) {
  try { await assertApprovalWithinHierarchy({ actingUserId, creatorId, organizationId }); check(label, false, "was allowed but should be blocked"); }
  catch (e: any) { check(label, e instanceof PurchaseHierarchyError, `wrong error: ${e?.message}`); }
}

async function main() {
  const i = process.argv.indexOf("--org");
  const orgName = i >= 0 ? process.argv[i + 1] : "Nessco Groupo";
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) throw new Error(`Org "${orgName}" not found`);
  console.log(`\n=== ${org.name} ===\n`);

  check("Org flag purchaseHierarchyScoped is ON", await purchaseHierarchyEnforced(org.id));

  const head = await prisma.role.findFirst({ where: { organizationId: org.id, name: "Production Head" } });
  if (!head) throw new Error('Role "Production Head" not found');
  const parentById = await buildRoleParentMap(prisma, org.id);
  const descIds = [...parentById.keys()].filter((rid) => isDescendantRole(rid, head.id, parentById));

  const headUser = (await prisma.userUnitAssignment.findFirst({
    where: { roleId: head.id, role: { isActive: true }, unit: { isActive: true } }, select: { userId: true, user: { select: { first_name: true } } },
  }));
  const subUser = await prisma.userUnitAssignment.findFirst({
    where: { roleId: { in: descIds }, role: { isActive: true }, unit: { isActive: true } },
    select: { userId: true, user: { select: { first_name: true } }, role: { select: { name: true } } },
  });
  const outsider = await prisma.userUnitAssignment.findFirst({
    where: { roleId: { notIn: [head.id, ...descIds] }, role: { isActive: true, isAdmin: false }, unit: { isActive: true } },
    select: { userId: true, user: { select: { first_name: true } }, role: { select: { name: true } } },
  });
  if (!headUser || !subUser || !outsider) throw new Error("Need a Production Head member, a subordinate, and an outsider user to test.");

  // Find an org admin/owner to prove bypass.
  const adminRole = await prisma.role.findFirst({ where: { organizationId: org.id, isAdmin: true, isActive: true }, select: { id: true } });
  const adminAssign = adminRole
    ? await prisma.userUnitAssignment.findFirst({ where: { roleId: adminRole.id, unit: { isActive: true } }, select: { userId: true } })
    : null;
  const owner = await prisma.organization.findUnique({ where: { id: org.id }, select: { ownerId: true } });
  const adminUserId = adminAssign?.userId ?? owner?.ownerId ?? null;

  console.log(`Head: ${headUser.user.first_name}   Subordinate: ${subUser.user.first_name} [${subUser.role.name}]   Outsider: ${outsider.user.first_name} [${outsider.role.name}]\n`);

  await expectAllowed("Production Head CAN approve a subordinate's document", headUser.userId, subUser.userId, org.id);
  await expectBlocked("Production Head CANNOT approve an outsider's document (e.g. IT)", headUser.userId, outsider.userId, org.id);
  await expectBlocked("Production Head CANNOT approve their OWN document", headUser.userId, headUser.userId, org.id);
  await expectBlocked("Production Head CANNOT approve a document with no creator", headUser.userId, null, org.id);

  if (adminUserId && (await isOrgAdmin(adminUserId))) {
    await expectAllowed("Org admin bypasses the hierarchy gate", adminUserId, outsider.userId, org.id);
  } else {
    console.log("  (no admin user resolved — skipping admin-bypass check)");
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
