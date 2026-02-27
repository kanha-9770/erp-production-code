export interface Employee {
  id: string
  name: string
  email: string
  department: string
  position: string
  status: string
  joinDate: string
  salary: string
}

export const employeeData: Employee[] = [
  {
    id: "EMP001",
    name: "John Doe",
    email: "john.doe@company.com",
    department: "Engineering",
    position: "Senior Developer",
    status: "Active",
    joinDate: "2022-01-15",
    salary: "$95,000",
  },
  {
    id: "EMP002",
    name: "Jane Smith",
    email: "jane.smith@company.com",
    department: "Marketing",
    position: "Marketing Manager",
    status: "Active",
    joinDate: "2021-06-20",
    salary: "$85,000",
  },
  {
    id: "EMP003",
    name: "Mike Johnson",
    email: "mike.johnson@company.com",
    department: "Sales",
    position: "Sales Executive",
    status: "Active",
    joinDate: "2023-03-10",
    salary: "$70,000",
  },
  {
    id: "EMP004",
    name: "Sarah Williams",
    email: "sarah.williams@company.com",
    department: "HR",
    position: "HR Specialist",
    status: "On Leave",
    joinDate: "2020-11-05",
    salary: "$65,000",
  },
  {
    id: "EMP005",
    name: "David Brown",
    email: "david.brown@company.com",
    department: "Finance",
    position: "Financial Analyst",
    status: "Active",
    joinDate: "2022-08-22",
    salary: "$78,000",
  },
  {
    id: "EMP006",
    name: "Emily Davis",
    email: "emily.davis@company.com",
    department: "Engineering",
    position: "Product Designer",
    status: "Active",
    joinDate: "2023-01-12",
    salary: "$88,000",
  },
  {
    id: "EMP007",
    name: "Robert Miller",
    email: "robert.miller@company.com",
    department: "Operations",
    position: "Operations Manager",
    status: "Active",
    joinDate: "2019-04-18",
    salary: "$92,000",
  },
  {
    id: "EMP008",
    name: "Lisa Anderson",
    email: "lisa.anderson@company.com",
    department: "Sales",
    position: "Account Manager",
    status: "Active",
    joinDate: "2022-05-30",
    salary: "$72,000",
  },
]

export const hrmListData = {
  columns: [
    { key: "id", label: "Employee ID", sortable: true },
    { key: "name", label: "Name", sortable: true, filterable: true },
    { key: "email", label: "Email", sortable: true },
    { key: "department", label: "Department", sortable: true, filterable: true },
    { key: "position", label: "Position", sortable: true },
    { key: "status", label: "Status", type: "status" as const, filterable: true },
    { key: "joinDate", label: "Join Date", type: "date" as const, sortable: true },
    { key: "salary", label: "Salary", sortable: true },
  ],
  filters: [
    { key: "name", label: "Name", type: "text" as const },
    {
      key: "department",
      label: "Department",
      type: "select" as const,
      options: [
        { label: "Engineering", value: "Engineering" },
        { label: "Marketing", value: "Marketing" },
        { label: "Sales", value: "Sales" },
        { label: "HR", value: "HR" },
        { label: "Finance", value: "Finance" },
        { label: "Operations", value: "Operations" },
      ],
    },
    {
      key: "status",
      label: "Status",
      type: "select" as const,
      options: [
        { label: "Active", value: "Active" },
        { label: "On Leave", value: "On Leave" },
        { label: "Inactive", value: "Inactive" },
      ],
    },
  ],
  actions: [
    { type: "add" as const, label: "Add Employee", icon: "UserPlus" },
    { type: "export" as const, label: "Export", icon: "Download" },
  ],
  data: employeeData,
}
