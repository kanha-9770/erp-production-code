/**
 * Restrict purchase/inventory pages to specific roles (idempotent).
 *
 * Creates a RoutePermission rule for each restricted page and grants it to the
 * mapped roles via RouteRoleAccess. A page WITH a rule is hidden from the
 * sidebar and blocked on direct URL for anyone not granted (admins bypass). A
 * page with NO rule stays open to all — so the Requisition page (and the
 * landing) are intentionally left out.
 *
 *   npx tsx scripts/setup-page-access.ts --orgId cmpdz3sk4000dqk0jux23u57m
 *   npx tsx scripts/setup-page-access.ts --orgId <id> --dry
 *
 * Adjust grants afterwards in the app at /settings/permission/route.
 * Users see the change within ~60s (perm-version poll) or on next login.
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// path → roles (by name) allowed to see it. Requisition + landing omitted = open.
const PAGE_ACCESS: Array<{ path: string; roles: string[] }> = [
  // Purchase — buyer pages
  { path: "/purchase-management/suppliers", roles: ["Purchase Manager"] },
  { path: "/purchase-management/sourcing", roles: ["Purchase Manager"] },
  // Store Keeper sees POs (read) so they can receive against them (Receive GRN).
  { path: "/purchase-management/purchase-order", roles: ["Purchase Manager", "Store Keeper"] },
  { path: "/purchase-management/open-po", roles: ["Purchase Manager", "Store Keeper"] },
  { path: "/purchase-management/master", roles: ["Purchase Manager"] },
  // Purchase — store receiving
  { path: "/purchase-management/grn", roles: ["Store Keeper", "Purchase Manager"] },
  // Purchase — accounts payable
  { path: "/purchase-management/payment-request", roles: ["Purchase Manager", "Account head", "Account Manager"] },
  // Inventory
  { path: "/inventory-management/store-inventory", roles: ["Store Keeper", "Logistic Manager"] },
  { path: "/inventory-management/inward", roles: ["Store Keeper", "Logistic Manager"] },
  { path: "/inventory-management/outward", roles: ["Store Keeper", "Logistic Manager"] },
  { path: "/inventory-management/machine-inventory", roles: ["Store Keeper"] },
  { path: "/inventory-management/metal-inventory", roles: ["Store Keeper"] },
  { path: "/inventory-management/master", roles: ["Store Keeper"] },
];

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
  const dry = !!args.dry;
  if (!orgId) throw new Error("Provide --orgId <id>");
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  if (!org) throw new Error(`No organization "${orgId}"`);

  // Resolve all referenced roles once.
  const roleNames = Array.from(new Set(PAGE_ACCESS.flatMap((p) => p.roles)));
  const roles = await prisma.role.findMany({
    where: { organizationId: orgId, name: { in: roleNames } },
    select: { id: true, name: true },
  });
  const roleId = new Map(roles.map((r) => [r.name, r.id]));
  const missing = roleNames.filter((n) => !roleId.has(n));
  if (missing.length) console.log(`  ⚠ roles not found (grants skipped): ${missing.join(", ")}`);

  console.log(`\n${dry ? "[DRY] " : ""}Restricting pages for "${org.name}"  (Requisition stays open)\n`);

  for (const page of PAGE_ACCESS) {
    const grantRoles = page.roles.filter((n) => roleId.has(n));
    if (dry) {
      console.log(`  [dry] ${page.path} → [${grantRoles.join(", ")}]`);
      continue;
    }
    // Upsert the rule.
    const rule = await prisma.routePermission.upsert({
      where: { pattern_organizationId: { pattern: page.path, organizationId: orgId } },
      create: { pattern: page.path, organizationId: orgId, description: "Restricted purchase/inventory page" },
      update: {},
      select: { id: true },
    });
    // Grant each role.
    for (const name of grantRoles) {
      const rid = roleId.get(name)!;
      await prisma.routeRoleAccess.upsert({
        where: { routePermissionId_roleId: { routePermissionId: rule.id, roleId: rid } },
        create: { routePermissionId: rule.id, roleId: rid, granted: true },
        update: { granted: true },
      });
    }
    console.log(`  ✓ ${page.path} → [${grantRoles.join(", ")}]`);
  }

  console.log(
    `\n${dry ? "Dry run — nothing written." : "Done."} Non-granted users lose these pages within ~60s (perm-version poll) or on next login. Admins keep full access.\n`,
  );
}

main()
  .catch((e) => { console.error("\n✗ Failed:", e?.message || e); process.exit(1); })
  .finally(() => prisma.$disconnect());
