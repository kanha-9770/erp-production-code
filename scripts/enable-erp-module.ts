/**
 * Enable an ERP module for orgs that already have at least one module
 * selected, then reseed their sidebar via the shared idempotent seeder.
 * Safe to run repeatedly.
 *
 *   npx tsx scripts/enable-erp-module.ts --module purchase
 *   npx tsx scripts/enable-erp-module.ts --module purchase --org <id>
 */
import { PrismaClient } from "@prisma/client";
import { ensureErpModuleSidebar } from "../lib/erp-modules-seed";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const moduleId = arg("module");
  const onlyOrg = arg("org");
  if (!moduleId) {
    console.error("Missing --module <id>");
    process.exit(1);
  }

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, selectedModules: true },
  });

  let processed = 0;
  for (const org of orgs) {
    if (onlyOrg && org.id !== onlyOrg) continue;
    const current = Array.isArray(org.selectedModules) ? (org.selectedModules as string[]) : [];
    if (current.length === 0 && !onlyOrg) {
      console.log(`[skip] ${org.name} (${org.id}) — no modules selected`);
      continue;
    }
    if (current.includes(moduleId)) {
      console.log(`[ok]   ${org.name} (${org.id}) — already has ${moduleId}; reseeding`);
    } else {
      console.log(`[add]  ${org.name} (${org.id}) — adding ${moduleId}`);
    }
    const next = Array.from(new Set([...current, moduleId]));

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
