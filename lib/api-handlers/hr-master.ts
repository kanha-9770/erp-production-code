/**
 * HR Master handlers — load / save the per-org HR dropdown registry, backed by
 * the HrMasterSnapshot Prisma model (table `hr_master_snapshots`). Mirrors the
 * inventory-system master flow: seed on first load, backfill newly-added seed
 * masters into existing orgs, and replace-the-whole-array on save.
 *
 * Implemented with raw SQL (not the typed Prisma accessor) so it works even
 * when the running Prisma client predates this model — common on Windows where
 * the dev server holds the query-engine DLL lock and `prisma generate` can't
 * refresh the client. Once regenerated, the same raw queries keep working.
 */

import { prisma } from "@/lib/prisma";
import type { OrgCtx } from "@/lib/api-handlers/with-org";
import { HR_SEED_MASTERS } from "@/lib/hr-master/schema";
import type { HrMasterType } from "@/lib/hr-master/types";

// Lightweight unique id for the row's primary key. Uniqueness only has to hold
// per-org (one row per org, enforced by the UNIQUE org_id), so a monotonic
// counter combined with the org id is plenty. Avoids Date.now/Math.random.
let idCounterSeed = 0;
function rowId(orgId: string): string {
  idCounterSeed += 1;
  let h = 0;
  const s = orgId + ":" + idCounterSeed;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return "hrms_" + Math.abs(h).toString(36) + idCounterSeed.toString(36);
}

async function readSnapshot(orgId: string): Promise<HrMasterType[] | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ masters: any }>>(
    'SELECT "masters" FROM "hr_master_snapshots" WHERE "organization_id" = $1 LIMIT 1',
    orgId,
  );
  if (!rows.length) return null;
  const m = rows[0].masters;
  // Postgres jsonb comes back already parsed by the driver; guard anyway.
  if (Array.isArray(m)) return m as HrMasterType[];
  if (typeof m === "string") {
    try {
      const parsed = JSON.parse(m);
      return Array.isArray(parsed) ? (parsed as HrMasterType[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function writeSnapshot(orgId: string, masters: HrMasterType[]): Promise<void> {
  // Upsert keyed on the unique organization_id.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "hr_master_snapshots" ("id", "organization_id", "masters", "created_at", "updated_at")
     VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT ("organization_id")
     DO UPDATE SET "masters" = EXCLUDED."masters", "updated_at" = CURRENT_TIMESTAMP`,
    rowId(orgId),
    orgId,
    JSON.stringify(masters),
  );
}

export const HrMasterHandlers = {
  /** Seed-if-needed, then return this org's HR master registry. */
  async loadMasters(ctx: OrgCtx): Promise<HrMasterType[]> {
    let masters = await readSnapshot(ctx.organizationId);

    // First load for this org → seed the defaults.
    if (masters === null) {
      const seed = structuredClone(HR_SEED_MASTERS);
      await writeSnapshot(ctx.organizationId, seed);
      return seed;
    }

    // Backfill masters added to the seed after this org first loaded, so new
    // dropdowns appear without a manual reset.
    const known = new Set(masters.map((m) => m.key));
    let changed = false;
    for (const m of HR_SEED_MASTERS) {
      if (!known.has(m.key)) {
        masters.push(structuredClone(m));
        changed = true;
      }
    }
    if (changed) {
      await writeSnapshot(ctx.organizationId, masters);
    }
    return masters;
  },

  /** Replace the whole registry (the manager sends the full array on edit). */
  async saveMasters(ctx: OrgCtx, masters: HrMasterType[]): Promise<HrMasterType[]> {
    await writeSnapshot(ctx.organizationId, masters);
    return masters;
  },
};
