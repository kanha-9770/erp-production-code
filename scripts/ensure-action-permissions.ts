/**
 * Ensure the action-permission catalog's Permission rows exist for an org, and
 * report current grants. Mirrors the lazy ensure the /api/action-permissions
 * GET does — running it pre-warms the data and verifies the global-unique
 * Permission.name constraint doesn't collide for this org.
 *
 *   npx tsx scripts/ensure-action-permissions.ts --orgId cmpdz3sk4000dqk0jux23u57m
 *
 * Kept self-contained (no @/ imports) like the other scripts. Keep the CATALOG
 * list in sync with lib/permissions/action-catalog.ts.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATALOG: Array<{ name: string; description: string; resource: string }> = [
  { name: "APPROVE_PURCHASE_REQUISITION", description: "Approve or reject purchase requisitions.", resource: "purchase" },
  { name: "APPROVE_PURCHASE_ORDER", description: "Approve or reject purchase orders.", resource: "purchase" },
  { name: "POST_GRN_STOCK", description: "Receive goods and post a GRN into store inventory.", resource: "purchase" },
  { name: "RAISE_PAYMENT_REQUEST", description: "Raise a payment request against a PO/GRN.", resource: "purchase" },
  { name: "PROCESS_PURCHASE", description: "Buyer: raise RFQs, create/convert POs, manage suppliers, edit & delete purchase docs.", resource: "purchase" },
  { name: "POST_INVENTORY_MOVEMENT", description: "Post/edit/delete goods movements (changes stock).", resource: "inventory" },
  { name: "DELETE_INVENTORY_ITEM", description: "Delete inventory items (single or bulk).", resource: "inventory" },
  { name: "RESET_INVENTORY_DATA", description: "Wipe and reseed all inventory data.", resource: "inventory" },
  { name: "APPROVE_SALES_INVOICE", description: "Approve an AR sales invoice.", resource: "accounts" },
  { name: "APPROVE_PAYMENT_VOUCHER", description: "Approve an outgoing payment voucher.", resource: "accounts" },
  { name: "APPROVE_EXPENSE_VOUCHER", description: "Approve an employee expense claim.", resource: "accounts" },
  { name: "POST_JOURNAL_VOUCHER", description: "Post a manual GL journal entry.", resource: "accounts" },
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
  if (!orgId) throw new Error("Provide --orgId <id>");
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  if (!org) throw new Error(`No organization "${orgId}"`);

  console.log(`\nEnsuring action permissions for "${org.name}"\n`);
  const idByName = new Map<string, string>();

  for (const def of CATALOG) {
    const existing = await prisma.permission.findUnique({
      where: { name: def.name },
      select: { id: true, organizationId: true },
    });
    if (existing) {
      if (existing.organizationId === orgId) {
        idByName.set(def.name, existing.id);
        console.log(`  ✓ ${def.name} — already exists`);
      } else {
        console.log(`  ⚠ ${def.name} — owned by ANOTHER org (global-unique name); cannot manage here`);
      }
      continue;
    }
    const created = await prisma.permission.create({
      data: { name: def.name, description: def.description, category: "SPECIAL", resource: def.resource, organizationId: orgId, isActive: true },
      select: { id: true },
    });
    idByName.set(def.name, created.id);
    console.log(`  + ${def.name} — created (${created.id})`);
  }

  console.log(`\nCurrent grants:`);
  for (const def of CATALOG) {
    const pid = idByName.get(def.name);
    if (!pid) continue;
    const [roleRows, userRows] = await Promise.all([
      prisma.rolePermission.findMany({
        where: { permissionId: pid, granted: true, moduleId: null, formId: null, sectionId: null, formFieldId: null, pagePath: null, role: { organizationId: orgId } },
        select: { role: { select: { name: true } } },
      }),
      prisma.userPermissionOverride.findMany({
        where: { permissionId: pid, granted: true, user: { organizationId: orgId } },
        select: { user: { select: { first_name: true, last_name: true, email: true } } },
      }),
    ]);
    const roles = roleRows.map((r) => r.role?.name).filter(Boolean);
    const users = userRows.map((u) => [u.user?.first_name, u.user?.last_name].filter(Boolean).join(" ") || u.user?.email);
    console.log(`  • ${def.name}: roles=[${roles.join(", ")}] users=[${users.join(", ")}]`);
  }

  console.log(`\nDone.\n`);
}

main()
  .catch((e) => { console.error("\n✗ Failed:", e?.message || e); process.exit(1); })
  .finally(() => prisma.$disconnect());
