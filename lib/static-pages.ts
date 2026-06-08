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
  // HR module sub-folders (sidebar order). "HR Core" is a parent folder that
  // nests PayRoll / Attendance / Leave Management / Onboarding / Offboarding
  // as sub-folders (see STATIC_PAGE_SUBGROUPS below).
  | 'HR Core'
  | 'Recruitment'
  | 'Performance'
  | 'Employee Engagement'
  | 'Asset & Admin'
  | 'Real Estate'
  | 'Inventory'
  | 'Purchase'
  | 'Accounts'
  | 'Products'
  | 'Settings'
  | 'Profile'
  | 'AI & Tools';

export const STATIC_PAGES: StaticPage[] = [
  // ── Attendance ─────────────────────────────────────────────────────────
  {
    path: '/attendance',
    label: 'My Attendance',
    group: 'HR Core',
    description: 'Punch in/out, see today’s status',
    icon: 'clock',
  },
  {
    path: '/attendance/regularizations',
    label: 'Attendance Regularizations',
    group: 'HR Core',
    description: 'Submit / review missed-punch corrections',
    icon: 'edit',
  },
  {
    path: '/attendance/team',
    label: 'Team Attendance',
    group: 'HR Core',
    description: 'See team attendance history',
    adminOnly: true,
    icon: 'users',
  },
  {
    path: '/settings/attendance-config',
    label: 'Attendance Configuration',
    group: 'HR Core',
    description: 'Shift, geofence, IP whitelist, face capture',
    adminOnly: true,
    icon: 'settings',
  },

  // ── Leave Management ───────────────────────────────────────────────────
  {
    path: '/leave',
    label: 'My Leaves',
    group: 'HR Core',
    description: 'Apply, view balance, see history',
    icon: 'calendar',
  },
  {
    path: '/leave/approvals',
    label: 'Leave Approvals',
    group: 'HR Core',
    description: 'Inbox of pending leave requests',
    icon: 'inbox',
  },
  {
    path: '/leave/admin',
    label: 'Leave Allocations',
    group: 'HR Core',
    description: 'Set yearly balances per employee',
    adminOnly: true,
    icon: 'wallet',
  },
  {
    path: '/leave/config',
    label: 'Leave Configuration',
    group: 'HR Core',
    description: 'Notice days, consecutive caps, deduction & approval rules',
    adminOnly: true,
    icon: 'settings',
  },
  {
    path: '/settings/holidays',
    label: 'Holiday Calendar',
    group: 'HR Core',
    description: 'Manage org-wide holidays',
    adminOnly: true,
    icon: 'calendar-heart',
  },

  // ── Payroll ────────────────────────────────────────────────────────────
  {
    path: '/payroll',
    label: 'Payroll',
    group: 'HR Core',
    description: 'View / run monthly payroll',
    icon: 'wallet',
  },
  {
    path: '/payroll/configure',
    label: 'Payroll Configuration',
    group: 'HR Core',
    description: 'Form mappings, leave-type rules',
    adminOnly: true,
    icon: 'settings',
  },

  // ── Recruitment ────────────────────────────────────────────────────────
  // Employee directory + the hiring pipeline (staffing → offer → appointment).
  {
    path: '/employee-master',
    label: 'Employee Master',
    group: 'Recruitment',
    description: 'Directory of all employees — list, filters, inline edit',
    icon: 'users',
  },
  {
    path: '/hr/recruitment/staffing-plan',
    label: 'Staffing Plan',
    group: 'Recruitment',
    description: 'Workforce planning — vacancies, profile and cost estimation',
    icon: 'briefcase',
  },
  {
    path: '/hr/recruitment/job-opening',
    label: 'Job Opening',
    group: 'Recruitment',
    description: 'Live recruitment postings — publish jobs and track vacancies',
    icon: 'megaphone',
  },
  {
    path: '/hr/recruitment/job-application',
    label: 'Job Application',
    group: 'Recruitment',
    description: 'Applicants for live job openings — screening and ratings',
    icon: 'user-plus',
  },
  {
    path: '/hr/recruitment/job-offer',
    label: 'Job Offer',
    group: 'Recruitment',
    description: 'Formal offers to shortlisted candidates — terms and status',
    icon: 'file-signature',
  },
  {
    path: '/hr/recruitment/appointment-letter',
    label: 'Appointment Letter',
    group: 'Recruitment',
    description: 'Appointment letters issued to accepted candidates',
    icon: 'scroll-text',
  },
  {
    path: '/hr/recruitment/employee-referral',
    label: 'Employee Referral',
    group: 'Recruitment',
    description: 'Candidate referrals submitted by existing employees',
    icon: 'user-plus',
  },

  // ── Employee Engagement ───────────────────────────────────────────────
  {
    path: '/employee-engagement',
    label: 'Engagement Dashboard',
    group: 'Employee Engagement',
    description: 'Overview of points distribution and module stats',
    icon: 'layout-dashboard',
  },
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
  // KRA tracking + periodic appraisals. Both pages persist via the
  // /api/performance/{kras,appraisals} routes (HR Phase 1).
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
    // Visible to all employees so each user can view their OWN appraisal
    // records (the page filters rows by employeeId for non-HR/Admin).
    // Create / edit / delete actions are gated client-side in the page
    // itself via the `canManage` check.
    description: 'Quarterly / annual review with rating, strengths, growth areas',
    icon: 'trending-up',
  },

  // ── HR Lifecycle (Phase 1) ─────────────────────────────────────────────
  // Onboarding fires automatically when an Appointment Letter is SIGNED;
  // Offboarding fires when an Employee.resignationLetterDate is set.
  {
    path: '/hr/onboarding',
    label: 'Onboarding',
    group: 'HR Core',
    description: 'New-hire checklist dashboard — auto-created on letter SIGNED',
    adminOnly: true,
    icon: 'user-plus',
  },
  {
    path: '/hr/onboarding/templates',
    label: 'Onboarding Templates',
    group: 'HR Core',
    description: 'Default task seeds used by the SIGNED trigger',
    adminOnly: true,
    icon: 'list',
  },
  {
    path: '/hr/offboarding',
    label: 'Offboarding',
    group: 'HR Core',
    description: 'Exit checklists — auto-created when resignation date is set',
    adminOnly: true,
    icon: 'user-minus',
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
  // Inventory Management — store / machine / metal submodules + masters.
  // Frontend-only module (optimistic UI, localStorage-backed) under
  // /inventory-management; see app/inventory-management.
  {
    path: '/inventory-management/store-inventory',
    label: 'Store Inventory',
    group: 'Inventory',
    description: 'Spares, consumables & general store items',
    icon: 'boxes',
  },
  {
    path: '/inventory-management/inward',
    label: 'Inward (Goods In)',
    group: 'Inventory',
    description: 'Goods received into the store — increases stock',
    icon: 'package',
  },
  {
    path: '/inventory-management/outward',
    label: 'Outward (Goods Out)',
    group: 'Inventory',
    description: 'Goods issued from the store — decreases stock',
    icon: 'package',
  },
  {
    path: '/inventory-management/machine-inventory',
    label: 'Machine Inventory',
    group: 'Inventory',
    description: 'Plant & machinery register',
    icon: 'package',
  },
  {
    path: '/inventory-management/metal-inventory',
    label: 'Metal Inventory',
    group: 'Inventory',
    description: 'Raw metal stock by grade & form',
    icon: 'list',
  },
  {
    path: '/inventory-management/master',
    label: 'Inventory Master',
    group: 'Inventory',
    description: 'Manage category, unit & warehouse dropdowns',
    icon: 'settings',
  },

  // ── Purchase & Procurement (Module #4) ─────────────────────────────────
  // Procure-to-pay documents under /purchase-management. Frontend-only
  // (optimistic UI, localStorage-backed); see app/purchase-management.
  {
    path: '/purchase-management/suppliers',
    label: 'Supplier Master',
    group: 'Purchase',
    description: 'Vendor master — tax, terms, banking',
    icon: 'users',
  },
  {
    path: '/purchase-management/requisition',
    label: 'Purchase Requisition',
    group: 'Purchase',
    description: 'Raise PR & production approval',
    icon: 'file-text',
  },
  {
    path: '/purchase-management/sourcing',
    label: 'Supplier Sourcing / RFQ',
    group: 'Purchase',
    description: 'Supplier selection, pricing & payment terms',
    icon: 'users',
  },
  {
    path: '/purchase-management/purchase-order',
    label: 'Purchase Order',
    group: 'Purchase',
    description: 'Approval & PO generation',
    icon: 'file-signature',
  },
  {
    path: '/purchase-management/grn',
    label: 'Goods Receipt (GRN)',
    group: 'Purchase',
    description: 'Inspection, GRN & stock update',
    icon: 'package',
  },
  {
    path: '/purchase-management/open-po',
    label: 'Open POs · Pending Balances',
    group: 'Purchase',
    description: 'POs with outstanding receipt balance',
    icon: 'list',
  },
  {
    path: '/purchase-management/payment-request',
    label: 'Payment Request',
    group: 'Purchase',
    description: 'Supplier payment requests',
    icon: 'banknote',
  },
  {
    path: '/purchase-management/master',
    label: 'Purchase Master',
    group: 'Purchase',
    description: 'Supplier, department & payment-term dropdowns',
    icon: 'settings',
  },

  // ── Accounts & Finance (Module #5) ─────────────────────────────────────
  // Self-contained finance documents (lib/accounts-system, localStorage-backed)
  // plus the procurement Payment Request, which is surfaced here AND under
  // Purchase (it reads POs & GRN invoices from the purchase store).
  {
    path: '/accounts/reports',
    label: 'Accounts Dashboard',
    group: 'Accounts',
    description: 'Receivables, collections & money-out roll-up',
    icon: 'bar-chart',
  },
  {
    path: '/accounts/chart-of-accounts',
    label: 'Chart of Accounts',
    group: 'Accounts',
    description: 'Ledger accounts master',
    icon: 'book',
  },
  {
    path: '/accounts/customers',
    label: 'Customers',
    group: 'Accounts',
    description: 'Customer master (AR)',
    icon: 'users',
  },
  {
    path: '/accounts/sales-invoice',
    label: 'Sales Invoice',
    group: 'Accounts',
    description: 'Customer invoices with tax & totals',
    icon: 'file-text',
  },
  {
    path: '/accounts/receipts',
    label: 'Receipts',
    group: 'Accounts',
    description: 'Money received against invoices',
    icon: 'banknote',
  },
  {
    path: '/accounts/payment-voucher',
    label: 'Payment Voucher',
    group: 'Accounts',
    description: 'Disbursements to suppliers / parties',
    icon: 'banknote',
  },
  {
    path: '/accounts/expenses',
    label: 'Expense Voucher',
    group: 'Accounts',
    description: 'Operating expenses & claims',
    icon: 'receipt',
  },
  {
    path: '/accounts/journal-voucher',
    label: 'Journal Voucher',
    group: 'Accounts',
    description: 'Manual Dr / Cr ledger entries',
    icon: 'book',
  },
  {
    path: '/accounts/payment-request',
    label: 'Payment Request',
    group: 'Accounts',
    description: 'Supplier payment requests (procurement)',
    icon: 'banknote',
  },
  {
    path: '/accounts/master',
    label: 'Accounts Master',
    group: 'Accounts',
    description: 'Account group, tax, payment-mode dropdowns',
    icon: 'settings',
  },

  // ── Product Master (Module #6) ─────────────────────────────────────────
  // Self-contained machine-product catalog (lib/product-system,
  // localStorage-backed): identification, technical, financial, sales & service.
  {
    path: '/product-master/products',
    label: 'Product Master',
    group: 'Products',
    description: 'Machine products — specs, pricing, technical & sales data',
    icon: 'package',
  },
  {
    path: '/product-master/master',
    label: 'Product Dropdowns',
    group: 'Products',
    description: 'Category, variant & UoM dropdowns',
    icon: 'settings',
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
    path: '/real-estate/admin/post-commissions',
    label: 'Post Commissions',
    group: 'Real Estate',
    description: 'Review closed deals and post commissions in bulk',
    adminOnly: true,
    icon: 'receipt',
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
    path: '/settings/erp-modules',
    label: 'ERP Modules',
    group: 'Settings',
    description: 'Enable / disable HR, Real Estate, Inventory, Assets',
    adminOnly: true,
    icon: 'boxes',
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
 * Optional 2nd-level bucketing of a group's pages into sub-folders.
 *
 * Most groups render flat (pages directly inside the group folder). A group
 * listed here is instead split into the named sub-folders below — used by the
 * sidebar to tame large modules. The Real Estate (MLM) module has ~40 pages,
 * far too many for one flat folder, so it's bucketed into functional areas.
 *
 * `paths` are matched against `StaticPage.path` exactly and render in the
 * order listed here. Any enabled page in the group that is NOT placed in a
 * sub-folder is hoisted as a flat leaf by the sidebar, so adding a new page to
 * the registry can never silently hide it — it just appears un-bucketed until
 * someone slots it into a sub-folder here.
 */
export interface StaticPageSubgroup {
  /** Sub-folder label shown in the sidebar. */
  label: string;
  /** Lucide icon NAME — resolved by the sidebar's icon switch. */
  icon: string;
  /** Page paths in this sub-folder, in display order. */
  paths: string[];
}

export const STATIC_PAGE_SUBGROUPS: Partial<
  Record<StaticPageGroup, StaticPageSubgroup[]>
> = {
  // HR Core is a parent folder: each entry below renders as an expandable
  // sub-folder under it, opening to its own pages (e.g. Attendance → My
  // Attendance, Regularizations, Team, Config). Every page whose group is
  // 'HR Core' MUST appear in exactly one sub-folder here, otherwise the
  // sidebar hoists it as a loose leaf under HR Core (the documented catch-all).
  'HR Core': [
    {
      label: 'PayRoll',
      icon: 'wallet',
      paths: ['/payroll', '/payroll/configure'],
    },
    {
      label: 'Attendance',
      icon: 'clock',
      paths: [
        '/attendance',
        '/attendance/regularizations',
        '/attendance/team',
        '/settings/attendance-config',
      ],
    },
    {
      label: 'Leave Management',
      icon: 'calendar',
      paths: [
        '/leave',
        '/leave/approvals',
        '/leave/admin',
        '/leave/config',
        '/settings/holidays',
      ],
    },
    {
      label: 'Onboarding',
      icon: 'user-plus',
      paths: ['/hr/onboarding', '/hr/onboarding/templates'],
    },
    {
      label: 'Offboarding',
      icon: 'user-minus',
      paths: ['/hr/offboarding'],
    },
  ],
  'Real Estate': [
    {
      label: 'Dashboard',
      icon: 'activity',
      paths: [
        '/real-estate',
        '/real-estate/dashboards/sales',
        '/real-estate/dashboards/network',
      ],
    },
    {
      label: 'Properties & Leads',
      icon: 'building2',
      paths: [
        '/real-estate/properties',
        '/real-estate/leads',
        '/real-estate/viewings',
      ],
    },
    {
      label: 'Agents & Teams',
      icon: 'users',
      paths: [
        '/real-estate/agents',
        '/real-estate/agents/ranks',
        '/real-estate/my-team',
        '/real-estate/members/active',
        '/real-estate/members/pending',
        '/real-estate/members/kyc',
        '/real-estate/admin/rank-promotions',
        '/real-estate/admin/sub-admins',
      ],
    },
    {
      label: 'Hierarchies',
      icon: 'network',
      paths: [
        '/real-estate/agents/tree',
        '/real-estate/agents/hierarchy-list',
        '/real-estate/agents/binary',
        '/real-estate/agents/sponsor',
      ],
    },
    {
      label: 'Financial',
      icon: 'wallet',
      paths: [
        '/real-estate/transactions',
        '/real-estate/wallet',
        '/real-estate/payouts',
        '/real-estate/admin/wallets',
        '/real-estate/admin/post-commissions',
        '/real-estate/admin/payouts',
        '/real-estate/admin/commission-rules',
        '/real-estate/admin/fund-credit',
      ],
    },
    {
      label: 'Compliance',
      icon: 'shield',
      paths: [
        '/real-estate/compliance',
        '/real-estate/admin/compliance',
        '/real-estate/admin/duplicates',
      ],
    },
    {
      label: 'Plan & Settings',
      icon: 'settings',
      paths: [
        '/real-estate/admin/plan-designer',
        '/real-estate/comp-plan',
        '/real-estate/admin/settings',
      ],
    },
    {
      label: 'Reports',
      icon: 'file-text',
      paths: [
        '/real-estate/reports',
        '/real-estate/reports/joining',
        '/real-estate/reports/member-income',
        '/real-estate/reports/sales',
        '/real-estate/reports/payouts',
        '/real-estate/reports/top-earners',
        '/real-estate/reports/fund-transfer',
        '/real-estate/reports/point-history',
      ],
    },
  ],
};

/**
 * Group order for display in the sidebar / matrix UIs. New groups append.
 */
export const STATIC_PAGE_GROUP_ORDER: StaticPageGroup[] = [
  // HR module sub-folders, in the order they appear under "HR" in the sidebar.
  'HR Core',
  'Recruitment',
  'Performance',
  'Employee Engagement',
  'Asset & Admin',
  // Other modules + always-on groups.
  'Real Estate',
  'Inventory',
  'Purchase',
  'Accounts',
  'Products',
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
