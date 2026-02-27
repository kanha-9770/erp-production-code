import type { ModuleConfig, ModuleType } from "./types"

export const MODULE_CONFIGS: Record<ModuleType, ModuleConfig> = {
  hrm: {
    id: "hrm",
    name: "Human Resources",
    icon: "Users",
    description: "Manage employees, attendance, leave, and payroll",
    color: "oklch(0.75 0.15 160)",
    submodules: [
      {
        id: "recruitment",
        name: "Recruitment",
        icon: "UserPlus",
        description: "Manage hiring process",
        pageData: {
          kpis: [
            { id: "open-positions", label: "Open Positions", value: 12, icon: "Briefcase" },
            { id: "applications", label: "Applications", value: 156, change: 12, trend: "up", icon: "FileText" },
            { id: "interviews", label: "Interviews Scheduled", value: 24, icon: "Calendar" },
            { id: "offers", label: "Offers Made", value: 8, change: 2, trend: "up", icon: "UserCheck" },
          ],
          listColumns: [
            { key: "position", label: "Position", sortable: true },
            { key: "department", label: "Department", sortable: true },
            { key: "applications", label: "Applications", type: "number" },
            { key: "status", label: "Status", type: "status" },
          ],
        },
        submodules: [
          {
            id: "job-postings",
            name: "Job Postings",
            icon: "Briefcase",
            pageData: {
              kpis: [
                { id: "active-postings", label: "Active Postings", value: 12, icon: "Briefcase" },
                { id: "total-views", label: "Total Views", value: 2456, change: 18, trend: "up", icon: "Eye" },
                { id: "avg-applications", label: "Avg Applications", value: 13, icon: "FileText" },
              ],
              listColumns: [
                { key: "title", label: "Job Title", sortable: true },
                { key: "department", label: "Department", sortable: true },
                { key: "posted", label: "Posted Date", type: "date", sortable: true },
                { key: "applications", label: "Applications", type: "number" },
                { key: "status", label: "Status", type: "status" },
              ],
            },
            submodules: [
              {
                id: "applications",
                name: "Applications",
                icon: "FileText",
                pageData: {
                  kpis: [
                    { id: "total-apps", label: "Total Applications", value: 156, icon: "FileText" },
                    { id: "under-review", label: "Under Review", value: 42, icon: "Eye" },
                    { id: "shortlisted", label: "Shortlisted", value: 24, change: 8, trend: "up", icon: "Star" },
                    { id: "rejected", label: "Rejected", value: 90, icon: "XCircle" },
                  ],
                  listColumns: [
                    { key: "candidate", label: "Candidate Name", sortable: true },
                    { key: "position", label: "Position", sortable: true },
                    { key: "applied", label: "Applied Date", type: "date", sortable: true },
                    { key: "experience", label: "Experience", type: "number" },
                    { key: "status", label: "Status", type: "status" },
                  ],
                },
              },
              {
                id: "interviews",
                name: "Interviews",
                icon: "Calendar",
                pageData: {
                  kpis: [
                    { id: "scheduled", label: "Scheduled", value: 24, icon: "Calendar" },
                    { id: "completed", label: "Completed", value: 18, icon: "CheckCircle" },
                    { id: "pending", label: "Pending", value: 6, icon: "Clock" },
                  ],
                  listColumns: [
                    { key: "candidate", label: "Candidate", sortable: true },
                    { key: "position", label: "Position", sortable: true },
                    { key: "date", label: "Interview Date", type: "date", sortable: true },
                    { key: "interviewer", label: "Interviewer", sortable: true },
                    { key: "status", label: "Status", type: "status" },
                  ],
                },
              },
            ],
          },
          {
            id: "candidates",
            name: "Candidates",
            icon: "Users",
            pageData: {
              kpis: [
                { id: "total-candidates", label: "Total Candidates", value: 342, icon: "Users" },
                { id: "active", label: "Active", value: 156, icon: "UserCheck" },
                { id: "hired", label: "Hired", value: 28, change: 5, trend: "up", icon: "UserPlus" },
              ],
            },
          },
          {
            id: "onboarding",
            name: "Onboarding",
            icon: "UserCheck",
            pageData: {
              kpis: [
                { id: "in-progress", label: "In Progress", value: 8, icon: "Clock" },
                { id: "completed", label: "Completed", value: 28, icon: "CheckCircle" },
              ],
            },
          },
        ],
      },
      {
        id: "payroll",
        name: "Payroll",
        icon: "Wallet",
        description: "Salary and compensation",
        pageData: {
          kpis: [
            { id: "total-payroll", label: "Total Payroll", value: "$245,000", icon: "DollarSign" },
            { id: "employees", label: "Employees", value: 156, icon: "Users" },
            { id: "pending", label: "Pending Payments", value: 12, icon: "Clock" },
          ],
        },
        submodules: [
          {
            id: "salary-processing",
            name: "Salary Processing",
            icon: "DollarSign",
            pageData: {
              kpis: [
                { id: "processed", label: "Processed", value: 144, icon: "CheckCircle" },
                { id: "pending", label: "Pending", value: 12, icon: "Clock" },
                { id: "total-amount", label: "Total Amount", value: "$245,000", icon: "DollarSign" },
              ],
            },
          },
          {
            id: "tax-management",
            name: "Tax Management",
            icon: "Receipt",
            pageData: {
              kpis: [
                { id: "total-tax", label: "Total Tax", value: "$48,500", icon: "Receipt" },
                { id: "filed", label: "Filed", value: 144, icon: "CheckCircle" },
              ],
            },
          },
          {
            id: "benefits",
            name: "Benefits",
            icon: "Gift",
            pageData: {
              kpis: [
                { id: "enrolled", label: "Enrolled", value: 142, icon: "Users" },
                { id: "total-cost", label: "Total Cost", value: "$32,400", icon: "DollarSign" },
              ],
            },
          },
        ],
      },
      {
        id: "attendance",
        name: "Attendance",
        icon: "Clock",
        description: "Track time and leave",
        pageData: {
          kpis: [
            { id: "present", label: "Present Today", value: 142, icon: "CheckCircle" },
            { id: "absent", label: "Absent", value: 8, icon: "XCircle" },
            { id: "on-leave", label: "On Leave", value: 6, icon: "Calendar" },
          ],
        },
        submodules: [
          {
            id: "time-tracking",
            name: "Time Tracking",
            icon: "Timer",
            pageData: {
              kpis: [
                { id: "avg-hours", label: "Avg Hours/Day", value: "8.2", icon: "Clock" },
                { id: "overtime", label: "Overtime Hours", value: 124, icon: "Timer" },
              ],
            },
          },
          {
            id: "leave-management",
            name: "Leave Management",
            icon: "CalendarDays",
            pageData: {
              kpis: [
                { id: "pending-requests", label: "Pending Requests", value: 12, icon: "Clock" },
                { id: "approved", label: "Approved", value: 45, icon: "CheckCircle" },
              ],
            },
          },
          {
            id: "shift-planning",
            name: "Shift Planning",
            icon: "CalendarClock",
            pageData: {
              kpis: [
                { id: "shifts-today", label: "Shifts Today", value: 24, icon: "Calendar" },
                { id: "coverage", label: "Coverage", value: "98%", icon: "CheckCircle" },
              ],
            },
          },
        ],
      },
      { id: "performance", name: "Performance", icon: "TrendingUp" },
      { id: "training", name: "Training", icon: "GraduationCap" },
    ],
  },
  finance: {
    id: "finance",
    name: "Finance & Accounting",
    icon: "DollarSign",
    description: "Track invoices, expenses, and financial reports",
    color: "oklch(0.65 0.18 250)",
    submodules: [
      {
        id: "accounts-payable",
        name: "Accounts Payable",
        icon: "CreditCard",
        submodules: [
          { id: "vendor-bills", name: "Vendor Bills", icon: "FileText" },
          { id: "payments", name: "Payments", icon: "Banknote" },
        ],
      },
      {
        id: "accounts-receivable",
        name: "Accounts Receivable",
        icon: "Receipt",
        submodules: [
          { id: "invoices", name: "Invoices", icon: "FileText" },
          { id: "collections", name: "Collections", icon: "DollarSign" },
        ],
      },
      { id: "general-ledger", name: "General Ledger", icon: "BookOpen" },
      { id: "budgeting", name: "Budgeting", icon: "PiggyBank" },
      { id: "assets", name: "Fixed Assets", icon: "Building" },
    ],
  },
  inventory: {
    id: "inventory",
    name: "Inventory Management",
    icon: "Package",
    description: "Monitor stock levels and product movements",
    color: "oklch(0.70 0.20 50)",
    submodules: [
      {
        id: "stock",
        name: "Stock Management",
        icon: "Boxes",
        submodules: [
          { id: "items", name: "Items", icon: "Package" },
          { id: "stock-levels", name: "Stock Levels", icon: "BarChart3" },
          { id: "adjustments", name: "Adjustments", icon: "Edit" },
        ],
      },
      { id: "warehouses", name: "Warehouses", icon: "Warehouse" },
      { id: "transfers", name: "Transfers", icon: "ArrowRightLeft" },
      { id: "valuation", name: "Valuation", icon: "Calculator" },
    ],
  },
  procurement: {
    id: "procurement",
    name: "Procurement",
    icon: "ShoppingCart",
    description: "Manage purchase orders and supplier relationships",
    color: "oklch(0.60 0.15 300)",
    submodules: [
      {
        id: "purchasing",
        name: "Purchasing",
        icon: "ShoppingBag",
        submodules: [
          { id: "purchase-orders", name: "Purchase Orders", icon: "FileText" },
          { id: "requisitions", name: "Requisitions", icon: "ClipboardList" },
        ],
      },
      { id: "suppliers", name: "Suppliers", icon: "Building2" },
      { id: "contracts", name: "Contracts", icon: "FileSignature" },
      { id: "rfq", name: "RFQ Management", icon: "MessageSquare" },
    ],
  },
  sales: {
    id: "sales",
    name: "Sales & Marketing",
    icon: "TrendingUp",
    description: "Track sales performance and marketing campaigns",
    color: "oklch(0.68 0.18 200)",
    submodules: [
      {
        id: "orders",
        name: "Orders",
        icon: "ShoppingCart",
        submodules: [
          { id: "quotes", name: "Quotes", icon: "FileText" },
          { id: "sales-orders", name: "Sales Orders", icon: "ShoppingBag" },
          { id: "deliveries", name: "Deliveries", icon: "Truck" },
        ],
      },
      { id: "customers", name: "Customers", icon: "Users" },
      { id: "pricing", name: "Pricing", icon: "Tag" },
      { id: "campaigns", name: "Campaigns", icon: "Megaphone" },
    ],
  },
  crm: {
    id: "crm",
    name: "Customer Relations",
    icon: "Heart",
    description: "Manage customer interactions and relationships",
    color: "oklch(0.72 0.16 350)",
    submodules: [
      {
        id: "leads",
        name: "Leads",
        icon: "Target",
        submodules: [
          { id: "lead-capture", name: "Lead Capture", icon: "UserPlus" },
          { id: "lead-scoring", name: "Lead Scoring", icon: "Star" },
        ],
      },
      { id: "opportunities", name: "Opportunities", icon: "TrendingUp" },
      { id: "contacts", name: "Contacts", icon: "Users" },
      { id: "activities", name: "Activities", icon: "Activity" },
    ],
  },
  scm: {
    id: "scm",
    name: "Supply Chain",
    icon: "Truck",
    description: "Optimize supply chain and logistics operations",
    color: "oklch(0.66 0.17 180)",
    submodules: [
      { id: "planning", name: "Planning", icon: "Calendar" },
      { id: "logistics", name: "Logistics", icon: "Truck" },
      { id: "distribution", name: "Distribution", icon: "Network" },
      { id: "tracking", name: "Tracking", icon: "MapPin" },
    ],
  },
  manufacturing: {
    id: "manufacturing",
    name: "Manufacturing",
    icon: "Factory",
    description: "Plan production and manage work orders",
    color: "oklch(0.64 0.19 30)",
    submodules: [
      {
        id: "production",
        name: "Production",
        icon: "Cog",
        submodules: [
          { id: "work-orders", name: "Work Orders", icon: "ClipboardList" },
          { id: "bom", name: "Bill of Materials", icon: "ListTree" },
        ],
      },
      { id: "quality", name: "Quality Control", icon: "CheckCircle" },
      { id: "maintenance", name: "Maintenance", icon: "Wrench" },
    ],
  },
  warehouse: {
    id: "warehouse",
    name: "Warehouse",
    icon: "Warehouse",
    description: "Manage warehouse operations and fulfillment",
    color: "oklch(0.69 0.16 280)",
    submodules: [
      { id: "receiving", name: "Receiving", icon: "PackageCheck" },
      { id: "picking", name: "Picking", icon: "PackageSearch" },
      { id: "packing", name: "Packing", icon: "Package" },
      { id: "shipping", name: "Shipping", icon: "Truck" },
    ],
  },
  project: {
    id: "project",
    name: "Project Management",
    icon: "Briefcase",
    description: "Track projects, tasks, and team collaboration",
    color: "oklch(0.67 0.18 220)",
    submodules: [
      {
        id: "projects",
        name: "Projects",
        icon: "FolderKanban",
        submodules: [
          { id: "tasks", name: "Tasks", icon: "CheckSquare" },
          { id: "milestones", name: "Milestones", icon: "Flag" },
        ],
      },
      { id: "resources", name: "Resources", icon: "Users" },
      { id: "timesheets", name: "Timesheets", icon: "Clock" },
      { id: "expenses", name: "Expenses", icon: "Receipt" },
    ],
  },
}
