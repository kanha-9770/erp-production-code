/**
 * List (and with --fix, remove) USER-level overrides for the action permissions,
 * reverting everyone to clean ROLE-based grants. Per-user overrides are the
 * exception and were causing a Store Keeper to hold buyer/manager powers.
 *
 *   npx tsx scripts/clean-action-overrides.ts --orgId <id>        # list only
 *   npx tsx scripts/clean-action-overrides.ts --orgId <id> --fix  # delete them
 */
import { PrismaClient } from "@prisma/client";
import { ACTION_PERMISSION_NAMES } from "@/lib/permissions/action-catalog";
const prisma = new PrismaClient();

// The full catalog (purchase + inventory + accounts + section permissions) —
// stays in sync automatically as the catalog grows.
const ACTION_PERMS = ACTION_PERMISSION_NAMES;

function parseArgs(argv: string[]) {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const n = argv[i + 1];
    if (n && !n.startsWith("--")) { a[argv[i].slice(2)] = n; i++; } else a[argv[i].slice(2)] = true;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgId = typeof args.orgId === "string" ? args.orgId : "";
  const fix = !!args.fix;
  if (!orgId) throw new Error("Provide --orgId");

  const rows = await prisma.userPermissionOverride.findMany({
    where: { user: { organizationId: orgId }, permission: { name: { in: ACTION_PERMS } } },
    select: {
      id: true, granted: true,
      user: { select: { first_name: true, last_name: true, email: true } },
      permission: { select: { name: true } },
    },
  });

  if (rows.length === 0) { console.log("\nNo action-permission user overrides — already clean.\n"); return; }

  console.log(`\n${fix ? "Removing" : "Found"} ${rows.length} user override(s) (reverting to role-based):\n`);
  for (const r of rows) {
    const who = [r.user?.first_name, r.user?.last_name].filter(Boolean).join(" ") || r.user?.email;
    console.log(`  ${r.granted ? "grant" : "deny "}  ${who?.padEnd(20)} → ${r.permission?.name}`);
  }
  if (fix) {
    await prisma.userPermissionOverride.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    console.log(`\n✓ Removed. Everyone now resolves purely via their ROLE grants.\n`);
  } else {
    console.log(`\n(dry run — re-run with --fix to remove)\n`);
  }
}
main().catch((e) => { console.error("✗", e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
