/**
 * Purchase System — server-side data handlers.
 *
 * Mirror of lib/api-handlers/inventory-system.ts, backed by PurchaseRecord +
 * PurchaseMasterSnapshot. Records are schema-driven open bags
 * (lib/purchase-system/schema.ts) stored in the `data` JSON column — including
 * nested lineItems (GRN invoices) and computed fields (receiptStatus), which are
 * persisted verbatim. The `status` mirror column tracks the workflow status
 * (data.status), NOT receiptStatus.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SEED_MASTERS, SUBMODULE_ORDER, getSchema } from "@/lib/purchase-system/schema";
import { seedRecords } from "@/lib/purchase-system/seed";
import { nextCode, maxCodeSuffix } from "@/lib/sequence/next-code";
import type {
  PurchaseRecord as PurchaseRecordType,
  PurchaseSnapshot,
  CurrentUserIdentity,
  MasterType,
  PurchaseSubmoduleKey,
} from "@/lib/purchase-system/types";

export interface PurCtx {
  organizationId: string;
  userId: string;
}

export interface PostStockResult {
  grn: PurchaseRecordType;
  /** Existing store items whose stock was increased. */
  increased: Array<{ itemCode: string; itemName: string; added: number; newStock: number }>;
  /** Store items auto-created because no match existed. */
  created: Array<{ itemCode: string; itemName: string; qty: number }>;
  /** True when the GRN was already posted (no-op). */
  alreadyPosted: boolean;
}

const SNAPSHOT_VERSION = 1;
// `docNo` is system-generated and locked — never let a client set or change it.
const RESERVED = ["id", "submodule", "createdAt", "updatedAt", "_optimistic", "_deleting", "docNo"];

function isValidSubmodule(s: unknown): s is PurchaseSubmoduleKey {
  return typeof s === "string" && (SUBMODULE_ORDER as string[]).includes(s);
}

function stripReserved(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  for (const k of RESERVED) delete out[k];
  return out;
}

/**
 * Resolve the logged-in user's display name + department for read-only prefill
 * of user-derived fields ("Requested By", Department). Prefers the linked
 * Employee record, then the User's own name/department, with sensible
 * fallbacks. Empty strings when nothing is set (never throws).
 */
async function resolveUserIdentity(userId: string): Promise<CurrentUserIdentity> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      first_name: true,
      last_name: true,
      username: true,
      email: true,
      department: true,
      employee: { select: { employeeName: true, department: true } },
    },
  });
  const name =
    u?.employee?.employeeName?.trim() ||
    [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() ||
    u?.username?.trim() ||
    u?.email?.trim() ||
    "";
  const department = u?.department?.trim() || u?.employee?.department?.trim() || "";
  return { name, department };
}

function toRecord(row: {
  id: string;
  submodule: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PurchaseRecordType {
  return {
    ...(row.data as Record<string, unknown>),
    id: row.id,
    submodule: row.submodule as PurchaseSubmoduleKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function seedIfFirstLoad(ctx: PurCtx): Promise<void> {
  const snap = await prisma.purchaseMasterSnapshot.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (snap) return;

  const existing = await prisma.purchaseRecord.count({
    where: { organizationId: ctx.organizationId },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.purchaseMasterSnapshot.create({
        data: { organizationId: ctx.organizationId, masters: structuredClone(SEED_MASTERS) as any },
      });
      if (existing === 0) {
        for (const key of SUBMODULE_ORDER) {
          for (const r of seedRecords(key)) {
            const { id, submodule, createdAt, updatedAt, ...data } = r as any;
            await tx.purchaseRecord.create({
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
    // Concurrent first-load already seeded — ignore (unique gate on snapshot).
  }
}

export const PurchaseHandlers = {
  async load(ctx: PurCtx): Promise<PurchaseSnapshot> {
    await seedIfFirstLoad(ctx);

    const snap = await prisma.purchaseMasterSnapshot.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    let masters = ((snap?.masters as MasterType[] | undefined) ?? []).slice();

    const known = new Set(masters.map((m) => m.key));
    let changed = false;
    for (const m of SEED_MASTERS) {
      if (!known.has(m.key)) {
        masters.push(structuredClone(m));
        changed = true;
      }
    }
    if (changed && snap) {
      await prisma.purchaseMasterSnapshot.update({
        where: { organizationId: ctx.organizationId },
        data: { masters: masters as any },
      });
    }

    const rows = await prisma.purchaseRecord.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const records = {
      supplier: [], pr: [], sourcing: [], po: [], grn: [], payment: [],
    } as Record<PurchaseSubmoduleKey, PurchaseRecordType[]>;
    for (const r of rows) {
      (records[r.submodule as PurchaseSubmoduleKey] ??= []).push(toRecord(r));
    }
    for (const k of SUBMODULE_ORDER) records[k] ??= [];

    const currentUser = await resolveUserIdentity(ctx.userId);

    return { version: SNAPSHOT_VERSION, masters, records, currentUser };
  },

  async createRecord(ctx: PurCtx, submodule: unknown, data: Record<string, unknown>): Promise<PurchaseRecordType> {
    if (!isValidSubmodule(submodule)) throw new Error(`Invalid submodule: ${String(submodule)}`);
    const schema = getSchema(submodule);
    const clean = stripReserved(data || {}); // `docNo` already stripped (RESERVED)

    // User-derived fields ("Requested By", Department) are authoritative: resolve
    // them from the authenticated user and overwrite any client-sent value, so
    // they can't be edited or spoofed.
    const prefillFields = schema.fields.filter((f) => f.prefillUser);
    const userOverrides: Record<string, unknown> = {};
    if (prefillFields.length > 0) {
      const identity = await resolveUserIdentity(ctx.userId);
      for (const f of prefillFields) {
        const val = f.prefillUser === "name" ? identity.name : identity.department;
        if (val) userOverrides[f.key] = val; // only override when we actually have a value
      }
    }

    // Mint the document number and persist it atomically with the record, so an
    // aborted create never burns a number.
    const row = await prisma.$transaction(async (tx) => {
      const docNo = await nextCode(tx, {
        scopeKey: `pur:${ctx.organizationId}:${submodule}`,
        prefix: schema.codePrefix,
        computeSeed: () =>
          maxCodeSuffix(tx, "purchase_records", ctx.organizationId, submodule, "docNo", schema.codePrefix),
      });
      return tx.purchaseRecord.create({
        data: {
          organizationId: ctx.organizationId,
          submodule,
          status: (clean.status as string) ?? null,
          data: { ...clean, ...userOverrides, docNo } as any,
          createdById: ctx.userId,
        },
      });
    });
    return toRecord(row);
  },

  async updateRecord(ctx: PurCtx, id: string, submodule: unknown, patch: Record<string, unknown>): Promise<PurchaseRecordType> {
    if (!isValidSubmodule(submodule)) throw new Error(`Invalid submodule: ${String(submodule)}`);
    const existing = await prisma.purchaseRecord.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) throw new Error("Record not found");
    const merged = { ...(existing.data as Record<string, unknown>), ...stripReserved(patch || {}) };
    const row = await prisma.purchaseRecord.update({
      where: { id },
      data: { data: merged as any, status: (merged.status as string) ?? null },
    });
    return toRecord(row);
  },

  async deleteRecord(ctx: PurCtx, id: string): Promise<{ id: string }> {
    await prisma.purchaseRecord.deleteMany({ where: { id, organizationId: ctx.organizationId } });
    return { id };
  },

  async saveMasters(ctx: PurCtx, masters: MasterType[]): Promise<MasterType[]> {
    await prisma.purchaseMasterSnapshot.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId, masters: masters as any },
      update: { masters: masters as any },
    });
    return masters;
  },

  /**
   * Post a received GRN's quantities into Store Inventory. For each invoice line
   * with receivedQty > 0, increments the matching store item's currentStock
   * (matched case-insensitively by itemName); creates the item (auto `STK-` code)
   * when there's no match. Idempotent — a GRN already marked stockUpdated=YES is
   * a no-op — and atomic. Marks the GRN STOCK_UPDATED on success.
   */
  async postStock(ctx: PurCtx, grnId: string): Promise<PostStockResult> {
    const grn = await prisma.purchaseRecord.findFirst({
      where: { id: grnId, organizationId: ctx.organizationId, submodule: "grn" },
    });
    if (!grn) throw new Error("GRN not found");

    const data = (grn.data as Record<string, unknown>) ?? {};
    if (String(data.stockUpdated ?? "NO") === "YES") {
      return { grn: toRecord(grn), increased: [], created: [], alreadyPosted: true };
    }

    // Aggregate received qty (+ amount, for a unit rate) per item name across
    // every invoice line on this GRN.
    const lines = Array.isArray(data.lines) ? (data.lines as Record<string, unknown>[]) : [];
    const byItem = new Map<string, { name: string; qty: number; amount: number }>();
    for (const inv of lines) {
      const items = Array.isArray(inv.items) ? (inv.items as Record<string, unknown>[]) : [];
      for (const it of items) {
        const name = String(it.itemName ?? "").trim();
        const qty = Number(it.receivedQty ?? 0) || 0;
        if (!name || qty <= 0) continue;
        const key = name.toLowerCase();
        const cur = byItem.get(key) ?? { name, qty: 0, amount: 0 };
        cur.qty += qty;
        cur.amount += Number(it.amount ?? 0) || 0;
        byItem.set(key, cur);
      }
    }
    if (byItem.size === 0) throw new Error("This GRN has no received quantities to post.");

    const warehouse = String(data.warehouse ?? "");
    const increased: PostStockResult["increased"] = [];
    const created: PostStockResult["created"] = [];

    const updatedGrn = await prisma.$transaction(async (tx) => {
      for (const entry of byItem.values()) {
        // Match an existing store item by case-insensitive itemName (oldest wins).
        const match = await tx.$queryRaw<Array<{ id: string; data: any }>>(Prisma.sql`
          SELECT id, data
            FROM inventory_records
           WHERE organization_id = ${ctx.organizationId} AND submodule = 'store'
             AND lower(data->>'itemName') = ${entry.name.toLowerCase()}
           ORDER BY created_at ASC
           LIMIT 1
        `);

        if (match.length > 0) {
          const row = match[0];
          const existingData = (row.data as Record<string, unknown>) ?? {};
          const newStock = (Number(existingData.currentStock ?? 0) || 0) + entry.qty;
          await tx.inventoryRecord.update({
            where: { id: row.id },
            data: { data: { ...existingData, currentStock: newStock } as any },
          });
          increased.push({
            itemCode: String(existingData.itemCode ?? ""),
            itemName: entry.name,
            added: entry.qty,
            newStock,
          });
        } else {
          // No match → auto-create a store item with a system STK- code.
          const itemCode = await nextCode(tx, {
            scopeKey: `inv:${ctx.organizationId}:store`,
            prefix: "STK",
            computeSeed: () =>
              maxCodeSuffix(tx, "inventory_records", ctx.organizationId, "store", "itemCode", "STK"),
          });
          const unitRate = entry.qty > 0 ? Number((entry.amount / entry.qty).toFixed(2)) : 0;
          await tx.inventoryRecord.create({
            data: {
              organizationId: ctx.organizationId,
              submodule: "store",
              status: null,
              data: { itemCode, itemName: entry.name, currentStock: entry.qty, minStock: 0, warehouse, unitRate } as any,
              createdById: ctx.userId,
            },
          });
          created.push({ itemCode, itemName: entry.name, qty: entry.qty });
        }
      }

      // Mark the GRN posted (idempotency guard for any re-submit).
      return tx.purchaseRecord.update({
        where: { id: grn.id },
        data: {
          data: { ...data, stockUpdated: "YES", status: "STOCK_UPDATED" } as any,
          status: "STOCK_UPDATED",
        },
      });
    });

    return { grn: toRecord(updatedGrn), increased, created, alreadyPosted: false };
  },

  async reset(ctx: PurCtx): Promise<PurchaseSnapshot> {
    await prisma.$transaction([
      prisma.purchaseRecord.deleteMany({ where: { organizationId: ctx.organizationId } }),
      prisma.purchaseMasterSnapshot.deleteMany({ where: { organizationId: ctx.organizationId } }),
    ]);
    return this.load(ctx);
  },
};
