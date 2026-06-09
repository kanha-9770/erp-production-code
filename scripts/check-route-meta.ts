/**
 * Show a user's computed route access (allowed / denied) — replicates
 * computeRouteMeta so we can confirm the DB rules resolve correctly without
 * the app. Diagnoses "why does X still see page Y".
 *
 *   npx tsx scripts/check-route-meta.ts --orgId <id> --email user@x.com
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

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
    },
  });
  if (!user) throw new Error(`No user ${email} in org`);
  const who = [user.first_name, user.last_name].filter(Boolean).join(" ") || email;
  const isAdmin = !!user.ownedOrganization || user.unitAssignments.some(
    (a) => a.role?.isAdmin || (a.role?.name ?? "").toLowerCase().includes("admin"));
  const roleIds = Array.from(new Set(user.unitAssignments.map((a) => a.roleId)));
  console.log(`\n${who}  roles=[${user.unitAssignments.map((a) => a.role?.name).join(", ")}]  admin=${isAdmin}`);
  if (isAdmin) { console.log("→ ADMIN bypass: sees everything.\n"); return; }

  const rules = await prisma.routePermission.findMany({
    where: { organizationId: orgId },
    select: { pattern: true, roleAccess: { select: { roleId: true, granted: true } }, userAccess: { select: { userId: true, granted: true } } },
    orderBy: { pattern: "asc" },
  });

  const allowed: string[] = [], denied: string[] = [];
  for (const rp of rules) {
    if (rp.roleAccess.length === 0 && rp.userAccess.length === 0) continue; // open
    const ue = rp.userAccess.find((u) => u.userId === user.id);
    if (ue) { (ue.granted ? allowed : denied).push(rp.pattern); continue; }
    const grant = rp.roleAccess.some((ra) => roleIds.includes(ra.roleId) && ra.granted);
    (grant ? allowed : denied).push(rp.pattern);
  }

  console.log(`\n  ALLOWED (visible):`);
  allowed.filter((p) => /purchase|inventory/.test(p)).forEach((p) => console.log(`    ✓ ${p}`));
  console.log(`\n  DENIED (hidden + blocked):`);
  denied.filter((p) => /purchase|inventory/.test(p)).forEach((p) => console.log(`    ✗ ${p}`));
  console.log(`\n  (pages with NO rule are open to all — e.g. /purchase-management/requisition)\n`);
}
main().catch((e) => { console.error("✗", e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
