/**
 * Open EVERY purchase form section to all users EXCEPT the "Approval" sections.
 *
 * Section edit access is "open-until-granted": a section is restricted only while
 * it has ≥1 grant. This removes the grants on all purchase sections whose name is
 * NOT ..._SECTION_APPROVAL — so e.g. PR Date and all Requisition fields become
 * editable by every user — while leaving the Approval section(s) restricted to
 * their current approvers. Idempotent.
 *
 *   npx tsx scripts/open-purchase-fields-except-approval.ts --org "Nessco Groupo" [--dry]
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const i = process.argv.indexOf("--org");
  const orgName = i >= 0 ? process.argv[i + 1] : "Nessco Groupo";
  const dry = process.argv.includes("--dry");
  const org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) throw new Error(`Org "${orgName}" not found`);
  console.log(`\nOrg: ${org.name}${dry ? "  [DRY RUN]" : ""}\n`);

  const perms = await prisma.permission.findMany({
    where: { organizationId: org.id, name: { startsWith: "EDIT_PURCHASE_" } },
    select: {
      id: true, name: true,
      rolePermissions: { where: { granted: true }, select: { id: true, role: { select: { name: true } } } },
      userOverrides: { where: { granted: true }, select: { id: true } },
    },
  });

  let opened = 0, kept = 0;
  for (const p of perms) {
    const isApproval = p.name.endsWith("_SECTION_APPROVAL");
    const grantCount = p.rolePermissions.length + p.userOverrides.length;
    if (isApproval) {
      if (grantCount > 0) { kept++; console.log(`  · KEEP restricted: ${p.name}  (roles=[${p.rolePermissions.map((r) => r.role.name).join(", ")}])`); }
      continue;
    }
    if (grantCount === 0) continue; // already open
    console.log(`  ✓ OPEN to all: ${p.name}  (removing ${grantCount} grant${grantCount === 1 ? "" : "s"})`);
    if (!dry) {
      await prisma.rolePermission.deleteMany({ where: { permissionId: p.id } });
      await prisma.userPermissionOverride.deleteMany({ where: { permissionId: p.id } });
    }
    opened++;
  }

  console.log(`\nSummary: opened ${opened} section(s); kept ${kept} approval section(s) restricted.`);
  console.log("All non-approval purchase fields (incl. PR Date) are now editable by every user.\n");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
