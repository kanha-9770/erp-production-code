/**
 * Role templates — one-click permission bundles.
 *
 * A template is a named bundle of (a) page/route grants and (b) named action
 * permissions that, applied to a role, sets it up for a job in ONE click
 * instead of dozens of toggles across the Route, Approvals and Roles screens.
 *
 * CLIENT-SAFE: this file imports ONLY `static-pages` (itself dependency-free)
 * and uses string-literal permission NAMES (which equal their constants, e.g.
 * APPROVE_PURCHASE_ORDER === "APPROVE_PURCHASE_ORDER"). It deliberately does
 * NOT import the permission-constant modules (purchase-permissions, etc.)
 * because those pull in prisma. The apply endpoint resolves these names to
 * Permission rows server-side; the names here must match the catalog.
 *
 * Editing: tweak the `routes`/`actions` of any template, or add a new one —
 * the picker UI and the apply endpoint both read from ROLE_TEMPLATES.
 */

import { STATIC_PAGES, type StaticPageGroup } from "@/lib/static-pages";

export interface RoleTemplate {
  /** Stable id used by the apply endpoint. */
  id: string;
  /** Display name. */
  label: string;
  /** One-line description of who this role is for. */
  description: string;
  /** Lucide icon name (resolved by the UI). */
  icon: string;
  /** Page/route patterns to GRANT (RouteRoleAccess). */
  routes: string[];
  /** Named action permissions to GRANT (RolePermission, org-level). */
  actions: string[];
}

/** Human labels for the action names used below (kept client-safe). */
export const ACTION_LABEL: Record<string, string> = {
  APPROVE_PURCHASE_REQUISITION: "Approve Requisition",
  APPROVE_PURCHASE_ORDER: "Approve Purchase Order",
  PROCESS_PURCHASE: "Process Purchase (Buyer)",
  RAISE_PAYMENT_REQUEST: "Raise Payment Request",
  APPROVE_PAYMENT_REQUEST: "Approve Payment Request",
  MANAGE_PURCHASE_APPROVAL_PROCESS: "Manage Purchase Approval Processes",
  GRN_GATE_ENTRY: "Gate Entry · Stage 1",
  GRN_QC_INSPECTION: "Gate Entry · QC Inspection",
  GRN_STORE_INSPECTION: "Gate Entry · Store Inspection",
  POST_GRN_STOCK: "Create GRN + Post to Inventory",
  POST_INVENTORY_MOVEMENT: "Post Goods Movement",
  DELETE_INVENTORY_ITEM: "Delete Inventory Item",
  RESET_INVENTORY_DATA: "Reset Inventory Data",
  MANAGE_INVENTORY_APPROVAL_PROCESS: "Manage Inventory Approval Processes",
  APPROVE_SALES_INVOICE: "Approve Sales Invoice",
  APPROVE_PAYMENT_VOUCHER: "Approve Payment Voucher",
  APPROVE_EXPENSE_VOUCHER: "Approve Expense Voucher",
  POST_JOURNAL_VOUCHER: "Post Journal Voucher",
};

/** All page paths in the given static-page groups (excludes adminOnly unless asked). */
function pagesInGroups(
  groups: StaticPageGroup[],
  opts?: { includeAdminOnly?: boolean },
): string[] {
  const set = new Set(groups);
  return STATIC_PAGES.filter(
    (p) => set.has(p.group) && (opts?.includeAdminOnly || !p.adminOnly),
  ).map((p) => p.path);
}

const uniq = (xs: string[]) => Array.from(new Set(xs));

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: "purchase_manager",
    label: "Purchase Manager",
    description:
      "Runs procurement end-to-end: sees all Purchase pages, approves requisitions & POs, manages payment requests and approval processes.",
    icon: "shopping-cart",
    routes: pagesInGroups(["Purchase"], { includeAdminOnly: true }),
    actions: [
      "APPROVE_PURCHASE_REQUISITION",
      "APPROVE_PURCHASE_ORDER",
      "PROCESS_PURCHASE",
      "RAISE_PAYMENT_REQUEST",
      "APPROVE_PAYMENT_REQUEST",
      "MANAGE_PURCHASE_APPROVAL_PROCESS",
    ],
  },
  {
    id: "store_incharge",
    label: "Store Incharge",
    description:
      "Receives goods and manages stock: Inventory pages + the receiving flow (gate entry → QC → store → GRN) and goods movement.",
    icon: "boxes",
    routes: uniq([
      ...pagesInGroups(["Inventory"]),
      "/purchase-management/gate-entry",
      "/purchase-management/grn",
      "/purchase-management/open-po",
    ]),
    actions: [
      "GRN_GATE_ENTRY",
      "GRN_QC_INSPECTION",
      "GRN_STORE_INSPECTION",
      "POST_GRN_STOCK",
      "POST_INVENTORY_MOVEMENT",
    ],
  },
  {
    id: "accountant",
    label: "Accountant",
    description:
      "Handles finance documents: Accounts pages plus invoice/voucher approvals and payment-request handling.",
    icon: "banknote",
    routes: pagesInGroups(["Accounts"], { includeAdminOnly: true }),
    actions: [
      "APPROVE_SALES_INVOICE",
      "APPROVE_PAYMENT_VOUCHER",
      "APPROVE_EXPENSE_VOUCHER",
      "POST_JOURNAL_VOUCHER",
      "RAISE_PAYMENT_REQUEST",
      "APPROVE_PAYMENT_REQUEST",
    ],
  },
  {
    id: "hr_manager",
    label: "HR Manager",
    description:
      "Manages the workforce: all HR, Recruitment, Performance and Engagement pages (including config). No purchase/inventory actions.",
    icon: "briefcase",
    routes: pagesInGroups(
      ["HR Core", "Recruitment", "Performance", "Employee Engagement", "Asset & Admin"],
      { includeAdminOnly: true },
    ),
    actions: [],
  },
  {
    id: "real_estate_agent",
    label: "Real Estate Agent",
    description:
      "Brokerage agent self-service: Real Estate pages (properties, leads, wallet, team) without admin/back-office screens.",
    icon: "building2",
    routes: pagesInGroups(["Real Estate"]),
    actions: [],
  },
  {
    id: "basic_employee",
    label: "Basic Employee (self-service)",
    description:
      "Minimal day-to-day access: own attendance, leave, payroll and appraisal. A safe starting point for any new role.",
    icon: "user",
    routes: uniq([
      "/profile",
      "/attendance",
      "/attendance/regularizations",
      "/leave",
      "/payroll",
      "/performance/appraisal",
    ]),
    actions: [],
  },
];

export function getRoleTemplate(id: string): RoleTemplate | undefined {
  return ROLE_TEMPLATES.find((t) => t.id === id);
}
