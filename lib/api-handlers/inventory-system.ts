/**
 * Inventory System — server-side data handlers.
 *
 * Implements the 6 operations the inventory `service.ts` boundary calls
 * (load / create / update / delete / saveMasters / reset), backed by the
 * InventoryRecord + InventoryMasterSnapshot Prisma models. Everything is
 * org-scoped; the thin route files do auth and pass {organizationId, userId}.
 *
 * Records are schema-driven open bags: the field set lives in
 * lib/inventory-system/schema.ts and is stored in the `data` JSON column. The
 * wire shape returned to the client is the localStorage shape — `data` spread
 * flat plus id/submodule/createdAt/updatedAt — so the provider/UI are untouched.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SEED_MASTERS, SUBMODULE_ORDER, getSchema } from "@/lib/inventory-system/schema";
import { seedItems } from "@/lib/inventory-system/seed";
import { nextCode, maxCodeSuffix } from "@/lib/sequence/next-code";
import type {
  InventoryItem,
  InventorySnapshot,
  MasterType,
  SubmoduleKey,
} from "@/lib/inventory-system/types";

export interface InvCtx {
  organizationId: string;
  userId: string;
}

/** Query params for the paginated list endpoint. */
export interface ListItemsQuery {
  submodule: SubmoduleKey;
  page: number;
  pageSize: number;
  search?: string;
  /** ACTIVE | INACTIVE | LOW_STOCK | OUT_OF_STOCK | MAINTENANCE | RETIRED */
  status?: string;
  /** Equality filters on master-backed fields (category/warehouse/uom/…). */
  masters?: Record<string, string>;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

export interface ListItemsResult {
  rows: InventoryItem[];
  total: number;
  lowCount: number;
  outCount: number;
  page: number;
  pageSize: number;
}

const SNAPSHOT_VERSION = 1;
// Keys the client owns — never let a create/update payload overwrite them.
// `itemCode` is system-generated and locked, so it's reserved too.
const RESERVED = ["id", "submodule", "createdAt", "updatedAt", "_optimistic", "_deleting", "itemCode"];

function isValidSubmodule(s: unknown): s is SubmoduleKey {
  return typeof s === "string" && (SUBMODULE_ORDER as string[]).includes(s);
}

function stripReserved(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  for (const k of RESERVED) delete out[k];
  return out;
}

/** DB row → canonical localStorage-shaped record (data flat + reserved keys). */
function toRecord(row: {
  id: string;
  submodule: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}): InventoryItem {
  return {
    ...(row.data as Record<string, unknown>),
    id: row.id,
    submodule: row.submodule as SubmoduleKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Same as toRecord but for $queryRaw rows: columns come back snake_cased and
 * the timestamps may be a JS Date *or* a string depending on the driver, so
 * normalise through `new Date(...)`.
 */
function toRecordRaw(row: {
  id: string;
  submodule: string;
  data: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}): InventoryItem {
  return {
    ...(row.data as Record<string, unknown>),
    id: row.id,
    submodule: row.submodule as SubmoduleKey,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ── Stock-status SQL (mirrors deriveStockStatus in lib/inventory-system/format.ts) ──
// A row's status is "overridden" when the stored `status` column is one of the
// non-stock states; only then does it short-circuit the quantity math. Stock
// values live in `data` as JSON text that may be empty/missing/non-numeric, so
// guard every cast with a numeric regex and COALESCE to 0 (matches Number(x ?? 0)).
// Numeric guard regex, inlined verbatim via Prisma.raw. In this plain string
// literal `\\.` is one literal backslash + dot, so Postgres's POSIX regex sees
// `\.` = a real decimal point. (A bare `.` would match ANY char and let junk
// like "1a2" slip past the guard into a crashing ::numeric cast.) Constant, no
// user input — safe to Prisma.raw.
const NUMERIC_RE = "'^-?[0-9]+(\\.[0-9]+)?$'";
const SQL_NOT_OVERRIDDEN = Prisma.sql`(status IS NULL OR status NOT IN ('INACTIVE','MAINTENANCE','RETIRED'))`;
const SQL_CUR = Prisma.sql`COALESCE(CASE WHEN (data->>'currentStock') ~ ${Prisma.raw(NUMERIC_RE)} THEN (data->>'currentStock')::numeric END, 0)`;
const SQL_MIN = Prisma.sql`COALESCE(CASE WHEN (data->>'minStock') ~ ${Prisma.raw(NUMERIC_RE)} THEN (data->>'minStock')::numeric END, 0)`;
const SQL_OUT_PRED = Prisma.sql`(${SQL_NOT_OVERRIDDEN} AND ${SQL_CUR} <= 0)`;
const SQL_LOW_PRED = Prisma.sql`(${SQL_NOT_OVERRIDDEN} AND ${SQL_CUR} > 0 AND ${SQL_MIN} > 0 AND ${SQL_CUR} <= ${SQL_MIN})`;
const SQL_ACTIVE_PRED = Prisma.sql`(${SQL_NOT_OVERRIDDEN} AND ${SQL_CUR} > 0 AND (${SQL_MIN} <= 0 OR ${SQL_CUR} > ${SQL_MIN}))`;

/** Escape LIKE/ILIKE wildcards in user search input (Postgres default '\' escape). */
function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

/**
 * Build the shared WHERE for list/count/ids queries: org + submodule, plus the
 * optional status / master-equality / search predicates. Returns a Prisma.Sql
 * that already starts after `WHERE`.
 */
function buildItemsWhere(ctx: InvCtx, q: ListItemsQuery): Prisma.Sql {
  const schema = getSchema(q.submodule);
  const masterKeys = new Set(
    schema.fields.filter((f) => f.type === "master").map((f) => f.key),
  );

  const parts: Prisma.Sql[] = [
    Prisma.sql`organization_id = ${ctx.organizationId}`,
    Prisma.sql`submodule = ${q.submodule}`,
  ];

  switch (q.status) {
    case "OUT_OF_STOCK": parts.push(SQL_OUT_PRED); break;
    case "LOW_STOCK": parts.push(SQL_LOW_PRED); break;
    case "ACTIVE": parts.push(SQL_ACTIVE_PRED); break;
    case "INACTIVE":
    case "MAINTENANCE":
    case "RETIRED": parts.push(Prisma.sql`status = ${q.status}`); break;
    default: break; // no status filter
  }

  if (q.masters) {
    for (const [k, v] of Object.entries(q.masters)) {
      // Bind the JSON path as a *value* operand to `->>` (injection-safe);
      // ignore unknown keys so the URL can't probe arbitrary paths.
      if (v && masterKeys.has(k)) parts.push(Prisma.sql`data->>${k} = ${v}`);
    }
  }

  const search = q.search?.trim();
  if (search) {
    const like = likeContains(search);
    parts.push(
      Prisma.sql`(data->>'itemCode' ILIKE ${like} OR data->>'itemName' ILIKE ${like} OR data->>'brand' ILIKE ${like})`,
    );
  }

  return Prisma.join(parts, " AND ");
}

/** Validate sortKey against the submodule schema and return a safe ORDER BY. */
function buildItemsOrderBy(q: ListItemsQuery): Prisma.Sql {
  const dir = q.sortDir === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");
  if (q.sortKey === "updatedAt") return Prisma.sql`updated_at ${dir}, id DESC`;
  if (q.sortKey === "createdAt") return Prisma.sql`created_at ${dir}, id DESC`;

  if (q.sortKey) {
    const field = getSchema(q.submodule).fields.find((f) => f.key === q.sortKey);
    if (field) {
      const numeric = field.type === "number" || field.type === "currency";
      const expr = numeric
        ? Prisma.sql`CASE WHEN (data->>${q.sortKey}) ~ ${Prisma.raw(NUMERIC_RE)} THEN (data->>${q.sortKey})::numeric END`
        : Prisma.sql`lower(data->>${q.sortKey})`;
      return Prisma.sql`${expr} ${dir} NULLS LAST, id DESC`;
    }
  }
  return Prisma.sql`created_at DESC, id DESC`;
}

function clampPageSize(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 100;
  return Math.min(v, 2000);
}

/**
 * Seed masters (+ demo items) the first time an org touches the system.
 * First-load marker = absence of the masters snapshot row. Demo items are only
 * seeded when the org has zero records (so an import-first / delete-all org
 * doesn't get demo rows injected on top of real data).
 */
async function seedIfFirstLoad(ctx: InvCtx): Promise<void> {
  const snap = await prisma.inventoryMasterSnapshot.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (snap) return;

  const existing = await prisma.inventoryRecord.count({
    where: { organizationId: ctx.organizationId },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.inventoryMasterSnapshot.create({
        data: { organizationId: ctx.organizationId, masters: structuredClone(SEED_MASTERS) as any },
      });
      if (existing === 0) {
        for (const key of SUBMODULE_ORDER) {
          for (const r of seedItems(key)) {
            const { id, submodule, createdAt, updatedAt, ...data } = r as any;
            await tx.inventoryRecord.create({
              data: {
                organizationId: ctx.organizationId,
                submodule: key,
                status: (data.status as string) ?? null,
                data: data as any,
                createdById: ctx.userId,
              },
            });
          }
        }
      }
    });
  } catch {
    // Concurrent first-load already created the snapshot (unique gate) — ignore.
  }
}

/**
 * Seed-if-needed, then return this org's master registry (with seed backfill
 * persisted). Shared by load() and the lightweight loadMasters() the provider
 * uses on mount — so opening an inventory tab no longer pulls every record.
 */
async function resolveMasters(ctx: InvCtx): Promise<MasterType[]> {
  await seedIfFirstLoad(ctx);

  const snap = await prisma.inventoryMasterSnapshot.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  const masters = ((snap?.masters as MasterType[] | undefined) ?? []).slice();

  // Backfill masters added to the seed after this org first loaded, so new
  // dropdowns appear without a manual reset (mirrors the old mock behaviour).
  const known = new Set(masters.map((m) => m.key));
  let changed = false;
  for (const m of SEED_MASTERS) {
    if (!known.has(m.key)) {
      masters.push(structuredClone(m));
      changed = true;
    }
  }
  if (changed && snap) {
    await prisma.inventoryMasterSnapshot.update({
      where: { organizationId: ctx.organizationId },
      data: { masters: masters as any },
    });
  }
  return masters;
}

export const InventoryHandlers = {
  /**
   * Legacy full snapshot (masters + ALL items for all submodules). Retained for
   * back-compat / tooling, but the UI no longer calls this — it loads masters
   * via loadMasters() and items a page at a time via listItems().
   */
  async load(ctx: InvCtx): Promise<InventorySnapshot> {
    const masters = await resolveMasters(ctx);

    const rows = await prisma.inventoryRecord.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const items = { store: [], machine: [], metal: [] } as Record<SubmoduleKey, InventoryItem[]>;
    for (const r of rows) {
      (items[r.submodule as SubmoduleKey] ??= []).push(toRecord(r));
    }
    for (const k of SUBMODULE_ORDER) items[k] ??= [];

    return { version: SNAPSHOT_VERSION, masters, items };
  },

  /** Just the master registry — the provider's cheap mount-time load. */
  async loadMasters(ctx: InvCtx): Promise<MasterType[]> {
    return resolveMasters(ctx);
  },

  /**
   * One paginated page of a submodule, server-filtered/sorted, with the total
   * and the low/out badge counts — all in a SINGLE round-trip via window
   * functions. The list projection strips the heavy `image` (base64 data-URL)
   * and `description` keys; the full record is fetched lazily via getItem().
   */
  async listItems(ctx: InvCtx, q: ListItemsQuery): Promise<ListItemsResult> {
    if (!isValidSubmodule(q.submodule)) throw new Error(`Invalid submodule: ${String(q.submodule)}`);
    const page = Number.isFinite(q.page) && q.page >= 0 ? Math.floor(q.page) : 0;
    const pageSize = clampPageSize(q.pageSize);
    const where = buildItemsWhere(ctx, q);
    const orderBy = buildItemsOrderBy(q);

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        submodule: string;
        data: unknown;
        created_at: Date | string;
        updated_at: Date | string;
        total: bigint;
        low_count: bigint;
        out_count: bigint;
      }>
    >(Prisma.sql`
      SELECT id, submodule, created_at, updated_at,
             (data - 'image' - 'description') AS data,
             COUNT(*) OVER() AS total,
             SUM(CASE WHEN ${SQL_LOW_PRED} THEN 1 ELSE 0 END) OVER() AS low_count,
             SUM(CASE WHEN ${SQL_OUT_PRED} THEN 1 ELSE 0 END) OVER() AS out_count
        FROM inventory_records
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ${pageSize} OFFSET ${page * pageSize}
    `);

    return {
      rows: rows.map(toRecordRaw),
      // Window aggregates come back as BigInt — Number() them (JSON can't serialise BigInt).
      total: rows.length ? Number(rows[0].total) : 0,
      lowCount: rows.length ? Number(rows[0].low_count) : 0,
      outCount: rows.length ? Number(rows[0].out_count) : 0,
      page,
      pageSize,
    };
  },

  /** Full single record (incl. image + description) for the preview/edit pane. */
  async getItem(ctx: InvCtx, id: string): Promise<InventoryItem | null> {
    const row = await prisma.inventoryRecord.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    return row ? toRecord(row) : null;
  },

  /** All matching ids (no pagination) — backs "Select all N matching". */
  async listItemIds(ctx: InvCtx, q: ListItemsQuery): Promise<string[]> {
    if (!isValidSubmodule(q.submodule)) throw new Error(`Invalid submodule: ${String(q.submodule)}`);
    const where = buildItemsWhere(ctx, q);
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM inventory_records WHERE ${where}`,
    );
    return rows.map((r) => r.id);
  },

  /** Lean records for a set of ids (cross-page export of the current selection). */
  async getItemsByIds(ctx: InvCtx, ids: string[]): Promise<InventoryItem[]> {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const rows = await prisma.inventoryRecord.findMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((r) => {
      const rec = toRecord(r);
      delete (rec as Record<string, unknown>).image;
      delete (rec as Record<string, unknown>).description;
      return rec;
    });
  },

  async createItem(ctx: InvCtx, submodule: unknown, data: Record<string, unknown>): Promise<InventoryItem> {
    if (!isValidSubmodule(submodule)) throw new Error(`Invalid submodule: ${String(submodule)}`);
    const schema = getSchema(submodule);
    const clean = stripReserved(data || {}); // `itemCode` already stripped (RESERVED)

    // Mint the item code and persist it atomically with the record.
    const row = await prisma.$transaction(async (tx) => {
      const itemCode = await nextCode(tx, {
        scopeKey: `inv:${ctx.organizationId}:${submodule}`,
        prefix: schema.codePrefix,
        computeSeed: () =>
          maxCodeSuffix(tx, "inventory_records", ctx.organizationId, submodule, "itemCode", schema.codePrefix),
      });
      return tx.inventoryRecord.create({
        data: {
          organizationId: ctx.organizationId,
          submodule,
          status: (clean.status as string) ?? null,
          data: { ...clean, itemCode } as any,
          createdById: ctx.userId,
        },
      });
    });
    return toRecord(row);
  },

  async updateItem(ctx: InvCtx, id: string, submodule: unknown, patch: Record<string, unknown>): Promise<InventoryItem> {
    if (!isValidSubmodule(submodule)) throw new Error(`Invalid submodule: ${String(submodule)}`);
    const existing = await prisma.inventoryRecord.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) throw new Error("Item not found");
    const merged = { ...(existing.data as Record<string, unknown>), ...stripReserved(patch || {}) };
    const row = await prisma.inventoryRecord.update({
      where: { id },
      data: { data: merged as any, status: (merged.status as string) ?? null },
    });
    return toRecord(row);
  },

  async deleteItem(ctx: InvCtx, id: string): Promise<{ id: string }> {
    await prisma.inventoryRecord.deleteMany({ where: { id, organizationId: ctx.organizationId } });
    return { id };
  },

  /** Delete many items in ONE statement (org-scoped). Returns how many rows
   *  were actually removed. */
  async bulkDelete(ctx: InvCtx, ids: string[]): Promise<{ count: number }> {
    if (!Array.isArray(ids) || ids.length === 0) return { count: 0 };
    const res = await prisma.inventoryRecord.deleteMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId },
    });
    return { count: res.count };
  },

  async saveMasters(ctx: InvCtx, masters: MasterType[]): Promise<MasterType[]> {
    await prisma.inventoryMasterSnapshot.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId, masters: masters as any },
      update: { masters: masters as any },
    });
    return masters;
  },

  async reset(ctx: InvCtx): Promise<InventorySnapshot> {
    await prisma.$transaction([
      prisma.inventoryRecord.deleteMany({ where: { organizationId: ctx.organizationId } }),
      prisma.inventoryMasterSnapshot.deleteMany({ where: { organizationId: ctx.organizationId } }),
    ]);
    return this.load(ctx);
  },
};
