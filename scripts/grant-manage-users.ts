/**
 * Grant the MANAGE_USERS permission to a role in an organization.
 *
 * Purpose
 * -------
 * The user-management API handlers (lib/api-handlers/user-management.ts)
 * gate create / update / delete on `canManageUsers()`, which resolves to:
 *   - admin OR org-owner → allowed
 *   - role has RolePermission row for MANAGE_USERS → allowed
 *   - user has explicit UserPermissionOverride → allowed/denied
 *
 * This script wires up the role path: it ensures the Permission row exists
 * for the target organization and inserts a RolePermission(granted=true)
 * for the chosen role. Idempotent — safe to re-run.
 *
 * Usage
 * -----
 *   npx tsx scripts/grant-manage-users.ts --org "Acme Corp" --role "HR"
 *   npx tsx scripts/grant-manage-users.ts --orgId clxxx --roleId clyyy
 *   npx tsx scripts/grant-manage-users.ts --org "Acme Corp" --role "HR" --revoke
 *
 * Either name OR id works for both flags. --revoke removes the grant.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MANAGE_USERS = "MANAGE_USERS";
const MANAGE_USERS_DESCRIPTION =
  "Create, update, and delete users in the organization. Required for HR-style roles that are not full admins.";

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
  organizationId: string
) {
  if (typeof args.roleId === "string") {
    const r = await prisma.role.findUnique({
      where: { id: args.roleId },
      select: { id: true, name: true, organizationId: true, isAdmin: true },
    });
    if (!r) throw new Error(`No role with id "${args.roleId}"`);
    if (r.organizationId !== organizationId)
      throw new Error(
        `Role "${r.name}" (${r.id}) does not belong to the target organization`
      );
    return r;
  }
  if (typeof args.role === "string") {
    const r = await prisma.role.findFirst({
      where: {
        organizationId,
        name: { equals: args.role, mode: "insensitive" },
      },
      select: { id: true, name: true, organizationId: true, isAdmin: true },
    });
    if (!r)
      throw new Error(
        `No role named "${args.role}" in organization ${organizationId}`
      );
    return r;
  }
  throw new Error("Provide --role <name> or --roleId <id>");
}

async function ensurePermission(organizationId: string) {
  const existing = await prisma.permission.findFirst({
    where: { name: MANAGE_USERS, organizationId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.permission.create({
    data: {
      name: MANAGE_USERS,
      description: MANAGE_USERS_DESCRIPTION,
      category: "ADMIN",
      resource: "user",
      organizationId,
      isActive: true,
    },
    select: { id: true },
  });
  console.log(`  ✓ Created Permission MANAGE_USERS (${created.id})`);
  return created.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const revoke = !!args.revoke;

  const org = await resolveOrg(args);
  const role = await resolveRole(args, org.id);

  console.log(
    `${revoke ? "Revoking" : "Granting"} MANAGE_USERS → role "${role.name}" in "${org.name}"`
  );

  if (role.isAdmin) {
    console.log(
      `  ℹ Role "${role.name}" is already isAdmin=true and bypasses all permission checks. No row needed, but proceeding anyway for an explicit audit trail.`
    );
  }

  const permissionId = await ensurePermission(org.id);

  // RolePermission has a compound unique on (roleId, permissionId, moduleId,
  // formId). Org-level capabilities have all three scope fields null, so we
  // look for that exact shape rather than blindly upserting.
  const existing = await prisma.rolePermission.findFirst({
    where: {
      roleId: role.id,
      permissionId,
      moduleId: null,
      formId: null,
      sectionId: null,
      formFieldId: null,
    },
    select: { id: true, granted: true },
  });

  if (revoke) {
    if (!existing) {
      console.log("  ℹ No grant row exists — nothing to revoke.");
    } else {
      await prisma.rolePermission.delete({ where: { id: existing.id } });
      console.log(`  ✓ Deleted RolePermission row ${existing.id}`);
    }
  } else {
    if (existing && existing.granted) {
      console.log("  ℹ Already granted — no change.");
    } else if (existing && !existing.granted) {
      await prisma.rolePermission.update({
        where: { id: existing.id },
        data: { granted: true },
      });
      console.log(`  ✓ Flipped granted=true on existing row ${existing.id}`);
    } else {
      const row = await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId,
          granted: true,
        },
        select: { id: true },
      });
      console.log(`  ✓ Created RolePermission row ${row.id}`);
    }
  }

  console.log("\nDone.");
  console.log(
    `Affected users (those assigned to "${role.name}") must log out and back in for their auth-meta cookie to pick up the change.`
  );
}

main()
  .catch((e) => {
    console.error("\n✗ Failed:", e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
