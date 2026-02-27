import type { KPIConfig, ChartConfig, QuickAction } from "../types"

export const hrmKPIs: KPIConfig[] = [
  {
    id: "total-employees",
    label: "Total Employees",
    value: "1,247",
    change: 8.2,
    trend: "up",
    icon: "Users",
  },
  {
    id: "new-hires",
    label: "New Hires (This Month)",
    value: "23",
    change: 15.3,
    trend: "up",
    icon: "UserPlus",
  },
  {
    id: "attendance-rate",
    label: "Attendance Rate",
    value: "94.5%",
    change: -2.1,
    trend: "down",
    icon: "Calendar",
  },
  {
    id: "payroll",
    label: "Monthly Payroll",
    value: "$2.4M",
    change: 3.7,
    trend: "up",
    icon: "DollarSign",
  },
]

export const hrmCharts: ChartConfig[] = [
  {
    id: "attendance-trend",
    title: "Attendance Trend (Last 6 Months)",
    type: "line",
    data: [
      { name: "Jan", value: 92 },
      { name: "Feb", value: 93 },
      { name: "Mar", value: 95 },
      { name: "Apr", value: 94 },
      { name: "May", value: 96 },
      { name: "Jun", value: 94.5 },
    ],
  },
  {
    id: "department-distribution",
    title: "Employee Distribution by Department",
    type: "bar",
    data: [
      { name: "Engineering", value: 450 },
      { name: "Sales", value: 320 },
      { name: "Marketing", value: 180 },
      { name: "HR", value: 85 },
      { name: "Finance", value: 120 },
      { name: "Operations", value: 92 },
    ],
  },
  {
    id: "leave-types",
    title: "Leave Requests by Type",
    type: "pie",
    data: [
      { name: "Sick Leave", value: 45 },
      { name: "Vacation", value: 120 },
      { name: "Personal", value: 35 },
      { name: "Maternity", value: 12 },
      { name: "Other", value: 18 },
    ],
  },
]

export const hrmQuickActions: QuickAction[] = [
  {
    id: "add-employee",
    label: "Add Employee",
    icon: "UserPlus",
    action: () => console.log("Add employee"),
  },
  {
    id: "approve-leave",
    label: "Approve Leave",
    icon: "Calendar",
    action: () => console.log("Approve leave"),
  },
  {
    id: "generate-payslip",
    label: "Generate Payslip",
    icon: "FileText",
    action: () => console.log("Generate payslip"),
  },
  {
    id: "view-attendance",
    label: "View Attendance",
    icon: "Clock",
    action: () => console.log("View attendance"),
  },
]

export const hrmDashboardData = {
  kpis: hrmKPIs,
  charts: hrmCharts,
  quickActions: hrmQuickActions,
}
