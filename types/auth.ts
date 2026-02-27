export interface PermissionMatrix {
  [moduleId: string]: {
    permissions: {
      canView: boolean
      canAdd: boolean
      canEdit: boolean
      canDelete: boolean
    }
    subModules: {
      [formId: string]: {
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

export interface UserPermission {
  id: string
  userId: string
  resourceType: 'module' | 'form'
  resourceId: string
  permissions: {
    canView: boolean
    canCreate: boolean
    canEdit: boolean
    canDelete: boolean
  }
  isSystemAdmin: boolean
  resource?: {
    id: string
    name: string
    description?: string
    moduleId?: string
  }
}