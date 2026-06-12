/**
 * Grant (or revoke) a purchase approval permission to a role in an organization.
 *
 * The purchase handlers (lib/api-handlers/purchase-system.ts) gate the
 * privileged transitions on named permissions resolved by hasPermission():
 *   - APPROVE_PURCHASE_REQUISITION → set a PR's Production Approval
 *   - APPROVE_PURCHASE_ORDER       → set a PO's Approval status
 *   - POST_GRN_STOCK               → receive goods / post a GRN to inventory
 *   - RAISE_PAYMENT_REQUEST        → raise a payment request + mark an approved one PAID
 *   - APPROVE_PAYMENT_REQUEST      → approve/hold/reject a payment request (the decision)
 *   - PROCESS_PURCHASE             → buyer: RFQs, POs, suppliers, edit/delete docs
 *
 * Admins / org-owners bypass these automatically. For everyone else, this script
 * wires the role path: it ensures the Permission row exists for the org and
 * inserts a RolePermission(granted=true) for the chosen role. Idempotent.
 *
 * Usage
 * -----
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Approver"     --perm requisition
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Purchase Mgr" --perm po
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Gate Security" --perm gate-entry
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "QC Inspector"  --perm qc-inspection
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Store Keeper"  --perm store-inspection
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Store Keeper" --perm grn
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Accounts"     --perm payment
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Finance Head" --perm approve-payment
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Buyer"        --perm process
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Buyer"        --perm all
 *   npx tsx scripts/grant-purchase-permissions.ts --org "Acme" --role "Approver"     --perm requisition --revoke
 *
 * --perm accepts a friendly alias (requisition|pr, po|order, grn|stock,
 * payment, approve-payment, process|buyer), a full permission name, or "all".
 * Either name OR id works for --org and --role.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mirror of lib/permissions/purchase-permissions.ts (kept local so the script
// stays dependency-free, like scripts/grant-manage-users.ts).
const PERMS: Record<string, { name: string; description: string }> = {
  requisition: {
    name: "APPROVE_PURCHASE_REQUISITION",
    description:
      "Approve or reject purchase requisitions (set Production Approval). Grant to department-head / approver roles.",
  },
  po: {
    name: "APPROVE_PURCHASE_ORDER",
    description:
      "Approve or reject purchase orders (set PO Approval). Grant to purchase-manager roles.",
  },
  "gate-entry": {
    name: "GRN_GATE_ENTRY",
    description:
      "GRN stage 1 — record gate entry (arrival, vehicle/challan, gate inspection) and start a goods receipt. Grant to gate/security roles.",
  },
  "qc-inspection": {
    name: "GRN_QC_INSPECTION",
    description:
      "GRN stage 2 — perform the purchase/quality (QC) inspection and forward the GRN. Grant to QC / purchase-inspection roles.",
  },
  "store-inspection": {
    name: "GRN_STORE_INSPECTION",
    description:
      "GRN stage 3 — perform the store/inventory inspection, confirm quantities and make the GRN postable. Grant to store/warehouse roles.",
  },
  grn: {
    name: "POST_GRN_STOCK",
    description:
      "Receive goods and post a GRN's quantities into store inventory (final step, after all inspections clear). Grant to store-keeper / warehouse roles.",
  },
  payment: {
    name: "RAISE_PAYMENT_REQUEST",
    description:
      "Raise a payment request against a PO/GRN, and mark an approved request as PAID. Grant to accounts-payable / account-manager roles.",
  },
  "approve-payment": {
    name: "APPROVE_PAYMENT_REQUEST",
    description:
      "Approve, hold or reject a payment request (the approval decision). Marking it PAID is the account manager's RAISE_PAYMENT_REQUEST. Grant to finance-approver / admin roles.",
  },
  process: {
    name: "PROCESS_PURCHASE",
    description:
      "Buyer: raise RFQs, create/convert purchase orders, manage suppliers, and edit/delete purchase documents.",
  },
};

const ALIASES: Record<string, string> = {
  requisition: "requisition",
  pr: "requisition",
  approve_purchase_requisition: "requisition",
  po: "po",
  order: "po",
  approve_purchase_order: "po",
  "gate-entry": "gate-entry",
  gate: "gate-entry",
  grn_gate_entry: "gate-entry",
  "qc-inspection": "qc-inspection",
  qc: "qc-inspection",
  grn_qc_inspection: "qc-inspection",
  "store-inspection": "store-inspection",
  store: "store-inspection",
  grn_store_inspection: "store-inspection",
  grn: "grn",
  stock: "grn",
  post: "grn",
  post_grn_stock: "grn",
  payment: "payment",
  raise_payment_request: "payment",
  "approve-payment": "approve-payment",
  approve_payment: "approve-payment",
  approve_payment_request: "approve-payment",
  process: "process",
  buyer: "process",
  process_purchase: "process",
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
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolvePerms(arg: unknown): Array<{ name: string; description: string }> {
  const raw = typeof arg === "string" ? arg.trim().toLowerCase() : "";
  if (!raw)
    throw new Error(
      "Provide --perm <requisition|po|gate-entry|qc-inspection|store-inspection|grn|payment|approve-payment|process|all|FULL_NAME>",
    );
  if (raw === "all") return Object.values(PERMS);
  const key = ALIASES[raw];
  if (!key)
    throw new Error(
      `Unknown --perm "${arg}". Use requisition | po | gate-entry | qc-inspection | store-inspection | grn | payment | approve-payment | process | all.`,
    );
  return [PERMS[key]];
}

async function resolveOrg(args: Record<string, string | boolean>) {
  if (typeof args.orgId === "string") {
    const o = await prisma.organization.findUnique({
      where: { id: args.orgId },
      select: { id: true, name: true },
    });
    if (!o) throw new Error(`No organization with id "${args.orgId}"`);
    return o;
  }
  if (typeof args.org === "string") {
    const o = await prisma.organization.findFirst({
      where: { name: { equals: args.org, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (!o) throw new Error(`No organization named "${args.org}"`);
    return o;
  }
  throw new Error("Provide --org <name> or --orgId <id>");
}

async function resolveRole(
  args: Record<string, string | boolean>,
  organizationId: string,
) {
  if (typeof args.roleId === "string") {
    const r = await prisma.role.findUnique({
      where: { id: args.roleId },
      select: { id: true, name: true, organizationId: true, isAdmin: true },
    });
    if (!r) throw new Error(`No role with id "${args.roleId}"`);
    if (r.organizationId !== organizationId)
      throw new Error(`Role "${r.name}" (${r.id}) is not in the target organization`);
    return r;
  }
  if (typeof args.role === "string") {
    const r = await prisma.role.findFirst({
      where: { organizationId, name: { equals: args.role, mode: "insensitive" } },
      select: { id: true, name: true, organizationId: true, isAdmin: true },
    });
    if (!r) throw new Error(`No role named "${args.role}" in organization ${organizationId}`);
    return r;
  }
  throw new Error("Provide --role <name> or --roleId <id>");
}

async function ensurePermission(
  organizationId: string,
  perm: { name: string; description: string },
) {
  const existing = await prisma.permission.findFirst({
    where: { name: perm.name, organizationId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.permission.create({
    data: {
      name: perm.name,
      description: perm.description,
      category: "SPECIAL",
      resource: "purchase",
      organizationId,
      isActive: true,
    },
    select: { id: true },
  });
  console.log(`  ✓ Created Permission ${perm.name} (${created.id})`);
  return created.id;
}

async function applyOne(
  roleId: string,
  permissionId: string,
  permName: string,
  revoke: boolean,
) {
  // Org-level capability: all scope fields null (matches grant-manage-users).
  const existing = await prisma.rolePermission.findFirst({
    where: { roleId, permissionId, moduleId: null, formId: null, sectionId: null, formFieldId: null },
    select: { id: true, granted: true },
  });

  if (revoke) {
    if (!existing) {
      console.log(`  ℹ ${permName}: no grant row — nothing to revoke.`);
    } else {
      await prisma.rolePermission.delete({ where: { id: existing.id } });
      console.log(`  ✓ ${permName}: deleted grant row ${existing.id}`);
    }
    return;
  }
  if (existing && existing.granted) {
    console.log(`  ℹ ${permName}: already granted — no change.`);
  } else if (existing && !existing.granted) {
    await prisma.rolePermission.update({ where: { id: existing.id }, data: { granted: true } });
    console.log(`  ✓ ${permName}: flipped granted=true on ${existing.id}`);
  } else {
    const row = await prisma.rolePermission.create({
      data: { roleId, permissionId, granted: true },
      select: { id: true },
    });
    console.log(`  ✓ ${permName}: created grant row ${row.id}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const revoke = !!args.revoke;
  const perms = resolvePerms(args.perm);

  const org = await resolveOrg(args);
  const role = await resolveRole(args, org.id);

  console.log(
    `${revoke ? "Revoking" : "Granting"} [${perms.map((p) => p.name).join(", ")}] ` +
      `→ role "${role.name}" in "${org.name}"`,
  );
  if (role.isAdmin) {
    console.log(
      `  ℹ Role "${role.name}" is isAdmin=true and already bypasses these checks; ` +
        `proceeding for an explicit audit trail.`,
    );
  }

  for (const perm of perms) {
    const permissionId = await ensurePermission(org.id, perm);
    await applyOne(role.id, permissionId, perm.name, revoke);
  }

  console.log("\nDone.");
  console.log(
    `Users assigned to "${role.name}" must log out and back in for their auth-meta to refresh.`,
  );
}

main()
  .catch((e) => {
    console.error("\n✗ Failed:", e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
