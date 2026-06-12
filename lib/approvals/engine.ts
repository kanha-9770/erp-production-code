/**
 * Approval engine — generic workflow operations (no module-specific imports).
 *
 * Drives the Zoho-style approval lifecycle on top of the ApprovalProcess /
 * ApprovalRequest / ApprovalAction tables:
 *
 *   findMatchingProcess  pick the first active process whose criteria match
 *   submitForApproval    open a request (freezing the process) + SUBMITTED action
 *   applyDecision        approve/reject at the current stage, advance or settle
 *   recallRequest        requester/admin withdraws a pending request
 *   listInbox            requests awaiting a given user's action
 *   cancelOpenRequests   close any open request for a deleted record
 *
 * All decision logic reads each request's FROZEN `processSnapshot`, never the
 * live process — so editing a process never changes in-flight requests. The
 * caller supplies an {@link ApprovalAdapter} so the engine can write settlement
 * side-effects back into the module's own record.
 */

import { Prisma, type ApprovalProcess, type ApprovalRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateCriteria } from "./criteria";
import { ApprovalEligibilityError, ApprovalStateError } from "./errors";
import type {
  ApprovalAdapter,
  ApprovalMeta,
  ApprovalStage,
  Criteria,
  ProcessScope,
  ProcessSnapshot,
  SettlementAction,
  TriggerKind,
} from "./types";

type Db = Prisma.TransactionClient | typeof prisma;

// The Supabase pooler adds ~1.3s/query latency, so a multi-query interactive
// transaction easily blows past Prisma's default 5s timeout. Widen it.
export const APPROVAL_TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;

// ── Snapshot helpers ────────────────────────────────────────────────────────

function readSnapshot(req: ApprovalRequest): ProcessSnapshot {
  const snap = (req.processSnapshot ?? {}) as unknown as ProcessSnapshot;
  return {
    name: snap.name ?? "",
    criteria: snap.criteria ?? { matchMode: "ALL", rules: [] },
    stages: Array.isArray(snap.stages) ? snap.stages : [],
    onApprove: snap.onApprove ?? null,
    onReject: snap.onReject ?? null,
    adminUserIds: Array.isArray(snap.adminUserIds) ? snap.adminUserIds : [],
  };
}

function buildSnapshot(process: ApprovalProcess): ProcessSnapshot {
  return {
    name: process.name,
    criteria: (process.criteria ?? { matchMode: "ALL", rules: [] }) as unknown as Criteria,
    stages: ((process.stages ?? []) as unknown as ApprovalStage[]) ?? [],
    onApprove: (process.onApprove ?? null) as unknown as SettlementAction | null,
    onReject: (process.onReject ?? null) as unknown as SettlementAction | null,
    adminUserIds: ((process.adminUserIds ?? []) as unknown as string[]) ?? [],
  };
}

// ── Role hierarchy ──────────────────────────────────────────────────────────

/** Per-request hierarchy context for gating a stage's role approvers. */
export interface StageHierarchy {
  /** Roles the requester held when the request was raised (frozen on the request). */
  requesterRoleIds: string[];
  /** roleId → parentId for the whole org (null = top of the tree). */
  parentById: Map<string, string | null>;
}

/** Build the org's roleId → parentId map (one query) for subtree checks. */
export async function buildRoleParentMap(
  db: Db,
  organizationId: string,
): Promise<Map<string, string | null>> {
  const roles = await db.role.findMany({
    where: { organizationId },
    select: { id: true, parentId: true },
  });
  const map = new Map<string, string | null>();
  for (const r of roles) map.set(r.id, r.parentId ?? null);
  return map;
}

/**
 * Is `childRoleId` a STRICT descendant of `ancestorRoleId` (reports up to it)?
 * Walks the parent chain; the role itself does not count (peers excluded). The
 * guard caps the walk so a malformed cycle can never spin.
 */
export function isDescendantRole(
  childRoleId: string,
  ancestorRoleId: string,
  parentById: Map<string, string | null>,
): boolean {
  let cur = parentById.get(childRoleId) ?? null;
  for (let guard = 0; cur && guard < 100; guard++) {
    if (cur === ancestorRoleId) return true;
    cur = parentById.get(cur) ?? null;
  }
  return false;
}

// ── Eligibility ─────────────────────────────────────────────────────────────

/**
 * Whether `userId` may act on `stage`. `canForce` (org/process admin) always
 * passes. Otherwise the user must be explicitly listed, or hold one of the
 * stage's approver roles — the matched role id is returned for the audit trail.
 *
 * When the stage is `hierarchyScoped` and `hierarchy` is supplied, holding an
 * approver role is not enough: the request's requester must sit strictly below
 * that role in the org role tree. Explicitly-listed users bypass this gate.
 */
export function stageEligibility(
  stage: ApprovalStage | undefined,
  userId: string,
  roleIds: string[],
  canForce: boolean,
  hierarchy?: StageHierarchy,
): { eligible: boolean; viaRoleId: string | null } {
  if (canForce) return { eligible: true, viaRoleId: null };
  if (!stage) return { eligible: false, viaRoleId: null };
  // An explicitly-listed user is always eligible (never hierarchy-gated).
  if ((stage.approverUserIds ?? []).includes(userId)) return { eligible: true, viaRoleId: null };

  const heldApproverRoles = (stage.approverRoleIds ?? []).filter((r) => roleIds.includes(r));
  if (heldApproverRoles.length === 0) return { eligible: false, viaRoleId: null };

  // No hierarchy gate (or no context) → holding any approver role suffices.
  if (!stage.hierarchyScoped || !hierarchy) {
    return { eligible: true, viaRoleId: heldApproverRoles[0] };
  }

  // Hierarchy-scoped: the requester must report up to one of the approver roles
  // the acting user holds. The first such role is recorded for the audit trail.
  for (const ar of heldApproverRoles) {
    if (hierarchy.requesterRoleIds.some((rr) => isDescendantRole(rr, ar, hierarchy.parentById))) {
      return { eligible: true, viaRoleId: ar };
    }
  }
  return { eligible: false, viaRoleId: null };
}

/** roleId → Set(userId) for the org's active assignments of the given roles. */
async function resolveRoleMembers(db: Db, roleIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (roleIds.length === 0) return map;
  const rows = await db.userUnitAssignment.findMany({
    where: { roleId: { in: roleIds }, role: { isActive: true }, unit: { isActive: true } },
    select: { roleId: true, userId: true },
  });
  for (const r of rows) {
    let set = map.get(r.roleId);
    if (!set) map.set(r.roleId, (set = new Set()));
    set.add(r.userId);
  }
  return map;
}

/**
 * Slot-based ALL/ANY stage completion (read from recorded APPROVED actions):
 *  - ANY  → any single approval completes the stage.
 *  - ALL  → every listed user must have approved, AND every listed role must
 *           have ≥1 member who approved (each role = one slot any member fills).
 */
async function isStageComplete(
  db: Db,
  requestId: string,
  stageIdx: number,
  stage: ApprovalStage | undefined,
): Promise<boolean> {
  if (!stage) return true;
  const actions = await db.approvalAction.findMany({
    where: { requestId, stage: stageIdx, type: "APPROVED" },
    select: { actorId: true, viaRoleId: true },
  });
  if (actions.length === 0) return false;
  if ((stage.mode ?? "ANY") === "ANY") return true;

  const approvedActors = new Set(actions.map((a) => a.actorId));
  for (const uid of stage.approverUserIds ?? []) {
    if (!approvedActors.has(uid)) return false;
  }
  const roleIds = stage.approverRoleIds ?? [];
  if (roleIds.length > 0) {
    const members = await resolveRoleMembers(db, roleIds);
    for (const rid of roleIds) {
      const memberSet = members.get(rid) ?? new Set<string>();
      const filled =
        actions.some((a) => a.viaRoleId === rid) ||
        [...approvedActors].some((a) => memberSet.has(a));
      if (!filled) return false;
    }
  }
  return true;
}

// ── Matching + submission ───────────────────────────────────────────────────

/**
 * Does a process's field/section scope match the keys that actually changed?
 * record (or undefined) → always; section/fields → only when a watched key
 * changed. When `changedKeys` is unknown the scope is not evaluated (matches).
 */
function scopeMatches(
  scope: ProcessScope | undefined,
  changedKeys: string[] | undefined,
  fieldSections: Record<string, string> | undefined,
): boolean {
  if (!scope || scope.type === "record") return true;
  if (!changedKeys) return true; // caller didn't supply a diff — don't block
  const changed = new Set(changedKeys);
  if (scope.type === "fields") return (scope.fields ?? []).some((f) => changed.has(f));
  if (scope.type === "section") {
    const sections = new Set(scope.sections ?? []);
    for (const k of changed) {
      if (sections.has(fieldSections?.[k] ?? "")) return true;
    }
    return false;
  }
  return true;
}

/**
 * The first active process for (org, module, submodule, trigger) whose scope AND
 * value-criteria match (ordered by sortOrder, then createdAt). `null` ⇒ no
 * approval needed (the record saves normally). Pass `changedKeys` (the keys this
 * create/edit actually changes) + `fieldSections` to evaluate field/section scope.
 */
export async function findMatchingProcess(
  db: Db,
  args: { organizationId: string; module: string; submodule: string | null },
  trigger: TriggerKind,
  normalizedData: Record<string, unknown>,
  opts?: { changedKeys?: string[]; fieldSections?: Record<string, string> },
): Promise<ApprovalProcess | null> {
  const processes = await db.approvalProcess.findMany({
    where: {
      organizationId: args.organizationId,
      module: args.module,
      isActive: true,
      AND: [
        { OR: [{ submodule: args.submodule }, { submodule: null }] },
        { OR: [{ trigger }, { trigger: "BOTH" }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  for (const p of processes) {
    const criteria = (p.criteria ?? { matchMode: "ALL", rules: [] }) as unknown as Criteria;
    if (!scopeMatches(criteria.scope, opts?.changedKeys, opts?.fieldSections)) continue;
    if (evaluateCriteria(criteria, normalizedData)) return p;
  }
  return null;
}

/**
 * Open an approval request against `recordId`, freezing `process` into the
 * request snapshot, and record the SUBMITTED action. MUST run inside the
 * caller's transaction. Guards: at most one open (PENDING) request per record.
 * Returns the new request id + the `_approval` marker to embed in the record.
 */
export async function submitForApproval(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    module: string;
    submodule: string | null;
    recordId: string;
    requestedById: string;
    trigger: TriggerKind;
    process: ApprovalProcess;
    pendingPatch?: Record<string, unknown> | null;
    prePatchData?: Record<string, unknown> | null;
    priorStatus?: string | null;
    supersedesId?: string | null;
  },
): Promise<{ requestId: string; approvalMeta: ApprovalMeta }> {
  const open = await tx.approvalRequest.findFirst({
    where: { organizationId: args.organizationId, recordId: args.recordId, status: "PENDING" },
    select: { id: true },
  });
  if (open) throw new ApprovalStateError("This record already has a pending approval request.");

  // Freeze the requester's active roles so hierarchy-scoped stages can decide who
  // sits above them even if their assignments change while the request is open.
  const requesterAssignments = await tx.userUnitAssignment.findMany({
    where: { userId: args.requestedById, role: { isActive: true }, unit: { isActive: true } },
    select: { roleId: true },
  });
  const requesterRoleIds = [...new Set(requesterAssignments.map((a) => a.roleId))];

  const snapshot = buildSnapshot(args.process);
  const req = await tx.approvalRequest.create({
    data: {
      organizationId: args.organizationId,
      module: args.module,
      submodule: args.submodule,
      recordId: args.recordId,
      processId: args.process.id,
      processSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      currentStage: 0,
      requestedById: args.requestedById,
      requesterRoleIds,
      trigger: args.trigger,
      pendingPatch: (args.pendingPatch ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      prePatchData: (args.prePatchData ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      supersedesId: args.supersedesId ?? null,
    },
  });

  await tx.approvalAction.create({
    data: {
      requestId: req.id,
      organizationId: args.organizationId,
      type: "SUBMITTED",
      stage: -1,
      actorId: args.requestedById,
      comment: args.supersedesId ? "Resubmitted for approval" : "Submitted for approval",
    },
  });

  const approvalMeta: ApprovalMeta = {
    requestId: req.id,
    status: "PENDING",
    processId: args.process.id,
    processName: snapshot.name,
    stage: 0,
    totalStages: snapshot.stages.length,
    trigger: args.trigger,
    priorStatus: args.priorStatus ?? null,
    submittedAt: req.createdAt.toISOString(),
  };
  return { requestId: req.id, approvalMeta };
}

// ── Decisions ───────────────────────────────────────────────────────────────

export interface DecisionArgs {
  organizationId: string;
  userId: string;
  requestId: string;
  decision: "APPROVE" | "REJECT";
  comment?: string;
  /** Org admin/owner — may force-decide any stage. */
  isAdmin: boolean;
  /** The acting user's active role ids (for stage eligibility). */
  userRoleIds: string[];
  adapter: Pick<ApprovalAdapter, "onSettled">;
}

/**
 * Approve or reject `requestId` at its current stage. Eligibility + double-vote
 * guarded; ANY/ALL stage completion advances the stage (compare-and-swap for
 * concurrent approvers) or settles the request, writing back via the adapter —
 * all in one transaction.
 */
export async function applyDecision(args: DecisionArgs): Promise<ApprovalRequest> {
  return prisma.$transaction(async (tx) => {
    const req = await tx.approvalRequest.findFirst({
      where: { id: args.requestId, organizationId: args.organizationId },
    });
    if (!req) throw new Error("Approval request not found");
    if (req.status !== "PENDING") throw new ApprovalStateError();

    const snapshot = readSnapshot(req);
    const stageIdx = req.currentStage;
    const stage = snapshot.stages[stageIdx];
    const canForce = args.isAdmin || (snapshot.adminUserIds ?? []).includes(args.userId);

    const hierarchy: StageHierarchy | undefined =
      stage?.hierarchyScoped && !canForce
        ? { requesterRoleIds: req.requesterRoleIds ?? [], parentById: await buildRoleParentMap(tx, args.organizationId) }
        : undefined;
    const elig = stageEligibility(stage, args.userId, args.userRoleIds, canForce, hierarchy);
    if (!elig.eligible) throw new ApprovalEligibilityError();

    // One vote per user per stage.
    const prior = await tx.approvalAction.findFirst({
      where: {
        requestId: req.id,
        stage: stageIdx,
        actorId: args.userId,
        type: { in: ["APPROVED", "REJECTED"] },
      },
      select: { id: true },
    });
    if (prior) throw new ApprovalStateError("You have already voted on this request at the current stage.");

    const comment = args.comment?.trim() || null;
    await tx.approvalAction.create({
      data: {
        requestId: req.id,
        organizationId: args.organizationId,
        type: args.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        stage: stageIdx,
        actorId: args.userId,
        viaRoleId: elig.viaRoleId,
        comment,
      },
    });

    // Reject is terminal at any stage.
    if (args.decision === "REJECT") {
      const updated = await tx.approvalRequest.update({
        where: { id: req.id },
        data: { status: "REJECTED", decidedAt: new Date() },
      });
      await args.adapter.onSettled(tx, {
        organizationId: args.organizationId,
        recordId: req.recordId,
        submodule: req.submodule,
        request: updated,
        decision: "REJECTED",
        action: snapshot.onReject ?? null,
        comment: comment ?? undefined,
      });
      return updated;
    }

    // Approve: is this stage now complete?
    if (!(await isStageComplete(tx, req.id, stageIdx, stage))) {
      return (await tx.approvalRequest.findUniqueOrThrow({ where: { id: req.id } }));
    }

    const isLastStage = stageIdx >= snapshot.stages.length - 1;
    if (isLastStage) {
      const updated = await tx.approvalRequest.update({
        where: { id: req.id },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
      await args.adapter.onSettled(tx, {
        organizationId: args.organizationId,
        recordId: req.recordId,
        submodule: req.submodule,
        request: updated,
        decision: "APPROVED",
        action: snapshot.onApprove ?? null,
        comment: comment ?? undefined,
      });
      return updated;
    }

    // Advance to the next stage — CAS so only one concurrent approver advances.
    await tx.approvalRequest.updateMany({
      where: { id: req.id, currentStage: stageIdx, status: "PENDING" },
      data: { currentStage: stageIdx + 1 },
    });
    return (await tx.approvalRequest.findUniqueOrThrow({ where: { id: req.id } }));
  }, APPROVAL_TX_OPTS);
}

/** Requester (or admin) withdraws a pending request; unlocks the record. */
export async function recallRequest(args: {
  organizationId: string;
  userId: string;
  requestId: string;
  isAdmin: boolean;
  adapter: Pick<ApprovalAdapter, "onSettled">;
  comment?: string;
}): Promise<ApprovalRequest> {
  return prisma.$transaction(async (tx) => {
    const req = await tx.approvalRequest.findFirst({
      where: { id: args.requestId, organizationId: args.organizationId },
    });
    if (!req) throw new Error("Approval request not found");
    if (req.status !== "PENDING") throw new ApprovalStateError("Only a pending request can be recalled.");
    if (req.requestedById !== args.userId && !args.isAdmin) {
      throw new ApprovalEligibilityError("Only the requester or an admin can recall this request.");
    }
    const updated = await tx.approvalRequest.update({
      where: { id: req.id },
      data: { status: "RECALLED", decidedAt: new Date() },
    });
    await tx.approvalAction.create({
      data: {
        requestId: req.id,
        organizationId: args.organizationId,
        type: "RECALLED",
        stage: req.currentStage,
        actorId: args.userId,
        comment: args.comment?.trim() || "Recalled by requester",
      },
    });
    await args.adapter.onSettled(tx, {
      organizationId: args.organizationId,
      recordId: req.recordId,
      submodule: req.submodule,
      request: updated,
      decision: "RECALLED",
      action: null,
    });
    return updated;
  }, APPROVAL_TX_OPTS);
}

/**
 * Mark every open request for the given records as RECALLED (e.g. the records
 * are being deleted). Runs inside the caller's tx; no record write-back. Batched
 * so a bulk delete is two statements regardless of how many records are passed.
 */
export async function cancelOpenRequestsForRecords(
  tx: Prisma.TransactionClient,
  organizationId: string,
  recordIds: string[],
  actorId: string,
): Promise<void> {
  if (recordIds.length === 0) return;
  const open = await tx.approvalRequest.findMany({
    where: { organizationId, recordId: { in: recordIds }, status: "PENDING" },
    select: { id: true, currentStage: true },
  });
  if (open.length === 0) return;
  await tx.approvalRequest.updateMany({
    where: { id: { in: open.map((o) => o.id) } },
    data: { status: "RECALLED", decidedAt: new Date() },
  });
  await tx.approvalAction.createMany({
    data: open.map((o) => ({
      requestId: o.id,
      organizationId,
      type: "RECALLED" as const,
      stage: o.currentStage,
      actorId,
      comment: "Record deleted",
    })),
  });
}

// ── Inbox ───────────────────────────────────────────────────────────────────

/**
 * Pending requests in `module` awaiting `userId`'s action: eligible at the
 * current stage (listed user / role member / process admin) and not already
 * voted at that stage. Org-admin status does NOT flood the personal inbox —
 * admins act from the "All" tab instead.
 */
export async function listInbox(args: {
  organizationId: string;
  module: string;
  userId: string;
  userRoleIds: string[];
}): Promise<ApprovalRequest[]> {
  const pending = await prisma.approvalRequest.findMany({
    where: { organizationId: args.organizationId, module: args.module, status: "PENDING" },
    orderBy: [{ createdAt: "desc" }],
  });
  if (pending.length === 0) return [];

  const ids = pending.map((p) => p.id);
  const myVotes = await prisma.approvalAction.findMany({
    where: { requestId: { in: ids }, actorId: args.userId, type: { in: ["APPROVED", "REJECTED"] } },
    select: { requestId: true, stage: true },
  });
  const votedAtStage = new Set(myVotes.map((a) => `${a.requestId}:${a.stage}`));

  // Built once, only if some pending stage actually uses hierarchy gating.
  let parentById: Map<string, string | null> | null = null;

  const out: ApprovalRequest[] = [];
  for (const req of pending) {
    const snapshot = readSnapshot(req);
    const stage = snapshot.stages[req.currentStage];
    const isProcessAdmin = (snapshot.adminUserIds ?? []).includes(args.userId);

    let hierarchy: StageHierarchy | undefined;
    if (stage?.hierarchyScoped && !isProcessAdmin) {
      if (!parentById) parentById = await buildRoleParentMap(prisma, args.organizationId);
      hierarchy = { requesterRoleIds: req.requesterRoleIds ?? [], parentById };
    }

    const elig = stageEligibility(stage, args.userId, args.userRoleIds, isProcessAdmin, hierarchy);
    if (!elig.eligible) continue;
    if (votedAtStage.has(`${req.id}:${req.currentStage}`)) continue;
    out.push(req);
  }
  return out;
}
