/**
 * Seed Route Whitelist
 * =====================
 *
 * Companion to the sidebar's WHITELIST gating (see components/layout/sidebar.tsx
 * → `canViewPage` uses `isPermitted`). With whitelist mode a static page is
 * hidden unless the user's role has an explicit grant — so without seeding,
 * every non-admin's sidebar would go blank. This script reproduces what each
 * role saw under the OLD open-by-default model, so the flip is a no-op for
 * existing users; admins then PRUNE per role in Settings → Permission → Route.
 *
 * What it does, per organization:
 *   1. Ensures a RoutePermission row exists for every page in STATIC_PAGES
 *      (so they are all manageable in the Route Permissions UI).
 *   2. Grants every NON-`adminOnly` page to every NON-admin role
 *      (RouteRoleAccess { granted: true }). `adminOnly` pages are intentionally
 *      left ungranted — they stay admin-only, exactly as before.
 *
 * Properties:
 *   - IDEMPOTENT: re-running only fills gaps (skipDuplicates); it never
 *     overwrites an existing grant/deny, so manual pruning is preserved.
 *   - BULK: ~5 queries per org regardless of page/role count (the DB pooler is
 *     ~1.3s/round-trip, so per-row upserts would be painfully slow).
 *
 * Run order at deploy:  seed FIRST, then ship the sidebar change.
 *
 * Usage:
 *   npm run seed:route-whitelist
 *   (or:  npx tsx scripts/seed-route-whitelist.ts)
 */

import { PrismaClient } from "@prisma/client";
import { STATIC_PAGES } from "../lib/static-pages";

const prisma = new PrismaClient();

async function seedOrg(org: { id: string; name: string }) {
  const allPaths = STATIC_PAGES.map((p) => p.path);

  // ── 1. Ensure a RoutePermission row exists for every static page ──────────
  const existing = await prisma.routePermission.findMany({
    where: { organizationId: org.id, pattern: { in: allPaths } },
    select: { pattern: true },
  });
  const existingPatterns = new Set(existing.map((r) => r.pattern));
  const missing = STATIC_PAGES.filter((p) => !existingPatterns.has(p.path));

  if (missing.length) {
    await prisma.routePermission.createMany({
      data: missing.map((p) => ({
        pattern: p.path,
        description: p.description ?? p.label,
        organizationId: org.id,
      })),
      skipDuplicates: true,
    });
  }

  // Re-fetch to map every static-page path → its RoutePermission id.
  const routes = await prisma.routePermission.findMany({
    where: { organizationId: org.id, pattern: { in: allPaths } },
    select: { id: true, pattern: true },
  });
  const idByPattern = new Map(routes.map((r) => [r.pattern, r.id]));

  // ── 2. Grant non-adminOnly pages to every non-admin role ──────────────────
  const roles = await prisma.role.findMany({
    where: { organizationId: org.id, isAdmin: false },
    select: { id: true, name: true },
  });

  if (roles.length === 0) {
    console.log(`    no non-admin roles — nothing to grant`);
    return { created: missing.length, grants: 0 };
  }

  const grantableRouteIds = STATIC_PAGES.filter((p) => !p.adminOnly)
    .map((p) => idByPattern.get(p.path))
    .filter((id): id is string => Boolean(id));

  // Existing grants/denies — so we only ADD missing rows (preserves pruning).
  const existingGrants = await prisma.routeRoleAccess.findMany({
    where: { routePermissionId: { in: grantableRouteIds } },
    select: { routePermissionId: true, roleId: true },
  });
  const key = (rid: string, roleId: string) => `${rid}::${roleId}`;
  const have = new Set(existingGrants.map((g) => key(g.routePermissionId, g.roleId)));

  const toCreate: { routePermissionId: string; roleId: string; granted: boolean }[] = [];
  for (const rid of grantableRouteIds) {
    for (const role of roles) {
      if (!have.has(key(rid, role.id))) {
        toCreate.push({ routePermissionId: rid, roleId: role.id, granted: true });
      }
    }
  }

  if (toCreate.length) {
    await prisma.routeRoleAccess.createMany({ data: toCreate, skipDuplicates: true });
  }

  return { created: missing.length, grants: toCreate.length };
}

async function main() {
  console.log("=".repeat(60));
  console.log("  Seed Route Whitelist (preserve current sidebar visibility)");
  console.log("=".repeat(60));

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  if (orgs.length === 0) {
    console.error("\n  No organizations found. Create one first.\n");
    process.exit(1);
  }

  console.log(`\n  ${STATIC_PAGES.length} static pages in registry`);
  console.log(`  ${STATIC_PAGES.filter((p) => !p.adminOnly).length} grantable (non-adminOnly)\n`);

  for (const org of orgs) {
    console.log(`  Org "${org.name}" (${org.id})`);
    const { created, grants } = await seedOrg(org);
    console.log(`    + ${created} route row(s) created, ${grants} role grant(s) added`);
  }

  console.log("\n  Done. Non-admin sidebars now match the pre-whitelist view.");
  console.log("  Next: prune per role in Settings → Permission → Route.");
  console.log("=".repeat(60));
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
