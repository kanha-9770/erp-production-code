/**
 * Action / functionality permission CATALOG.
 *
 * The single registry of per-module privileged "functionalities" (named
 * permissions) that the Approvals & Permissions admin page
 * (/settings/permission/approvals) lets you grant to roles and users. Each
 * entry maps to a named Permission resolved by hasPermission(); `enforced`
 * tells the UI whether the server actually checks it today (so the page can
 * label not-yet-wired actions honestly instead of pretending they bite).
 *
 * Adding a new gate = one entry here + one requireXxxPermission() call in the
 * matching handler. Pure data (no prisma import) so it's safe to import anywhere.
 */

import {
  APPROVE_PURCHASE_REQUISITION,
  APPROVE_PURCHASE_ORDER,
  POST_GRN_STOCK,
  RAISE_PAYMENT_REQUEST,
  PROCESS_PURCHASE,
} from "@/lib/permissions/purchase-permissions";
import {
  POST_INVENTORY_MOVEMENT,
  DELETE_INVENTORY_ITEM,
  RESET_INVENTORY_DATA,
} from "@/lib/permissions/inventory-permissions";

export interface ActionPermissionDef {
  /** Named permission constant (matches a Permission.name row). */
  name: string;
  /** Human label shown as the column header. */
  label: string;
  /** One-line explanation shown in a tooltip / subtext. */
  description: string;
  /** True when a handler actually enforces this permission today. */
  enforced: boolean;
}

export interface ActionModuleGroup {
  /** Stable key. */
  module: string;
  /** Display name. */
  label: string;
  description: string;
  functionalities: ActionPermissionDef[];
}

export const ACTION_CATALOG: ActionModuleGroup[] = [
  {
    module: "purchase",
    label: "Purchase & Procurement",
    description: "Approvals and posting across the procure-to-pay chain.",
    functionalities: [
      {
        name: APPROVE_PURCHASE_REQUISITION,
        label: "Approve Requisition",
        description: "Set a Purchase Requisition's Production Approval.",
        enforced: true,
      },
      {
        name: APPROVE_PURCHASE_ORDER,
        label: "Approve Purchase Order",
        description: "Set a Purchase Order's approval status.",
        enforced: true,
      },
      {
        name: POST_GRN_STOCK,
        label: "Post GRN → Inventory",
        description: "Receive goods and post a GRN's quantities into store inventory.",
        enforced: true,
      },
      {
        name: RAISE_PAYMENT_REQUEST,
        label: "Raise Payment Request",
        description: "Create a payment request against a PO/GRN.",
        enforced: true,
      },
      {
        name: PROCESS_PURCHASE,
        label: "Process Purchase (Buyer)",
        description: "Raise RFQs, create/convert POs, manage suppliers, edit & delete purchase docs.",
        enforced: true,
      },
    ],
  },
  {
    module: "inventory",
    label: "Inventory",
    description: "Stock-affecting and destructive inventory operations.",
    functionalities: [
      {
        name: POST_INVENTORY_MOVEMENT,
        label: "Post Goods Movement",
        description: "Create/edit/delete inward & outward movements (changes stock).",
        enforced: true,
      },
      {
        name: DELETE_INVENTORY_ITEM,
        label: "Delete Inventory Item",
        description: "Delete inventory items, single or bulk.",
        enforced: true,
      },
      {
        name: RESET_INVENTORY_DATA,
        label: "Reset Inventory Data",
        description: "Wipe and reseed all inventory data.",
        enforced: true,
      },
    ],
  },
  {
    module: "accounts",
    label: "Accounts & Finance",
    description:
      "Approvals for accounting documents. Enforcement pending a server backend (accounts is currently client-only).",
    functionalities: [
      {
        name: "APPROVE_SALES_INVOICE",
        label: "Approve Sales Invoice",
        description: "Approve an AR sales invoice.",
        enforced: false,
      },
      {
        name: "APPROVE_PAYMENT_VOUCHER",
        label: "Approve Payment Voucher",
        description: "Approve an outgoing payment voucher.",
        enforced: false,
      },
      {
        name: "APPROVE_EXPENSE_VOUCHER",
        label: "Approve Expense Voucher",
        description: "Approve an employee expense claim.",
        enforced: false,
      },
      {
        name: "POST_JOURNAL_VOUCHER",
        label: "Post Journal Voucher",
        description: "Post a manual general-ledger journal entry.",
        enforced: false,
      },
    ],
  },
];

/** Flat list of every catalogued permission (for ensure + lookups). */
export const ALL_ACTION_PERMISSIONS: Array<ActionPermissionDef & { module: string }> =
  ACTION_CATALOG.flatMap((g) =>
    g.functionalities.map((f) => ({ ...f, module: g.module })),
  );

/** Every permission name in the catalog. */
export const ACTION_PERMISSION_NAMES: string[] = ALL_ACTION_PERMISSIONS.map(
  (f) => f.name,
);
