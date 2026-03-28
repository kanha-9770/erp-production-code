// ─── Core Permission Types ───────────────────────────────────────────────────

export interface Permission {
  id: string
  name: string
  description?: string
  category: "READ" | "WRITE" | "DELETE" | "ADMIN" | "SPECIAL" | "read" | "write" | "delete" | "admin" | "special"
  resource: string
}

export interface RolePermission {
  id?: string
  roleId: string
  permissionId: string
  moduleId?: string | null
  formId?: string | null
  sectionId?: string | null
  granted: boolean
  inheritedFrom?: string
  canDelegate: boolean
}

export interface UserPermission {
  userId: string
  permissionId: string
  moduleId?: string | null
  formId?: string | null
  granted: boolean
  reason?: string
  isActive: boolean
}

// ─── Module / Form Shape (used in permission matrix + sidebar) ────────────────

export interface PermissionForm {
  id: string
  name: string
  description?: string
  moduleId: string
  isEmployeeForm?: boolean
  isUserForm?: boolean
}

export interface PermissionModule {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  level: number
  forms: PermissionForm[]
  children: PermissionModule[]
}

// ─── Role / User Shape ────────────────────────────────────────────────────────

export interface PermissionUser {
  id: string
  first_name: string
  last_name: string
  email: string
  department?: string
  location?: string
  status: string
  unitAssignments: Array<{
    unitId: string
    unit: { name: string }
    roleId: string
  }>
}

export interface PermissionRole {
  id: string
  name: string
  description?: string
  level: number
  isActive: boolean
  userCount: number
  users: PermissionUser[]
}

// ─── Form selection state ─────────────────────────────────────────────────────

export interface FormSelection {
  formId: string
  moduleId: string
  submoduleId?: string | null
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export interface DataSharingRule {
  id: string
  name: string
  description: string
  sourceUnitId: string
  targetUnitId: string
  dataTypes: string[]
  accessLevel: "read" | "write" | "full"
  conditions: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface UserPermissionOverride {
  userId: string
  permissionId: string
  granted: boolean
  reason: string
  expiresAt?: Date
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const STANDARD_PERMISSIONS: Permission[] = [
  { id: "1", name: "VIEW",   category: "READ",   resource: "form" },
  { id: "2", name: "CREATE", category: "WRITE",  resource: "form" },
  { id: "3", name: "EDIT",   category: "WRITE",  resource: "form" },
  { id: "4", name: "DELETE", category: "DELETE", resource: "form" },
]
