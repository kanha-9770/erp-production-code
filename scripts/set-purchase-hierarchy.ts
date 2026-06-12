/**
 * Toggle the org opt-in that restricts purchase approvals to the role hierarchy
 * (Organization.setup.approvals.purchaseHierarchyScoped). No migration.
 *
 *   npx tsx scripts/set-purchase-hierarchy.ts --org "Nessco Groupo"        # enable
 *   npx tsx scripts/set-purchase-hierarchy.ts --org "Nessco Groupo" --off  # disable
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const i = process.argv.indexOf("--org");
  const orgName = i >= 0 ? process.argv[i + 1] : "Nessco Groupo";
  const on = !process.argv.includes("--off");
  const org = await prisma.organization.findFirst({ where: { name: orgName }, select: { id: true, name: true, setup: true } });
  if (!org) throw new Error(`Org "${orgName}" not found`);
  const setup = ((org.setup ?? {}) as Record<string, unknown>);
  setup.approvals = { ...((setup.approvals as Record<string, unknown>) ?? {}), purchaseHierarchyScoped: on };
  await prisma.organization.update({ where: { id: org.id }, data: { setup: setup as any } });
  console.log(`\n${org.name}: purchaseHierarchyScoped = ${on}\n`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
