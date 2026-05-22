/**
 * Backfill: (re)build the default sidebar — nested FormModule folders +
 * static-page anchors — for one or more organizations, based on each org's
 * own `selectedModules`. Uses the same idempotent seeder as org creation, so
 * it's safe to run repeatedly.
 *
 * Run from the project root:
 *   npx tsx scripts/backfill-erp-module-sidebar.ts --email you@example.com
 *   npx tsx scripts/backfill-erp-module-sidebar.ts --org <organizationId>
 *   npx tsx scripts/backfill-erp-module-sidebar.ts --all
 *
 * Exactly one selector is required (no accidental org-wide writes):
 *   --email <addr>  backfill the org owned-by / containing this user
 *   --org   <id>    backfill a single organization by id
 *   --all           backfill every organization in the database
 */

import { PrismaClient } from "@prisma/client";
import { ensureErpModuleSidebar } from "../lib/erp-modules-seed";

function parseArgs(argv: string[]): {
  email?: string;
  org?: string;
  all: boolean;
} {
  const out: { email?: string; org?: string; all: boolean } = { all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") out.all = true;
    else if (a === "--email") out.email = argv[++i];
    else if (a === "--org") out.org = argv[++i];
    else if (a.startsWith("--email=")) out.email = a.slice("--email=".length);
    else if (a.startsWith("--org=")) out.org = a.slice("--org=".length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selectors = [args.email, args.org, args.all ? "all" : undefined].filter(
    Boolean,
  );
  if (selectors.length !== 1) {
    console.error(
      "Specify exactly one selector: --email <addr> | --org <id> | --all",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    let orgs: Array<{ id: string; name: string; selectedModules: string[] }> =
      [];

    if (args.all) {
      orgs = await prisma.organization.findMany({
        select: { id: true, name: true, selectedModules: true },
      });
    } else if (args.org) {
      const org = await prisma.organization.findUnique({
        where: { id: args.org },
        select: { id: true, name: true, selectedModules: true },
      });
      if (!org) {
        console.error(`No organization found with id "${args.org}".`);
        process.exit(1);
      }
      orgs = [org];
    } else if (args.email) {
      const user = await prisma.user.findUnique({
        where: { email: args.email },
        select: { organizationId: true },
      });
      if (!user?.organizationId) {
        console.error(
          `User "${args.email}" not found or not in an organization.`,
        );
        process.exit(1);
      }
      const org = await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { id: true, name: true, selectedModules: true },
      });
      if (!org) {
        console.error(`Organization ${user.organizationId} not found.`);
        process.exit(1);
      }
      orgs = [org];
    }

    let processed = 0;
    for (const org of orgs) {
      const modules = Array.isArray(org.selectedModules)
        ? org.selectedModules
        : [];
      if (modules.length === 0) {
        console.log(`[skip] ${org.name} (${org.id}) — no selectedModules`);
        continue;
      }
      await ensureErpModuleSidebar(prisma, org.id, modules);
      processed += 1;
      console.log(
        `[ok]   ${org.name} (${org.id}) — seeded modules: ${modules.join(", ")}`,
      );
    }

    console.log(`\nDone. Processed ${processed}/${orgs.length} org(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
