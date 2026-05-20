/**
 * One-shot backfill: assign NK-NNN / ES-NNN / PR-NNN / SI-NNN / ST-NNN
 * to engagement rows created before the displayId column existed.
 * Numbers are scoped per (organization, module) and ordered by createdAt
 * so the oldest submission gets the lowest number.
 *
 * Re-running is safe — rows that already have a displayId are skipped,
 * and the next sequence number is computed from the existing highest one.
 *
 * Usage:  npx tsx scripts/backfill-engagement-display-ids.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

type ModuleSpec = {
  label: string;
  prefix: string;
  findMany: (where: { organizationId: string }) => Promise<Array<{ id: string; displayId: string | null; createdAt: Date }>>;
  update: (id: string, displayId: string) => Promise<unknown>;
};

const MODULES: ModuleSpec[] = [
  {
    label: "Kaizen",
    prefix: "NK",
    findMany: (where) => (prisma as any).engagementKaizen.findMany({ where, select: { id: true, displayId: true, createdAt: true } }),
    update: (id, displayId) => (prisma as any).engagementKaizen.update({ where: { id }, data: { displayId } }),
  },
  {
    label: "Suggestion",
    prefix: "ES",
    findMany: (where) => (prisma as any).engagementSuggestion.findMany({ where, select: { id: true, displayId: true, createdAt: true } }),
    update: (id, displayId) => (prisma as any).engagementSuggestion.update({ where: { id }, data: { displayId } }),
  },
  {
    label: "Problem",
    prefix: "PR",
    findMany: (where) => (prisma as any).engagementProblem.findMany({ where, select: { id: true, displayId: true, createdAt: true } }),
    update: (id, displayId) => (prisma as any).engagementProblem.update({ where: { id }, data: { displayId } }),
  },
  {
    label: "Initiative",
    prefix: "SI",
    findMany: (where) => (prisma as any).engagementInitiative.findMany({ where, select: { id: true, displayId: true, createdAt: true } }),
    update: (id, displayId) => (prisma as any).engagementInitiative.update({ where: { id }, data: { displayId } }),
  },
  {
    label: "Target",
    prefix: "ST",
    findMany: (where) => (prisma as any).engagementTarget.findMany({ where, select: { id: true, displayId: true, createdAt: true } }),
    update: (id, displayId) => (prisma as any).engagementTarget.update({ where: { id }, data: { displayId } }),
  },
];

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  console.log(`Found ${orgs.length} organization(s).`);

  for (const org of orgs) {
    for (const m of MODULES) {
      const rows = await m.findMany({ organizationId: org.id });
      rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      let next = 1;
      for (const r of rows) {
        if (r.displayId) {
          const matched = /-(\d+)$/.exec(r.displayId);
          if (matched) next = Math.max(next, Number(matched[1]) + 1);
        }
      }

      let assigned = 0;
      for (const r of rows) {
        if (r.displayId) continue;
        const displayId = `${m.prefix}-${String(next).padStart(3, "0")}`;
        await m.update(r.id, displayId);
        next += 1;
        assigned += 1;
      }
      console.log(`  [${m.label}] org=${org.id.slice(0, 8)} assigned=${assigned} nextN=${next}`);
    }
  }
  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
