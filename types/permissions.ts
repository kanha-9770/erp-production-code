export interface Permission {
  id: string
  name: string
  description: string
  category: "read" | "write" | "delete" | "admin" | "special"
  resource: string
}

export interface RolePermission {
  roleId: string
  permissionId: string
  granted: boolean
  inheritedFrom?: string // Role ID that this permission is inherited from
  canDelegate: boolean
}

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
