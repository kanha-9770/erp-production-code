/**
 * ERP module catalog — the set of high-level functional modules that an
 * organization can opt-in to during sign-up (or change later from Settings).
 *
 * Each entry bundles:
 *   - the static-page groups (from `lib/static-pages.ts`) it owns
 *   - the URL prefixes that should be blocked when the module is disabled
 *
 * The catalog drives three things:
 *   1. The module-selection UI in the org-creation modal.
 *   2. Sidebar visibility — pages whose group isn't in any selected module
 *      are hidden.
 *   3. Middleware route-gating — requests to a disabled module's prefixes
 *      are redirected to `/`.
 *
 * Settings, Profile, and AI & Tools are always available regardless of
 * selection so the org admin can always reach configuration.
 */

import type { StaticPageGroup } from "./static-pages";

export interface ErpModuleDef {
  /** Stable identifier persisted on Organization.selectedModules. */
  id: string;
  /** Display label for the selection UI (org-creation picker, settings). */
  label: string;
  /** Optional label for the sidebar's top-level module folder. Falls back to
   *  `label`. Lets the picker keep a short name (e.g. "HR", "MLM") while the
   *  sidebar shows a friendlier heading (e.g. "HR & Workforce"). */
  sidebarLabel?: string;
  /** One-line description shown under the label. */
  description: string;
  /** Lucide icon name (resolved by the picker component). */
  icon: string;
  /** Static-page groups that belong to this module. */
  groups: StaticPageGroup[];
  /** URL prefixes the middleware should block when the module is OFF. */
  routePrefixes: string[];
  /** Recommend selecting by default on new orgs. */
  recommended?: boolean;
}

/**
 * Groups that should ALWAYS be visible — independent of module selection.
 * Without these, a brand-new org with no modules picked would have an empty
 * sidebar and no way to reach Settings to fix it.
 */
export const ALWAYS_ON_GROUPS: StaticPageGroup[] = [
  "Settings",
  "Profile",
  "AI & Tools",
];

export const ERP_MODULES: ErpModuleDef[] = [
  {
    id: "hr",
    label: "HR",
    sidebarLabel: "HR",
    description:
      "Attendance, leave, payroll, employees, recruitment, engagement, performance, assets",
    icon: "users",
    // The HR module renders as five sub-folders (sidebar order below):
    //   - "HR Core"  → a parent folder nesting PayRoll / Attendance /
    //     Leave Management / Onboarding / Offboarding (see STATIC_PAGE_SUBGROUPS).
    //   - "Recruitment" → employee directory + hiring pipeline.
    //   - "Performance", "Employee Engagement", "Asset & Admin".
    // "Asset & Admin" is folded into HR so a default new org gets the asset
    // register without a separate module toggle.
    groups: [
      "HR Core",
      "Recruitment",
      "Performance",
      "Employee Engagement",
      "Asset & Admin",
    ],
    routePrefixes: [
      "/attendance",
      "/leave",
      "/payroll",
      "/employee-master",
      "/hr",
      "/employee-engagement",
      "/performance",
      "/asset-management",
    ],
    recommended: true,
  },
  {
    id: "real_estate",
    label: "MLM",
    sidebarLabel: "MLM",
    description:
      "Properties, agents, leads, transactions, commissions, MLM hierarchy",
    icon: "building2",
    groups: ["Real Estate"],
    routePrefixes: ["/real-estate"],
  },
  {
    id: "inventory",
    label: "Inventory & Storefront",
    description: "Product catalog, stock, and public storefront pages",
    icon: "boxes",
    groups: ["Inventory"],
    routePrefixes: ["/inventory", "/inventory-management", "/storefront"],
  },
  {
    id: "purchase",
    label: "Purchase & Procurement",
    description: "Procure-to-pay: requisition, sourcing, PO, GRN, payments",
    icon: "shopping-cart",
    groups: ["Purchase"],
    routePrefixes: ["/purchase-management"],
  },
  {
    id: "accounts",
    label: "Accounts & Finance",
    sidebarLabel: "Accounts",
    description: "Payables & finance: supplier payment requests",
    icon: "banknote",
    groups: ["Accounts"],
    routePrefixes: ["/accounts"],
  },
  {
    id: "product",
    label: "Product Master",
    sidebarLabel: "Products",
    description: "Machine product catalog: specs, pricing, technical & sales data",
    icon: "package",
    groups: ["Products"],
    routePrefixes: ["/product-master"],
  },
];

/** Default modules picked for brand-new orgs if the user submits none. */
export const DEFAULT_NEW_ORG_MODULES = ["hr"];

/** Full set — used when backfilling existing orgs to preserve behavior. */
export const ALL_MODULE_IDS = ERP_MODULES.map((m) => m.id);

/**
 * Validate and normalize a user-submitted module-id array against the
 * catalog. Unknown ids are silently dropped; duplicates are removed.
 */
export function sanitizeSelectedModules(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const known = new Set(ERP_MODULES.map((m) => m.id));
  const out = new Set<string>();
  for (const v of input) {
    if (typeof v === "string" && known.has(v)) out.add(v);
  }
  return Array.from(out);
}

/**
 * Returns the set of static-page groups that should be visible for an
 * organization given its `selectedModules`. Always includes ALWAYS_ON_GROUPS.
 */
export function getEnabledGroups(selectedModules: string[]): Set<StaticPageGroup> {
  const result = new Set<StaticPageGroup>(ALWAYS_ON_GROUPS);
  const selected = new Set(selectedModules);
  for (const m of ERP_MODULES) {
    if (selected.has(m.id)) m.groups.forEach((g) => result.add(g));
  }
  return result;
}

/**
 * Returns the URL prefixes that should be BLOCKED for an org given its
 * `selectedModules` — i.e. the prefixes owned by modules NOT in the
 * selection.
 */
export function getDisabledRoutePrefixes(selectedModules: string[]): string[] {
  const selected = new Set(selectedModules);
  const out: string[] = [];
  for (const m of ERP_MODULES) {
    if (!selected.has(m.id)) out.push(...m.routePrefixes);
  }
  return out;
}

/**
 * Returns true if `pathname` should be blocked given the org's
 * `selectedModules`. A path is blocked when it lies under any disabled
 * module's prefix AND is NOT under an always-on path like `/settings`.
 */
export function isPathBlockedByModules(
  pathname: string,
  selectedModules: string[]
): boolean {
  // Hard exemptions — always reachable so admins can re-enable modules.
  const ALWAYS_ALLOWED_PREFIXES = ["/settings", "/profile", "/chatbot", "/admin"];
  for (const p of ALWAYS_ALLOWED_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return false;
  }
  const blocked = getDisabledRoutePrefixes(selectedModules);
  for (const prefix of blocked) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
  }
  return false;
}
