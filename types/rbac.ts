// Resource types that can have permissions
export type ResourceType = 'FormModule' | 'Form' | 'FormField' | 'User' | 'System'

// Permission actions
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete'

// Role interface (now just for designation purposes)
export interface Role {
  id: string
  name: string
  description: string | null
  permissions: Permission[] // Deprecated - kept for backward compatibility
  createdAt: Date
  updatedAt: Date
}

// Permission interface (deprecated - kept for backward compatibility)
export interface Permission {
  id: string
  name: string
  description: string | null
  resourceId: string | null
  resourceType: string | null
  roles: Role[]
  createdAt: Date
  updatedAt: Date
}

// Role-Permission relationship (deprecated)
export interface RolePermission {
  id: string
  roleId: string
  permissionId: string
  createdAt: Date
  updatedAt: Date
}

// NEW: User-specific permission interface
export interface UserPermission {
  id: string
  userId: string
  resourceType: 'module' | 'form'
  resourceId: string
  resource?: {
    id: string
    name: string
    description?: string
    moduleId?: string // For forms
  }
  permissions: {
    canView: boolean
    canCreate: boolean
    canEdit: boolean
    canDelete: boolean
  }
  isSystemAdmin: boolean
  grantedBy?: string
  grantedAt: Date
  expiresAt?: Date
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// Permission matrix for UI display
export interface PermissionMatrix {
  [moduleId: string]: {
    name: string
    permissions: {
      canView: boolean
    }
    subModules: {
      [formId: string]: {
        name: string
        permissions: {
          canView: boolean
          canAdd: boolean
          canEdit: boolean
          canDelete: boolean
        }
      }
    }
  }
}

// Employee with permissions for admin interface
export interface EmployeeWithPermissions {
  id: string
  name: string
  email: string
  role: string
  department: string
  status: string
  permissions: Record<string, Record<string, Record<string, boolean>>>
}

// Module with submodules for permission management
export interface ModuleWithSubmodules {
  id: string
  name: string
  description: string
  subModules: Array<{
    id: string
    name: string
  }>
}