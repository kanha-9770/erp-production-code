/**
 * Purchase ⇄ approval-engine adapter.
 *
 * Mirror of the inventory adapter for procurement documents (supplier / pr /
 * sourcing / po / grn / payment). KEY DIFFERENCE: purchase's denormalised
 * `status` COLUMN is the workflow stage (DRAFT → APPROVED → … and even a literal
 * "PENDING_APPROVAL" PO stage), so we must NOT hijack it. Approval state lives
 * ONLY in `data._approval`; the status column always reflects the real workflow
 * status. `data.status` (and the column) are only changed by onApprove/onReject
 * setStatus on settlement.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSchema, SUBMODULE_ORDER } from "@/lib/purchase-system/schema";
import { MANAGE_PURCHASE_APPROVAL_PROCESS } from "@/lib/permissions/purchase-permissions";
import { findMatchingProcess, submitForApproval, APPROVAL_TX_OPTS } from "@/lib/approvals/engine";
import { ApprovalStateError } from "@/lib/approvals/errors";
import type { MasterType, PurchaseSubmoduleKey } from "@/lib/purchase-system/types";
import type {
  AdapterCtx,
  ApprovalAdapter,
  ApprovalMeta,
  FieldTypeMap,
  RecordSummary,
  SettlementContext,
  TriggerKind,
} from "@/lib/approvals/types";

export const PURCHASE_MODULE = "purchase";

function isPurSubmodule(s: string | null): s is PurchaseSubmoduleKey {
  return !!s && (SUBMODULE_ORDER as string[]).includes(s);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Read the approval marker a purchase record carries. */
export function purchaseApprovalMeta(data: Record<string, unknown>): ApprovalMeta | null {
  const a = data._approval as ApprovalMeta | undefined;
  return a && typeof a === "object" && a.status ? a : null;
}

export async function canonicalizePurchaseData(
  organizationId: string,
  submodule: string | null,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isPurSubmodule(submodule)) return data;
  const masterFields = getSchema(submodule).fields.filter((f) => f.type === "master");
  if (masterFields.length === 0) return data;

  const snap = await prisma.purchaseMasterSnapshot.findUnique({ where: { organizationId } });
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

export const purchaseApprovalAdapter: ApprovalAdapter = {
  module: PURCHASE_MODULE,
  label: "Purchase",
  managePermission: MANAGE_PURCHASE_APPROVAL_PROCESS,
  submodules: SUBMODULE_ORDER.map((k) => ({ key: k, label: getSchema(k).label })),

  fieldTypes(submodule): FieldTypeMap {
    if (!isPurSubmodule(submodule)) return {};
    const out: FieldTypeMap = {};
    for (const f of getSchema(submodule).fields) out[f.key] = f.type;
    return out;
  },

  fieldSections(submodule): Record<string, string> {
    if (!isPurSubmodule(submodule)) return {};
    const out: Record<string, string> = {};
    for (const f of getSchema(submodule).fields) out[f.key] = f.section;
    return out;
  },

  canonicalizeData: canonicalizePurchaseData,

  async loadRecordSummaries(organizationId, recordIds) {
    const map = new Map<string, RecordSummary>();
    if (recordIds.length === 0) return map;
    const rows = await prisma.purchaseRecord.findMany({
      where: { id: { in: recordIds }, organizationId },
      select: { id: true, submodule: true, data: true },
    });
    for (const r of rows) {
      const d = (r.data as Record<string, unknown>) ?? {};
      map.set(r.id, {
        id: r.id,
        submodule: r.submodule,
        primary: (d.docNo as string) || (d.itemName as string) || "—",
        secondary: (d.supplierName as string) || (d.supplier as string) || (d.itemName as string) || null,
      });
    }
    return map;
  },

  async loadRecordSnapshot(organizationId, recordId) {
    const row = await prisma.purchaseRecord.findFirst({
      where: { id: recordId, organizationId },
      select: { submodule: true, data: true },
    });
    if (!row) return null;
    const data = { ...((row.data as Record<string, unknown>) ?? {}) };
    // Strip heavy media fields from the snapshot payload.
    if (isPurSubmodule(row.submodule)) {
      for (const f of getSchema(row.submodule).fields) {
        if (f.type === "media") delete data[f.key];
      }
    }
    return { submodule: row.submodule, data };
  },

  async onSettled(tx: Prisma.TransactionClient, ctx: SettlementContext): Promise<void> {
    const row = await tx.purchaseRecord.findFirst({
      where: { id: ctx.recordId, organizationId: ctx.organizationId },
    });
    if (!row) return;

    const data: Record<string, unknown> = { ...((row.data as Record<string, unknown>) ?? {}) };
    const meta = (data._approval ?? {}) as ApprovalMeta;
    const req = ctx.request;

    if (ctx.decision === "APPROVED" && req.trigger === "EDIT" && req.pendingPatch && typeof req.pendingPatch === "object") {
      Object.assign(data, req.pendingPatch as Record<string, unknown>);
    }
    if (ctx.decision !== "RECALLED" && ctx.action?.setFields) {
      Object.assign(data, ctx.action.setFields);
    }
    if (ctx.decision !== "RECALLED" && ctx.action?.setStatus) {
      data.status = ctx.action.setStatus;
    }

    data._approval = {
      requestId: req.id,
      status: ctx.decision,
      processName: meta.processName,
      decidedAt: nowIso(),
      ...(ctx.comment ? { comment: ctx.comment } : {}),
    } satisfies ApprovalMeta;

    // The status COLUMN always tracks the workflow status field (never PENDING_APPROVAL).
    await tx.purchaseRecord.update({
      where: { id: row.id },
      data: { data: data as Prisma.InputJsonValue, status: (data.status as string) ?? null },
    });
  },

  async resubmit(ctx: AdapterCtx, recordId: string): Promise<{ resubmitted: boolean }> {
    const existing = await prisma.purchaseRecord.findFirst({
      where: { id: recordId, organizationId: ctx.organizationId },
    });
    if (!existing) throw new Error("Record not found");
    const data = (existing.data as Record<string, unknown>) ?? {};
    if (purchaseApprovalMeta(data)?.status === "PENDING") {
      throw new ApprovalStateError("This record already has a pending approval request.");
    }
    const submodule = existing.submodule;
    if (!isPurSubmodule(submodule)) throw new Error("This record cannot be submitted for approval.");

    const last = await prisma.approvalRequest.findFirst({
      where: { organizationId: ctx.organizationId, recordId },
      orderBy: { createdAt: "desc" },
      select: { id: true, trigger: true },
    });
    const trigger = (last?.trigger as TriggerKind) ?? "EDIT";
    const normalized = await canonicalizePurchaseData(ctx.organizationId, submodule, data);
    const process = await findMatchingProcess(
      prisma,
      { organizationId: ctx.organizationId, module: PURCHASE_MODULE, submodule },
      trigger,
      normalized,
    );

    if (!process) {
      const next = { ...data };
      delete next._approval;
      await prisma.purchaseRecord.update({
        where: { id: recordId },
        data: { data: next as Prisma.InputJsonValue },
      });
      return { resubmitted: false };
    }

    await prisma.$transaction(async (tx) => {
      const { approvalMeta } = await submitForApproval(tx, {
        organizationId: ctx.organizationId,
        module: PURCHASE_MODULE,
        submodule,
        recordId,
        requestedById: ctx.userId,
        trigger,
        process,
        priorStatus: (data.status as string) ?? null,
        supersedesId: last?.id ?? null,
      });
      await tx.purchaseRecord.update({
        where: { id: recordId },
        data: { data: { ...data, _approval: approvalMeta } as unknown as Prisma.InputJsonValue },
      });
    }, APPROVAL_TX_OPTS);
    return { resubmitted: true };
  },
};
