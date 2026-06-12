/**
 * Purchase-system privileged actions — named-permission enforcement.
 *
 * The P2P documents (lib/purchase-system/schema.ts) are schema-driven open bags
 * with manual status/approval fields. Page-level route access controls who can
 * *open* a stage, but it does NOT stop a user who can open the Requisition page
 * from flipping `productionApproval` to APPROVED. This module closes that gap by
 * gating the three privileged transitions on org-scoped named permissions,
 * reusing the same engine as MANAGE_USERS (lib/permissions/has-permission.ts):
 *
 *   - APPROVE_PURCHASE_REQUISITION  → may set a PR's Production Approval
 *   - APPROVE_PURCHASE_ORDER        → may set a PO's Approval status
 *   - POST_GRN_STOCK                → may receive goods + post a GRN to inventory
 *
 * Resolution (inherited from hasPermission): admin / org-owner always pass;
 * otherwise the user needs a role grant (RolePermission) or an explicit user
 * override for the permission. Secure by default — nobody but admins can perform
 * these until you grant the permission to a role (scripts/grant-purchase-permissions.ts).
 */

import { prisma } from "@/lib/prisma";
import { hasPermission, isOrgAdmin } from "@/lib/permissions/has-permission";
import { buildRoleParentMap, isDescendantRole } from "@/lib/approvals/engine";
import type { PurchasePermissions } from "@/lib/purchase-system/types";

export const APPROVE_PURCHASE_REQUISITION = "APPROVE_PURCHASE_REQUISITION";
export const APPROVE_PURCHASE_ORDER = "APPROVE_PURCHASE_ORDER";
export const POST_GRN_STOCK = "POST_GRN_STOCK";
export const RAISE_PAYMENT_REQUEST = "RAISE_PAYMENT_REQUEST";
export const APPROVE_PAYMENT_REQUEST = "APPROVE_PAYMENT_REQUEST";
export const PROCESS_PURCHASE = "PROCESS_PURCHASE";
export const MANAGE_PURCHASE_APPROVAL_PROCESS = "MANAGE_PURCHASE_APPROVAL_PROCESS";

/**
 * The single guarded field per submodule and the permission that gates it. One
 * source of truth for every enforcement path (API edit/create + bulk import).
 */
export const GUARDED_FIELDS: Record<string, { field: string; permission: string }> = {
  pr: { field: "productionApproval", permission: APPROVE_PURCHASE_REQUISITION },
  po: { field: "approvalStatus", permission: APPROVE_PURCHASE_ORDER },
  grn: { field: "stockUpdated", permission: POST_GRN_STOCK },
  // A payment request's workflow status: only approvers may move it past
  // REQUESTED (approve / hold / pay / reject).
  payment: { field: "status", permission: APPROVE_PAYMENT_REQUEST },
};

/**
 * Plain (non-status) fields only an approver may fill. Unlike GUARDED_FIELDS —
 * where only a "decided" value (APPROVED/REJECTED/YES) is privileged — ANY change
 * to these needs the permission. The PR's "Item Location Kept" is recorded by the
 * production manager at approval time, so it's reserved to the same approver who
 * sets Production Approval (APPROVE_PURCHASE_REQUISITION).
 */
export const APPROVER_ONLY_FIELDS: Record<string, { fields: string[]; permission: string }> = {
  pr: { fields: ["itemLocationKept"], permission: APPROVE_PURCHASE_REQUISITION },
};

/**
 * The permission an approver-only field demands when `next` changes it vs `base`
 * (or, on create where base is null, when it's set to a non-empty value). Returns
 * null when no such field is touched.
 */
function approverOnlyPermission(
  submodule: string,
  base: Record<string, unknown> | null,
  next: Record<string, unknown>,
): string | null {
  const a = APPROVER_ONLY_FIELDS[submodule];
  if (!a) return null;
  for (const f of a.fields) {
    if (!Object.prototype.hasOwnProperty.call(next, f)) continue;
    const changed = base
      ? String(next[f] ?? "") !== String(base[f] ?? "")
      : String(next[f] ?? "").trim() !== "";
    if (changed) return a.permission;
  }
  return null;
}

/** Does this flag set permit the named permission? */
function permitted(permission: string, perms: PurchasePermissions): boolean {
  switch (permission) {
    case APPROVE_PURCHASE_REQUISITION:
      return perms.approveRequisition;
    case APPROVE_PURCHASE_ORDER:
      return perms.approvePo;
    case POST_GRN_STOCK:
      return perms.postStock;
    case APPROVE_PAYMENT_REQUEST:
      return perms.approvePayment;
    default:
      return false;
  }
}

// ── Role-hierarchy gate for approvals (org opt-in) ──────────────────────────

/** Active role ids a user currently holds (role + unit both active). */
async function activeRoleIds(userId: string): Promise<string[]> {
  const rows = await prisma.userUnitAssignment.findMany({
    where: { userId, role: { isActive: true }, unit: { isActive: true } },
    select: { roleId: true },
  });
  return [...new Set(rows.map((r) => r.roleId))];
}

/**
 * Org opt-in flag (Organization.setup.approvals.purchaseHierarchyScoped — no
 * migration). When true, a guarded approval (e.g. a PR's Production Approval)
 * may only be applied by someone who sits ABOVE the record's creator in the role
 * tree — so a department head approves their own team's documents, never another
 * department's. Off by default (blanket permission, as before).
 */
export async function purchaseHierarchyEnforced(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { setup: true },
  });
  const setup = (org?.setup ?? {}) as { approvals?: { purchaseHierarchyScoped?: boolean } };
  return setup.approvals?.purchaseHierarchyScoped === true;
}

/**
 * Org opt-in (Organization.setup.approvals.engineOnly — no migration). When true,
 * the approval-PROCESS engine (lib/approvals) is the SOLE approval gate for
 * purchase: the legacy named-permission FIELD gating (productionApproval /
 * approvalStatus / payment status) is skipped, so a field with NO configured
 * approval process is freely editable, and ALL approval control comes from the
 * approval-process pages. GRN stock-posting (POST_GRN_STOCK) is unaffected — it
 * triggers a real inventory write, not a field approval. Off by default.
 */
export async function approvalsEngineOnly(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { setup: true },
  });
  const setup = (org?.setup ?? {}) as { approvals?: { engineOnly?: boolean } };
  return setup.approvals?.engineOnly === true;
}

/** Thrown when an approver acts on a document outside their role hierarchy (403). */
export class PurchaseHierarchyError extends Error {
  readonly forbidden = true;
  constructor(
    message = "You can only approve documents raised by your own team — this one was raised outside your role hierarchy.",
  ) {
    super(message);
    this.name = "PurchaseHierarchyError";
  }
}

/**
 * Enforce role-hierarchy on a guarded approval: the acting user must hold a role
 * that is a strict ANCESTOR of one of the record creator's roles (the creator is
 * their subordinate). Admins/owners bypass. Callers gate this on
 * {@link purchaseHierarchyEnforced} so it's a no-op unless the org opted in.
 */
export async function assertApprovalWithinHierarchy(args: {
  actingUserId: string;
  creatorId: string | null;
  organizationId: string;
}): Promise<void> {
  if (await isOrgAdmin(args.actingUserId)) return;
  const [actorRoles, creatorRoles, parentById] = await Promise.all([
    activeRoleIds(args.actingUserId),
    args.creatorId ? activeRoleIds(args.creatorId) : Promise.resolve<string[]>([]),
    buildRoleParentMap(prisma, args.organizationId),
  ]);
  const ok = creatorRoles.some((cr) => actorRoles.some((ar) => isDescendantRole(cr, ar, parentById)));
  if (!ok) throw new PurchaseHierarchyError();
}

/** Source of truth for the purchase permissions, used by seed + grant tooling. */
export const PURCHASE_PERMISSIONS: ReadonlyArray<{
  name: string;
  description: string;
  resource: string;
}> = [
  {
    name: APPROVE_PURCHASE_REQUISITION,
    description:
      "Approve or reject purchase requisitions (set Production Approval). Grant to department-head / approver roles.",
    resource: "purchase",
  },
  {
    name: APPROVE_PURCHASE_ORDER,
    description:
      "Approve or reject purchase orders (set PO Approval). Grant to purchase-manager roles.",
    resource: "purchase",
  },
  {
    name: POST_GRN_STOCK,
    description:
      "Receive goods and post a GRN's quantities into store inventory. Grant to store-keeper / warehouse roles.",
    resource: "purchase",
  },
  {
    name: RAISE_PAYMENT_REQUEST,
    description:
      "Raise a payment request against a PO/GRN. Grant to accounts-payable / purchase roles.",
    resource: "purchase",
  },
  {
    name: APPROVE_PAYMENT_REQUEST,
    description:
      "Approve, hold, reject or mark-paid a payment request (set its status). Grant to finance-approver roles.",
    resource: "purchase",
  },
  {
    name: PROCESS_PURCHASE,
    description:
      "Buyer: raise RFQs, create/convert purchase orders, manage suppliers, and edit/delete purchase documents.",
    resource: "purchase",
  },
  {
    name: MANAGE_PURCHASE_APPROVAL_PROCESS,
    description:
      "Create, edit, activate and delete purchase approval processes (Settings → Purchase Approvals). Grant to purchase/admin roles.",
    resource: "purchase",
  },
];

/**
 * Creating a record in a submodule is a privileged action (independent of any
 * field value): raising a payment, a buyer creating an RFQ/PO/supplier, or a
 * store-keeper receiving a GRN. Returns the permission required to create in
 * `submodule`, or null when create is open (a Requisition — any employee).
 */
export function submoduleCreatePermission(submodule: string): string | null {
  switch (submodule) {
    case "pr":
      return null; // any employee may raise a requisition
    case "payment":
      return RAISE_PAYMENT_REQUEST;
    case "grn":
      return POST_GRN_STOCK; // store-keeper receives goods
    case "sourcing":
    case "po":
    case "supplier":
      return PROCESS_PURCHASE; // buyer
    default:
      return null;
  }
}

/** Permission required to DELETE a record — buyers/admins only (not requesters). */
export function deletePermission(): string {
  return PROCESS_PURCHASE;
}

/**
 * Thrown when the caller lacks a required purchase permission. The `forbidden`
 * flag lets route handlers map it to HTTP 403 without string-matching.
 */
export class PurchasePermissionError extends Error {
  readonly forbidden = true;
  constructor(public readonly permission: string, message?: string) {
    super(
      message ??
        `You do not have permission to perform this action (${permission}).`,
    );
    this.name = "PurchasePermissionError";
  }
}

/** Throw PurchasePermissionError unless the user holds (or admin-bypasses) `name`. */
export async function requirePurchasePermission(
  userId: string,
  name: string,
): Promise<void> {
  const ok = await hasPermission(userId, name);
  if (!ok) throw new PurchasePermissionError(name);
}

/**
 * Resolve all three privileged-action flags for a user in one round-trip
 * (the three checks run concurrently). Sent to the client in the load payload
 * so the UI can hide/lock actions the user can't perform.
 */
export async function getPurchasePermissions(
  userId: string,
): Promise<PurchasePermissions> {
  const [approveRequisition, approvePo, postStock, raisePayment, approvePayment, process] =
    await Promise.all([
      hasPermission(userId, APPROVE_PURCHASE_REQUISITION),
      hasPermission(userId, APPROVE_PURCHASE_ORDER),
      hasPermission(userId, POST_GRN_STOCK),
      hasPermission(userId, RAISE_PAYMENT_REQUEST),
      hasPermission(userId, APPROVE_PAYMENT_REQUEST),
      hasPermission(userId, PROCESS_PURCHASE),
    ]);
  return { approveRequisition, approvePo, postStock, raisePayment, approvePayment, process };
}

/** A guarded field set to a "decided"/privileged value (not the benign default). */
function isPrivilegedValue(field: string, v: unknown): boolean {
  const s = String(v ?? "").trim().toUpperCase();
  if (field === "stockUpdated") return s === "YES";
  // Payment status: anything past the initial "REQUESTED" is an approver move.
  if (field === "status") return ["APPROVED", "REJECTED", "PAID", "ON_HOLD"].includes(s);
  return s === "APPROVED" || s === "REJECTED";
}

/**
 * Return the permission a caller must hold to CREATE `data` for `submodule` —
 * or null when nothing privileged is being set. Closes the back door of
 * creating a record already pre-approved (or pre-posted) to skip the gate. The
 * benign defaults (PENDING / NO) need no permission.
 */
export function guardedPermissionForCreate(
  submodule: string,
  data: Record<string, unknown>,
): string | null {
  const g = GUARDED_FIELDS[submodule];
  if (g && isPrivilegedValue(g.field, data[g.field])) return g.permission;
  // An approver-only field pre-filled on create is the same back-door.
  return approverOnlyPermission(submodule, null, data);
}

/**
 * Bulk-import safety: strip the guarded field from an imported `data` bag when
 * the acting user lacks the permission to set it. On create the field then
 * falls back to its benign default; on a re-import (merge) the existing value is
 * preserved — so a CSV can never escalate past the API guards. Mutates and
 * returns `data`. Admins/grantees keep `perms` flags true and import unchanged.
 */
export function sanitizePurchaseImport(
  submodule: string,
  data: Record<string, unknown>,
  perms: PurchasePermissions,
): Record<string, unknown> {
  const g = GUARDED_FIELDS[submodule];
  if (
    g &&
    Object.prototype.hasOwnProperty.call(data, g.field) &&
    !permitted(g.permission, perms)
  ) {
    delete data[g.field];
  }
  // Approver-only plain fields (PR Item Location Kept) get the same treatment.
  const a = APPROVER_ONLY_FIELDS[submodule];
  if (a && !permitted(a.permission, perms)) {
    for (const f of a.fields) {
      if (Object.prototype.hasOwnProperty.call(data, f)) delete data[f];
    }
  }
  return data;
}

/**
 * For a record update, return the permission a caller must hold to apply `patch`
 * to an `existing` record of `submodule` — or null when the patch touches no
 * guarded field (the common case: an ordinary edit needs no special permission).
 *
 * Only an actual *change* to a guarded field triggers a check, so re-saving a
 * record with the same approval value never demands the permission.
 */
export function guardedPermissionForPatch(
  submodule: string,
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): string | null {
  const g = GUARDED_FIELDS[submodule];
  if (g) {
    const changed =
      Object.prototype.hasOwnProperty.call(patch, g.field) &&
      String(patch[g.field] ?? "") !== String(existing[g.field] ?? "");
    if (changed) return g.permission;
  }
  // …or an approver-only plain field (e.g. the PR's Item Location Kept) changed.
  return approverOnlyPermission(submodule, existing, patch);
}

/**
 * Idempotently create the three purchase Permission rows for an organization so
 * they exist for grant tooling / admin UI. Safe to call repeatedly.
 */
export async function ensurePurchasePermissions(
  organizationId: string,
): Promise<void> {
  for (const p of PURCHASE_PERMISSIONS) {
    const existing = await prisma.permission.findFirst({
      where: { name: p.name, organizationId },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.permission.create({
      data: {
        name: p.name,
        description: p.description,
        category: "SPECIAL",
        resource: p.resource,
        organizationId,
        isActive: true,
      },
    });
  }
}
