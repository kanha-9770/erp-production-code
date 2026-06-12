/**
 * Generic, module-aware approval orchestration — the server layer behind the
 * /settings/<module>/approvals pages and the cross-module inbox. Resolves the
 * right {@link ApprovalAdapter} from the registry, so the same handlers serve
 * inventory, purchase and any future module.
 *
 *   • Config CRUD   — gated by the module's manage permission
 *   • Inbox         — CROSS-MODULE: every request awaiting the user, any module
 *   • History       — per-scope (mine / all-admin), optional module filter
 *   • Decisions     — approve/reject/recall/resubmit via the engine + adapter
 */

import { Prisma, type ApprovalRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireInventoryPermission } from "@/lib/permissions/inventory-permissions";
import { isOrgAdmin } from "@/lib/permissions/has-permission";
import { getUserActiveRoles } from "@/lib/auth-helpers";
import { applyDecision, buildRoleParentMap, listInbox, recallRequest, stageEligibility } from "@/lib/approvals/engine";
import type { StageHierarchy } from "@/lib/approvals/engine";
import { APPROVAL_MODULES, getAdapter } from "@/lib/approvals/registry";
import type { OrgCtx } from "@/lib/api-handlers/with-org";
import type {
  ApprovalStage,
  Criteria,
  CriteriaOp,
  ProcessScope,
  ProcessSnapshot,
  RecordSummary,
  SettlementAction,
} from "@/lib/approvals/types";

// ── Permission gate (per module) ────────────────────────────────────────────

async function requireManage(ctx: OrgCtx, module: string): Promise<void> {
  // All module manage-permissions resolve through the same hasPermission engine;
  // requireInventoryPermission is just the canonical thrower (name-agnostic).
  await requireInventoryPermission(ctx.userId, getAdapter(module).managePermission);
}

// ── Input sanitisation ──────────────────────────────────────────────────────

export interface ProcessInput {
  name?: string;
  description?: string | null;
  submodule?: string | null;
  trigger?: string;
  isActive?: boolean;
  sortOrder?: number;
  criteria?: Partial<Criteria>;
  scope?: ProcessScope;
  stages?: ApprovalStage[];
  onApprove?: SettlementAction | null;
  onReject?: SettlementAction | null;
  adminUserIds?: string[];
}

const VALID_OPS: CriteriaOp[] = [
  "equals", "not_equals", "contains", "starts_with", "gt", "lt", "is_empty", "is_not_empty",
];

function cleanScope(scope: ProcessScope | undefined): ProcessScope | undefined {
  if (!scope || typeof scope !== "object") return undefined;
  if (scope.type === "section" && Array.isArray(scope.sections) && scope.sections.length > 0) {
    return { type: "section", sections: scope.sections.map(String) };
  }
  if (scope.type === "fields" && Array.isArray(scope.fields) && scope.fields.length > 0) {
    return { type: "fields", fields: scope.fields.map(String) };
  }
  return undefined; // record-level (default)
}

function cleanCriteria(input: Partial<Criteria> | undefined, scope: ProcessScope | undefined): Criteria {
  const rules = Array.isArray(input?.rules) ? input!.rules : [];
  return {
    matchMode: input?.matchMode === "ANY" ? "ANY" : "ALL",
    rules: rules
      .filter((r) => r && typeof r.field === "string" && VALID_OPS.includes(r.op as CriteriaOp))
      .map((r) => ({ field: String(r.field), op: r.op as CriteriaOp, value: r.value != null ? String(r.value) : undefined })),
    ...(scope ? { scope } : {}),
  };
}

function cleanStages(input: ApprovalStage[] | undefined): ApprovalStage[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((s) => ({
      name: s?.name ? String(s.name) : undefined,
      mode: s?.mode === "ALL" ? ("ALL" as const) : ("ANY" as const),
      approverUserIds: Array.isArray(s?.approverUserIds) ? s.approverUserIds.map(String) : [],
      approverRoleIds: Array.isArray(s?.approverRoleIds) ? s.approverRoleIds.map(String) : [],
      ...(s?.hierarchyScoped ? { hierarchyScoped: true } : {}),
    }))
    .filter((s) => s.approverUserIds.length + s.approverRoleIds.length > 0);
}

function cleanAction(a: SettlementAction | null | undefined): SettlementAction | null {
  if (!a || typeof a !== "object") return null;
  const out: SettlementAction = {};
  if (typeof a.setStatus === "string" && a.setStatus.trim()) out.setStatus = a.setStatus.trim();
  if (a.setFields && typeof a.setFields === "object") out.setFields = a.setFields;
  return out.setStatus || out.setFields ? out : null;
}

function jsonOrDbNull(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

function sanitize(module: string, input: ProcessInput) {
  const submodules = getAdapter(module).submodules.map((s) => s.key);
  const submodule = input.submodule && submodules.includes(input.submodule) ? input.submodule : null;
  const trigger = input.trigger === "CREATE" || input.trigger === "EDIT" ? input.trigger : "BOTH";
  const scope = cleanScope(input.scope ?? input.criteria?.scope);
  return {
    name: (input.name ?? "").trim(),
    description: input.description?.toString().trim() || null,
    submodule,
    trigger: trigger as "CREATE" | "EDIT" | "BOTH",
    isActive: input.isActive !== false,
    sortOrder: Number.isFinite(input.sortOrder) ? Math.floor(Number(input.sortOrder)) : 0,
    criteria: cleanCriteria(input.criteria, scope),
    stages: cleanStages(input.stages),
    onApprove: cleanAction(input.onApprove),
    onReject: cleanAction(input.onReject),
    adminUserIds: Array.isArray(input.adminUserIds) ? input.adminUserIds.map(String) : [],
  };
}

// ── User name resolution ────────────────────────────────────────────────────

export interface UserBrief {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

async function fetchUsers(userIds: string[], organizationId: string): Promise<Map<string, UserBrief>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, UserBrief>();
  if (ids.length === 0) return map;
  const rows = await prisma.user.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, email: true, username: true, first_name: true, last_name: true, avatar: true },
  });
  for (const u of rows) {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.username || u.email;
    map.set(u.id, { id: u.id, name, email: u.email, avatar: u.avatar ?? null });
  }
  return map;
}

// ── Request enrichment (cross-module) ───────────────────────────────────────

export interface RequestSummary {
  id: string;
  module: string;
  recordId: string;
  submodule: string | null;
  status: string;
  trigger: string;
  currentStage: number;
  totalStages: number;
  stageName: string | null;
  processId: string | null;
  processName: string;
  requestedById: string;
  requestedByName: string;
  createdAt: string;
  decidedAt: string | null;
  record: { id: string; primary: string; secondary: string | null; submodule: string } | null;
}

async function enrichRequests(ctx: OrgCtx, requests: ApprovalRequest[]): Promise<RequestSummary[]> {
  if (requests.length === 0) return [];

  // Group record ids by module so each adapter loads its own summaries.
  const byModule = new Map<string, string[]>();
  for (const r of requests) {
    const arr = byModule.get(r.module) ?? [];
    arr.push(r.recordId);
    byModule.set(r.module, arr);
  }
  const summaries = new Map<string, RecordSummary>();
  await Promise.all(
    [...byModule.entries()].map(async ([module, ids]) => {
      try {
        const m = await getAdapter(module).loadRecordSummaries(ctx.organizationId, ids);
        for (const [id, s] of m) summaries.set(`${module}:${id}`, s);
      } catch {
        /* unknown module — leave records unresolved */
      }
    }),
  );
  const users = await fetchUsers(requests.map((r) => r.requestedById), ctx.organizationId);

  return requests.map((req) => {
    const snapshot = (req.processSnapshot ?? {}) as unknown as ProcessSnapshot;
    const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
    const sum = summaries.get(`${req.module}:${req.recordId}`);
    return {
      id: req.id,
      module: req.module,
      recordId: req.recordId,
      submodule: req.submodule,
      status: req.status,
      trigger: req.trigger,
      currentStage: req.currentStage,
      totalStages: stages.length,
      stageName: stages[req.currentStage]?.name ?? null,
      processId: req.processId,
      processName: snapshot.name ?? "Approval",
      requestedById: req.requestedById,
      requestedByName: users.get(req.requestedById)?.name ?? "—",
      createdAt: req.createdAt.toISOString(),
      decidedAt: req.decidedAt?.toISOString() ?? null,
      record: sum ? { id: sum.id, primary: sum.primary, secondary: sum.secondary ?? null, submodule: sum.submodule } : null,
    };
  });
}

// ── Handlers ────────────────────────────────────────────────────────────────

export const ApprovalHandlers = {
  // ── Process config (admin-gated, per module) ──
  async listProcesses(ctx: OrgCtx, module: string) {
    await requireManage(ctx, module);
    const rows = await prisma.approvalProcess.findMany({
      where: { organizationId: ctx.organizationId, module },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { requests: true } } },
    });
    return rows.map((p) => {
      const criteria = (p.criteria as unknown as Criteria) ?? { matchMode: "ALL", rules: [] };
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        module: p.module,
        submodule: p.submodule,
        trigger: p.trigger,
        isActive: p.isActive,
        sortOrder: p.sortOrder,
        scope: criteria.scope ?? { type: "record" },
        ruleCount: (criteria.rules ?? []).length,
        stageCount: ((p.stages as unknown as ApprovalStage[]) ?? []).length,
        requestCount: p._count.requests,
        updatedAt: p.updatedAt.toISOString(),
      };
    });
  },

  async getProcess(ctx: OrgCtx, module: string, id: string) {
    await requireManage(ctx, module);
    const p = await prisma.approvalProcess.findFirst({
      where: { id, organizationId: ctx.organizationId, module },
    });
    if (!p) return null;
    const criteria = (p.criteria as unknown as Criteria) ?? { matchMode: "ALL", rules: [] };
    return { ...p, scope: criteria.scope ?? { type: "record" } };
  },

  async createProcess(ctx: OrgCtx, module: string, input: ProcessInput) {
    await requireManage(ctx, module);
    const s = sanitize(module, input);
    if (!s.name) throw new Error("Process name is required");
    if (s.stages.length === 0) throw new Error("Add at least one approver stage with an approver");
    return prisma.approvalProcess.create({
      data: {
        organizationId: ctx.organizationId,
        module,
        submodule: s.submodule,
        name: s.name,
        description: s.description,
        isActive: s.isActive,
        sortOrder: s.sortOrder,
        trigger: s.trigger,
        criteria: s.criteria as unknown as Prisma.InputJsonValue,
        stages: s.stages as unknown as Prisma.InputJsonValue,
        onApprove: jsonOrDbNull(s.onApprove),
        onReject: jsonOrDbNull(s.onReject),
        adminUserIds: s.adminUserIds as unknown as Prisma.InputJsonValue,
        createdById: ctx.userId,
      },
    });
  },

  async updateProcess(ctx: OrgCtx, module: string, id: string, input: ProcessInput) {
    await requireManage(ctx, module);
    const existing = await prisma.approvalProcess.findFirst({
      where: { id, organizationId: ctx.organizationId, module },
      select: { id: true },
    });
    if (!existing) throw new Error("Approval process not found");
    const s = sanitize(module, input);
    if (!s.name) throw new Error("Process name is required");
    if (s.stages.length === 0) throw new Error("Add at least one approver stage with an approver");
    return prisma.approvalProcess.update({
      where: { id },
      data: {
        submodule: s.submodule,
        name: s.name,
        description: s.description,
        isActive: s.isActive,
        sortOrder: s.sortOrder,
        trigger: s.trigger,
        criteria: s.criteria as unknown as Prisma.InputJsonValue,
        stages: s.stages as unknown as Prisma.InputJsonValue,
        onApprove: jsonOrDbNull(s.onApprove),
        onReject: jsonOrDbNull(s.onReject),
        adminUserIds: s.adminUserIds as unknown as Prisma.InputJsonValue,
      },
    });
  },

  async setProcessActive(ctx: OrgCtx, module: string, id: string, isActive: boolean) {
    await requireManage(ctx, module);
    const existing = await prisma.approvalProcess.findFirst({
      where: { id, organizationId: ctx.organizationId, module },
      select: { id: true },
    });
    if (!existing) throw new Error("Approval process not found");
    return prisma.approvalProcess.update({ where: { id }, data: { isActive: !!isActive } });
  },

  async deleteProcess(ctx: OrgCtx, module: string, id: string) {
    await requireManage(ctx, module);
    await prisma.approvalProcess.deleteMany({ where: { id, organizationId: ctx.organizationId, module } });
    return { id };
  },

  // ── Inbox (cross-module) / history ──
  async listInbox(ctx: OrgCtx): Promise<RequestSummary[]> {
    const roles = await getUserActiveRoles(ctx.userId);
    const roleIds = roles.map((r) => r.roleId);
    const collected: ApprovalRequest[] = [];
    for (const module of APPROVAL_MODULES) {
      const reqs = await listInbox({
        organizationId: ctx.organizationId,
        module,
        userId: ctx.userId,
        userRoleIds: roleIds,
      });
      collected.push(...reqs);
    }
    collected.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return enrichRequests(ctx, collected);
  },

  async listRequests(
    ctx: OrgCtx,
    opts: { module?: string; scope?: string; status?: string; submodule?: string; page?: number; pageSize?: number },
  ): Promise<{ rows: RequestSummary[]; total: number; page: number; pageSize: number }> {
    const page = Number.isFinite(opts.page) && opts.page! >= 0 ? Math.floor(opts.page!) : 0;
    const pageSize = Math.min(Math.max(Number(opts.pageSize) || 50, 1), 200);

    const where: Prisma.ApprovalRequestWhereInput = { organizationId: ctx.organizationId };
    if (opts.module) where.module = opts.module;
    const admin = opts.scope === "all" ? await isOrgAdmin(ctx.userId) : false;
    if (opts.scope !== "all" || !admin) where.requestedById = ctx.userId;
    if (opts.status) where.status = opts.status as Prisma.ApprovalRequestWhereInput["status"];
    if (opts.submodule) where.submodule = opts.submodule;

    const [rows, total] = await Promise.all([
      prisma.approvalRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * pageSize, take: pageSize }),
      prisma.approvalRequest.count({ where }),
    ]);
    return { rows: await enrichRequests(ctx, rows), total, page, pageSize };
  },

  async getRequest(ctx: OrgCtx, id: string) {
    const req = await prisma.approvalRequest.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!req) return null;

    const adapter = (() => {
      try {
        return getAdapter(req.module);
      } catch {
        return null;
      }
    })();

    const [actions, snap, roles, admin] = await Promise.all([
      prisma.approvalAction.findMany({ where: { requestId: id }, orderBy: { createdAt: "asc" } }),
      adapter ? adapter.loadRecordSnapshot(ctx.organizationId, req.recordId) : Promise.resolve(null),
      getUserActiveRoles(ctx.userId),
      isOrgAdmin(ctx.userId),
    ]);

    const users = await fetchUsers([req.requestedById, ...actions.map((a) => a.actorId)], ctx.organizationId);
    const snapshot = (req.processSnapshot ?? {}) as unknown as ProcessSnapshot;
    const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
    const roleIds = roles.map((r) => r.roleId);
    const isProcessAdmin = (snapshot.adminUserIds ?? []).includes(ctx.userId);
    const canForce = admin || isProcessAdmin;
    const currentStage = stages[req.currentStage];
    const hierarchy: StageHierarchy | undefined =
      currentStage?.hierarchyScoped && !canForce
        ? { requesterRoleIds: req.requesterRoleIds ?? [], parentById: await buildRoleParentMap(prisma, ctx.organizationId) }
        : undefined;
    const elig = stageEligibility(currentStage, ctx.userId, roleIds, canForce, hierarchy);
    const alreadyVoted = actions.some(
      (a) => a.stage === req.currentStage && a.actorId === ctx.userId && (a.type === "APPROVED" || a.type === "REJECTED"),
    );

    const stageUserIds = stages.flatMap((s) => s.approverUserIds ?? []);
    const stageRoleIds = [...new Set(stages.flatMap((s) => s.approverRoleIds ?? []))];
    const [stageUsers, stageRoles] = await Promise.all([
      fetchUsers(stageUserIds, ctx.organizationId),
      stageRoleIds.length
        ? prisma.role.findMany({ where: { id: { in: stageRoleIds }, organizationId: ctx.organizationId }, select: { id: true, name: true } })
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);
    const roleNameById = new Map(stageRoles.map((r) => [r.id, r.name]));

    return {
      request: {
        id: req.id,
        module: req.module,
        recordId: req.recordId,
        submodule: req.submodule,
        status: req.status,
        trigger: req.trigger,
        currentStage: req.currentStage,
        totalStages: stages.length,
        processId: req.processId,
        processName: snapshot.name ?? "Approval",
        requestedById: req.requestedById,
        requestedByName: users.get(req.requestedById)?.name ?? "—",
        createdAt: req.createdAt.toISOString(),
        decidedAt: req.decidedAt?.toISOString() ?? null,
      },
      stages: stages.map((s, i) => ({
        index: i,
        name: s.name ?? `Stage ${i + 1}`,
        mode: s.mode,
        approvers: [
          ...(s.approverUserIds ?? []).map((uid) => ({ kind: "user" as const, id: uid, name: stageUsers.get(uid)?.name ?? uid })),
          ...(s.approverRoleIds ?? []).map((rid) => ({ kind: "role" as const, id: rid, name: roleNameById.get(rid) ?? rid })),
        ],
      })),
      actions: actions.map((a) => ({
        id: a.id,
        type: a.type,
        stage: a.stage,
        actorId: a.actorId,
        actorName: users.get(a.actorId)?.name ?? a.actorId,
        comment: a.comment,
        createdAt: a.createdAt.toISOString(),
      })),
      record: snap ? { id: req.recordId, submodule: snap.submodule, data: snap.data } : null,
      pendingPatch: (req.pendingPatch as Record<string, unknown> | null) ?? null,
      capabilities: {
        canAct: req.status === "PENDING" && elig.eligible && !alreadyVoted,
        canRecall: req.status === "PENDING" && (req.requestedById === ctx.userId || admin),
        canResubmit:
          (req.status === "REJECTED" || req.status === "RECALLED") && (req.requestedById === ctx.userId || admin),
      },
    };
  },

  async decide(ctx: OrgCtx, id: string, decision: "APPROVE" | "REJECT", comment?: string) {
    const req = await prisma.approvalRequest.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { module: true },
    });
    if (!req) throw new Error("Approval request not found");
    const roles = await getUserActiveRoles(ctx.userId);
    const admin = await isOrgAdmin(ctx.userId);
    return applyDecision({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      requestId: id,
      decision,
      comment,
      isAdmin: admin,
      userRoleIds: roles.map((r) => r.roleId),
      adapter: getAdapter(req.module),
    });
  },

  async recall(ctx: OrgCtx, id: string, comment?: string) {
    const req = await prisma.approvalRequest.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { module: true },
    });
    if (!req) throw new Error("Approval request not found");
    const admin = await isOrgAdmin(ctx.userId);
    return recallRequest({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      requestId: id,
      isAdmin: admin,
      adapter: getAdapter(req.module),
      comment,
    });
  },

  async resubmit(ctx: OrgCtx, module: string, recordId: string) {
    return getAdapter(module).resubmit({ organizationId: ctx.organizationId, userId: ctx.userId }, recordId);
  },

  async recordHistory(ctx: OrgCtx, recordId: string): Promise<RequestSummary[]> {
    const requests = await prisma.approvalRequest.findMany({
      where: { organizationId: ctx.organizationId, recordId },
      orderBy: { createdAt: "desc" },
    });
    return enrichRequests(ctx, requests);
  },
};
