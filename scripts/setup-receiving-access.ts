/**
 * Set up COMPLETE access for the gate-entry receiving workflow for a role —
 * both halves that the UI manages on two different pages:
 *
 *   1. ACTION permission (RolePermission, org-level) — may the role act on a
 *      workflow stage? (GRN_GATE_ENTRY / GRN_QC_INSPECTION / GRN_STORE_INSPECTION
 *      / POST_GRN_STOCK — the Approvals & Permissions page)
 *   2. PAGE access (RoutePermission + RouteRoleAccess) — does the role SEE the
 *      Gate Entry / GRN tab? (the sidebar's isPermitted() whitelist — the
 *      Route permissions page)
 *
 * Granting only #1 leaves the tab invisible; only #2 leaves the stage buttons
 * locked. This script does both, idempotently, and prints a full diagnostic.
 *
 * Usage
 * -----
 *   # Diagnose only (no writes):
 *   npx tsx scripts/setup-receiving-access.ts --role Sales --stage qc
 *
 *   # Apply:
 *   npx tsx scripts/setup-receiving-access.ts --role Sales --stage qc --apply
 *   npx tsx scripts/setup-receiving-access.ts --role "Store Keeper" --stage store --apply
 *   npx tsx scripts/setup-receiving-access.ts --role "Store Keeper" --stage post --apply
 *   npx tsx scripts/setup-receiving-access.ts --role "Gate Security" --stage gate --apply
 *   npx tsx scripts/setup-receiving-access.ts --role Admin --stage all --apply
 *
 *   --org "<name|id>" picks the organization when there is more than one.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Stage → action permission + the page(s) the role must see for that stage.
const STAGES: Record<string, { perm: string; description: string; pages: string[] }> = {
  gate: {
    perm: "GRN_GATE_ENTRY",
    description:
      "Gate Entry stage 1 — log the gate inward (arrival, vehicle/challan, items, gate inspection) and forward it. Grant to gate/security roles.",
    pages: ["/purchase-management/gate-entry"],
  },
  qc: {
    perm: "GRN_QC_INSPECTION",
    description:
      "Gate Entry stage 2 — perform the purchase/quality (QC) inspection on a forwarded gate entry and forward it. Grant to QC / purchase-inspection roles.",
    pages: ["/purchase-management/gate-entry"],
  },
  store: {
    perm: "GRN_STORE_INSPECTION",
    description:
      "Gate Entry stage 3 — store/inventory inspection, confirm quantities and clear the gate entry for GRN. Grant to store/warehouse roles.",
    pages: ["/purchase-management/gate-entry"],
  },
  post: {
    perm: "POST_GRN_STOCK",
    description:
      "Store incharge: create a GRN from a cleared gate entry and post its quantities into store inventory. Grant to store-keeper / warehouse roles.",
    pages: ["/purchase-management/gate-entry", "/purchase-management/grn"],
  },
};

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else args[key] = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = !!args.apply;
  const stageArg = String(args.stage ?? "").toLowerCase();
  const roleArg = typeof args.role === "string" ? args.role : "";

  const stages =
    stageArg === "all" ? Object.keys(STAGES) : STAGES[stageArg] ? [stageArg] : null;
  if (!stages || !roleArg) {
    console.log("Usage: npx tsx scripts/setup-receiving-access.ts --role <name> --stage <gate|qc|store|post|all> [--org <name|id>] [--apply]");
    process.exit(1);
  }

  // ── Resolve organization ───────────────────────────────────────────────────
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`\nOrganizations (${orgs.length}):`);
  for (const o of orgs) console.log(`  - ${o.name} (${o.id})`);
  let org = orgs[0];
  if (typeof args.org === "string") {
    const want = args.org.toLowerCase();
    const found = orgs.find((o) => o.id === args.org || o.name.toLowerCase() === want);
    if (!found) throw new Error(`No organization matching "${args.org}"`);
    org = found;
  } else if (orgs.length > 1) {
    throw new Error(`Multiple organizations — pick one with --org "<name>"`);
  }
  if (!org) throw new Error("No organization found");
  console.log(`\nUsing organization: ${org.name}`);

  // ── Resolve role ───────────────────────────────────────────────────────────
  const roles = await prisma.role.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, isAdmin: true, isActive: true },
    orderBy: { name: "asc" },
  });
  console.log(`\nRoles in org (${roles.length}):`);
  for (const r of roles)
    console.log(`  - ${r.name}${r.isAdmin ? "  [ADMIN — bypasses all checks]" : ""}${r.isActive === false ? "  [INACTIVE]" : ""}`);
  const role = roles.find((r) => r.name.toLowerCase() === roleArg.toLowerCase());
  if (!role) throw new Error(`No role named "${roleArg}" in "${org.name}"`);
  console.log(`\nTarget role: ${role.name} (${role.id})`);
  if (role.isAdmin)
    console.log("  ℹ This role is ADMIN — it already bypasses every check; grants are for audit only.");

  // ── Diagnose current state ─────────────────────────────────────────────────
  const permNames = stages.map((s) => STAGES[s].perm);
  const permRows = await prisma.permission.findMany({
    where: { name: { in: permNames } },
    select: { id: true, name: true, organizationId: true },
  });
  console.log(`\nPermission rows:`);
  for (const name of permNames) {
    const row = permRows.find((p) => p.name === name);
    if (!row) console.log(`  - ${name}: MISSING (will create)`);
    else if (row.organizationId !== org.id)
      console.log(`  - ${name}: ⚠ owned by ANOTHER org (${row.organizationId}) — name is globally unique, cannot manage here`);
    else console.log(`  - ${name}: exists (${row.id})`);
  }

  const pages = [...new Set(stages.flatMap((s) => STAGES[s].pages))];
  const routeRows = await prisma.routePermission.findMany({
    where: { organizationId: org.id, pattern: { in: pages } },
    select: { id: true, pattern: true, roleAccess: { select: { roleId: true, granted: true } } },
  });
  console.log(`\nRoute (page) permission rows:`);
  for (const p of pages) {
    const row = routeRows.find((r) => r.pattern === p);
    if (!row) console.log(`  - ${p}: no row (will create + grant)`);
    else {
      const mine = row.roleAccess.find((ra) => ra.roleId === role.id);
      console.log(`  - ${p}: exists; ${role.name} → ${mine ? (mine.granted ? "GRANTED" : "DENIED ⚠") : "no rule (will grant)"}`);
    }
  }

  if (!apply) {
    console.log(`\nDry run only — re-run with --apply to write the grants above.`);
    return;
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  console.log(`\nApplying…`);
  for (const s of stages) {
    const def = STAGES[s];

    // 1. Ensure the Permission row for this org.
    let perm = await prisma.permission.findFirst({
      where: { name: def.perm },
      select: { id: true, organizationId: true },
    });
    if (!perm) {
      perm = await prisma.permission.create({
        data: {
          name: def.perm,
          description: def.description,
          category: "SPECIAL",
          resource: "purchase",
          organizationId: org.id,
          isActive: true,
        },
        select: { id: true, organizationId: true },
      });
      console.log(`  ✓ Created Permission ${def.perm}`);
    } else if (perm.organizationId !== org.id) {
      console.log(`  ✗ ${def.perm} owned by another org — SKIPPED (rename or delete the foreign row first)`);
      continue;
    }

    // 2. Org-level RolePermission grant (all scope fields null) — what
    //    hasPermission() resolves.
    const existing = await prisma.rolePermission.findFirst({
      where: {
        roleId: role.id,
        permissionId: perm.id,
        moduleId: null,
        formId: null,
        sectionId: null,
        formFieldId: null,
        pagePath: null,
      },
      select: { id: true, granted: true },
    });
    if (existing?.granted) console.log(`  ℹ ${def.perm} → ${role.name}: already granted`);
    else if (existing) {
      await prisma.rolePermission.update({ where: { id: existing.id }, data: { granted: true } });
      console.log(`  ✓ ${def.perm} → ${role.name}: flipped granted=true`);
    } else {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id, granted: true } });
      console.log(`  ✓ ${def.perm} → ${role.name}: granted`);
    }

    // 3. Page access: RoutePermission row + RouteRoleAccess(granted) so the
    //    sidebar tab shows (isPermitted whitelist) and middleware allows it.
    for (const pattern of def.pages) {
      const route = await prisma.routePermission.upsert({
        where: { pattern_organizationId: { pattern, organizationId: org.id } },
        create: { pattern, organizationId: org.id, description: pattern.split("/").pop() },
        update: {},
        select: { id: true },
      });
      await prisma.routeRoleAccess.upsert({
        where: { routePermissionId_roleId: { routePermissionId: route.id, roleId: role.id } },
        create: { routePermissionId: route.id, roleId: role.id, granted: true },
        update: { granted: true },
      });
      console.log(`  ✓ Page ${pattern} → ${role.name}: visible`);
    }
  }

  console.log(`\nDone. Users in "${role.name}" must LOG OUT and BACK IN (auth-meta refresh) to see the change.`);
}

main()
  .catch((e) => {
    console.error("\n✗ Failed:", e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
