/**
 * Default sidebar blueprint — the canonical, nested folder structure that
 * every new organization is seeded with (and that existing orgs can be
 * backfilled to).
 *
 * How it maps onto the runtime sidebar
 * ------------------------------------
 * The sidebar is built from two things (see lib/erp-modules-seed.ts):
 *   1. `FormModule` rows — the folders. Nested via `parentId`.
 *   2. `StaticPageAnchor` rows — they pin a static page (from
 *      lib/static-pages.ts) as a leaf under a specific folder.
 *
 * This file declares, per ERP module, the folder tree to create and which
 * static-page paths live in each folder. The seeder walks this blueprint to:
 *   - create/reuse the top-level module folder (renaming any legacy folder so
 *     existing orgs migrate in place without losing custom forms),
 *   - create/reuse each nested sub-folder, and
 *   - write a page-level anchor for every listed page so it renders as a leaf
 *     under the right folder.
 *
 * Ordering notes
 * --------------
 *   - Folder order within a parent follows the order of `children` here (the
 *     seeder assigns `sortOrder` accordingly).
 *   - Leaf (page) order WITHIN a folder follows the order pages appear in
 *     lib/static-pages.ts — the anchor resolver re-numbers leaves by registry
 *     order, so keep related pages adjacent there if their order matters.
 *   - A folder may have BOTH sub-folders and direct page leaves. The renderer
 *     shows sub-folders first, then the leaf pages.
 *
 * Every static-page path owned by a blueprint module SHOULD appear somewhere
 * in its tree (or in `topPages`); a path that's omitted simply won't show in
 * the sidebar (it stays URL-reachable, just unanchored).
 */

export interface SidebarBlueprintNode {
  /** Folder label shown in the sidebar. */
  name: string;
  /** Optional Lucide icon name (resolved by getModuleIcon in the sidebar). */
  icon?: string;
  /** Static-page paths anchored directly under this folder, as leaf pages. */
  pages?: string[];
  /** Nested sub-folders. */
  children?: SidebarBlueprintNode[];
}

export interface ModuleBlueprint {
  /** ERP module id this blueprint belongs to (Organization.selectedModules). */
  erpModuleId: string;
  /** Display label for the top-level module folder. */
  topLabel: string;
  /** Lucide icon name for the top-level folder. */
  topIcon: string;
  /** One-line description stored on the top-level folder. */
  topDescription?: string;
  /**
   * Past names this top-level folder may already exist under (e.g. before a
   * rename). The seeder reuses + renames a matching folder instead of creating
   * a duplicate, so existing orgs migrate in place.
   */
  legacyLabels?: string[];
  /** Pages anchored directly under the top-level folder (not in a sub-folder). */
  topPages?: string[];
  /** Sub-folder tree under the top-level folder. */
  tree: SidebarBlueprintNode[];
}

// ── HR ─────────────────────────────────────────────────────────────────────
const HR_BLUEPRINT: ModuleBlueprint = {
  erpModuleId: "hr",
  topLabel: "HR",
  topIcon: "users",
  topDescription: "Human resources, recruitment, engagement & performance",
  legacyLabels: ["HR & Workforce"],
  tree: [
    {
      name: "HR Core",
      icon: "users",
      // Direct leaf under HR Core in addition to the sub-folders below.
      pages: ["/employee-master"],
      children: [
        {
          name: "PayRoll",
          icon: "wallet",
          pages: ["/payroll", "/payroll/configure"],
        },
        {
          name: "Attendance",
          icon: "clock",
          pages: [
            "/attendance",
            "/attendance/regularizations",
            "/attendance/team",
            "/settings/attendance-config",
          ],
        },
        {
          name: "Leave Management",
          icon: "calendar",
          pages: [
            "/leave",
            "/leave/approvals",
            "/leave/admin",
            "/settings/holidays",
          ],
        },
      ],
    },
    {
      name: "Recruitment",
      icon: "briefcase",
      pages: [
        "/hr/recruitment/staffing-plan",
        "/hr/recruitment/job-opening",
        "/hr/recruitment/job-application",
        "/hr/recruitment/job-offer",
        "/hr/recruitment/appointment-letter",
        "/hr/recruitment/employee-referral",
      ],
    },
    {
      name: "Performance",
      icon: "target",
      pages: ["/performance/kra", "/performance/appraisal"],
    },
    {
      name: "Employee Engagement",
      icon: "trending-up",
      pages: [
        "/employee-engagement",
        "/employee-engagement/self-target",
        "/employee-engagement/self-initiative",
        "/employee-engagement/problem-registration",
        "/employee-engagement/kaizen",
        "/employee-engagement/employee-suggestion",
      ],
    },
    {
      name: "Asset & Admin",
      icon: "package",
      pages: ["/asset-management"],
    },
  ],
};

// ── MLM (Real Estate Brokerage) ──────────────────────────────────────────────
const MLM_BLUEPRINT: ModuleBlueprint = {
  erpModuleId: "real_estate",
  topLabel: "MLM",
  topIcon: "building2",
  topDescription: "Network, properties, commissions & compliance",
  legacyLabels: ["Real Estate Brokerage", "Real Estate"],
  // Direct leaves under the MLM module (rendered after the sub-folders).
  topPages: [
    "/real-estate/properties",
    "/real-estate/leads",
    "/real-estate/viewings",
    "/real-estate/admin/commission-rules",
    "/real-estate/compliance",
    "/real-estate/admin/compliance",
    "/real-estate/admin/plan-designer",
    "/real-estate/admin/settings",
  ],
  tree: [
    {
      name: "Agent",
      icon: "users",
      pages: [
        "/real-estate/agents",
        "/real-estate/agents/ranks",
        "/real-estate/members/active",
        "/real-estate/members/pending",
        "/real-estate/members/kyc",
        "/real-estate/my-team",
        "/real-estate/admin/sub-admins",
        "/real-estate/admin/rank-promotions",
        "/real-estate/admin/duplicates",
      ],
    },
    {
      name: "Dashboards",
      icon: "trending-up",
      pages: [
        "/real-estate",
        "/real-estate/dashboards/sales",
        "/real-estate/dashboards/network",
      ],
    },
    {
      name: "Financial",
      icon: "coins",
      pages: [
        "/real-estate/transactions",
        "/real-estate/wallet",
        "/real-estate/payouts",
        "/real-estate/admin/wallets",
        "/real-estate/admin/post-commissions",
        "/real-estate/admin/payouts",
        "/real-estate/admin/fund-credit",
        "/real-estate/comp-plan",
      ],
    },
    {
      name: "GeneaLogy",
      icon: "network",
      pages: [
        "/real-estate/agents/tree",
        "/real-estate/agents/hierarchy-list",
        "/real-estate/agents/binary",
        "/real-estate/agents/sponsor",
      ],
    },
    {
      name: "Reports",
      icon: "file-text",
      pages: [
        "/real-estate/reports",
        "/real-estate/reports/joining",
        "/real-estate/reports/member-income",
        "/real-estate/reports/sales",
        "/real-estate/reports/payouts",
        "/real-estate/reports/top-earners",
        "/real-estate/reports/fund-transfer",
        "/real-estate/reports/point-history",
      ],
    },
  ],
};

/** All module blueprints, keyed implicitly by `erpModuleId`. */
export const SIDEBAR_BLUEPRINTS: ModuleBlueprint[] = [HR_BLUEPRINT, MLM_BLUEPRINT];

/** ERP module ids that have a nested-folder blueprint. */
export const BLUEPRINT_MODULE_IDS = new Set(
  SIDEBAR_BLUEPRINTS.map((b) => b.erpModuleId),
);

/** Look up a blueprint by ERP module id. */
export function getBlueprint(erpModuleId: string): ModuleBlueprint | undefined {
  return SIDEBAR_BLUEPRINTS.find((b) => b.erpModuleId === erpModuleId);
}
