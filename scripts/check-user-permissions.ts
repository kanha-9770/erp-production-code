/**
 * Resolve a user's named-permission access exactly as hasPermission() does
 * (admin bypass → user override → role grant). Confirms who can do what.
 *
 *   npx tsx scripts/check-user-permissions.ts --orgId <id> --email user@x.com
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
  "POST_INVENTORY_MOVEMENT",
  "DELETE_INVENTORY_ITEM",
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
  const orgId = args.orgId, email = args.email;
  if (!orgId || !email) throw new Error("Provide --orgId and --email");

  const user = await prisma.user.findFirst({
    where: { organizationId: orgId, email: { equals: email, mode: "insensitive" } },
    select: {
      id: true, first_name: true, last_name: true,
      ownedOrganization: { select: { id: true } },
      unitAssignments: { select: { roleId: true, role: { select: { name: true, isAdmin: true } } } },
      permissionOverrides: { select: { granted: true, expiresAt: true, permission: { select: { name: true } } } },
    },
  });
  if (!user) throw new Error(`No user ${email}`);
  const who = [user.first_name, user.last_name].filter(Boolean).join(" ") || email;
  const roleNames = user.unitAssignments.map((a) => a.role?.name);
  const isAdmin = !!user.ownedOrganization || user.unitAssignments.some(
    (a) => a.role?.isAdmin || (a.role?.name ?? "").toLowerCase().includes("admin"));
  const roleIds = Array.from(new Set(user.unitAssignments.map((a) => a.roleId)));
  const now = new Date();

  console.log(`\n${who}  roles=[${roleNames.join(", ")}]  admin=${isAdmin}\n`);

  for (const name of PERMS) {
    let verdict: string;
    if (isAdmin) {
      verdict = "ALLOW (admin bypass)";
    } else {
      const ov = user.permissionOverrides.filter((o) => o.permission?.name === name && (!o.expiresAt || o.expiresAt > now));
      if (ov.some((o) => !o.granted)) verdict = "DENY (user override)";
      else if (ov.some((o) => o.granted)) verdict = "ALLOW (user override)";
      else {
        const grant = await prisma.rolePermission.findFirst({
          where: { roleId: { in: roleIds }, granted: true, permission: { name, organizationId: orgId, isActive: true } },
          select: { role: { select: { name: true } } },
        });
        verdict = grant ? `ALLOW (role: ${grant.role?.name})` : "DENY (no grant)";
      }
    }
    const ok = verdict.startsWith("ALLOW");
    console.log(`  ${ok ? "✅" : "🚫"}  ${name.padEnd(28)} → ${verdict}`);
  }
  console.log();
}
main().catch((e) => { console.error("✗", e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
