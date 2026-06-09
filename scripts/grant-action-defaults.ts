/**
 * Grant sensible DEFAULT action permissions to roles so the gated buttons work
 * out of the box for the configured team. Idempotent. Refine later on the
 * Approvals & Permissions page (/settings/permission/approvals).
 *
 *   npx tsx scripts/grant-action-defaults.ts --orgId cmpdz3sk4000dqk0jux23u57m
 *
 * Mapping:
 *   Purchase Manager → PROCESS_PURCHASE, RAISE_PAYMENT_REQUEST  (buyer + AP)
 *   Store Keeper     → POST_INVENTORY_MOVEMENT, DELETE_INVENTORY_ITEM
 * (Approver already has APPROVE_PURCHASE_REQUISITION; Purchase Manager already
 *  has APPROVE_PURCHASE_ORDER; Store Keeper already has POST_GRN_STOCK.)
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const PERMS: Record<string, { description: string; resource: string }> = {
  PROCESS_PURCHASE: { description: "Buyer: raise RFQs, create/convert POs, manage suppliers, edit & delete purchase docs.", resource: "purchase" },
  RAISE_PAYMENT_REQUEST: { description: "Raise a payment request against a PO/GRN.", resource: "purchase" },
  POST_INVENTORY_MOVEMENT: { description: "Post/edit/delete goods movements (changes stock).", resource: "inventory" },
  DELETE_INVENTORY_ITEM: { description: "Delete inventory items (single or bulk).", resource: "inventory" },
};

const GRANTS: Array<{ role: string; perms: string[] }> = [
  { role: "Purchase Manager", perms: ["PROCESS_PURCHASE", "RAISE_PAYMENT_REQUEST"] },
  { role: "Store Keeper", perms: ["POST_INVENTORY_MOVEMENT", "DELETE_INVENTORY_ITEM"] },
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

async function ensurePerm(orgId: string, name: string) {
  const existing = await prisma.permission.findUnique({ where: { name }, select: { id: true, organizationId: true } });
  if (existing) return existing.organizationId === orgId ? existing.id : null;
  const c = await prisma.permission.create({
    data: { name, description: PERMS[name].description, category: "SPECIAL", resource: PERMS[name].resource, organizationId: orgId, isActive: true },
    select: { id: true },
  });
  return c.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgId = args.orgId;
  if (!orgId) throw new Error("Provide --orgId <id>");
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  if (!org) throw new Error(`No organization "${orgId}"`);

  console.log(`\nGranting default action permissions for "${org.name}"\n`);
  for (const g of GRANTS) {
    const role = await prisma.role.findFirst({ where: { organizationId: orgId, name: g.role }, select: { id: true } });
    if (!role) { console.log(`  ⚠ role "${g.role}" not found — skipped`); continue; }
    for (const name of g.perms) {
      const pid = await ensurePerm(orgId, name);
      if (!pid) { console.log(`  ⚠ ${name} owned by another org — skipped`); continue; }
      const existing = await prisma.rolePermission.findFirst({
        where: { roleId: role.id, permissionId: pid, moduleId: null, formId: null, sectionId: null, formFieldId: null, pagePath: null },
        select: { id: true, granted: true },
      });
      if (existing?.granted) { console.log(`  ℹ ${g.role} → ${name}: already granted`); continue; }
      if (existing) {
        await prisma.rolePermission.update({ where: { id: existing.id }, data: { granted: true } });
      } else {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: pid, granted: true } });
      }
      console.log(`  ✓ ${g.role} → ${name}`);
    }
  }
  console.log(`\nDone. Affected users refresh on next page load.\n`);
}

main().catch((e) => { console.error("\n✗ Failed:", e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
