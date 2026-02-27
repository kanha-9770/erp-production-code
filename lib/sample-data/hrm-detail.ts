export interface EmployeeDetail {
  id: string
  name: string
  email: string
  phone: string
  department: string
  position: string
  status: string
  joinDate: string
  salary: string
  manager: string
  location: string
  employeeType: string
  workSchedule: string

  // Additional tabs data
  attendance: {
    present: number
    absent: number
    late: number
    totalDays: number
  }

  leaveBalance: {
    sick: number
    vacation: number
    personal: number
  }

  documents: Array<{
    id: string
    name: string
    type: string
    uploadDate: string
  }>

  timeline: Array<{
    id: string
    title: string
    description: string
    timestamp: string
    type: "info" | "success" | "warning" | "error"
    user?: string
  }>
}

export const employeeDetail: EmployeeDetail = {
  id: "EMP001",
  name: "John Doe",
  email: "john.doe@company.com",
  phone: "+1 (555) 123-4567",
  department: "Engineering",
  position: "Senior Developer",
  status: "Active",
  joinDate: "2022-01-15",
  salary: "$95,000",
  manager: "Sarah Williams",
  location: "New York, NY",
  employeeType: "Full-time",
  workSchedule: "Monday - Friday, 9:00 AM - 5:00 PM",

  attendance: {
    present: 220,
    absent: 5,
    late: 8,
    totalDays: 240,
  },

  leaveBalance: {
    sick: 8,
    vacation: 15,
    personal: 5,
  },

  documents: [
    {
      id: "DOC001",
      name: "Employment Contract.pdf",
      type: "Contract",
      uploadDate: "2022-01-15",
    },
    {
      id: "DOC002",
      name: "ID Verification.pdf",
      type: "Identity",
      uploadDate: "2022-01-15",
    },
    {
      id: "DOC003",
      name: "Tax Forms.pdf",
      type: "Tax",
      uploadDate: "2022-01-20",
    },
  ],

  timeline: [
    {
      id: "TL001",
      title: "Salary Increase",
      description: "Annual salary increased to $95,000",
      timestamp: "2024-01-15",
      type: "success",
      user: "HR Department",
    },
    {
      id: "TL002",
      title: "Performance Review",
      description: "Completed annual performance review with rating: Exceeds Expectations",
      timestamp: "2023-12-20",
      type: "info",
      user: "Sarah Williams",
    },
    {
      id: "TL003",
      title: "Promotion",
      description: "Promoted from Developer to Senior Developer",
      timestamp: "2023-06-01",
      type: "success",
      user: "HR Department",
    },
    {
      id: "TL004",
      title: "Training Completed",
      description: "Completed Advanced React Development certification",
      timestamp: "2023-03-15",
      type: "info",
      user: "John Doe",
    },
  ],
}

export const hrmDetailData = {
  tabs: [
    {
      id: "overview",
      label: "Overview",
      fields: [
        { key: "name", label: "Full Name", type: "text" as const, required: true },
        { key: "email", label: "Email", type: "text" as const, required: true },
        { key: "phone", label: "Phone", type: "text" as const },
        { key: "department", label: "Department", type: "select" as const, required: true },
        { key: "position", label: "Position", type: "text" as const, required: true },
        { key: "status", label: "Status", type: "select" as const },
      ],
    },
    {
      id: "employment",
      label: "Employment Details",
      fields: [
        { key: "joinDate", label: "Join Date", type: "date" as const },
        { key: "salary", label: "Salary", type: "text" as const },
        { key: "manager", label: "Manager", type: "text" as const },
        { key: "location", label: "Location", type: "text" as const },
        { key: "employeeType", label: "Employment Type", type: "select" as const },
        { key: "workSchedule", label: "Work Schedule", type: "text" as const },
      ],
    },
  ],
  actions: [
    { type: "edit" as const, label: "Edit", icon: "Edit" },
    { type: "delete" as const, label: "Delete", icon: "Trash", variant: "destructive" as const },
  ],
}
