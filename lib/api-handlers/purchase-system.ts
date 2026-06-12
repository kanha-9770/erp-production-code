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
import {
  POST_GRN_STOCK,
  getPurchasePermissions,
  guardedPermissionForCreate,
  guardedPermissionForPatch,
  requirePurchasePermission,
  submoduleCreatePermission,
  deletePermission,
  purchaseHierarchyEnforced,
  assertApprovalWithinHierarchy,
  approvalsEngineOnly,
} from "@/lib/permissions/purchase-permissions";
import {
  assertSectionEditsAllowed,
  getSectionAccess,
} from "@/lib/permissions/section-permissions";
import { isOrgAdmin } from "@/lib/permissions/has-permission";
import {
  findMatchingProcess,
  submitForApproval,
  cancelOpenRequestsForRecords,
  APPROVAL_TX_OPTS,
} from "@/lib/approvals/engine";
import { ApprovalLockedError } from "@/lib/approvals/errors";
import type { ApprovalMeta } from "@/lib/approvals/types";
import {
  purchaseApprovalAdapter,
  purchaseApprovalMeta,
  PURCHASE_MODULE,
} from "@/lib/purchase-system/approval-adapter";
import { grnItemRows } from "@/lib/purchase-system/receipt";
import type {
  PurchaseRecord as PurchaseRecordType,
  PurchaseSnapshot,
  CurrentUserIdentity,
  MasterType,
  PurchaseSubmoduleKey,
  SectionAccess,
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
// `_approval` is the server-only approval marker (written exclusively by the
// approval engine) — a client must never forge or clear it.
const RESERVED = ["id", "submodule", "createdAt", "updatedAt", "_optimistic", "_deleting", "docNo", "_approval"];

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

/** PO numbers referenced by a GRN's receipt lines (invoice grid + flat lines). */
function grnPoRefs(data: Record<string, unknown> | null | undefined): string[] {
  return grnItemRows(data)
    .map((r) => String((r as Record<string, unknown>).poRef ?? "").trim())
    .filter(Boolean);
}

/**
 * After any GRN change, recompute received qty per referenced PO across ALL GRNs
 * and flip that PO's status: → CLOSED once fully received, or back to SENT if a
 * later edit/deletion drops it below the ordered qty. System action (no approval
 * gate) — the Open-POs report already hides closed POs; this makes the PO record
 * itself reflect the closure.
 */
async function reconcilePoClosure(organizationId: string, poRefs: string[]): Promise<void> {
  const refs = [...new Set(poRefs.map((r) => r.trim()).filter(Boolean))];
  if (refs.length === 0) return;

  const grns = await prisma.purchaseRecord.findMany({
    where: { organizationId, submodule: "grn" },
    select: { data: true },
  });
  const receivedByPo = new Map<string, number>();
  for (const g of grns) {
    for (const row of grnItemRows(g.data as Record<string, unknown>)) {
      const po = String((row as Record<string, unknown>).poRef ?? "").trim();
      if (!po) continue;
      receivedByPo.set(po, (receivedByPo.get(po) ?? 0) + (Number((row as Record<string, unknown>).receivedQty ?? 0) || 0));
    }
  }

  const pos = await prisma.purchaseRecord.findMany({
    where: { organizationId, submodule: "po" },
    select: { id: true, data: true },
  });
  for (const po of pos) {
    const d = (po.data as Record<string, unknown>) ?? {};
    const docNo = String(d.docNo ?? "").trim();
    if (!refs.includes(docNo)) continue;
    const ordered = Number(d.quantity ?? 0) || 0;
    if (ordered <= 0) continue;
    const received = receivedByPo.get(docNo) ?? 0;
    const status = String(d.status ?? "");
    if (received >= ordered && status !== "CLOSED" && status !== "CANCELLED") {
      await prisma.purchaseRecord.update({ where: { id: po.id }, data: { data: { ...d, status: "CLOSED" } as any, status: "CLOSED" } });
    } else if (received < ordered && status === "CLOSED") {
      await prisma.purchaseRecord.update({ where: { id: po.id }, data: { data: { ...d, status: "SENT" } as any, status: "SENT" } });
    }
  }
}

/** Thrown when a GRN tries to receive against a PO that isn't approved yet → 403. */
class UnapprovedPoReceiveError extends Error {
  readonly forbidden = true;
  constructor(refs: string[]) {
    const list = refs.join(", ");
    super(
      refs.length > 1
        ? `These purchase orders must be approved before goods can be received against them: ${list}.`
        : `Purchase order ${list} must be approved before goods can be received against it.`,
    );
    this.name = "UnapprovedPoReceiveError";
  }
}

/**
 * Block receiving against an unapproved PO: every supplied poRef that matches a
 * KNOWN PO in this org must have `approvalStatus === "APPROVED"`. Callers pass the
 * NEWLY-added refs (diffed against the existing GRN) so re-saving never re-checks
 * an already-booked line. Refs that don't match any PO are left alone (treated as
 * external/manual references, validated elsewhere).
 */
async function assertGrnPosApproved(organizationId: string, refs: string[]): Promise<void> {
  const want = [...new Set(refs.map((r) => r.trim()).filter(Boolean))];
  if (want.length === 0) return;
  const pos = await prisma.purchaseRecord.findMany({
    where: { organizationId, submodule: "po" },
    select: { data: true },
  });
  const approvedByDocNo = new Map<string, boolean>(); // docNo → is approved
  for (const po of pos) {
    const d = (po.data as Record<string, unknown>) ?? {};
    const docNo = String(d.docNo ?? "").trim();
    if (docNo) approvedByDocNo.set(docNo, String(d.approvalStatus ?? "").toUpperCase() === "APPROVED");
  }
  const blocked = want.filter((r) => approvedByDocNo.get(r) === false);
  if (blocked.length > 0) throw new UnapprovedPoReceiveError(blocked);
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

    const [currentUser, permissions, sectionAccess] = await Promise.all([
      resolveUserIdentity(ctx.userId),
      getPurchasePermissions(ctx.userId),
      getSectionAccess(ctx.userId, ctx.organizationId, "purchase"),
    ]);
    // Every privileged purchase FIELD is now reserved to its named permission even
    // under engine-only — GRN stock-posting (postStock), the PR approval
    // (approveRequisition — Production Approval / Item Location Kept), the PO
    // approval (approvePo) and the payment status (approvePayment for the approval
    // decision; raisePayment for marking PAID). So the snapshot sends the user's
    // real permissions verbatim (no engine-only field unlock) and the UI locks
    // each field accordingly. Mirrors the server gate in createRecord/updateRecord.
    // (Engine-only still relaxes the role-hierarchy gate, handled in those gates.)

    return {
      version: SNAPSHOT_VERSION,
      masters,
      records,
      currentUser,
      permissions,
      sectionAccess: sectionAccess as SectionAccess,
    };
  },

  async createRecord(ctx: PurCtx, submodule: unknown, data: Record<string, unknown>): Promise<PurchaseRecordType> {
    if (!isValidSubmodule(submodule)) throw new Error(`Invalid submodule: ${String(submodule)}`);
    const schema = getSchema(submodule);
    const clean = stripReserved(data || {}); // `docNo` already stripped (RESERVED)

    // Some submodules are privileged to create at all (e.g. raising a payment).
    const subNeeds = submoduleCreatePermission(submodule);
    if (subNeeds) await requirePurchasePermission(ctx.userId, subNeeds);
    // Block creating a record already pre-approved / pre-posted to skip the gate;
    // benign defaults (PENDING/NO) pass through without a permission.
    const createNeeds = guardedPermissionForCreate(submodule, clean);
    // Every privileged purchase field is reserved to its named permission even
    // under engine-only (GRN stock-posting + the PR/PO/payment approvals), so the
    // field gate always applies. Engine-only only relaxes the role-hierarchy gate
    // below (the approval-process engine still routes who decides).
    const createEngineOnly = await approvalsEngineOnly(ctx.organizationId);
    if (createNeeds) {
      await requirePurchasePermission(ctx.userId, createNeeds);
      // Closing the create-time back-door under hierarchy mode: you can't mint a
      // pre-approved document (you'd be approving your own — never a subordinate's).
      if (!createEngineOnly && (await purchaseHierarchyEnforced(ctx.organizationId))) {
        await assertApprovalWithinHierarchy({
          actingUserId: ctx.userId,
          creatorId: ctx.userId,
          organizationId: ctx.organizationId,
        });
      }
    }
    // Restricted form sections may only be pre-filled by their grantees
    // (diffed against the schema defaults — untouched defaults pass).
    await assertSectionEditsAllowed({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      module: "purchase",
      submodule,
      existing: null,
      patch: clean,
    });
    // A GRN may only receive against an APPROVED purchase order.
    if (submodule === "grn") await assertGrnPosApproved(ctx.organizationId, grnPoRefs(clean));

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

    const userStatus = (clean.status as string) ?? null;

    // Mint the document number and persist it atomically with the record, so an
    // aborted create never burns a number. If an approval process intercepts the
    // create, the record is created then immediately flagged PENDING via
    // `data._approval` (the workflow `status` column is left untouched).
    const row = await prisma.$transaction(async (tx) => {
      const docNo = await nextCode(tx, {
        scopeKey: `pur:${ctx.organizationId}:${submodule}`,
        prefix: schema.codePrefix,
        computeSeed: () =>
          maxCodeSuffix(tx, "purchase_records", ctx.organizationId, submodule, "docNo", schema.codePrefix),
      });
      const recordData = { ...clean, ...userOverrides, docNo };
      const created = await tx.purchaseRecord.create({
        data: {
          organizationId: ctx.organizationId,
          submodule,
          status: userStatus,
          data: recordData as any,
          createdById: ctx.userId,
        },
      });

      const normalized = await purchaseApprovalAdapter.canonicalizeData(ctx.organizationId, submodule, recordData);
      const changedKeys = Object.keys(recordData).filter((k) => {
        const v = (recordData as Record<string, unknown>)[k];
        return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
      });
      const process = await findMatchingProcess(
        tx,
        { organizationId: ctx.organizationId, module: PURCHASE_MODULE, submodule },
        "CREATE",
        normalized,
        { changedKeys, fieldSections: purchaseApprovalAdapter.fieldSections(submodule) },
      );
      if (!process) return created;

      const { approvalMeta } = await submitForApproval(tx, {
        organizationId: ctx.organizationId,
        module: PURCHASE_MODULE,
        submodule,
        recordId: created.id,
        requestedById: ctx.userId,
        trigger: "CREATE",
        process,
        priorStatus: userStatus,
      });
      return tx.purchaseRecord.update({
        where: { id: created.id },
        data: { data: { ...recordData, _approval: approvalMeta } as any },
      });
    }, APPROVAL_TX_OPTS);
    if (submodule === "grn") await reconcilePoClosure(ctx.organizationId, grnPoRefs(row.data as Record<string, unknown>));
    return toRecord(row);
  },

  async updateRecord(ctx: PurCtx, id: string, submodule: unknown, patch: Record<string, unknown>): Promise<PurchaseRecordType> {
    if (!isValidSubmodule(submodule)) throw new Error(`Invalid submodule: ${String(submodule)}`);
    const existing = await prisma.purchaseRecord.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) throw new Error("Record not found");
    const existingData = (existing.data as Record<string, unknown>) ?? {};

    // A record awaiting approval is read-only: only an admin may force-edit it;
    // everyone else must recall the pending request first. (Purchase tracks
    // pending in `data._approval`, not the workflow status column.)
    const isPending = purchaseApprovalMeta(existingData)?.status === "PENDING";
    if (isPending && !(await isOrgAdmin(ctx.userId))) throw new ApprovalLockedError();

    const cleanPatch = stripReserved(patch || {});

    // Approval / stock-posting transitions are privileged: only callers holding
    // the matching named permission (or admins/owner) may flip them. An ordinary
    // edit that doesn't touch a guarded field needs no special permission.
    const needed = guardedPermissionForPatch(submodule, existingData, cleanPatch);
    // Every privileged purchase field is reserved to its named permission even
    // under engine-only — GRN stock-posting, the PR/PO approvals, and the payment
    // status (approve/hold/reject → APPROVE_PAYMENT_REQUEST; mark PAID →
    // RAISE_PAYMENT_REQUEST). So the field gate always applies; engine-only only
    // relaxes the role-hierarchy gate below.
    const editEngineOnly = await approvalsEngineOnly(ctx.organizationId);
    if (needed) {
      await requirePurchasePermission(ctx.userId, needed);
      // Legacy mode only: an approver may act only on documents raised by their
      // own subordinates (role hierarchy) when the org enabled that gate.
      if (!editEngineOnly && (await purchaseHierarchyEnforced(ctx.organizationId))) {
        await assertApprovalWithinHierarchy({
          actingUserId: ctx.userId,
          creatorId: existing.createdById,
          organizationId: ctx.organizationId,
        });
      }
    }
    // Section-restricted fields may only be CHANGED by their grantees
    // (re-saving the full form bag with untouched values passes).
    await assertSectionEditsAllowed({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      module: "purchase",
      submodule,
      existing: existingData,
      patch: cleanPatch,
    });

    const merged = { ...existingData, ...cleanPatch };

    // A GRN may only receive against an APPROVED PO — check only the newly-added
    // PO refs so re-saving a GRN with already-booked lines never re-validates them.
    if (submodule === "grn") {
      const before = new Set(grnPoRefs(existingData));
      await assertGrnPosApproved(ctx.organizationId, grnPoRefs(merged).filter((r) => !before.has(r)));
    }

    // Admin force-edit while pending: persist the change but keep it pending.
    if (isPending) {
      const row = await prisma.purchaseRecord.update({
        where: { id },
        data: { data: merged as any, status: (merged.status as string) ?? null },
      });
      if (submodule === "grn") await reconcilePoClosure(ctx.organizationId, [...grnPoRefs(existingData), ...grnPoRefs(merged)]);
      return toRecord(row);
    }

    // Does an EDIT approval process intercept this change? If so, PARK the patch
    // (record keeps its old values + a pending marker) until approved.
    const normalized = await purchaseApprovalAdapter.canonicalizeData(ctx.organizationId, submodule, merged);
    const changedKeys = Object.keys(cleanPatch).filter(
      (k) => String(cleanPatch[k] ?? "") !== String(existingData[k] ?? ""),
    );
    const process = await findMatchingProcess(
      prisma,
      { organizationId: ctx.organizationId, module: PURCHASE_MODULE, submodule },
      "EDIT",
      normalized,
      { changedKeys, fieldSections: purchaseApprovalAdapter.fieldSections(submodule) },
    );
    if (process) {
      const row = await prisma.$transaction(async (tx) => {
        const { approvalMeta } = await submitForApproval(tx, {
          organizationId: ctx.organizationId,
          module: PURCHASE_MODULE,
          submodule,
          recordId: id,
          requestedById: ctx.userId,
          trigger: "EDIT",
          process,
          pendingPatch: cleanPatch,
          prePatchData: existingData,
          priorStatus: (existingData.status as string) ?? null,
        });
        return tx.purchaseRecord.update({
          where: { id },
          data: {
            data: { ...existingData, _approval: approvalMeta } as any,
            status: (existingData.status as string) ?? null,
          },
        });
      }, APPROVAL_TX_OPTS);
      return toRecord(row);
    }

    // No approval needed — apply as before, dropping any stale terminal marker.
    const nextData = { ...merged };
    const marker = nextData._approval as ApprovalMeta | undefined;
    if (marker && marker.status !== "PENDING") delete nextData._approval;
    const row = await prisma.purchaseRecord.update({
      where: { id },
      data: { data: nextData as any, status: (merged.status as string) ?? null },
    });
    if (submodule === "grn") await reconcilePoClosure(ctx.organizationId, [...grnPoRefs(existingData), ...grnPoRefs(merged)]);
    return toRecord(row);
  },

  async deleteRecord(ctx: PurCtx, id: string): Promise<{ id: string }> {
    // Deleting any purchase document is a buyer/admin action, not a requester's.
    await requirePurchasePermission(ctx.userId, deletePermission());
    // If a GRN is being deleted, remember which POs it touched so we can re-open
    // any that drop below full receipt afterwards.
    const doomed = await prisma.purchaseRecord.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { submodule: true, data: true },
    });
    await prisma.$transaction(async (tx) => {
      await cancelOpenRequestsForRecords(tx, ctx.organizationId, [id], ctx.userId);
      await tx.purchaseRecord.deleteMany({ where: { id, organizationId: ctx.organizationId } });
    }, APPROVAL_TX_OPTS);
    if (doomed?.submodule === "grn") {
      await reconcilePoClosure(ctx.organizationId, grnPoRefs(doomed.data as Record<string, unknown>));
    }
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
    // Receiving goods into inventory is a store-keeper privilege.
    await requirePurchasePermission(ctx.userId, POST_GRN_STOCK);
    const grn = await prisma.purchaseRecord.findFirst({
      where: { id: grnId, organizationId: ctx.organizationId, submodule: "grn" },
    });
    if (!grn) throw new Error("GRN not found");

    const data = (grn.data as Record<string, unknown>) ?? {};
    if (String(data.stockUpdated ?? "NO") === "YES") {
      return { grn: toRecord(grn), increased: [], created: [], alreadyPosted: true };
    }

    // Aggregate received qty (+ amount, for a unit rate) per item name across
    // every receipt line on this GRN — invoice lines and flat challan /
    // no-invoice lines alike.
    const byItem = new Map<string, { name: string; qty: number; amount: number }>();
    for (const it of grnItemRows(data)) {
      const name = String(it.itemName ?? "").trim();
      const qty = Number(it.receivedQty ?? 0) || 0;
      if (!name || qty <= 0) continue;
      const key = name.toLowerCase();
      const cur = byItem.get(key) ?? { name, qty: 0, amount: 0 };
      cur.qty += qty;
      cur.amount += Number(it.amount ?? 0) || 0;
      byItem.set(key, cur);
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
