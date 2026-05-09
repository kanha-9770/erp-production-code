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
  | 'Real Estate'
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

  // ── Real Estate Brokerage (Module #2) ──────────────────────────────────
  {
    path: '/real-estate',
    label: 'Real Estate Dashboard',
    group: 'Real Estate',
    description: 'Brokerage overview, KPIs, and quick links',
    icon: 'building2',
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
    label: 'Agent Hierarchy',
    group: 'Real Estate',
    description: 'Visual MLM tree of all agents',
    icon: 'users',
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
  'Real Estate',
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
