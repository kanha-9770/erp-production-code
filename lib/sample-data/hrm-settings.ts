export interface Setting {
  id: string
  category: string
  label: string
  description: string
  type: "toggle" | "input" | "textarea" | "select"
  value: any
  options?: Array<{ label: string; value: string }>
}

export const hrmSettings: Setting[] = [
  // General Settings
  {
    id: "auto-approve-leave",
    category: "Leave Management",
    label: "Auto-approve Leave Requests",
    description: "Automatically approve leave requests that meet policy criteria",
    type: "toggle",
    value: false,
  },
  {
    id: "max-leave-days",
    category: "Leave Management",
    label: "Maximum Consecutive Leave Days",
    description: "Maximum number of consecutive days an employee can take leave",
    type: "input",
    value: "15",
  },
  {
    id: "leave-approval-workflow",
    category: "Leave Management",
    label: "Leave Approval Workflow",
    description: "Select the approval workflow for leave requests",
    type: "select",
    value: "manager-only",
    options: [
      { label: "Manager Only", value: "manager-only" },
      { label: "Manager + HR", value: "manager-hr" },
      { label: "Multi-level", value: "multi-level" },
    ],
  },

  // Attendance Settings
  {
    id: "track-attendance",
    category: "Attendance",
    label: "Enable Attendance Tracking",
    description: "Track employee check-in and check-out times",
    type: "toggle",
    value: true,
  },
  {
    id: "late-threshold",
    category: "Attendance",
    label: "Late Arrival Threshold (minutes)",
    description: "Number of minutes after scheduled time to mark as late",
    type: "input",
    value: "15",
  },
  {
    id: "attendance-policy",
    category: "Attendance",
    label: "Attendance Policy",
    description: "Define the attendance policy for your organization",
    type: "textarea",
    value: "Employees must check in within 15 minutes of their scheduled start time.",
  },

  // Payroll Settings
  {
    id: "auto-generate-payslips",
    category: "Payroll",
    label: "Auto-generate Payslips",
    description: "Automatically generate payslips at the end of each month",
    type: "toggle",
    value: true,
  },
  {
    id: "payroll-cycle",
    category: "Payroll",
    label: "Payroll Cycle",
    description: "Select the payroll processing cycle",
    type: "select",
    value: "monthly",
    options: [
      { label: "Weekly", value: "weekly" },
      { label: "Bi-weekly", value: "bi-weekly" },
      { label: "Monthly", value: "monthly" },
    ],
  },

  // Notification Settings
  {
    id: "email-notifications",
    category: "Notifications",
    label: "Email Notifications",
    description: "Send email notifications for important events",
    type: "toggle",
    value: true,
  },
  {
    id: "notify-leave-approval",
    category: "Notifications",
    label: "Notify on Leave Approval",
    description: "Send notifications when leave requests are approved or rejected",
    type: "toggle",
    value: true,
  },
]

export const roles = [
  {
    id: "admin",
    name: "Admin",
    permissions: ["view", "add", "edit", "delete", "approve", "generate", "export", "manage-settings"],
  },
  {
    id: "manager",
    name: "Manager",
    permissions: ["view", "add", "edit", "approve", "generate", "export"],
  },
  {
    id: "employee",
    name: "Employee",
    permissions: ["view"],
  },
]

export const permissions = [
  {
    id: "view",
    label: "View Records",
    description: "View employee records and information",
  },
  {
    id: "add",
    label: "Add Records",
    description: "Create new employee records",
  },
  {
    id: "edit",
    label: "Edit Records",
    description: "Modify existing employee records",
  },
  {
    id: "delete",
    label: "Delete Records",
    description: "Remove employee records from the system",
  },
  {
    id: "approve",
    label: "Approve Requests",
    description: "Approve leave requests and other submissions",
  },
  {
    id: "generate",
    label: "Generate Reports",
    description: "Generate and view reports",
  },
  {
    id: "export",
    label: "Export Data",
    description: "Export data to external formats",
  },
  {
    id: "manage-settings",
    label: "Manage Settings",
    description: "Configure module settings and policies",
  },
]
