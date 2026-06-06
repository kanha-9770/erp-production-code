/**
 * One-off: enable the "inventory" ERP module for orgs that already have at
 * least one module selected, then reseed their sidebar via the shared
 * idempotent seeder. Safe to run repeatedly.
 *
 *   npx tsx scripts/enable-inventory-module.ts          # all orgs with modules
 *   npx tsx scripts/enable-inventory-module.ts --org <id>
 */
import { PrismaClient } from "@prisma/client";
import { ensureErpModuleSidebar } from "../lib/erp-modules-seed";

const prisma = new PrismaClient();

async function main() {
  const orgArgIdx = process.argv.indexOf("--org");
  const onlyOrg = orgArgIdx !== -1 ? process.argv[orgArgIdx + 1] : undefined;

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, selectedModules: true },
  });

  let processed = 0;
  for (const org of orgs) {
    if (onlyOrg && org.id !== onlyOrg) continue;
    const current = Array.isArray(org.selectedModules)
      ? (org.selectedModules as string[])
      : [];
    if (current.length === 0 && !onlyOrg) {
      console.log(`[skip] ${org.name} (${org.id}) — no modules selected`);
      continue;
    }
    if (current.includes("inventory")) {
      console.log(`[ok]   ${org.name} (${org.id}) — already has inventory; reseeding`);
    } else {
      console.log(`[add]  ${org.name} (${org.id}) — adding inventory`);
    }
    const next = Array.from(new Set([...current, "inventory"]));

    // Mirror scripts/backfill-erp-module-sidebar.ts: update the org, then run
    // the seeder with the plain client (it manages its own short
    // transactions — wrapping it in one long interactive tx times out).
    await prisma.organization.update({
      where: { id: org.id },
      data: { selectedModules: next },
    });
    await ensureErpModuleSidebar(prisma, org.id, next);
    processed++;
  }

  console.log(`\nDone. Processed ${processed} org(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
