export interface Report {
  id: string
  title: string
  description: string
  category: string
  lastGenerated?: string
}

export const hrmReports: Report[] = [
  {
    id: "attendance-summary",
    title: "Attendance Summary Report",
    description: "Overview of employee attendance patterns and trends",
    category: "Attendance",
    lastGenerated: "2024-01-15",
  },
  {
    id: "leave-balance",
    title: "Leave Balance Report",
    description: "Current leave balances for all employees by type",
    category: "Leave Management",
    lastGenerated: "2024-01-14",
  },
  {
    id: "payroll-summary",
    title: "Payroll Summary Report",
    description: "Monthly payroll breakdown by department and employee",
    category: "Payroll",
    lastGenerated: "2024-01-10",
  },
  {
    id: "headcount",
    title: "Headcount Report",
    description: "Employee headcount analysis by department and location",
    category: "Workforce",
    lastGenerated: "2024-01-12",
  },
  {
    id: "turnover",
    title: "Employee Turnover Report",
    description: "Analysis of employee retention and turnover rates",
    category: "Workforce",
    lastGenerated: "2024-01-08",
  },
  {
    id: "performance",
    title: "Performance Review Report",
    description: "Summary of employee performance reviews and ratings",
    category: "Performance",
    lastGenerated: "2024-01-05",
  },
]

export const analyticsCharts = [
  {
    id: "monthly-attendance",
    title: "Monthly Attendance Rate",
    type: "line" as const,
    data: [
      { name: "Jul", value: 93 },
      { name: "Aug", value: 94 },
      { name: "Sep", value: 92 },
      { name: "Oct", value: 95 },
      { name: "Nov", value: 94 },
      { name: "Dec", value: 96 },
    ],
  },
  {
    id: "leave-distribution",
    title: "Leave Distribution by Type",
    type: "pie" as const,
    data: [
      { name: "Sick Leave", value: 120 },
      { name: "Vacation", value: 350 },
      { name: "Personal", value: 85 },
      { name: "Maternity/Paternity", value: 45 },
      { name: "Other", value: 30 },
    ],
  },
  {
    id: "hiring-trend",
    title: "Hiring Trend (Last 6 Months)",
    type: "bar" as const,
    data: [
      { name: "Jul", value: 12 },
      { name: "Aug", value: 18 },
      { name: "Sep", value: 15 },
      { name: "Oct", value: 22 },
      { name: "Nov", value: 19 },
      { name: "Dec", value: 23 },
    ],
  },
  {
    id: "payroll-trend",
    title: "Payroll Expense Trend",
    type: "area" as const,
    data: [
      { name: "Jul", value: 2.1 },
      { name: "Aug", value: 2.2 },
      { name: "Sep", value: 2.15 },
      { name: "Oct", value: 2.3 },
      { name: "Nov", value: 2.35 },
      { name: "Dec", value: 2.4 },
    ],
  },
]

export const hrmReportsData = {
  reports: hrmReports,
  charts: analyticsCharts,
}
