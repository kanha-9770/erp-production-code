/**
 * Inventory ⇄ approval-engine adapter.
 *
 * The inventory-aware glue the generic engine (lib/approvals) needs: criteria
 * field metadata, master id→label canonicalisation, settlement write-back into
 * the InventoryRecord, record summaries/snapshots for the inbox, and resubmit.
 *
 * Status handling: while PENDING the denormalised `status` COLUMN is forced to
 * "PENDING_APPROVAL" while the user-intended value is preserved in
 * `data._approval.priorStatus`; on settle/recall the real status is restored.
 * (Inventory has no workflow-status column, so this column trick is safe — unlike
 * purchase, whose status column is its workflow stage.)
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSchema, SUBMODULE_ORDER } from "@/lib/inventory-system/schema";
import { MANAGE_INVENTORY_APPROVAL_PROCESS } from "@/lib/permissions/inventory-permissions";
import { findMatchingProcess, submitForApproval, APPROVAL_TX_OPTS } from "@/lib/approvals/engine";
import { ApprovalStateError } from "@/lib/approvals/errors";
import type { MasterType, SubmoduleKey } from "@/lib/inventory-system/types";
import type {
  AdapterCtx,
  ApprovalAdapter,
  ApprovalMeta,
  FieldTypeMap,
  RecordSummary,
  SettlementContext,
  TriggerKind,
} from "@/lib/approvals/types";

export const INVENTORY_MODULE = "inventory";

/** The denormalised `status` column value that flags an inventory record pending. */
export const PENDING_STATUS = "PENDING_APPROVAL";

function isItemSubmodule(s: string | null): s is SubmoduleKey {
  return !!s && (SUBMODULE_ORDER as string[]).includes(s);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Canonicalise master option ids/codes → their label so criteria compare like-for-like. */
export async function canonicalizeInventoryData(
  organizationId: string,
  submodule: string | null,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isItemSubmodule(submodule)) return data;
  const masterFields = getSchema(submodule).fields.filter((f) => f.type === "master");
  if (masterFields.length === 0) return data;

  const snap = await prisma.inventoryMasterSnapshot.findUnique({ where: { organizationId } });
  const masters = (snap?.masters as MasterType[] | undefined) ?? [];
  const byKey = new Map(masters.map((m) => [m.key, m]));

  const out: Record<string, unknown> = { ...data };
  for (const f of masterFields) {
    const raw = data[f.key];
    if (raw == null || raw === "") continue;
    const master = f.master ? byKey.get(f.master) : undefined;
    if (!master) continue;
    const s = String(raw);
    const opt = master.options.find((o) => o.id === s || o.value === s || o.code === s);
    if (opt) out[f.key] = opt.value;
  }
  return out;
}

export const inventoryApprovalAdapter: ApprovalAdapter = {
  module: INVENTORY_MODULE,
  label: "Inventory",
  managePermission: MANAGE_INVENTORY_APPROVAL_PROCESS,
  submodules: SUBMODULE_ORDER.map((k) => ({ key: k, label: getSchema(k).label })),

  fieldTypes(submodule): FieldTypeMap {
    if (!isItemSubmodule(submodule)) return {};
    const out: FieldTypeMap = {};
    for (const f of getSchema(submodule).fields) out[f.key] = f.type;
    return out;
  },

  fieldSections(submodule): Record<string, string> {
    if (!isItemSubmodule(submodule)) return {};
    const out: Record<string, string> = {};
    for (const f of getSchema(submodule).fields) out[f.key] = f.section;
    return out;
  },

  canonicalizeData: canonicalizeInventoryData,

  async loadRecordSummaries(organizationId, recordIds) {
    const map = new Map<string, RecordSummary>();
    if (recordIds.length === 0) return map;
    const rows = await prisma.inventoryRecord.findMany({
      where: { id: { in: recordIds }, organizationId },
      select: { id: true, submodule: true, data: true },
    });
    for (const r of rows) {
      const d = (r.data as Record<string, unknown>) ?? {};
      map.set(r.id, {
        id: r.id,
        submodule: r.submodule,
        primary: (d.itemName as string) || (d.itemCode as string) || "—",
        secondary: (d.itemCode as string) ?? null,
      });
    }
    return map;
  },

  async loadRecordSnapshot(organizationId, recordId) {
    const row = await prisma.inventoryRecord.findFirst({
      where: { id: recordId, organizationId },
      select: { submodule: true, data: true },
    });
    if (!row) return null;
    const data = { ...((row.data as Record<string, unknown>) ?? {}) };
    delete data.image;
    return { submodule: row.submodule, data };
  },

  async onSettled(tx: Prisma.TransactionClient, ctx: SettlementContext): Promise<void> {
    const row = await tx.inventoryRecord.findFirst({
      where: { id: ctx.recordId, organizationId: ctx.organizationId },
    });
    if (!row) return; // record deleted while pending — nothing to write back

    const data: Record<string, unknown> = { ...((row.data as Record<string, unknown>) ?? {}) };
    const meta = (data._approval ?? {}) as ApprovalMeta;
    const priorStatus = (meta.priorStatus ?? (data.status as string | undefined) ?? null) as string | null;
    const req = ctx.request;

    if (ctx.decision === "APPROVED" && req.trigger === "EDIT" && req.pendingPatch && typeof req.pendingPatch === "object") {
      Object.assign(data, req.pendingPatch as Record<string, unknown>);
    }
    if (ctx.decision !== "RECALLED" && ctx.action?.setFields) {
      Object.assign(data, ctx.action.setFields);
    }

    const explicitStatus = ctx.decision !== "RECALLED" ? ctx.action?.setStatus : undefined;
    if (explicitStatus != null) data.status = explicitStatus;
    else if (priorStatus != null) data.status = priorStatus;
    const newStatus = (explicitStatus ?? (data.status as string | undefined) ?? null) as string | null;

    data._approval = {
      requestId: req.id,
      status: ctx.decision,
      processName: meta.processName,
      decidedAt: nowIso(),
      ...(ctx.comment ? { comment: ctx.comment } : {}),
    } satisfies ApprovalMeta;

    await tx.inventoryRecord.update({
      where: { id: row.id },
      data: { data: data as Prisma.InputJsonValue, status: newStatus },
    });
  },

  async resubmit(ctx: AdapterCtx, recordId: string): Promise<{ resubmitted: boolean }> {
    const existing = await prisma.inventoryRecord.findFirst({
      where: { id: recordId, organizationId: ctx.organizationId },
    });
    if (!existing) throw new Error("Item not found");
    if (existing.status === PENDING_STATUS) {
      throw new ApprovalStateError("This record already has a pending approval request.");
    }
    const submodule = existing.submodule;
    if (!isItemSubmodule(submodule)) throw new Error("This record cannot be submitted for approval.");

    const data = (existing.data as Record<string, unknown>) ?? {};
    const last = await prisma.approvalRequest.findFirst({
      where: { organizationId: ctx.organizationId, recordId },
      orderBy: { createdAt: "desc" },
      select: { id: true, trigger: true },
    });
    const trigger = (last?.trigger as TriggerKind) ?? "EDIT";
    const normalized = await canonicalizeInventoryData(ctx.organizationId, submodule, data);
    const process = await findMatchingProcess(
      prisma,
      { organizationId: ctx.organizationId, module: INVENTORY_MODULE, submodule },
      trigger,
      normalized,
    );

    if (!process) {
      const next = { ...data };
      delete next._approval;
      await prisma.inventoryRecord.update({
        where: { id: recordId },
        data: { data: next as Prisma.InputJsonValue, status: (next.status as string) ?? null },
      });
      return { resubmitted: false };
    }

    await prisma.$transaction(async (tx) => {
      const { approvalMeta } = await submitForApproval(tx, {
        organizationId: ctx.organizationId,
        module: INVENTORY_MODULE,
        submodule,
        recordId,
        requestedById: ctx.userId,
        trigger,
        process,
        priorStatus: (data.status as string) ?? null,
        supersedesId: last?.id ?? null,
      });
      await tx.inventoryRecord.update({
        where: { id: recordId },
        data: { data: { ...data, _approval: approvalMeta } as unknown as Prisma.InputJsonValue, status: PENDING_STATUS },
      });
    }, APPROVAL_TX_OPTS);
    return { resubmitted: true };
  },
};
