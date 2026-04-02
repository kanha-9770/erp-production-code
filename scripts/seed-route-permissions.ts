/**
 * Seed Route Permissions
 *
 * Seeds all static application routes into the RoutePermission table.
 * Safe to run multiple times — uses upsert (skips existing routes).
 *
 * Usage:
 *   npx tsx scripts/seed-route-permissions.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── All static routes in the app (excluding public/auth pages) ──────────────

const STATIC_ROUTES: { pattern: string; description: string }[] = [
  // ─── Root ──────────────────────────────────────────────────────────────
  { pattern: "/", description: "Home / Dashboard" },

  // ─── Admin ─────────────────────────────────────────────────────────────
  { pattern: "/admin", description: "Admin panel home" },
  { pattern: "/admin/analytics", description: "Analytics dashboard" },
  { pattern: "/admin/analytics/settings", description: "Analytics settings" },
  { pattern: "/admin/chatbot", description: "AI Chatbot" },
  { pattern: "/admin/dashboard", description: "Admin dashboard" },
  { pattern: "/admin/intelligence", description: "Intelligence dashboard" },
  { pattern: "/admin/modules", description: "Module management" },
  { pattern: "/admin/reports", description: "Reports" },
  { pattern: "/admin/settings", description: "Admin settings" },
  { pattern: "/admin/users", description: "User management (admin)" },

  // ─── Chatbot ───────────────────────────────────────────────────────────
  { pattern: "/chatbot", description: "Chatbot" },

  // ─── Data Migration ────────────────────────────────────────────────────
  { pattern: "/data-migration/export", description: "Data export" },
  { pattern: "/data-migration/import", description: "Data import" },

  // ─── Formulas ──────────────────────────────────────────────────────────
  { pattern: "/formulas/demo", description: "Formula demo" },

  // ─── Payroll ───────────────────────────────────────────────────────────
  { pattern: "/payroll", description: "Payroll" },

  // ─── Profile ───────────────────────────────────────────────────────────
  { pattern: "/profile/security", description: "Security settings" },
  { pattern: "/profile/update-profile", description: "Update profile" },

  // ─── Settings ──────────────────────────────────────────────────────────
  { pattern: "/settings", description: "Settings home" },
  { pattern: "/settings/audit-log", description: "Audit log" },
  { pattern: "/settings/company", description: "Company settings" },
  { pattern: "/settings/import", description: "Import data" },
  { pattern: "/settings/login-history", description: "Login history" },
  { pattern: "/settings/masters", description: "Masters configuration" },
  { pattern: "/settings/permission", description: "Permission management" },
  { pattern: "/settings/permission/roles", description: "Role-based permissions" },
  { pattern: "/settings/permission/route", description: "Route-based permissions" },
  { pattern: "/settings/profiles", description: "Profile settings" },
  { pattern: "/settings/users", description: "Users list" },
  { pattern: "/settings/users/user-management", description: "User management" },
  // ─── Standalone ────────────────────────────────────────────────────────
  { pattern: "/StandaloneTable", description: "Standalone table view" },
];

async function seedRoutePermissions() {
  console.log("=".repeat(60));
  console.log("  Seed Route Permissions");
  console.log("=".repeat(60));

  // 1. Find all organizations
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });

  if (orgs.length === 0) {
    console.error("\n  No organizations found. Create one first.\n");
    process.exit(1);
  }

  console.log(`\n  Found ${orgs.length} organization(s):`);
  orgs.forEach((o) => console.log(`    - ${o.name} (${o.id})`));

  let totalCreated = 0;
  let totalSkipped = 0;

  // 2. Seed routes for each organization
  for (const org of orgs) {
    console.log(`\n  Seeding routes for "${org.name}"...`);

    let created = 0;
    let skipped = 0;

    for (const route of STATIC_ROUTES) {
      try {
        await prisma.routePermission.upsert({
          where: {
            pattern_organizationId: {
              pattern: route.pattern,
              organizationId: org.id,
            },
          },
          update: {}, // Don't overwrite existing records
          create: {
            pattern: route.pattern,
            description: route.description,
            organizationId: org.id,
          },
        });
        created++;
      } catch (e: any) {
        // Already exists (race condition) — skip
        if (e.code === "P2002") {
          skipped++;
        } else {
          console.error(`    Failed: ${route.pattern} — ${e.message}`);
          skipped++;
        }
      }
    }

    // The upsert doesn't tell us if it was created or updated,
    // so count existing to determine
    const existing = await prisma.routePermission.count({
      where: { organizationId: org.id },
    });

    console.log(`    ${existing} total routes in DB for this org`);
    totalCreated += created;
    totalSkipped += skipped;
  }

  // 3. Summary
  const total = await prisma.routePermission.count();
  console.log(`\n  Done!`);
  console.log(`  Total RoutePermission records in DB: ${total}`);
  console.log("=".repeat(60));
}

seedRoutePermissions()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
