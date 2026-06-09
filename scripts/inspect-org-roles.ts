/**
 * READ-ONLY inspection of an organization's roles, units, user assignments, and
 * existing purchase permissions. Nothing is written. Used to plan the
 * approval-permission setup safely.
 *
 *   npx tsx scripts/inspect-org-roles.ts --orgId cmpdz3sk4000dqk0jux23u57m
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[a.slice(2)] = next;
      i++;
    }
  }
  return args;
}

const PURCHASE_PERMS = [
  "APPROVE_PURCHASE_REQUISITION",
  "APPROVE_PURCHASE_ORDER",
  "POST_GRN_STOCK",
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgId = args.orgId;
  if (!orgId) throw new Error("Provide --orgId <id>");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, ownerId: true },
  });
  if (!org) throw new Error(`No organization with id "${orgId}"`);

  console.log(`\n=== ORGANIZATION ===`);
  console.log(`  ${org.name}  (${org.id})`);
  console.log(`  ownerId: ${org.ownerId}`);

  const roles = await prisma.role.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      isAdmin: true,
      isActive: true,
      _count: { select: { userAssignments: true } },
    },
    orderBy: { sortOrder: "asc" },
  });
  console.log(`\n=== ROLES (${roles.length}) ===`);
  if (roles.length === 0) console.log("  (none)");
  for (const r of roles) {
    console.log(
      `  • ${r.name}${r.isAdmin ? "  [ADMIN]" : ""}${r.isActive ? "" : "  [inactive]"}` +
        `  — ${r._count.userAssignments} user(s)   id=${r.id}`,
    );
  }

  const units = await prisma.organizationUnit.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, parentId: true },
    orderBy: { sortOrder: "asc" },
  });
  console.log(`\n=== ORG UNITS / DEPARTMENTS (${units.length}) ===`);
  if (units.length === 0) console.log("  (none — no units defined)");
  for (const u of units) console.log(`  • ${u.name}   id=${u.id}${u.parentId ? `  parent=${u.parentId}` : ""}`);

  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      username: true,
      email: true,
      department: true,
      unitAssignments: {
        select: {
          unit: { select: { name: true } },
          role: { select: { name: true } },
        },
      },
    },
    take: 50,
  });
  console.log(`\n=== USERS (${users.length}${users.length === 50 ? "+, showing 50" : ""}) ===`);
  for (const u of users) {
    const name =
      [u.first_name, u.last_name].filter(Boolean).join(" ") ||
      u.username ||
      u.email ||
      u.id;
    const owner = u.id === org.ownerId ? "  [OWNER]" : "";
    const assigns =
      u.unitAssignments.length > 0
        ? u.unitAssignments.map((a) => `${a.role?.name ?? "?"}@${a.unit?.name ?? "?"}`).join(", ")
        : "(no role assignment)";
    console.log(`  • ${name}${owner}  <${u.email ?? "no-email"}>  dept=${u.department ?? "—"}  → ${assigns}`);
  }

  const perms = await prisma.permission.findMany({
    where: { organizationId: orgId, name: { in: PURCHASE_PERMS } },
    select: {
      name: true,
      rolePermissions: {
        where: { granted: true },
        select: { role: { select: { name: true } } },
      },
    },
  });
  console.log(`\n=== EXISTING PURCHASE PERMISSIONS ===`);
  for (const p of PURCHASE_PERMS) {
    const row = perms.find((x) => x.name === p);
    if (!row) {
      console.log(`  • ${p}: not created yet`);
    } else {
      const granted = row.rolePermissions.map((rp) => rp.role?.name).filter(Boolean);
      console.log(`  • ${p}: granted to [${granted.join(", ") || "no roles"}]`);
    }
  }

  const routes = await prisma.routePermission.findMany({
    where: { organizationId: orgId },
    select: { pattern: true },
    orderBy: { pattern: "asc" },
  });
  const relevant = routes.filter((r) => /purchase|inventory|account/i.test(r.pattern));
  console.log(`\n=== ROUTE PERMISSION RULES (${routes.length} total) ===`);
  if (routes.length === 0) {
    console.log("  (none) → every page is OPEN to all roles by default.");
  } else {
    console.log(`  purchase/inventory/accounts patterns with explicit rules:`);
    if (relevant.length === 0) console.log("    (none — those pages are OPEN by default)");
    for (const r of relevant) console.log(`    • ${r.pattern}`);
  }

  console.log("\nDone (read-only — nothing was changed).\n");
}

main()
  .catch((e) => {
    console.error("\n✗ Failed:", e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
