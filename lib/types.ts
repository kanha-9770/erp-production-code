// Core ERP type definitions for dynamic module system

export type ModuleType =
  | "hrm"
  | "finance"
  | "inventory"
  | "procurement"
  | "sales"
  | "crm"
  | "scm"
  | "manufacturing"
  | "warehouse"
  | "project"

export type UserRole = "admin" | "manager" | "employee" | "viewer"

export type ActionType = "add" | "edit" | "delete" | "approve" | "view" | "generate" | "export" | "upload" | "assign"

export interface SubmoduleConfig {
  id: string
  name: string
  icon: string
  description?: string
  submodules?: SubmoduleConfig[] // Recursive for deep nesting
  pageData?: {
    kpis?: KPIConfig[]
    charts?: ChartConfig[]
    quickActions?: QuickAction[]
    listColumns?: ColumnConfig[]
    filters?: FilterConfig[]
    detailTabs?: TabConfig[]
    actions?: ActionConfig[]
    reports?: ReportConfig[]
    settings?: SettingConfig[]
  }
}

export interface ModuleConfig {
  id: ModuleType
  name: string
  icon: string
  description: string
  color: string
  submodules?: SubmoduleConfig[]
}

export interface FieldConfig {
  key: string
  label: string
  type: "text" | "number" | "date" | "select" | "textarea" | "file" | "boolean"
  required?: boolean
  options?: { label: string; value: string }[]
  placeholder?: string
}

export interface TabConfig {
  id: string
  label: string
  fields: FieldConfig[]
}

export interface ActionConfig {
  type: ActionType
  label: string
  icon: string
  variant?: "default" | "destructive" | "outline" | "secondary"
  requiresPermission?: UserRole[]
}

export interface KPIConfig {
  id: string
  label: string
  value: string | number
  change?: number
  trend?: "up" | "down" | "neutral"
  icon: string
}

export interface ChartConfig {
  id: string
  title: string
  type: "line" | "bar" | "pie" | "area"
  data: any[]
}

export interface QuickAction {
  id: string
  label: string
  icon: string
  action: () => void
}

export interface ColumnConfig {
  key: string
  label: string
  sortable?: boolean
  filterable?: boolean
  type?: "text" | "number" | "date" | "status" | "badge"
}

export interface FilterConfig {
  key: string
  label: string
  type: "text" | "select" | "date" | "range"
  options?: { label: string; value: string }[]
}

export interface ReportConfig {
  id: string
  title: string
  description: string
  type: "chart" | "table" | "summary"
  exportable?: boolean
}

export interface SettingConfig {
  id: string
  category: string
  label: string
  description: string
  type: "toggle" | "input" | "select" | "textarea"
  value: any
  options?: { label: string; value: string }[]
}

export interface ModuleData {
  module: ModuleType
  listColumns: ColumnConfig[]
  filters: FilterConfig[]
  detailTabs: TabConfig[]
  actions: ActionConfig[]
  kpis: KPIConfig[]
  charts: ChartConfig[]
  quickActions: QuickAction[]
  reports: ReportConfig[]
  settings: SettingConfig[]
}
