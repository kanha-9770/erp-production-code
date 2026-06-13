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
import { SEED_MASTERS, SUBMODULE_ORDER, getSchema, GATE_ENTRY_SCHEMA, isAdvancePaymentTerm } from "@/lib/purchase-system/schema";
import { seedRecords } from "@/lib/purchase-system/seed";
import { nextCode, maxCodeSuffix } from "@/lib/sequence/next-code";
import {
  POST_GRN_STOCK,
  getPurchasePermissions,
  hasAnyPurchaseCapability,
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
import { isOrgAdmin, hasPermission } from "@/lib/permissions/has-permission";
import {
  findMatchingProcess,
  submitForApproval,
  cancelOpenRequestsForRecords,
  buildRoleParentMap,
  isDescendantRole,
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
import { promotionApprovalBlock } from "@/lib/purchase-system/promote";
import {
  GATE_ENTRY_INITIAL_STATUS,
  GATE_ENTRY_WORKFLOW_SECTIONS,
  GE_S_GRN_CREATED,
  gateEntryCurrentStage,
  gateEntryStagesOwningSection,
  gateEntrySectionEditableAt,
  gateEntryResolveAdvance,
  readGateEntryWorkflow,
  type GateEntryAdvanceAction,
  type GateEntryWorkflowEvent,
} from "@/lib/purchase-system/gate-entry-workflow";
import type {
  PurchaseRecord as PurchaseRecordType,
  PurchaseSnapshot,
  CurrentUserIdentity,
  MasterType,
  PurchaseSubmoduleKey,
  SectionAccess,
  FieldDef,
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
// approval engine) and `_workflow` is the server-only GRN stage timeline
// (written exclusively by createRecord / advanceStage / postStock) — a client
// must never forge or clear either.
const RESERVED = ["id", "submodule", "createdAt", "updatedAt", "_optimistic", "_deleting", "docNo", "_approval", "_workflow"];

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

/** Thrown when receiving against an advance-terms PO whose advance payment
 *  isn't approved yet → 403. */
class UnpaidAdvanceReceiveError extends Error {
  readonly forbidden = true;
  constructor(refs: string[]) {
    const list = refs.join(", ");
    super(
      refs.length > 1
        ? `An approved advance payment is required before goods can be received against these purchase orders: ${list}.`
        : `Purchase order ${list} needs an approved advance payment before goods can be received against it.`,
    );
    this.name = "UnpaidAdvanceReceiveError";
  }
}

/**
 * Block receiving against an ADVANCE-terms PO that has no approved payment yet.
 * For every supplied poRef that matches a KNOWN PO whose paymentTerms are
 * advance-based, at least one payment request referencing it must be APPROVED
 * (or already PAID). Credit-term POs — and refs matching no known PO — are left
 * alone (payment follows receipt there). Mirrors assertGrnPosApproved; applied to
 * both the gate entry (receiving start) and the GRN.
 */
async function assertAdvancePaid(organizationId: string, refs: string[]): Promise<void> {
  const want = [...new Set(refs.map((r) => r.trim()).filter(Boolean))];
  if (want.length === 0) return;

  // Which of the referenced POs are advance-terms? Only those gate receiving.
  const pos = await prisma.purchaseRecord.findMany({
    where: { organizationId, submodule: "po" },
    select: { data: true },
  });
  const advanceRefs = new Set<string>();
  for (const po of pos) {
    const d = (po.data as Record<string, unknown>) ?? {};
    const docNo = String(d.docNo ?? "").trim();
    if (docNo && want.includes(docNo) && isAdvancePaymentTerm(String(d.paymentTerms ?? ""))) {
      advanceRefs.add(docNo);
    }
  }
  if (advanceRefs.size === 0) return;

  // An advance is satisfied by any payment for that PO at APPROVED or PAID.
  const payments = await prisma.purchaseRecord.findMany({
    where: { organizationId, submodule: "payment" },
    select: { data: true },
  });
  const paidRefs = new Set<string>();
  for (const p of payments) {
    const d = (p.data as Record<string, unknown>) ?? {};
    const ref = String(d.poRef ?? "").trim();
    const status = String(d.status ?? "").toUpperCase();
    if (ref && (status === "APPROVED" || status === "PAID")) paidRefs.add(ref);
  }

  const blocked = [...advanceRefs].filter((r) => !paidRefs.has(r));
  if (blocked.length > 0) throw new UnpaidAdvanceReceiveError(blocked);
}

/** Thrown when a document is converted from a source whose generic approval
 *  (`data._approval`) hasn't settled as APPROVED. 409 = unmet precondition. */
class UnapprovedSourceConvertError extends Error {
  readonly status = 409;
  constructor(ref: string, message: string) {
    super(`${ref}: ${message}`);
    this.name = "UnapprovedSourceConvertError";
  }
}

// A converted document carries its source's docNo in a back-reference field.
// Map each target submodule to that field + the submodule(s) the ref can name,
// so the source's approval state can be looked up and enforced on create.
const CONVERSION_SOURCE_REF: Partial<
  Record<PurchaseSubmoduleKey, { field: string; from: PurchaseSubmoduleKey[] }>
> = {
  sourcing: { field: "prRef", from: ["pr"] }, // PR → Raise RFQ
  po: { field: "rfqRef", from: ["pr", "sourcing"] }, // PR / RFQ → Convert to PO
  payment: { field: "poRef", from: ["po"] }, // PO → Raise Payment
};

/**
 * Conversion gate (server backstop): block raising the next document while its
 * source's generic approval is unsettled (PENDING / REJECTED / RECALLED). The
 * target carries the source docNo in a ref field (prRef / rfqRef / poRef); if
 * that source still has a blocking `_approval`, the conversion is refused.
 * Refs matching no known record are left alone (manual / external references).
 * Mirrors promotionApprovalBlock in the UI so the button and the API agree.
 */
async function assertConversionSourceApproved(
  organizationId: string,
  submodule: PurchaseSubmoduleKey,
  data: Record<string, unknown>,
): Promise<void> {
  const map = CONVERSION_SOURCE_REF[submodule];
  if (!map) return;
  const ref = String(data[map.field] ?? "").trim();
  if (!ref) return;
  const rows = await prisma.purchaseRecord.findMany({
    where: { organizationId, submodule: { in: map.from } },
    select: { data: true },
  });
  for (const r of rows) {
    const d = (r.data as Record<string, unknown>) ?? {};
    if (String(d.docNo ?? "").trim() !== ref) continue;
    const block = promotionApprovalBlock(d);
    if (block) throw new UnapprovedSourceConvertError(ref, block.message);
    return; // source found and approval settled — allow
  }
}

// ── Gate-entry sequential receiving workflow ────────────────────────────────

/** Thrown when a gate-entry stage rule is violated. `status` maps to the HTTP
 *  code (403 for permission/stage-edit, 409 for an invalid transition). */
export class GateEntryWorkflowError extends Error {
  readonly status: number;
  readonly forbidden: boolean;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "GateEntryWorkflowError";
    this.status = status;
    this.forbidden = status === 403;
  }
}

/** Schema default for a gate-entry field (mirrors buildInitial in the form) —
 *  used to tell, on create, whether a field was filled vs left at its default. */
function gateEntryFieldDefault(f: FieldDef): unknown {
  if (f.type === "lineItems") return [];
  if (f.type === "checkbox") return false;
  if (f.defaultValue != null) return f.defaultValue;
  if (f.type === "status" && f.statusOptions?.length) return f.statusOptions[0].value;
  return f.type === "number" || f.type === "currency" ? 0 : "";
}

/** Loose value equality: JSON for objects/arrays (line items, media), string
 *  for primitives — enough to decide whether a patch actually changed a field. */
function gateEntryValueEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    } catch {
      return false;
    }
  }
  return String(a ?? "") === String(b ?? "");
}

/**
 * Enforce the gate-entry stage gate on a create/update. A non-admin may only
 * change a workflow-section field when that section is editable at the gate
 * entry's CURRENT stage AND they hold that stage's permission. `status` is
 * workflow-driven and may never be hand-edited; receiptStatus / remarks stay
 * open. On create the baseline is each field's schema default, so leaving
 * later-stage sections untouched passes.
 */
async function assertGateEntryWorkflowEdit(args: {
  userId: string;
  currentStatus: string;
  existing: Record<string, unknown> | null;
  patch: Record<string, unknown>;
}): Promise<void> {
  const onCreate = args.existing == null;
  const existing = args.existing ?? {};
  const stage = gateEntryCurrentStage(args.currentStatus);
  let isAdmin: boolean | null = null; // resolved lazily, only if a gate is hit

  for (const [key, val] of Object.entries(args.patch)) {
    const f = GATE_ENTRY_SCHEMA.fields.find((x) => x.key === key);
    if (!f) continue;
    const baseline = onCreate ? gateEntryFieldDefault(f) : existing[key];
    if (gateEntryValueEq(val, baseline)) continue; // unchanged → no gate

    if (key === "status") {
      throw new GateEntryWorkflowError(
        "The gate-entry stage changes via “Complete & forward”, Reject or Send back — not by editing Status directly.",
        409,
      );
    }
    // receiptStatus is system-derived; remarks stay open at any stage.
    if (key === "receiptStatus" || key === "remarks") continue;
    if (!GATE_ENTRY_WORKFLOW_SECTIONS.includes(f.section)) continue; // non-workflow section

    if (isAdmin === null) isAdmin = await isOrgAdmin(args.userId);
    if (isAdmin) continue; // admins bypass the stage gate

    if (!gateEntrySectionEditableAt(f.section, args.currentStatus)) {
      const owner = gateEntryStagesOwningSection(f.section)[0];
      throw new GateEntryWorkflowError(
        `The “${f.section}” section can only be edited during the ${owner?.label ?? "owning"} stage.`,
      );
    }
    if (stage && !(await hasPermission(args.userId, stage.permission))) {
      throw new GateEntryWorkflowError(
        `You need the “${stage.label}” permission to edit this gate entry at its current stage.`,
      );
    }
  }
}

/**
 * Mark a gate entry CONSUMED once a GRN is raised from it: flip its status to
 * GRN_CREATED so it drops out of the "cleared gate entries" picker and append a
 * timeline event. No-op if the docNo doesn't resolve to a cleared gate entry.
 */
async function consumeGateEntry(
  organizationId: string,
  gateEntryDocNo: string,
  byUserId: string,
  byName: string,
  grnDocNo: string,
): Promise<void> {
  const ref = gateEntryDocNo.trim();
  if (!ref) return;
  // Resolve the gate entry by its docNo (it lives in the JSON bag, no column).
  const candidates = await prisma.purchaseRecord.findMany({
    where: { organizationId, submodule: "gateEntry" },
    select: { id: true, data: true, status: true },
  });
  const target = candidates.find(
    (c) => String((c.data as Record<string, unknown>)?.docNo ?? "").trim() === ref,
  );
  if (!target) return;
  const data = (target.data as Record<string, unknown>) ?? {};
  if (String(target.status ?? data.status ?? "") === GE_S_GRN_CREATED) return; // already consumed
  const wf = readGateEntryWorkflow(data);
  const event: GateEntryWorkflowEvent = {
    action: "GRN_CREATED",
    fromStatus: String(target.status ?? data.status ?? ""),
    toStatus: GE_S_GRN_CREATED,
    label: "GRN Created",
    byUserId,
    byName,
    at: new Date().toISOString(),
    note: grnDocNo ? `GRN ${grnDocNo}` : undefined,
  };
  await prisma.purchaseRecord.update({
    where: { id: target.id },
    data: {
      data: { ...data, status: GE_S_GRN_CREATED, _workflow: { history: [...wf.history, event] } } as any,
      status: GE_S_GRN_CREATED,
    },
  });
}

/**
 * Row-level Purchase-Requisition visibility (org role hierarchy).
 *
 * A non-admin may see a PR only when they RAISED it, or when its creator holds a
 * role strictly BELOW one of the viewer's roles in the org role tree (i.e. the
 * creator is the viewer's subordinate). Admins see every PR and never reach here.
 * Returns the set of visible PR record ids. Mirrors the approval engine's
 * hierarchy model (buildRoleParentMap / isDescendantRole). Three reads, batched
 * and parallel, so it adds one round-trip regardless of PR count.
 */
async function visiblePrIds(
  organizationId: string,
  viewerId: string,
  prRows: Array<{ id: string; createdById: string | null }>,
): Promise<Set<string>> {
  const visible = new Set<string>();
  // Own PRs are always visible; only the rest need a hierarchy check.
  const others: Array<{ id: string; createdById: string }> = [];
  for (const r of prRows) {
    if (r.createdById && r.createdById === viewerId) visible.add(r.id);
    else if (r.createdById) others.push({ id: r.id, createdById: r.createdById });
    // A PR with no creator (legacy/seed) stays hidden from non-admins.
  }
  if (others.length === 0) return visible;

  const creatorIds = [...new Set(others.map((r) => r.createdById))];
  const [viewerAssignments, creatorAssignments, parentById] = await Promise.all([
    prisma.userUnitAssignment.findMany({
      where: { userId: viewerId, role: { isActive: true }, unit: { isActive: true } },
      select: { roleId: true },
    }),
    prisma.userUnitAssignment.findMany({
      where: { userId: { in: creatorIds }, role: { isActive: true }, unit: { isActive: true } },
      select: { userId: true, roleId: true },
    }),
    buildRoleParentMap(prisma, organizationId),
  ]);

  const viewerRoleIds = [...new Set(viewerAssignments.map((a) => a.roleId))];
  if (viewerRoleIds.length === 0) return visible; // no roles → only own PRs

  const rolesByCreator = new Map<string, string[]>();
  for (const a of creatorAssignments) {
    const arr = rolesByCreator.get(a.userId);
    if (arr) arr.push(a.roleId);
    else rolesByCreator.set(a.userId, [a.roleId]);
  }

  for (const r of others) {
    const creatorRoles = rolesByCreator.get(r.createdById) ?? [];
    const isSubordinate = creatorRoles.some((cr) =>
      viewerRoleIds.some((vr) => isDescendantRole(cr, vr, parentById)),
    );
    if (isSubordinate) visible.add(r.id);
  }
  return visible;
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

    const [currentUser, permissions, sectionAccess, isAdmin] = await Promise.all([
      resolveUserIdentity(ctx.userId),
      getPurchasePermissions(ctx.userId),
      getSectionAccess(ctx.userId, ctx.organizationId, "purchase"),
      isOrgAdmin(ctx.userId),
    ]);

    // Row-level PR scoping: a PURE REQUESTER sees only the requisitions they
    // raised plus those raised by their subordinates (org role tree). Anyone in
    // the procurement pipeline bypasses this — admins, and anyone holding a
    // purchase capability (buyer / approver / AP / gate / QC / STORE INCHARGE),
    // since every PR ultimately flows inward to the store. All other submodules
    // stay fully visible.
    const seesAllPr = isAdmin || hasAnyPurchaseCapability(permissions);
    const prRows = rows.filter((r) => r.submodule === "pr");
    let visiblePr: Set<string> | null = null;
    if (!seesAllPr && prRows.length > 0) {
      visiblePr = await visiblePrIds(
        ctx.organizationId,
        ctx.userId,
        prRows.map((r) => ({ id: r.id, createdById: r.createdById })),
      );
    }

    const records = {
      supplier: [], pr: [], sourcing: [], po: [], gateEntry: [], grn: [], payment: [],
    } as Record<PurchaseSubmoduleKey, PurchaseRecordType[]>;
    for (const r of rows) {
      if (r.submodule === "pr" && visiblePr && !visiblePr.has(r.id)) continue;
      (records[r.submodule as PurchaseSubmoduleKey] ??= []).push(toRecord(r));
    }
    for (const k of SUBMODULE_ORDER) records[k] ??= [];
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
    // Goods may only be received against an APPROVED purchase order — and, for
    // advance-payment-term POs, only once an advance payment has been approved.
    // Both are checked on the gate entry (where items are first logged) and the
    // GRN (copied refs).
    if (submodule === "gateEntry" || submodule === "grn") {
      const poRefs = grnPoRefs(clean);
      await assertGrnPosApproved(ctx.organizationId, poRefs);
      await assertAdvancePaid(ctx.organizationId, poRefs);
    }
    // A document may only be converted from a source whose own approval has
    // completed: raising a PO from a still-pending PR/RFQ (or a payment from a
    // pending PO) is refused until that source is APPROVED. (UI hides the button;
    // this is the authoritative backstop.)
    await assertConversionSourceApproved(ctx.organizationId, submodule, clean);
    // Gate-entry stage gate: the creator (gate / security, GRN_GATE_ENTRY) starts
    // at the Gate-Entry stage and may only fill that stage's sections — later
    // inspection sections stay at their defaults until their stage is reached.
    if (submodule === "gateEntry") {
      await assertGateEntryWorkflowEdit({
        userId: ctx.userId,
        currentStatus: GATE_ENTRY_INITIAL_STATUS,
        existing: null,
        patch: clean,
      });
    }

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

    // A gate entry always starts at the Gate-Entry stage with a stamped workflow
    // timeline; its status is workflow-driven, never taken from the client. Other
    // documents (incl. the store-created GRN) keep their client-supplied status.
    const gateCreatorName =
      submodule === "gateEntry" ? (await resolveUserIdentity(ctx.userId)).name || "—" : "";
    const userStatus =
      submodule === "gateEntry" ? GATE_ENTRY_INITIAL_STATUS : (clean.status as string) ?? null;

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
      const recordData: Record<string, unknown> = { ...clean, ...userOverrides, docNo };
      if (submodule === "gateEntry") {
        recordData.status = GATE_ENTRY_INITIAL_STATUS;
        const seed: GateEntryWorkflowEvent = {
          action: "CREATED",
          fromStatus: GATE_ENTRY_INITIAL_STATUS,
          toStatus: GATE_ENTRY_INITIAL_STATUS,
          label: "Gate Entry",
          byUserId: ctx.userId,
          byName: gateCreatorName,
          at: new Date().toISOString(),
        };
        recordData._workflow = { history: [seed] };
      }
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
    if (submodule === "grn") {
      const grnData = row.data as Record<string, unknown>;
      await reconcilePoClosure(ctx.organizationId, grnPoRefs(grnData));
      // Creating the GRN consumes its source gate entry (→ GRN_CREATED), so it
      // drops out of the "cleared gate entries" picker and can't be reused.
      const geRef = String(grnData.gateEntryRef ?? "").trim();
      if (geRef) {
        const actorName = (await resolveUserIdentity(ctx.userId)).name || "—";
        await consumeGateEntry(ctx.organizationId, geRef, ctx.userId, actorName, String(grnData.docNo ?? ""));
      }
    }
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
    // Gate-entry stage gate: a field whose section belongs to the workflow may
    // only be changed during its owning stage, by a holder of that stage's
    // permission. The status moves only via advanceStage, never here.
    // (Admins bypass inside the helper — incl. the pending force-edit path above.)
    if (submodule === "gateEntry") {
      await assertGateEntryWorkflowEdit({
        userId: ctx.userId,
        currentStatus: String(existing.status ?? existingData.status ?? GATE_ENTRY_INITIAL_STATUS),
        existing: existingData,
        patch: cleanPatch,
      });
    }

    const merged = { ...existingData, ...cleanPatch };

    // Goods may only be received against an APPROVED PO — check only the newly-
    // added PO refs so re-saving with already-booked lines never re-validates them.
    if (submodule === "gateEntry" || submodule === "grn") {
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
    // A GRN is created by the store incharge from an already-cleared gate entry,
    // so it is postable as soon as it exists — no extra stage gate here.

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

  /**
   * Move a gate entry through its sequential receiving workflow. The caller must
   * hold the CURRENT stage's named permission (admins bypass). COMPLETE forwards
   * to the next stage — or CLEARS the gate entry once the final inspection stage
   * passes; REJECT settles it terminally; SEND_BACK returns it to an earlier
   * stage for correction. Every transition is appended to `data._workflow`.
   */
  async advanceStage(
    ctx: PurCtx,
    gateEntryId: string,
    action: GateEntryAdvanceAction,
    opts?: { toStage?: string; note?: string },
  ): Promise<PurchaseRecordType> {
    const ge = await prisma.purchaseRecord.findFirst({
      where: { id: gateEntryId, organizationId: ctx.organizationId, submodule: "gateEntry" },
    });
    if (!ge) throw new Error("Gate entry not found");
    const data = (ge.data as Record<string, unknown>) ?? {};

    // A gate entry parked for a separate approval process is read-only until it settles.
    if (purchaseApprovalMeta(data)?.status === "PENDING") throw new ApprovalLockedError();

    const currentStatus = String(ge.status ?? data.status ?? GATE_ENTRY_INITIAL_STATUS);
    const stage = gateEntryCurrentStage(currentStatus);
    if (!stage) throw new GateEntryWorkflowError("This gate entry is not in an active workflow stage.", 409);

    // Only the current stage's owner (or an admin) may act on it.
    await requirePurchasePermission(ctx.userId, stage.permission);

    const resolution = gateEntryResolveAdvance(currentStatus, action, data, opts?.toStage);
    if (!resolution.ok || !resolution.toStatus || !resolution.event) {
      throw new GateEntryWorkflowError(resolution.error ?? "Invalid stage transition.", 409);
    }

    const actorName = (await resolveUserIdentity(ctx.userId)).name || "—";
    const wf = readGateEntryWorkflow(data);
    const event: GateEntryWorkflowEvent = {
      action: resolution.event,
      fromStatus: currentStatus,
      toStatus: resolution.toStatus,
      label: stage.label,
      byUserId: ctx.userId,
      byName: actorName,
      at: new Date().toISOString(),
      note: opts?.note?.trim() || undefined,
    };
    const row = await prisma.purchaseRecord.update({
      where: { id: gateEntryId },
      data: {
        data: { ...data, status: resolution.toStatus, _workflow: { history: [...wf.history, event] } } as any,
        status: resolution.toStatus,
      },
    });
    return toRecord(row);
  },

  async reset(ctx: PurCtx): Promise<PurchaseSnapshot> {
    await prisma.$transaction([
      prisma.purchaseRecord.deleteMany({ where: { organizationId: ctx.organizationId } }),
      prisma.purchaseMasterSnapshot.deleteMany({ where: { organizationId: ctx.organizationId } }),
    ]);
    return this.load(ctx);
  },
};
