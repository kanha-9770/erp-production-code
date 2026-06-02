/**
 * Apply the form_records_15 JSONB indexes (mirror of
 * scripts/sql/jsonb_indexes_form_records_15.sql) through Prisma — for
 * environments without `psql` on PATH (e.g. Windows).
 *
 * Idempotent (CREATE INDEX IF NOT EXISTS). Safe to run repeatedly.
 *
 * Usage:
 *   npx tsx scripts/apply-jsonb-indexes.ts
 *   # or
 *   npm run db:jsonb-indexes
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
  `CREATE INDEX IF NOT EXISTS idx_form_records_15_email
     ON form_records_15 (((record_data::jsonb) ->> 'email'))`,
  `CREATE INDEX IF NOT EXISTS idx_form_records_15_role_id
     ON form_records_15 (((record_data::jsonb) ->> 'roleId'))`,
  `CREATE INDEX IF NOT EXISTS idx_form_records_15_record_data_gin
     ON form_records_15 USING gin (((record_data)::jsonb) jsonb_path_ops)`,
  `ANALYZE form_records_15`,
];

async function main(): Promise<void> {
  for (const sql of STATEMENTS) {
    const label = sql.trim().split(/\s+/).slice(0, 6).join(" ");
    process.stdout.write(`→ ${label} … `);
    await prisma.$executeRawUnsafe(sql);
    console.log("ok");
  }
}

main()
  .then(() => console.log("✅ JSONB indexes applied to form_records_15."))
  .catch((e) => {
    console.error("❌ Failed:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
