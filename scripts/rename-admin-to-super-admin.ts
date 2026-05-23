/**
 * One-time migration: rename the master controlling role of every organization
 * from "ADMIN" / "Admin" / "Administrator" to "Super Admin", and ensure the
 * isAdmin flag is set so permission short-circuits keep working.
 *
 * Safe to re-run — uses upsert-style logic and skips orgs that already have
 * a "Super Admin" role.
 *
 * Run with:  npx tsx scripts/rename-admin-to-super-admin.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_NAME = "Super Admin";
const TARGET_DESCRIPTION =
  "Super Administrator with full access to the organization";

async function main() {
  console.log("Starting Admin → Super Admin role rename...\n");

  // Pull every role whose name looks like a master-admin role.
  // The fuzzy match catches "ADMIN", "Admin", "Administrator", etc.
  const candidates = await prisma.role.findMany({
    where: {
      name: { contains: "admin", mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      isAdmin: true,
    },
  });

  console.log(`Found ${candidates.length} admin-like role(s).\n`);

  let renamed = 0;
  let flagged = 0;
  let skipped = 0;

  for (const role of candidates) {
    // Already named exactly "Super Admin" — just make sure isAdmin is set.
    if (role.name === TARGET_NAME) {
      if (!role.isAdmin) {
        await prisma.role.update({
          where: { id: role.id },
          data: { isAdmin: true },
        });
        flagged++;
        console.log(`  Flagged isAdmin=true on existing "${role.name}" (org=${role.organizationId ?? "global"})`);
      } else {
        skipped++;
      }
      continue;
    }

    // If this role belongs to an organization, check whether that org already
    // has a "Super Admin" role — if so, we can't rename (unique constraint),
    // so we just flag this legacy role as admin and move on.
    if (role.organizationId) {
      const conflict = await prisma.role.findFirst({
        where: {
          organizationId: role.organizationId,
          name: TARGET_NAME,
        },
        select: { id: true },
      });

      if (conflict && conflict.id !== role.id) {
        if (!role.isAdmin) {
          await prisma.role.update({
            where: { id: role.id },
            data: { isAdmin: true },
          });
          flagged++;
        }
        console.log(`  Org ${role.organizationId} already has "Super Admin" — left legacy "${role.name}" in place with isAdmin=true.`);
        continue;
      }
    } else {
      // Global (no organization) role — check for any global "Super Admin".
      const conflict = await prisma.role.findFirst({
        where: { organizationId: null, name: TARGET_NAME },
        select: { id: true },
      });
      if (conflict && conflict.id !== role.id) {
        skipped++;
        console.log(`  Global "Super Admin" already exists — skipping rename of "${role.name}".`);
        continue;
      }
    }

    await prisma.role.update({
      where: { id: role.id },
      data: {
        name: TARGET_NAME,
        description: TARGET_DESCRIPTION,
        isAdmin: true,
      },
    });
    renamed++;
    console.log(`  Renamed "${role.name}" → "${TARGET_NAME}" (org=${role.organizationId ?? "global"})`);
  }

  console.log(`\nDone. renamed=${renamed} flagged=${flagged} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
