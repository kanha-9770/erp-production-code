/**
 * Static-page registry — single source of truth for every URL in the app
 * that exists OUTSIDE the form-builder module hierarchy.
 *
 * Why this exists
 * ---------------
 * The form-builder generates routes from FormModule rows in the database, so
 * permissioning those is straightforward (the existing RolePermission +
 * FormModule join). Static pages (the leave module, attendance widget pages,
 * payroll, settings) are not modules and therefore cannot be permissioned
 * through that join — they need to be expressed as a path pattern stored
 * on RoutePermission.
 *
 * This registry lists every such page in one place so the roles-permissions
 * UI can offer them alongside form modules. The sidebar of /settings/permission
 * /roles reads this list, the RoutePermissionMatrix uses it to display
 * friendly names, and the route-permission discover endpoint can warm-start
 * the database from it. Adding a new static page = one line here.
 *
 * No imports allowed from `lucide-react` here — this file is consumed by
 * server-side code paths too. Keep it dependency-free.
 */

export interface StaticPage {
  /** Pattern used as RoutePermission.pattern. Match wildcard syntax: `*` = one segment, `**` = many. */
  path: string;
  /** Friendly name shown in the admin UI. */
  label: string;
  /** Group header — used to bucket related pages in the sidebar. */
  group: StaticPageGroup;
  /** Optional one-line description shown under the page name in the matrix. */
  description?: string;
  /** Hint that the page is admin-only by convention. The UI uses this to
   *  mark the row, but the actual gate is still a RoutePermission record. */
  adminOnly?: boolean;
  /** Lucide icon NAME (string). Resolved by the sidebar via a switch — keeps
   *  this file decoupled from React. */
  icon?: string;
  /** Required permissions for this page. */
  requiredPermissions?: string[];
}

export type StaticPageGroup =
  | 'Attendance'
  | 'Leave Management'
  | 'Payroll'
  | 'HR & Employees'
  | 'Employee Engagement'
  | 'Performance'
  | 'Real Estate'
  | 'Inventory'
  | 'Asset & Admin'
  | 'Settings'
  | 'Profile'
  | 'AI & Tools';

export const STATIC_PAGES: StaticPage[] = [
  // ── Attendance ─────────────────────────────────────────────────────────
  {
    path: '/attendance',
    label: 'My Attendance',
    group: 'Attendance',
    description: 'Punch in/out, see today’s status',
    icon: 'clock',
  },
  {
    path: '/attendance/regularizations',
    label: 'Attendance Regularizations',
    group: 'Attendance',
    description: 'Submit / review missed-punch corrections',
    icon: 'edit',
  },
  {
    path: '/attendance/team',
    label: 'Team Attendance',
    group: 'Attendance',
    description: 'See team attendance history',
    adminOnly: true,
    icon: 'users',
  },
  {
    path: '/settings/attendance-config',
    label: 'Attendance Configuration',
    group: 'Attendance',
    description: 'Shift, geofence, IP whitelist, face capture',
    adminOnly: true,
    icon: 'settings',
  },

  // ── Leave Management ───────────────────────────────────────────────────
  {
    path: '/leave',
    label: 'My Leaves',
    group: 'Leave Management',
    description: 'Apply, view balance, see history',
    icon: 'calendar',
  },
  {
    path: '/leave/approvals',
    label: 'Leave Approvals',
    group: 'Leave Management',
    description: 'Inbox of pending leave requests',
    icon: 'inbox',
  },
  {
    path: '/leave/admin',
    label: 'Leave Allocations',
    group: 'Leave Management',
    description: 'Set yearly balances per employee',
    adminOnly: true,
    icon: 'wallet',
  },
  {
    path: '/settings/holidays',
    label: 'Holiday Calendar',
    group: 'Leave Management',
    description: 'Manage org-wide holidays',
    adminOnly: true,
    icon: 'calendar-heart',
  },

  // ── Payroll ────────────────────────────────────────────────────────────
  {
    path: '/payroll',
    label: 'Payroll',
    group: 'Payroll',
    description: 'View / run monthly payroll',
    icon: 'wallet',
  },
  {
    path: '/payroll/configure',
    label: 'Payroll Configuration',
    group: 'Payroll',
    description: 'Form mappings, leave-type rules',
    adminOnly: true,
    icon: 'settings',
  },

  // ── HR & Employees ─────────────────────────────────────────────────────
  {
    path: '/employee-master',
    label: 'Employee Master',
    group: 'HR & Employees',
    description: 'Directory of all employees — list, filters, inline edit',
    icon: 'users',
  },
  {
    path: '/staffing-plan',
    label: 'Staffing Plan',
    group: 'HR & Employees',
    description: 'Workforce planning — vacancies, profile and cost estimation',
    icon: 'briefcase',
  },
  {
    path: '/job-opening',
    label: 'Job Opening',
    group: 'HR & Employees',
    description: 'Live recruitment postings — publish jobs and track vacancies',
    icon: 'megaphone',
  },
  {
    path: '/job-application',
    label: 'Job Application',
    group: 'HR & Employees',
    description: 'Applicants for live job openings — screening and ratings',
    icon: 'user-plus',
  },
  {
    path: '/job-offer',
    label: 'Job Offer',
    group: 'HR & Employees',
    description: 'Formal offers to shortlisted candidates — terms and status',
    icon: 'file-signature',
  },
  {
    path: '/appointment-letter',
    label: 'Appointment Letter',
    group: 'HR & Employees',
    description: 'Appointment letters issued to accepted candidates',
    icon: 'scroll-text',
  },
  {
    path: '/employee-referral',
    label: 'Employee Referral',
    group: 'HR & Employees',
    description: 'Candidate referrals submitted by existing employees',
    icon: 'user-plus',
  },

  // ── Employee Engagement ───────────────────────────────────────────────
  {
    path: '/employee-engagement/self-target',
    label: 'Self Target',
    group: 'Employee Engagement',
    description: 'Set and track personal performance targets',
    icon: 'target',
  },
  {
    path: '/employee-engagement/self-initiative',
    label: 'Self Initiative',
    group: 'Employee Engagement',
    description: 'Document and manage self-initiated improvement projects',
    icon: 'lightbulb',
  },
  {
    path: '/employee-engagement/problem-registration',
    label: 'Problem Registration',
    group: 'Employee Engagement',
    description: 'Register and track workplace problems for resolution',
    icon: 'alert-circle',
  },
  {
    path: '/employee-engagement/kaizen',
    label: 'Kaizen',
    group: 'Employee Engagement',
    description: 'Continuous improvement suggestions and implementation',
    icon: 'trending-up',
  },
  {
    path: '/employee-engagement/employee-suggestion',
    label: 'Employee Suggestion',
    group: 'Employee Engagement',
    description: 'Submit and track employee suggestions for improvement',
    icon: 'message-square',
  },

  // ── Performance ────────────────────────────────────────────────────────
  // KRA tracking + periodic appraisals. Both pages persist to localStorage
  // until a backend table is added — replace with API hooks when ready.
  {
    path: '/performance/kra',
    label: 'Key Result Areas',
    group: 'Performance',
    description: 'Set, weight, and track measurable objectives per employee',
    icon: 'target',
  },
  {
    path: '/performance/appraisal',
    label: 'Performance Appraisal',
    group: 'Performance',
    description: 'Quarterly / annual review with rating, strengths, growth areas',
    adminOnly: true,
    icon: 'trending-up',
  },

  // ── Asset & Admin ──────────────────────────────────────────────────────
  // Single physical-asset register — laptops, monitors, phones, accessories,
  // and corporate SIMs (SIM is an asset type, not a separate module).
  // Persists to localStorage until a backend table is added — replace with
  // API hooks when ready.
  {
    path: '/asset-management',
    label: 'Asset Management',
    group: 'Asset & Admin',
    description: 'Laptops, phones, monitors, and SIM cards — assignment + status',
    adminOnly: true,
    icon: 'package',
  },

  // ── Inventory (Module #3) ──────────────────────────────────────────────
  // Product catalog with a structured form **and** a Webflow-style page
  // builder for the storefront detail page.
  {
    path: '/inventory',
    label: 'Inventory',
    group: 'Inventory',
    description: 'Products, stock, page builder',
    icon: 'boxes',
  },
  {
    path: '/inventory/new',
    label: 'New Product',
    group: 'Inventory',
    description: 'Quick-create a product',
    icon: 'plus',
  },

  // ── Real Estate Brokerage (Module #2) ──────────────────────────────────
  // Pages are listed in sidebar order — top to bottom mirrors the in-app
  // navigation flow (overview → inventory → people → money → admin).
  {
    path: '/real-estate',
    label: 'Real Estate Dashboard',
    group: 'Real Estate',
    description: 'Module home — KPIs and quick links',
    icon: 'building2',
  },
  {
    path: '/real-estate/dashboards/sales',
    label: 'Sales Dashboard',
    group: 'Real Estate',
    description: 'Revenue, expense, profit, top properties',
    icon: 'trending-up',
  },
  {
    path: '/real-estate/dashboards/network',
    label: 'Agent Network Dashboard',
    group: 'Real Estate',
    description: 'Override commissions, registrations, members map',
    icon: 'network',
  },
  {
    path: '/real-estate/properties',
    label: 'Properties',
    group: 'Real Estate',
    description: 'Property inventory & listings',
    icon: 'building2',
  },
  {
    path: '/real-estate/agents',
    label: 'Agents',
    group: 'Real Estate',
    description: 'Agents, ranks, MLM hierarchy',
    icon: 'users',
  },
  {
    path: '/real-estate/agents/tree',
    label: 'Hierarchy: Tree',
    group: 'Real Estate',
    description: 'Visual sponsor/parent tree of all agents',
    icon: 'network',
  },
  {
    path: '/real-estate/agents/hierarchy-list',
    label: 'Hierarchy: List',
    group: 'Real Estate',
    description: 'Flat depth-indented agent list (spreadsheet view)',
    icon: 'list',
  },
  {
    path: '/real-estate/agents/binary',
    label: 'Hierarchy: Binary',
    group: 'Real Estate',
    description: 'Left/right binary placement view of recruits',
    icon: 'network',
  },
  {
    path: '/real-estate/agents/sponsor',
    label: 'Hierarchy: Sponsor',
    group: 'Real Estate',
    description: 'Sponsor-edge tree (the chain commission overrides walk)',
    icon: 'network',
  },
  {
    path: '/real-estate/agents/ranks',
    label: 'Ranks & Promotion Rules',
    group: 'Real Estate',
    description: 'Configure agent ranks & override percents',
    adminOnly: true,
    icon: 'settings',
  },
  {
    path: '/real-estate/leads',
    label: 'Leads',
    group: 'Real Estate',
    description: 'CRM pipeline (list + Kanban)',
    icon: 'inbox',
  },
  {
    path: '/real-estate/viewings',
    label: 'Property Viewings',
    group: 'Real Estate',
    description: 'Scheduled viewings calendar',
    icon: 'calendar',
  },
  {
    path: '/real-estate/transactions',
    label: 'Transactions',
    group: 'Real Estate',
    description: 'Property sales — pending and closed',
    icon: 'wallet',
  },
  {
    path: '/real-estate/wallet',
    label: 'My Wallet',
    group: 'Real Estate',
    description: 'Commission balance and ledger',
    icon: 'wallet',
  },
  {
    path: '/real-estate/payouts',
    label: 'Payouts',
    group: 'Real Estate',
    description: 'Withdrawal requests, bank accounts',
    icon: 'wallet',
  },
  {
    path: '/real-estate/admin/wallets',
    label: 'Wallets (admin)',
    group: 'Real Estate',
    description: 'Commission liability across all agents',
    adminOnly: true,
    icon: 'wallet',
  },
  {
    path: '/real-estate/admin/payouts',
    label: 'Payout Approvals',
    group: 'Real Estate',
    description: 'Approve / reject / mark-paid withdrawals',
    adminOnly: true,
    icon: 'inbox',
  },
  {
    path: '/real-estate/admin/commission-rules',
    label: 'Commission Rules',
    group: 'Real Estate',
    description: 'Configure splits, override percents, hold period',
    adminOnly: true,
    icon: 'settings',
  },
  {
    path: '/real-estate/compliance',
    label: 'My Compliance',
    group: 'Real Estate',
    description: 'KYC documents, license, agency agreement',
    icon: 'shield',
  },
  {
    path: '/real-estate/admin/compliance',
    label: 'Compliance Queue',
    group: 'Real Estate',
    description: 'Verify / reject agent KYC submissions',
    adminOnly: true,
    icon: 'shield',
  },
  {
    path: '/real-estate/admin/duplicates',
    label: 'Duplicate Leads',
    group: 'Real Estate',
    description: 'Silent duplicate-capture review (phone / email / photo)',
    adminOnly: true,
    icon: 'shield',
  },
  {
    path: '/real-estate/admin/rank-promotions',
    label: 'Rank Promotions',
    group: 'Real Estate',
    description: 'Evaluate criteria + auto-promote agents',
    adminOnly: true,
    icon: 'sparkles',
  },
  {
    path: '/real-estate/admin/sub-admins',
    label: 'Sub-Admins',
    group: 'Real Estate',
    description: 'Brokerage staff with admin privileges',
    adminOnly: true,
    icon: 'shield',
  },
  {
    path: '/real-estate/admin/fund-credit',
    label: 'Fund Credit',
    group: 'Real Estate',
    description: 'Manual wallet credit / debit (dual-authorized)',
    adminOnly: true,
    icon: 'coins',
  },
  // Members Management — focused views over the agents data
  {
    path: '/real-estate/members/active',
    label: 'Active Network Members',
    group: 'Real Estate',
    description: 'Active agents currently selling',
    icon: 'users',
  },
  {
    path: '/real-estate/members/pending',
    label: 'Pending Onboarding',
    group: 'Real Estate',
    description: 'Agents awaiting KYC verification',
    adminOnly: true,
    icon: 'user-plus',
  },
  {
    path: '/real-estate/members/kyc',
    label: 'KYC Details',
    group: 'Real Estate',
    description: 'Compliance overview + expiring documents',
    adminOnly: true,
    icon: 'shield',
  },
  {
    path: '/real-estate/reports',
    label: 'Reports',
    group: 'Real Estate',
    description: 'Sales register, leaderboard, tax statement, etc.',
    icon: 'file-text',
  },
  {
    path: '/real-estate/reports/joining',
    label: 'Joining Report',
    group: 'Real Estate',
    description: 'Agents who joined in the period (recruiting analytics)',
    icon: 'user-plus',
  },
  {
    path: '/real-estate/reports/member-income',
    label: 'Member Income Report',
    group: 'Real Estate',
    description: 'Per-agent gross / reversed / net commission',
    icon: 'coins',
  },
  {
    path: '/real-estate/reports/sales',
    label: 'Sales Report',
    group: 'Real Estate',
    description: 'Closed sales register, period-filtered',
    icon: 'receipt',
  },
  {
    path: '/real-estate/reports/payouts',
    label: 'Payout Report',
    group: 'Real Estate',
    description: 'Withdrawal register — requested through paid',
    icon: 'banknote',
  },
  {
    path: '/real-estate/reports/top-earners',
    label: 'Top Earners',
    group: 'Real Estate',
    description: 'Highest-grossing agents leaderboard',
    icon: 'trophy',
  },
  {
    path: '/real-estate/reports/fund-transfer',
    label: 'Fund Transfer Report',
    group: 'Real Estate',
    description: 'Manual ledger adjustments audit log',
    adminOnly: true,
    icon: 'coins',
  },
  {
    path: '/real-estate/reports/point-history',
    label: 'Wallet Activity',
    group: 'Real Estate',
    description: 'All ledger entries across all wallets',
    adminOnly: true,
    icon: 'activity',
  },

  // ── REBM Module #4 — Plan Designer, Settings, Team ─────────────────────
  {
    path: '/real-estate/admin/plan-designer',
    label: 'Plan Designer',
    group: 'Real Estate',
    description: 'Design compensation plans — slabs, overrides, designations, guarantees',
    adminOnly: true,
    icon: 'sparkles',
  },
  {
    path: '/real-estate/comp-plan',
    label: 'Compensation Plan',
    group: 'Real Estate',
    description: 'View / print the active compensation plan',
    icon: 'file-text',
  },
  {
    path: '/real-estate/admin/settings',
    label: 'Module Settings',
    group: 'Real Estate',
    description: 'RERA toggle, plan engine, hold period, residual %',
    adminOnly: true,
    icon: 'settings',
  },
  {
    path: '/real-estate/my-team',
    label: 'My Team',
    group: 'Real Estate',
    description: 'Downline, invite links, team performance',
    icon: 'users',
  },

  // ── Profile ────────────────────────────────────────────────────────────
  {
    path: '/profile',
    label: 'My Profile',
    group: 'Profile',
    description: 'Personal account page',
    icon: 'user',
  },

  // ── AI & Tools ─────────────────────────────────────────────────────────
  {
    path: '/chatbot',
    label: 'AI Chatbot',
    group: 'AI & Tools',
    description: 'Conversational assistant',
    icon: 'sparkles',
  },

  // ── Settings ───────────────────────────────────────────────────────────
  {
    path: '/settings',
    label: 'Settings (root)',
    group: 'Settings',
    description: 'Top-level settings hub',
    icon: 'settings',
  },
  {
    path: '/settings/permission',
    label: 'Permission Management',
    group: 'Settings',
    description: 'Roles, route, profile permissions',
    adminOnly: true,
    icon: 'shield',
  },
  {
    path: '/settings/profiles',
    label: 'User Profiles',
    group: 'Settings',
    adminOnly: true,
    icon: 'users',
  },
];

/**
 * Group order for display in the sidebar / matrix UIs. New groups append.
 */
export const STATIC_PAGE_GROUP_ORDER: StaticPageGroup[] = [
  'Attendance',
  'Leave Management',
  'Payroll',
  'HR & Employees',
  'Employee Engagement',
  'Performance',
  'Real Estate',
  'Inventory',
  'Asset & Admin',
  'Settings',
  'Profile',
  'AI & Tools',
];

/**
 * Returns the registry grouped by `group`, preserving the order in
 * STATIC_PAGE_GROUP_ORDER. Useful for building grouped UI lists.
 */
export function staticPagesByGroup(): Array<{ group: StaticPageGroup; pages: StaticPage[] }> {
  const map = new Map<StaticPageGroup, StaticPage[]>();
  for (const p of STATIC_PAGES) {
    const list = map.get(p.group) ?? [];
    list.push(p);
    map.set(p.group, list);
  }
  return STATIC_PAGE_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    pages: (map.get(g) ?? []).slice().sort((a, b) => a.label.localeCompare(b.label)),
  }));
}

/** Find a static-page entry by path. Used by the matrix to render headers. */
export function findStaticPage(path: string): StaticPage | null {
  return STATIC_PAGES.find((p) => p.path === path) ?? null;
}
