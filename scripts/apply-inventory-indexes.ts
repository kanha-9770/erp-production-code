/**
 * Apply the JSONB indexes that back the Inventory & Purchase list views
 * (server-side search / filter / sort over the `data` JSON bag).
 *
 * These touch ONLY the dedicated business tables — `inventory_records` and
 * `purchase_records`. They do NOT touch the `form_records_*` tables at all.
 *
 * The features work WITHOUT these indexes (queries just fall back to sequential
 * scans); the indexes simply make search/filter fast at scale. The runner is
 * fault-tolerant: a statement that fails (e.g. a table not yet created, or a
 * restricted `CREATE EXTENSION`) is logged and skipped so the rest still apply.
 * Idempotent (CREATE INDEX IF NOT EXISTS). Safe to run repeatedly.
 *
 * Usage:
 *   npx tsx scripts/apply-inventory-indexes.ts
 *   # or
 *   npm run db:inventory-indexes
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// Minimal .env loader so this works under `npx tsx` without a dotenv dep.
function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key]) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* no .env file — rely on the ambient environment */
  }
}

loadEnv();

if (!process.env.DATABASE_URL) {
  console.error(
    "❌ DATABASE_URL is not set (no .env found and not in the environment).",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

// One statement per call — Prisma's $executeRawUnsafe runs a single statement.
const STATEMENTS: string[] = [
  // pg_trgm powers fast case-insensitive substring search (ILIKE '%term%').
  // If the managed DB forbids CREATE EXTENSION, this is skipped and ILIKE just
  // falls back to a sequential scan — still correct, only slower.
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,

  // ── Inventory list view (components/inventory-system) — search/filter/sort ──
  `CREATE INDEX IF NOT EXISTS inventory_records_itemname_trgm_idx
     ON inventory_records USING gin ((data ->> 'itemName') gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS inventory_records_itemcode_trgm_idx
     ON inventory_records USING gin ((data ->> 'itemCode') gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS inventory_records_brand_trgm_idx
     ON inventory_records USING gin ((data ->> 'brand') gin_trgm_ops)`,
  // Expression btrees back the master-equality filters + dedup lookups.
  `CREATE INDEX IF NOT EXISTS inventory_records_org_sub_itemcode_idx
     ON inventory_records (organization_id, submodule, ((data) ->> 'itemCode'))`,
  `CREATE INDEX IF NOT EXISTS inventory_records_org_sub_category_idx
     ON inventory_records (organization_id, submodule, ((data) ->> 'category'))`,
  `CREATE INDEX IF NOT EXISTS inventory_records_org_sub_warehouse_idx
     ON inventory_records (organization_id, submodule, ((data) ->> 'warehouse'))`,
  `CREATE INDEX IF NOT EXISTS inventory_records_org_sub_uom_idx
     ON inventory_records (organization_id, submodule, ((data) ->> 'uom'))`,

  // ── Purchase static-import dedup key (lib/purchase-system) ──
  `CREATE INDEX IF NOT EXISTS purchase_records_org_sub_docno_idx
     ON purchase_records (organization_id, submodule, ((data) ->> 'docNo'))`,

  `ANALYZE inventory_records`,
  `ANALYZE purchase_records`,
];

async function main(): Promise<void> {
  let applied = 0;
  let skipped = 0;
  for (const sql of STATEMENTS) {
    const label = sql.trim().split(/\s+/).slice(0, 6).join(" ");
    process.stdout.write(`→ ${label} … `);
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log("ok");
      applied++;
    } catch (e: any) {
      // Don't abort the whole run on one failing statement — keep going.
      console.log(`skipped (${e?.message ?? e})`);
      skipped++;
    }
  }
  console.log(`\n✅ Inventory/Purchase indexes — ${applied} applied, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
