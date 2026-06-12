/**
 * Gate-Entry receiving workflow — single source of truth.
 *
 * A Gate Entry (gate-inward register) moves through an ordered, permission-gated
 * chain of stages. Each stage is OWNED by a named permission; only its holder
 * may edit that stage's form sections and click "Complete & forward" to hand the
 * gate entry to the next stage:
 *
 *   GATE_ENTRY ─▶ PURCHASE_INSPECTION ─▶ INVENTORY_INSPECTION ─▶ CLEARED
 *
 * Once CLEARED, the Store Incharge creates a GRN from the gate entry (which pulls
 * its supplier / warehouse / items and posts to store); creating that GRN flips
 * the gate entry to GRN_CREATED (consumed, can't be reused). Any stage owner may
 * REJECT (terminal) or SEND BACK to an earlier stage. Every transition is logged
 * to the timeline (`data._workflow.history`) recording who acted and when.
 *
 * Prisma-free on purpose, so it is safe to import from both the client (the form
 * sheet / store) and the server (the API handlers).
 */

// ── Named permissions — one per workflow stage ──────────────────────────────
// (Values are unchanged from the original GRN-staging build so any already
// granted permissions keep working; they now gate the gate-entry document.)
export const GRN_GATE_ENTRY = "GRN_GATE_ENTRY";
export const GRN_QC_INSPECTION = "GRN_QC_INSPECTION";
export const GRN_STORE_INSPECTION = "GRN_STORE_INSPECTION";

// ── Status values that make up the pipeline ─────────────────────────────────
export const GE_S_GATE_ENTRY = "GATE_ENTRY";
export const GE_S_PURCHASE_INSPECTION = "PURCHASE_INSPECTION";
export const GE_S_INVENTORY_INSPECTION = "INVENTORY_INSPECTION";
/** All inspections passed — ready for the store incharge to create the GRN. */
export const GE_S_CLEARED = "CLEARED";
/** A GRN has been created from this gate entry — consumed / terminal. */
export const GE_S_GRN_CREATED = "GRN_CREATED";
export const GE_S_REJECTED = "REJECTED";

/** PurchasePermissions flag keys that mirror each stage's named permission. */
export type GateEntryStagePermFlag = "gateEntry" | "qcInspection" | "storeInspection";

export interface GateEntryStage {
  /** The `status` value while this stage is the current (active) one. */
  key: string;
  /** Short label for the timeline + buttons. */
  label: string;
  /** What the stage owner does — shown as helper text on the timeline. */
  blurb: string;
  /** Named permission required to edit + complete this stage (server gate). */
  permission: string;
  /** PurchasePermissions flag mirroring `permission` (client UI gating only). */
  permFlag: GateEntryStagePermFlag;
  /** Form sections this stage owns — editable only while it is the current stage. */
  sections: string[];
  /** The PASS / FAIL field this stage signs off (must be decided to advance). */
  inspectionField: string;
}

/** The ordered sign-off stages. After the final stage the gate entry is CLEARED,
 *  from which the store incharge creates the GRN. */
export const GATE_ENTRY_STAGES: GateEntryStage[] = [
  {
    key: GE_S_GATE_ENTRY,
    label: "Gate Entry",
    blurb: "Security records arrival, vehicle / challan details, items and the gate inspection.",
    permission: GRN_GATE_ENTRY,
    permFlag: "gateEntry",
    sections: ["Receipt", "Gate Entry", "Items"],
    inspectionField: "gateInspection",
  },
  {
    key: GE_S_PURCHASE_INSPECTION,
    label: "QC Inspection",
    blurb: "Purchase / quality inspects the goods and records the QC result.",
    permission: GRN_QC_INSPECTION,
    permFlag: "qcInspection",
    sections: ["Purchase Inspection"],
    inspectionField: "purchaseInspection",
  },
  {
    key: GE_S_INVENTORY_INSPECTION,
    label: "Store Inspection",
    blurb: "Store verifies the goods and confirms received quantities before clearing.",
    permission: GRN_STORE_INSPECTION,
    permFlag: "storeInspection",
    sections: ["Inventory Inspection", "Items"],
    inspectionField: "inventoryInspection",
  },
];

/** Statuses past which the workflow no longer advances. */
export const GATE_ENTRY_TERMINAL_STATUSES: readonly string[] = [GE_S_GRN_CREATED, GE_S_REJECTED];

/** Sections the workflow governs (locked unless their owner stage is current). */
export const GATE_ENTRY_WORKFLOW_SECTIONS: readonly string[] = [
  ...new Set(GATE_ENTRY_STAGES.flatMap((s) => s.sections)),
];

/** The default starting status of a freshly created gate entry. */
export const GATE_ENTRY_INITIAL_STATUS = GE_S_GATE_ENTRY;

// ── Lookups ─────────────────────────────────────────────────────────────────

export function gateEntryStageIndex(status: string | null | undefined): number {
  return GATE_ENTRY_STAGES.findIndex((s) => s.key === status);
}

/** The active stage object for `status`, or null when not in an active stage
 *  (CLEARED / GRN_CREATED / REJECTED, or an unknown legacy value). */
export function gateEntryCurrentStage(status: string | null | undefined): GateEntryStage | null {
  return GATE_ENTRY_STAGES.find((s) => s.key === status) ?? null;
}

export function gateEntryStageByKey(key: string): GateEntryStage | null {
  return GATE_ENTRY_STAGES.find((s) => s.key === key) ?? null;
}

export function gateEntryIsCleared(status: string | null | undefined): boolean {
  return status === GE_S_CLEARED;
}
export function gateEntryIsConsumed(status: string | null | undefined): boolean {
  return status === GE_S_GRN_CREATED;
}
export function gateEntryIsRejected(status: string | null | undefined): boolean {
  return status === GE_S_REJECTED;
}
export function gateEntryIsTerminal(status: string | null | undefined): boolean {
  return GATE_ENTRY_TERMINAL_STATUSES.includes(String(status));
}

/** The status a COMPLETE moves to from `status`: the next stage, or CLEARED after
 *  the final stage. Null when `status` isn't an active stage. */
export function gateEntryNextStatus(status: string | null | undefined): string | null {
  const i = gateEntryStageIndex(status);
  if (i < 0) return null;
  return i + 1 < GATE_ENTRY_STAGES.length ? GATE_ENTRY_STAGES[i + 1].key : GE_S_CLEARED;
}

export function gateEntryStagesOwningSection(section: string): GateEntryStage[] {
  return GATE_ENTRY_STAGES.filter((s) => s.sections.includes(section));
}

/** Is `section` editable when the gate entry is at `status`? True when an owner
 *  stage of the section is the current stage. Non-workflow sections → true. */
export function gateEntrySectionEditableAt(section: string, status: string | null | undefined): boolean {
  const owners = gateEntryStagesOwningSection(section);
  if (owners.length === 0) return true;
  return owners.some((s) => s.key === status);
}

// ── Stage sign-off validation ───────────────────────────────────────────────

const DECIDED_INSPECTION = new Set(["PASSED", "PARTIAL", "FAILED"]);

export function gateEntryInspectionDecided(stage: GateEntryStage, data: Record<string, unknown>): boolean {
  return DECIDED_INSPECTION.has(String(data[stage.inspectionField] ?? "").toUpperCase());
}
export function gateEntryInspectionFailed(stage: GateEntryStage, data: Record<string, unknown>): boolean {
  return String(data[stage.inspectionField] ?? "").toUpperCase() === "FAILED";
}

/** Fields that must be present before a stage can be COMPLETED, beyond the
 *  inspection result (which must always be decided). */
const STAGE_REQUIRED_FIELDS: Record<string, string[]> = {
  [GE_S_GATE_ENTRY]: ["docDate", "supplier"],
};

export interface GateEntryStageReadiness {
  ok: boolean;
  missing: string[];
  failed: boolean;
}

/** Can the current stage be completed (forwarded)? Checks required fields and
 *  that the inspection result is decided and not FAILED. */
export function gateEntryStageReadiness(
  stage: GateEntryStage,
  data: Record<string, unknown>,
): GateEntryStageReadiness {
  const missing: string[] = [];
  for (const key of STAGE_REQUIRED_FIELDS[stage.key] ?? []) {
    if (String(data[key] ?? "").trim() === "") missing.push(key);
  }
  const failed = gateEntryInspectionFailed(stage, data);
  if (!gateEntryInspectionDecided(stage, data)) {
    missing.push(`${stage.inspectionField} (record a result)`);
  }
  return { ok: missing.length === 0 && !failed, missing, failed };
}

// ── Timeline ────────────────────────────────────────────────────────────────

export type GateEntryWorkflowAction = "CREATED" | "COMPLETED" | "REJECTED" | "SENT_BACK" | "GRN_CREATED";

export interface GateEntryWorkflowEvent {
  action: GateEntryWorkflowAction;
  fromStatus: string;
  toStatus: string;
  label?: string;
  byUserId: string;
  byName: string;
  /** ISO timestamp. */
  at: string;
  note?: string;
}

export interface GateEntryWorkflowMeta {
  history: GateEntryWorkflowEvent[];
}

export function readGateEntryWorkflow(
  data: Record<string, unknown> | null | undefined,
): GateEntryWorkflowMeta {
  const wf = (data as Record<string, unknown> | null | undefined)?._workflow as
    | GateEntryWorkflowMeta
    | undefined;
  return { history: Array.isArray(wf?.history) ? wf!.history : [] };
}

export type GateEntryAdvanceAction = "COMPLETE" | "REJECT" | "SEND_BACK";

export interface GateEntryAdvanceResolution {
  ok: boolean;
  toStatus?: string;
  event?: GateEntryWorkflowAction;
  error?: string;
}

/**
 * Pure resolver for a stage transition request. Validates the gate entry is in
 * an active stage, that COMPLETE is allowed (fields + non-FAILED inspection),
 * and that a SEND_BACK target is a strictly-earlier stage. Permission checks and
 * persistence are the caller's job.
 */
export function gateEntryResolveAdvance(
  currentStatus: string | null | undefined,
  action: GateEntryAdvanceAction,
  data: Record<string, unknown>,
  toStage?: string,
): GateEntryAdvanceResolution {
  const stage = gateEntryCurrentStage(currentStatus);
  if (!stage) {
    return { ok: false, error: "This gate entry is not in an active workflow stage." };
  }
  if (action === "REJECT") {
    return { ok: true, toStatus: GE_S_REJECTED, event: "REJECTED" };
  }
  if (action === "SEND_BACK") {
    const fromIdx = gateEntryStageIndex(currentStatus);
    const toIdx = gateEntryStageIndex(toStage ?? "");
    if (toIdx < 0 || toIdx >= fromIdx) {
      return { ok: false, error: "Send-back must target an earlier stage." };
    }
    return { ok: true, toStatus: GATE_ENTRY_STAGES[toIdx].key, event: "SENT_BACK" };
  }
  // COMPLETE
  const readiness = gateEntryStageReadiness(stage, data);
  if (!readiness.ok) {
    return {
      ok: false,
      error: readiness.failed
        ? `${stage.label} inspection FAILED — reject or send back instead of forwarding.`
        : `Complete the ${stage.label} stage first: ${readiness.missing.join(", ")}.`,
    };
  }
  const next = gateEntryNextStatus(currentStatus);
  if (!next) return { ok: false, error: "No next stage." };
  return { ok: true, toStatus: next, event: "COMPLETED" };
}
