/**
 * Diagnose why a role still gets "Unauthorized" after MANAGE_USERS was
 * granted. Walks every layer that could block them.
 *
 * Usage:
 *   npx tsx scripts/diagnose-manage-users.ts --orgId <id> --roleId <id>
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgId = args.orgId as string;
  const roleId = args.roleId as string;

  if (!orgId || !roleId) {
    console.error("Need --orgId and --roleId");
    process.exit(1);
  }

  console.log("─".repeat(70));
  console.log("LAYER 1: Role and organization");
  console.log("─".repeat(70));
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      name: true,
      isAdmin: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  });
  if (!role) {
    console.log(`  ✗ Role ${roleId} NOT FOUND`);
    return;
  }
  console.log(`  ✓ Role: "${role.name}" (isAdmin=${role.isAdmin})`);
  console.log(`  ✓ Org:  "${role.organization.name}" (${role.organizationId})`);
  if (role.organizationId !== orgId) {
    console.log(`  ✗ Role does NOT belong to org ${orgId}`);
    return;
  }

  console.log();
  console.log("─".repeat(70));
  console.log("LAYER 2: Users actually assigned to this role");
  console.log("─".repeat(70));
  const assignments = await prisma.userUnitAssignment.findMany({
    where: { roleId },
    select: {
      userId: true,
      user: {
        select: { email: true, first_name: true, last_name: true, status: true },
      },
    },
  });
  if (assignments.length === 0) {
    console.log(
      `  ✗ NO USERS assigned to this role. The user trying to manage HR-style work isn't actually in this role.`
    );
    console.log(`    → Assign her to "${role.name}" via Settings → Users.`);
  } else {
    console.log(`  ✓ ${assignments.length} user(s) assigned:`);
    for (const a of assignments) {
      console.log(
        `      • ${a.user.email} (${a.user.first_name} ${a.user.last_name}) status=${a.user.status} id=${a.userId}`
      );
    }
  }

  console.log();
  console.log("─".repeat(70));
  console.log("LAYER 3: MANAGE_USERS Permission row in this org");
  console.log("─".repeat(70));
  const perm = await prisma.permission.findFirst({
    where: { name: "MANAGE_USERS", organizationId: orgId },
    select: { id: true, isActive: true, category: true },
  });
  if (!perm) {
    console.log(`  ✗ No Permission row named MANAGE_USERS in this org.`);
    console.log(`    → Run: npx tsx scripts/grant-manage-users.ts --orgId ${orgId} --roleId ${roleId}`);
  } else {
    console.log(`  ✓ Permission row: id=${perm.id} active=${perm.isActive} category=${perm.category}`);
  }

  console.log();
  console.log("─".repeat(70));
  console.log("LAYER 4: RolePermission link for this role");
  console.log("─".repeat(70));
  if (perm) {
    const rp = await prisma.rolePermission.findFirst({
      where: {
        roleId,
        permissionId: perm.id,
        moduleId: null,
        formId: null,
        sectionId: null,
        formFieldId: null,
      },
      select: { id: true, granted: true, createdAt: true },
    });
    if (!rp) {
      console.log(`  ✗ No RolePermission row tying role to MANAGE_USERS.`);
      console.log(`    → Run the grant script.`);
    } else {
      console.log(`  ✓ RolePermission: id=${rp.id} granted=${rp.granted} createdAt=${rp.createdAt.toISOString()}`);
      if (!rp.granted) {
        console.log(`    ✗ granted=false — this REVOKES access. Re-grant.`);
      }
    }
  }

  console.log();
  console.log("─".repeat(70));
  console.log("LAYER 5: Per-user overrides (deny would beat role grant)");
  console.log("─".repeat(70));
  if (perm && assignments.length > 0) {
    const overrides = await prisma.userPermissionOverride.findMany({
      where: {
        permissionId: perm.id,
        userId: { in: assignments.map((a) => a.userId) },
      },
      select: { userId: true, granted: true, expiresAt: true, reason: true },
    });
    if (overrides.length === 0) {
      console.log(`  ✓ No per-user overrides — role grant applies.`);
    } else {
      for (const o of overrides) {
        const live = !o.expiresAt || o.expiresAt > new Date();
        const sym = live ? (o.granted ? "✓ allow" : "✗ DENY") : "○ expired";
        console.log(`  ${sym} user=${o.userId} reason="${o.reason}"`);
      }
    }
  }

  console.log();
  console.log("─".repeat(70));
  console.log("LAYER 6: Page-route gate (/settings/users)");
  console.log("─".repeat(70));
  const routeRules = await prisma.routePermission.findMany({
    where: { organizationId: orgId },
    select: {
      pattern: true,
      roleAccess: { select: { roleId: true, granted: true } },
    },
  });
  const matching = routeRules.filter((r) => {
    const re = globToRegex(r.pattern);
    return re.test("/settings/users") || re.test("/settings/users/123");
  });
  if (matching.length === 0) {
    console.log(`  ✓ No RoutePermission rules match /settings/users — page is open by default.`);
  } else {
    for (const m of matching) {
      const roleEntry = m.roleAccess.find((ra) => ra.roleId === roleId);
      if (!roleEntry) {
        console.log(`  ○ pattern="${m.pattern}" — role has NO entry. ${m.roleAccess.length === 0 ? "Pattern is open (no rules)." : "Other roles have entries — falls through to default."}`);
      } else if (roleEntry.granted) {
        console.log(`  ✓ pattern="${m.pattern}" — role explicitly GRANTED.`);
      } else {
        console.log(`  ✗ pattern="${m.pattern}" — role explicitly DENIED. This blocks the page.`);
      }
    }
  }

  console.log();
  console.log("─".repeat(70));
  console.log("VERDICT");
  console.log("─".repeat(70));
  if (!perm) {
    console.log("  Run the grant script first.");
  } else if (assignments.length === 0) {
    console.log("  The role has no users. Assign the HR user to this role.");
  } else {
    console.log("  Permission setup looks correct on the DB side.");
    console.log("  Remaining checks:");
    console.log("    1. Restart your Next.js dev server so the new code in user-management.ts is live.");
    console.log("    2. Have the HR user LOG OUT and log back in (the auth-meta cookie is cached 5 min).");
    console.log("    3. Tell me the exact error message + status code they see — that will pinpoint the layer.");
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§DOUBLESTAR§")
    .replace(/\*/g, "[^/]+")
    .replace(/§DOUBLESTAR§/g, ".*");
  return new RegExp(`^${escaped}$`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
