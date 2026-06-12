/**
 * Approval engine — shared types.
 *
 * GENERIC and module-agnostic: the engine knows about a `module`, an optional
 * `submodule`, a `recordId` (string) and the record's open JSON `data` bag only.
 * It never imports inventory/purchase code. Each consuming module supplies an
 * {@link ApprovalAdapter} that maps its schema (criteria field types, master
 * normalisation) and writes settlement side-effects back into its own record.
 *
 * These TS shapes describe the JSON columns on the Prisma models
 * (ApprovalProcess.criteria / .stages / .onApprove / .onReject and
 * ApprovalRequest.processSnapshot) — Prisma stores them as `Json`, this file is
 * the contract for reading them back.
 */

import type { Prisma, ApprovalRequest } from "@prisma/client";

// ── Criteria (rule matching) ────────────────────────────────────────────────

export type CriteriaOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "gt"
  | "lt"
  | "is_empty"
  | "is_not_empty";

export interface CriteriaRule {
  /** Record field key (a submodule schema field). */
  field: string;
  op: CriteriaOp;
  /** Comparison operand (ignored for is_empty / is_not_empty). */
  value?: string;
}

/**
 * What edits trigger approval (field/section granularity), AND-combined with the
 * value rules. Stored inside {@link Criteria} so no extra DB column is needed.
 *   record  — any create/edit (default)
 *   section — only when a field in one of these sections changes
 *   fields  — only when one of these specific fields changes
 */
export type ProcessScope =
  | { type: "record" }
  | { type: "section"; sections: string[] }
  | { type: "fields"; fields: string[] };

export interface Criteria {
  /** ALL = every rule must pass (AND); ANY = at least one (OR). */
  matchMode: "ALL" | "ANY";
  rules: CriteriaRule[];
  /** Field/section scope that gates the trigger (defaults to whole record). */
  scope?: ProcessScope;
}

// ── Stages (ordered approver levels) ────────────────────────────────────────

export interface ApprovalStage {
  /** Optional label, e.g. "Manager", "Finance Head". */
  name?: string;
  /** ALL = every listed user + one member per listed role must approve; ANY = one suffices. */
  mode: "ALL" | "ANY";
  approverUserIds: string[];
  approverRoleIds: string[];
  /**
   * Role-hierarchy gating for this stage's ROLE approvers. When true, a user is
   * eligible via an approver role only for requests whose requester holds a role
   * strictly BELOW that approver role in the org role tree (i.e. a subordinate).
   * Explicitly-listed `approverUserIds` are never hierarchy-gated. Defaults to
   * false (any holder of the role may act, as before).
   */
  hierarchyScoped?: boolean;
}

/** Side-effects applied to the target record on final settlement (adapter-interpreted). */
export interface SettlementAction {
  setStatus?: string;
  setFields?: Record<string, unknown>;
}

/** Frozen copy of a process captured on the request at submit time. */
export interface ProcessSnapshot {
  name: string;
  criteria: Criteria;
  stages: ApprovalStage[];
  onApprove?: SettlementAction | null;
  onReject?: SettlementAction | null;
  /** User ids allowed to force-decide this process (process admins). */
  adminUserIds?: string[];
}

export type TriggerKind = "CREATE" | "EDIT";
export type DecisionKind = "APPROVE" | "REJECT";
export type SettlementDecision = "APPROVED" | "REJECTED" | "RECALLED";

/** Field key → coarse type hint ("master" | "number" | "currency" | "status" | "text" | …). */
export type FieldTypeMap = Record<string, string>;

// ── Embedded record metadata (`data._approval`) ─────────────────────────────

/**
 * The compact approval marker the adapter writes into the target record's JSON
 * `data` under the `_approval` key, so the record list/form can render approval
 * state without joining the approval tables.
 */
export interface ApprovalMeta {
  requestId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED";
  processId?: string | null;
  processName?: string;
  /** 0-based index of the stage currently awaiting a decision. */
  stage?: number;
  totalStages?: number;
  trigger?: TriggerKind;
  /** The user-intended status preserved while PENDING so it can be restored on settle/recall. */
  priorStatus?: string | null;
  submittedAt?: string;
  decidedAt?: string;
  /** Decision comment (e.g. rejection reason) surfaced on the record banner. */
  comment?: string;
}

// ── Adapter contract ────────────────────────────────────────────────────────

export interface SettlementContext {
  organizationId: string;
  recordId: string;
  submodule: string | null;
  /** The settled request row. */
  request: ApprovalRequest;
  decision: SettlementDecision;
  /** onApprove / onReject from the frozen snapshot (null for recall). */
  action: SettlementAction | null;
  comment?: string;
}

export interface AdapterCtx {
  organizationId: string;
  userId: string;
}

/** Compact record identity for inbox/history rows (module-agnostic). */
export interface RecordSummary {
  id: string;
  submodule: string;
  /** Main label, e.g. item name / document no. */
  primary: string;
  /** Secondary label, e.g. item code / supplier. */
  secondary?: string | null;
}

export interface ApprovalAdapter {
  /** The module key this adapter serves, e.g. "inventory". */
  module: string;
  /** Human label, e.g. "Inventory", "Purchase". */
  label: string;
  /** Named permission that gates this module's approval-process config pages. */
  managePermission: string;
  /** Selectable submodules for the builder's Module dropdown. */
  submodules: Array<{ key: string; label: string }>;

  /** Field-type hints for the given submodule, used by the criteria UI + coercion. */
  fieldTypes(submodule: string | null): FieldTypeMap;
  /** field key → section name, for resolving section-scoped triggers. */
  fieldSections(submodule: string | null): Record<string, string>;
  /**
   * Return a copy of `data` with values canonicalised for criteria matching
   * (e.g. master option id → its label) so {@link evaluateCriteria} compares
   * like-for-like. May read masters, hence async + org-scoped.
   */
  canonicalizeData(
    organizationId: string,
    submodule: string | null,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  /** Apply settlement side-effects to the target record within the open tx. */
  onSettled(tx: Prisma.TransactionClient, ctx: SettlementContext): Promise<void>;

  /** Compact identities for a set of records (inbox/history enrichment). */
  loadRecordSummaries(organizationId: string, recordIds: string[]): Promise<Map<string, RecordSummary>>;
  /** Full record snapshot for the request detail view (heavy fields stripped). */
  loadRecordSnapshot(
    organizationId: string,
    recordId: string,
  ): Promise<{ submodule: string; data: Record<string, unknown> } | null>;
  /** Re-submit a rejected/recalled record for approval (re-runs matching). */
  resubmit(ctx: AdapterCtx, recordId: string): Promise<{ resubmitted: boolean }>;
}
