/**
 * One-shot, IDEMPOTENT setup of the purchase approval roles + permissions +
 * user assignments for an organization. Re-runnable; never strips an existing
 * role (assigns a new role in a unit the user isn't already in, since
 * UserUnitAssignment is unique per (userId, unitId)).
 *
 *   npx tsx scripts/setup-purchase-approvals.ts --orgId cmpdz3sk4000dqk0jux23u57m
 *   npx tsx scripts/setup-purchase-approvals.ts --orgId <id> --dry        (preview only)
 *
 * Mapping (confirmed with the user):
 *   Approver         → APPROVE_PURCHASE_REQUISITION → UDAY YADAV   (Production)
 *   Purchase Manager → APPROVE_PURCHASE_ORDER       → Pushkar Singh (Account Mgr)
 *   Store Keeper     → POST_GRN_STOCK               → NIRAJ BHATNAGAR (Store)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PERM_DESC: Record<string, string> = {
  APPROVE_PURCHASE_REQUISITION:
    "Approve or reject purchase requisitions (set Production Approval). Grant to department-head / approver roles.",
  APPROVE_PURCHASE_ORDER:
    "Approve or reject purchase orders (set PO Approval). Grant to purchase-manager roles.",
  POST_GRN_STOCK:
    "Receive goods and post a GRN's quantities into store inventory. Grant to store-keeper / warehouse roles.",
};

// role name → { permission, the user (by email) to assign }
const SETUP = [
  { role: "Approver", perm: "APPROVE_PURCHASE_REQUISITION", email: "udai.yadav678@gmail.com" },
  { role: "Purchase Manager", perm: "APPROVE_PURCHASE_ORDER", email: "pushkar.nessco@gmail.com" },
  { role: "Store Keeper", perm: "POST_GRN_STOCK", email: "Neerajbhatnagar88@gmail.Compny" },
];

function parseArgs(argv: string[]) {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n && !n.startsWith("--")) {
      a[k] = n;
      i++;
    } else a[k] = true;
  }
  return a;
}

async function ensureRole(orgId: string, name: string, dry: boolean) {
  const existing = await prisma.role.findFirst({
    where: { organizationId: orgId, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) {
    console.log(`  role "${existing.name}" exists (${existing.id})`);
    return existing.id;
  }
  if (dry) {
    console.log(`  [dry] would CREATE role "${name}"`);
    return "<new>";
  }
  const max = await prisma.role.aggregate({
    where: { organizationId: orgId },
    _max: { sortOrder: true },
  });
  const role = await prisma.role.create({
    data: {
      name,
      organizationId: orgId,
      isActive: true,
      isAdmin: false,
      level: 0,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    select: { id: true },
  });
  console.log(`  ✓ CREATED role "${name}" (${role.id})`);
  return role.id;
}

async function ensurePermission(orgId: string, name: string, dry: boolean) {
  const existing = await prisma.permission.findFirst({
    where: { name, organizationId: orgId },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (dry) {
    console.log(`  [dry] would CREATE permission ${name}`);
    return "<new>";
  }
  const p = await prisma.permission.create({
    data: {
      name,
      description: PERM_DESC[name],
      category: "SPECIAL",
      resource: "purchase",
      organizationId: orgId,
      isActive: true,
    },
    select: { id: true },
  });
  console.log(`  ✓ CREATED permission ${name} (${p.id})`);
  return p.id;
}

async function ensureGrant(roleId: string, permissionId: string, permName: string, dry: boolean) {
  if (roleId === "<new>" || permissionId === "<new>") {
    console.log(`  [dry] would GRANT ${permName}`);
    return;
  }
  const existing = await prisma.rolePermission.findFirst({
    where: { roleId, permissionId, moduleId: null, formId: null, sectionId: null, formFieldId: null },
    select: { id: true, granted: true },
  });
  if (existing?.granted) {
    console.log(`  grant ${permName} already in place`);
    return;
  }
  if (existing) {
    await prisma.rolePermission.update({ where: { id: existing.id }, data: { granted: true } });
    console.log(`  ✓ flipped grant ${permName} → granted`);
    return;
  }
  await prisma.rolePermission.create({ data: { roleId, permissionId, granted: true } });
  console.log(`  ✓ GRANTED ${permName}`);
}

async function ensureAssignment(
  orgId: string,
  email: string,
  roleId: string,
  roleName: string,
  units: Array<{ id: string; name: string }>,
  dry: boolean,
) {
  const user = await prisma.user.findFirst({
    where: { organizationId: orgId, email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      unitAssignments: { select: { unitId: true, roleId: true, unit: { select: { name: true } }, role: { select: { name: true } } } },
    },
  });
  if (!user) {
    console.log(`  ✗ user <${email}> NOT FOUND — skipped`);
    return;
  }
  const who = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  if (user.unitAssignments.some((a) => a.roleId === roleId)) {
    console.log(`  ${who} already has role "${roleName}"`);
    return;
  }
  // Pick a unit the user is NOT already assigned in (unique [userId, unitId]),
  // so we add the role without clobbering an existing one.
  const taken = new Set(user.unitAssignments.map((a) => a.unitId));
  const freeUnit = units.find((u) => !taken.has(u.id));
  if (!freeUnit) {
    console.log(`  ✗ ${who} is already assigned in every unit — cannot add "${roleName}" without replacing a role; skipped`);
    return;
  }
  const keeps = user.unitAssignments.map((a) => `${a.role?.name}@${a.unit?.name}`).join(", ") || "none";
  if (dry) {
    console.log(`  [dry] would ASSIGN ${who} → "${roleName}"@${freeUnit.name} (keeps: ${keeps})`);
    return;
  }
  await prisma.userUnitAssignment.create({
    data: { userId: user.id, unitId: freeUnit.id, roleId },
  });
  console.log(`  ✓ ASSIGNED ${who} → "${roleName}"@${freeUnit.name}  (kept: ${keeps})`);
}

async function verify(orgId: string, email: string, permName: string) {
  const user = await prisma.user.findFirst({
    where: { organizationId: orgId, email: { equals: email, mode: "insensitive" } },
    select: {
      first_name: true,
      last_name: true,
      email: true,
      ownedOrganization: { select: { id: true } },
      unitAssignments: { select: { roleId: true, role: { select: { name: true, isAdmin: true } } } },
    },
  });
  if (!user) return console.log(`  ? <${email}> not found`);
  const who = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
  const adminBypass =
    !!user.ownedOrganization ||
    user.unitAssignments.some((a) => a.role?.isAdmin || (a.role?.name ?? "").toLowerCase().includes("admin"));
  const roleIds = user.unitAssignments.map((a) => a.roleId);
  const grant = await prisma.rolePermission.findFirst({
    where: { roleId: { in: roleIds }, granted: true, permission: { name: permName, organizationId: orgId, isActive: true } },
    select: { id: true },
  });
  const ok = adminBypass || !!grant;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${who} → ${permName}  ${adminBypass ? "(admin bypass)" : grant ? "(role grant)" : "(NO grant)"}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgId = typeof args.orgId === "string" ? args.orgId : "";
  const dry = !!args.dry;
  if (!orgId) throw new Error("Provide --orgId <id>");

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  if (!org) throw new Error(`No organization "${orgId}"`);

  // Unit priority: operational company first (name contains "machin"), then by sortOrder.
  const allUnits = await prisma.organizationUnit.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
  const units = allUnits
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => (a.name.toLowerCase().includes("machin") ? -1 : 0) - (b.name.toLowerCase().includes("machin") ? -1 : 0));
  if (units.length === 0) throw new Error("Org has no units — cannot assign roles to users.");

  console.log(`\n${dry ? "[DRY RUN] " : ""}Setting up purchase approvals for "${org.name}"\n`);

  for (const step of SETUP) {
    console.log(`▸ ${step.role}  (${step.perm})`);
    const roleId = await ensureRole(orgId, step.role, dry);
    const permId = await ensurePermission(orgId, step.perm, dry);
    await ensureGrant(roleId, permId, step.perm, dry);
    await ensureAssignment(orgId, step.email, roleId, step.role, units, dry);
    console.log("");
  }

  if (!dry) {
    console.log("=== VERIFY (resolves the same way the server's hasPermission does) ===");
    for (const step of SETUP) await verify(orgId, step.email, step.perm);
  }

  console.log(
    `\n${dry ? "Dry run complete — nothing written." : "Done."} ` +
      `Assigned users must log out and back in to refresh their auth-meta.\n`,
  );
}

main()
  .catch((e) => {
    console.error("\n✗ Failed:", e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
