/**
 * One-off backfill: for every organization with non-empty `selectedModules`,
 * ensure the FormModules + group-anchor rows exist so the sidebar is
 * populated.
 *
 * Run from the project root:
 *   node --import tsx scripts/backfill-erp-module-sidebar.ts
 * or:
 *   npx tsx scripts/backfill-erp-module-sidebar.ts
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { ensureErpModuleSidebar } from "../lib/erp-modules-seed";

async function main() {
  const prisma = new PrismaClient();
  try {
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, selectedModules: true },
    });

    let processed = 0;
    for (const org of orgs) {
      const modules = Array.isArray(org.selectedModules) ? org.selectedModules : [];
      if (modules.length === 0) {
        console.log(`[skip] ${org.name} (${org.id}) — no selectedModules`);
        continue;
      }
      await ensureErpModuleSidebar(prisma, org.id, modules);
      processed += 1;
      console.log(
        `[ok]   ${org.name} (${org.id}) — seeded ${modules.length} ERP modules`
      );
    }

    console.log(`\nDone. Processed ${processed}/${orgs.length} orgs.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
