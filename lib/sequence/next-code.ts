/**
 * Shared, atomic document/item-code generator.
 *
 * Both the Purchase and Inventory modules mint their codes here so numbering is
 * consistent and race-free. Codes are a per-scope running sequence rendered as
 * `${prefix}-${padded}` (e.g. `PO-0001`, `STK-0042`). The counter lives in the
 * existing `unique_id_counters` table (model `UniqueIdCounter`) — no schema
 * change — keyed by an opaque `scopeKey` so each org+submodule has its own run
 * (e.g. `pur:<orgId>:po`, `inv:<orgId>:store`).
 *
 * Call these INSIDE a `prisma.$transaction(async (tx) => …)` so the code and the
 * record it belongs to are committed together (an aborted create never burns a
 * number).
 */

import { Prisma } from "@prisma/client";

/** Tables we may scan for an existing max suffix. Allow-listed so the table
 *  name (which can't be a bound parameter) is never attacker-controlled. */
const SCAN_TABLES = {
  purchase_records: "purchase_records",
  inventory_records: "inventory_records",
} as const;
type ScanTable = keyof typeof SCAN_TABLES;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highest numeric suffix already used by `${prefix}-NNNN` codes for one
 * org+submodule, read straight from the JSON `data->>jsonKey` column (projects
 * only the code string, never the heavy `data` blob). Used to seed a brand-new
 * counter so previously-seeded / imported rows (e.g. `PO-0005`) are never
 * collided with or renumbered. Returns 0 when nothing matches.
 */
export async function maxCodeSuffix(
  tx: Prisma.TransactionClient,
  table: ScanTable,
  organizationId: string,
  submodule: string,
  jsonKey: string,
  prefix: string,
): Promise<number> {
  const tableSql = Prisma.raw(SCAN_TABLES[table]); // allow-listed constant — safe
  const rows = await tx.$queryRaw<Array<{ code: string | null }>>(Prisma.sql`
    SELECT data->>${jsonKey} AS code
      FROM ${tableSql}
     WHERE organization_id = ${organizationId} AND submodule = ${submodule}
  `);
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, "i");
  let max = 0;
  for (const r of rows) {
    const m = r.code ? re.exec(r.code.trim()) : null;
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

export interface NextCodeOpts {
  /** Opaque per-run key, e.g. `pur:<orgId>:po`. */
  scopeKey: string;
  /** Code prefix, e.g. `PO`. */
  prefix: string;
  /** Zero-padded width of the numeric part (default 4 → `0001`). */
  minDigits?: number;
  /** Lazily computes the seed for a NOT-yet-existing counter (first generated
   *  number = seed + 1). Only invoked once per scope, so an expensive scan here
   *  is fine. Defaults to 0 (first number = 1). */
  computeSeed?: () => Promise<number>;
}

/**
 * Reserve and return the next code for `scopeKey`. Atomic: the row is created
 * (seeded) once, then every call does a single `increment`, so concurrent
 * creates can never hand out the same number.
 */
export async function nextCode(tx: Prisma.TransactionClient, opts: NextCodeOpts): Promise<string> {
  const minDigits = opts.minDigits ?? 4;

  const existing = await tx.uniqueIdCounter.findUnique({ where: { fieldId: opts.scopeKey } });
  if (!existing) {
    const seed = opts.computeSeed ? await opts.computeSeed() : 0;
    // upsert → Postgres INSERT … ON CONFLICT DO UPDATE: race-safe for the rare
    // first-ever create of this scope (a concurrent create is a no-op update,
    // not an error that would poison the surrounding transaction).
    await tx.uniqueIdCounter.upsert({
      where: { fieldId: opts.scopeKey },
      create: { fieldId: opts.scopeKey, lastNumber: BigInt(seed) },
      update: {},
    });
  }

  const updated = await tx.uniqueIdCounter.update({
    where: { fieldId: opts.scopeKey },
    data: { lastNumber: { increment: BigInt(1) } },
  });

  const n = Number(updated.lastNumber); // safe well past any realistic sequence
  return `${opts.prefix}-${n.toString().padStart(minDigits, "0")}`;
}
