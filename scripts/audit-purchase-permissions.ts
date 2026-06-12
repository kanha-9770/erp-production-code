/**
 * Full picture of WHO can do WHAT in the purchase module, straight from the DB.
 * Dumps every role's grants, every user's resolved verdict (mirroring
 * hasPermission exactly), and every stray user-override — so we can see at a
 * glance why a granted permission is / isn't producing buttons.
 *
 *   npx tsx scripts/audit-purchase-permissions.ts --orgId <id>
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const PERMS = [
  "APPROVE_PURCHASE_REQUISITION",
  "APPROVE_PURCHASE_ORDER",
  "POST_GRN_STOCK",
  "RAISE_PAYMENT_REQUEST",
  "APPROVE_PAYMENT_REQUEST",
  "PROCESS_PURCHASE",
];

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const n = argv[i + 1];
    if (n && !n.startsWith("--")) { a[argv[i].slice(2)] = n; i++; }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgId = args.orgId;
  if (!orgId) throw new Error("Provide --orgId");

  // ── Permission rows that exist for this org ──────────────────────────────
  const permRows = await prisma.permission.findMany({
    where: { name: { in: PERMS }, organizationId: orgId },
    select: { id: true, name: true, isActive: true },
  });
  console.log(`\n=== Permission rows in org (must be isActive) ===`);
  for (const name of PERMS) {
    const r = permRows.find((p) => p.name === name);
    console.log(`  ${r ? (r.isActive ? "✅ active" : "⚠️ INACTIVE") : "❌ MISSING"}  ${name}`);
  }

  // ── Roles + which perms each grants ──────────────────────────────────────
  const roles = await prisma.role.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, isAdmin: true },
    orderBy: { name: "asc" },
  });
  const roleGrants = await prisma.rolePermission.findMany({
    where: { granted: true, role: { organizationId: orgId }, permission: { name: { in: PERMS } } },
    select: { roleId: true, permission: { select: { name: true } } },
  });
  console.log(`\n=== Roles → granted purchase permissions ===`);
  for (const role of roles) {
    const granted = roleGrants.filter((g) => g.roleId === role.id).map((g) => g.permission?.name);
    const tag = role.isAdmin || role.name.toLowerCase().includes("admin") ? " [ADMIN → all]" : "";
    console.log(`  ${role.name}${tag}`);
    console.log(`    ${granted.length ? granted.join(", ") : "(no purchase grants)"}`);
  }

  // ── Users → resolved verdict per perm (mirror hasPermission) ─────────────
  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: {
      id: true, first_name: true, last_name: true, email: true,
      ownedOrganization: { select: { id: true } },
      unitAssignments: { select: { roleId: true, role: { select: { name: true, isAdmin: true } } } },
      permissionOverrides: {
        where: { permission: { name: { in: PERMS } } },
        select: { granted: true, expiresAt: true, permission: { select: { name: true } } },
      },
    },
    orderBy: { first_name: "asc" },
  });

  const now = new Date();
  console.log(`\n=== Users → resolved purchase verdicts ===`);
  for (const u of users) {
    const who = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
    const roleNames = u.unitAssignments.map((a) => a.role?.name).filter(Boolean);
    const isAdmin = !!u.ownedOrganization || u.unitAssignments.some(
      (a) => a.role?.isAdmin || (a.role?.name ?? "").toLowerCase().includes("admin"));
    const roleIds = Array.from(new Set(u.unitAssignments.map((a) => a.roleId)));

    const verdicts: string[] = [];
    for (const name of PERMS) {
      let v: boolean;
      if (isAdmin) v = true;
      else {
        const ov = u.permissionOverrides.filter((o) => o.permission?.name === name && (!o.expiresAt || o.expiresAt > now));
        if (ov.some((o) => !o.granted)) v = false;
        else if (ov.some((o) => o.granted)) v = true;
        else {
          const g = await prisma.rolePermission.findFirst({
            where: { roleId: { in: roleIds }, granted: true, permission: { name, organizationId: orgId, isActive: true } },
            select: { id: true },
          });
          v = !!g;
        }
      }
      if (v) verdicts.push(name.replace("PURCHASE_", "").replace("_PURCHASE", ""));
    }
    console.log(`  ${who.padEnd(22)} [${roleNames.join(", ") || "no role"}]${isAdmin ? " ADMIN" : ""}`);
    console.log(`    can: ${verdicts.length ? verdicts.join(", ") : "— nothing (pure requester)"}`);
    if (u.permissionOverrides.length) {
      console.log(`    overrides: ${u.permissionOverrides.map((o) => `${o.granted ? "+" : "-"}${o.permission?.name}`).join(", ")}`);
    }
  }
  console.log();
}
main().catch((e) => { console.error("✗", e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
