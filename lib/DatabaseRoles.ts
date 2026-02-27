import { prisma } from "@/lib/prisma"
import type { Role, Permission, RolePermission } from "@/types/rbac"

export class DatabaseRoles {
  // Role Operations (Now just for designation/department purposes)
  static async createRole(data: {
    name: string
    description?: string
  }): Promise<Role> {
    try {
      console.log("[DatabaseRoles] Creating role (designation):", data.name)

      // Check if role already exists
      const existingRole = await prisma.role.findUnique({
        where: { name: data.name }
      })

      if (existingRole) {
        throw new Error(`Role with name "${data.name}" already exists`)
      }

      // Create the role (just for designation purposes)
      const role = await prisma.role.create({
        data: {
          name: data.name,
          description: data.description
        }
      })

      return this.transformRole(role)
    } catch (error: any) {
      console.error("Database error creating role:", error)
      throw new Error(`Failed to create role: ${error?.message}`)
    }
  }

  static async getRoles(): Promise<Role[]> {
    try {
      const roles = await prisma.role.findMany({
        orderBy: { name: "asc" }
      })

      return roles.map(role => this.transformRole(role))
    } catch (error: any) {
      console.error("Database error fetching roles:", error)
      throw new Error(`Failed to fetch roles: ${error?.message}`)
    }
  }

  static async getRole(id: string): Promise<Role | null> {
    try {
      const role = await prisma.role.findUnique({
        where: { id }
      })

      if (!role) return null
      return this.transformRole(role)
    } catch (error: any) {
      console.error("Database error fetching role:", error)
      throw new Error(`Failed to fetch role: ${error?.message}`)
    }
  }

  static async updateRole(id: string, data: {
    name?: string
    description?: string
  }): Promise<Role> {
    try {
      console.log("[DatabaseRoles] Updating role:", id)

      // Check if new name conflicts with existing roles
      if (data.name) {
        const existingRole = await prisma.role.findFirst({
          where: { 
            name: data.name,
            id: { not: id }
          }
        })

        if (existingRole) {
          throw new Error(`Role with name "${data.name}" already exists`)
        }
      }

      // Update role basic info
      const role = await prisma.role.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description
        }
      })

      return this.transformRole(role)
    } catch (error: any) {
      console.error("Database error updating role:", error)
      throw new Error(`Failed to update role: ${error?.message}`)
    }
  }

  static async deleteRole(id: string): Promise<void> {
    try {
      console.log("[DatabaseRoles] Deleting role:", id)

      // Check if role is in use (just for reference, not permissions)
      const usersWithRole = await prisma.formRecord15.count({
        where: {
          recordData: {
            path: ["roleId"],
            equals: id
          }
        }
      })

      if (usersWithRole > 0) {
        throw new Error(`Cannot delete role. ${usersWithRole} users are assigned to this role.`)
      }

      // Delete the role
      await prisma.role.delete({
        where: { id }
      })

      console.log("[DatabaseRoles] Role deleted successfully")
    } catch (error: any) {
      console.error("Database error deleting role:", error)
      throw new Error(`Failed to delete role: ${error?.message}`)
    }
  }

  // USER-SPECIFIC PERMISSION OPERATIONS (COMPLETELY REFACTORED FOR DEDICATED TABLE)
  
  /**
   * Assign role to user (just for designation/department purposes)
   */
  static async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    try {
      console.log("[DatabaseRoles] Assigning role (designation) to user:", { userId, roleId })

      // Validate role exists
      const role = await prisma.role.findUnique({ where: { id: roleId } })
      if (!role) {
        throw new Error(`Role not found: ${roleId}`)
      }

      // Get user record from form_records_15
      const userRecord = await prisma.formRecord15.findUnique({
        where: { id: userId }
      })

      if (!userRecord) {
        throw new Error(`User not found: ${userId}`)
      }

      // Update user record with role assignment (just for designation)
      const recordData = userRecord.recordData as any
      const updatedRecordData = {
        ...recordData,
        roleId: roleId,
        roleName: role.name,
        roleUpdatedAt: new Date().toISOString()
      }

      await prisma.formRecord15.update({
        where: { id: userId },
        data: {
          recordData: updatedRecordData,
          updatedAt: new Date()
        }
      })

      console.log("[DatabaseRoles] Role assigned to user successfully")
    } catch (error: any) {
      console.error("Database error assigning role to user:", error)
      throw new Error(`Failed to assign role to user: ${error?.message}`)
    }
  }

  /**
   * Get user permissions from dedicated UserPermission table
   */
  static async getUserPermissions(userId: string): Promise<any[]> {
    try {
      console.log("[DatabaseRoles] Getting user permissions from UserPermission table:", userId)

      // Check if UserPermission table exists
      let tableExists = true
      try {
        await prisma.userPermission.findFirst({ take: 1 })
      } catch (error) {
        console.log("[DatabaseRoles] UserPermission table not available, returning empty permissions")
        tableExists = false
        return []
      }

      if (!tableExists) {
        return []
      }

      // Get user permissions from dedicated table
      const userPermissions: any[] = await prisma.userPermission.findMany({
        where: {
          userId: userId,
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        orderBy: [
          { resourceType: 'asc' },
          { createdAt: 'desc' }
        ]
      })

      console.log(`[DatabaseRoles] Found ${userPermissions.length} permissions for user`)
      
      // Get resource details for each permission
      const permissionsWithResources = await Promise.all(
        userPermissions.map(async (perm: any) => {
          let resource = null
          
          if (perm.resourceType === 'module') {
            resource = await prisma.formModule.findUnique({
              where: { id: perm.resourceId },
              select: {
                id: true,
                name: true,
                description: true
              }
            })
          } else if (perm.resourceType === 'form') {
            resource = await prisma.form.findUnique({
              where: { id: perm.resourceId },
              select: {
                id: true,
                name: true,
                description: true,
                moduleId: true
              }
            })
          }
          
          return {
            id: perm.id,
            userId: perm.userId,
            resourceType: perm.resourceType,
            resourceId: perm.resourceId,
            resource: resource,
            permissions: {
              canView: perm.canView,
              canCreate: perm.canCreate,
              canEdit: perm.canEdit,
              canDelete: perm.canDelete,
            },
            isSystemAdmin: perm.isSystemAdmin,
            grantedBy: perm.grantedBy,
            grantedAt: perm.grantedAt,
            expiresAt: perm.expiresAt,
            isActive: perm.isActive
          }
        })
      )
      
      return permissionsWithResources.filter(perm => perm.resource !== null)
    } catch (error: any) {
      console.error("Database error getting user permissions:", error)
      return []
    }
  }

  /**
   * Get resource details for permissions
   */
  static async getResourceDetails(resourceType: 'module' | 'form', resourceId: string): Promise<any> {
    try {
      if (resourceType === 'module') {
        return await prisma.formModule.findUnique({
          where: { id: resourceId },
          select: {
            id: true,
            name: true,
            description: true
          }
        })
      } else if (resourceType === 'form') {
        return await prisma.form.findUnique({
          where: { id: resourceId },
          select: {
            id: true,
            name: true,
            description: true,
            moduleId: true
          }
        })
      }
      return null
    } catch (error: any) {
      console.error("Database error getting resource details:", error)
      return null
    }
  }

  /**
   * Get user permissions with resource details (optimized version)
   */
  static async getUserPermissionsWithResources(userId: string): Promise<any[]> {
    try {
      console.log("[DatabaseRoles] Getting user permissions with resources:", userId)

      // Check if UserPermission table exists
      let tableExists = true
      try {
        await prisma.userPermission.findFirst({ take: 1 })
      } catch (error) {
        console.log("[DatabaseRoles] UserPermission table not available, returning empty permissions")
        tableExists = false
        return []
      }

      if (!tableExists) {
        return []
      }

      // Get user permissions from dedicated table
      const userPermissions: any[] = await prisma.userPermission.findMany({
        where: {
          userId: userId,
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        orderBy: [
          { resourceType: 'asc' },
          { createdAt: 'desc' }
        ]
      })

      console.log(`[DatabaseRoles] Found ${userPermissions.length} permissions for user`)
      
      // Get all unique module and form IDs
      const moduleIds = userPermissions
        .filter(p => p.resourceType === 'module')
        .map(p => p.resourceId)
      
      const formIds = userPermissions
        .filter(p => p.resourceType === 'form')
        .map(p => p.resourceId)
      
      // Batch fetch resources
      const [modules, forms] = await Promise.all([
        moduleIds.length > 0 ? prisma.formModule.findMany({
          where: { id: { in: moduleIds } },
          select: {
            id: true,
            name: true,
            description: true
          }
        }) : [],
        formIds.length > 0 ? prisma.form.findMany({
          where: { id: { in: formIds } },
          select: {
            id: true,
            name: true,
            description: true,
            moduleId: true
          }
        }) : []
      ])
      
      // Create lookup maps
      const moduleMap = new Map(modules.map(m => [m.id, m]))
      const formMap = new Map(forms.map(f => [f.id, f]))
      
      // Combine permissions with resources
      return userPermissions.map(perm => ({
        id: perm.id,
        userId: perm.userId,
        resourceType: perm.resourceType,
        resourceId: perm.resourceId,
        resource: perm.resourceType === 'module' 
          ? moduleMap.get(perm.resourceId) 
          : formMap.get(perm.resourceId),
        permissions: {
          canView: perm.canView,
          canCreate: perm.canCreate,
          canEdit: perm.canEdit,
          canDelete: perm.canDelete
        },
        isSystemAdmin: perm.isSystemAdmin,
        grantedBy: perm.grantedBy,
        grantedAt: perm.grantedAt,
        expiresAt: perm.expiresAt,
        isActive: perm.isActive
      })).filter(perm => perm.resource !== null)
    } catch (error: any) {
      console.error("Database error getting user permissions:", error)
      return []
    }
  }

  /**
   * Check if user has specific permission on a resource
   */
  static async checkUserPermission(
    userId: string, 
    resourceType: 'module' | 'form', 
    resourceId: string, 
    action: 'view' | 'create' | 'edit' | 'delete'
  ): Promise<boolean> {
    try {
      console.log("[DatabaseRoles] Checking user permission:", { userId, resourceType, resourceId, action })

      // Check if UserPermission table exists
      let tableExists = true
      try {
        await prisma.userPermission.findFirst({ take: 1 })
      } catch (error) {
        console.log("[DatabaseRoles] UserPermission table not available, returning false")
        return false
      }

      if (!tableExists) {
        return false
      }

      // Check if user has system admin permission
      const systemAdminPermission = await prisma.userPermission.findFirst({
        where: {
          userId: userId,
          isSystemAdmin: true,
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      })

      if (systemAdminPermission) {
        console.log("[DatabaseRoles] User has system admin permission")
        return true
      }

      // Check specific resource permission
      const permission = await prisma.userPermission.findFirst({
        where: {
          userId: userId,
          resourceType: resourceType,
          resourceId: resourceId,
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      })

      if (!permission) {
        console.log("[DatabaseRoles] No permission found for resource")
        return false
      }

      // Check specific action
      let hasPermission = false
      switch (action) {
        case 'view':
          hasPermission = permission.canView 
          break
        case 'create':
          hasPermission = permission.canCreate 
          break
        case 'edit':
          hasPermission = permission.canEdit 
          break
        case 'delete':
          hasPermission = permission.canDelete 
          break
        default:
          hasPermission = false
      }

      console.log(`[DatabaseRoles] Permission check result: ${hasPermission}`)
      return hasPermission
    } catch (error: any) {
      console.error("Database error checking user permission:", error)
      return false
    }
  }

  /**
   * Grant permission to user for a specific resource
   */
  static async grantUserPermission(data: {
    userId: string
    resourceType: 'module' | 'form'
    resourceId: string
    permissions: {
      canView?: boolean
      canCreate?: boolean
      canEdit?: boolean
      canDelete?: boolean
    }
    isSystemAdmin?: boolean
    grantedBy?: string
    expiresAt?: Date
  }): Promise<void> {
    try {
      console.log("[DatabaseRoles] Granting user permission:", data)

      // Check if UserPermission table exists
      let tableExists = true
      try {
        await prisma.userPermission.findFirst({ take: 1 })
      } catch (error) {
        console.log("[DatabaseRoles] UserPermission table not available, skipping permission grant")
        return
      }

      if (!tableExists) {
        return
      }

      // Validate resource exists
      if (data.resourceType === 'module') {
        const module = await prisma.formModule.findUnique({
          where: { id: data.resourceId }
        })
        if (!module) {
          throw new Error(`Module not found: ${data.resourceId}`)
        }
      } else if (data.resourceType === 'form') {
        const form = await prisma.form.findUnique({
          where: { id: data.resourceId }
        })
        if (!form) {
          throw new Error(`Form not found: ${data.resourceId}`)
        }
      }

      // Validate user exists
      const userRecord = await prisma.formRecord15.findUnique({
        where: { id: data.userId }
      })
      if (!userRecord) {
        throw new Error(`User not found: ${data.userId}`)
      }

      // Upsert permission
      await prisma.userPermission.upsert({
        where: {
          unique_user_resource_permission: {
            userId: data.userId,
            resourceType: data.resourceType,
            resourceId: data.resourceId
          }
        },
        update: {
          canView: data.permissions.canView ?? false,
          canCreate: data.permissions.canCreate ?? false,
          canEdit: data.permissions.canEdit ?? false,
          canDelete: data.permissions.canDelete ?? false,
          isSystemAdmin: data.isSystemAdmin ?? false,
          grantedBy: data.grantedBy,
          expiresAt: data.expiresAt,
          isActive: true,
          updatedAt: new Date()
        },
        create: {
          userId: data.userId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          canView: data.permissions.canView ?? false,
          canCreate: data.permissions.canCreate ?? false,
          canEdit: data.permissions.canEdit ?? false,
          canDelete: data.permissions.canDelete ?? false,
          isSystemAdmin: data.isSystemAdmin ?? false,
          grantedBy: data.grantedBy,
          expiresAt: data.expiresAt,
          isActive: true
        }
      })

      console.log("[DatabaseRoles] User permission granted successfully")
    } catch (error: any) {
      console.error("Database error granting user permission:", error)
      throw new Error(`Failed to grant user permission: ${error?.message}`)
    }
  }

  /**
   * Revoke permission from user for a specific resource
   */
  static async revokeUserPermission(
    userId: string,
    resourceType: 'module' | 'form',
    resourceId: string
  ): Promise<void> {
    try {
      console.log("[DatabaseRoles] Revoking user permission:", { userId, resourceType, resourceId })

      // Check if UserPermission table exists
      let tableExists = true
      try {
        await prisma.userPermission.findFirst({ take: 1 })
      } catch (error) {
        console.log("[DatabaseRoles] UserPermission table not available, skipping permission revoke")
        return
      }

      if (!tableExists) {
        return
      }

      await prisma.userPermission.updateMany({
        where: {
          userId: userId,
          resourceType: resourceType,
          resourceId: resourceId
        },
        data: {
          isActive: false,
          updatedAt: new Date()
        }
      })

      console.log("[DatabaseRoles] User permission revoked successfully")
    } catch (error: any) {
      console.error("Database error revoking user permission:", error)
      throw new Error(`Failed to revoke user permission: ${error?.message}`)
    }
  }

  /**
   * Batch update multiple user permissions
   */
  static async batchUpdateUserPermissions(
    userId: string,
    permissionUpdates: Array<{
      resourceType: 'module' | 'form'
      resourceId: string
      permissions: {
        canView?: boolean
        canCreate?: boolean
        canEdit?: boolean
        canDelete?: boolean
      }
      grantedBy?: string
    }>
  ): Promise<void> {
    try {
      console.log("[DatabaseRoles] Batch updating user permissions:", { userId, updates: permissionUpdates.length })

      // Check if UserPermission table exists
      let tableExists = true
      try {
        await prisma.userPermission.findFirst({ take: 1 })
      } catch (error) {
        console.log("[DatabaseRoles] UserPermission table not available, skipping batch update")
        return
      }

      if (!tableExists) {
        return
      }

      // Validate user exists
      const userRecord = await prisma.formRecord15.findUnique({
        where: { id: userId }
      })
      if (!userRecord) {
        throw new Error(`User not found: ${userId}`)
      }

      // Process each permission update
      for (const update of permissionUpdates) {
        await this.grantUserPermission({
          userId: userId,
          resourceType: update.resourceType,
          resourceId: update.resourceId,
          permissions: update.permissions,
          grantedBy: update.grantedBy
        })
      }

      console.log("[DatabaseRoles] Batch user permissions updated successfully")
    } catch (error: any) {
      console.error("Database error batch updating user permissions:", error)
      throw new Error(`Failed to batch update user permissions: ${error?.message}`)
    }
  }

  /**
   * Batch update user permissions using permission name format (moduleId:submoduleId:action)
   */
  static async updateUserPermissionsBatch(
    userId: string,
    permissionUpdates: Array<{
      permissionName: string // Format: "moduleId:submoduleId:action"
      value: boolean
    }>
  ): Promise<void> {
    try {
      console.log("[DatabaseRoles] Batch updating user permissions by name:", { userId, updates: permissionUpdates.length })

      // Check if UserPermission table exists
      let tableExists = true
      try {
        await prisma.userPermission.findFirst({ take: 1 })
      } catch (error) {
        console.log("[DatabaseRoles] UserPermission table not available, skipping permission updates")
        return
      }

      if (!tableExists) {
        return
      }

      // Validate user exists
      const userRecord = await prisma.formRecord15.findUnique({
        where: { id: userId }
      })
      if (!userRecord) {
        throw new Error(`User not found: ${userId}`)
      }

      // Group updates by resource
      const resourceUpdates = new Map<string, {
        resourceType: 'module' | 'form'
        resourceId: string
        permissions: Record<string, boolean>
      }>()

      for (const update of permissionUpdates) {
        const parts = update.permissionName.split(':')
        if (parts.length !== 3) {
          console.warn(`[DatabaseRoles] Invalid permission name format: ${update.permissionName}`)
          continue
        }

        const [moduleId, submoduleId, action] = parts
        let resourceType: 'module' | 'form'
        let resourceId: string

        if (submoduleId === '_module') {
          resourceType = 'module'
          resourceId = moduleId
        } else {
          resourceType = 'module'
          resourceId = submoduleId
        }

        const key = `${resourceType}:${resourceId}`
        if (!resourceUpdates.has(key)) {
          resourceUpdates.set(key, {
            resourceType,
            resourceId,
            permissions: {}
          })
        }

        const resourceUpdate = resourceUpdates.get(key)!
        
        // Map action to permission field
        switch (action) {
          case 'view':
            resourceUpdate.permissions.canView = update.value
            break
          case 'create':
            resourceUpdate.permissions.canCreate = update.value
            break
          case 'edit':
            resourceUpdate.permissions.canEdit = update.value
            break
          case 'delete':
            resourceUpdate.permissions.canDelete = update.value
            break
        }
      }

      console.log(`[DatabaseRoles] Processing ${resourceUpdates.size} resource updates`)
      
      // Apply all updates
      for (const [, resourceUpdate] of resourceUpdates) {
        // Get existing permissions first
        let existingPermission = null
        try {
          existingPermission = await prisma.userPermission.findFirst({
            where: {
              userId: userId,
              resourceType: resourceUpdate.resourceType,
              resourceId: resourceUpdate.resourceId
            }
          })
        } catch (error) {
          console.log("[DatabaseRoles] Error fetching existing permission, creating new one")
        }

        // Merge with existing permissions
        const finalPermissions = {
          canView: resourceUpdate.permissions.canView ?? existingPermission?.canView ?? false,
          canCreate: resourceUpdate.permissions.canCreate ?? existingPermission?.canCreate ?? false,
          canEdit: resourceUpdate.permissions.canEdit ?? existingPermission?.canEdit ?? false,
          canDelete: resourceUpdate.permissions.canDelete ?? existingPermission?.canDelete ?? false,
        }

        console.log(`[DatabaseRoles] Updating ${resourceUpdate.resourceType} ${resourceUpdate.resourceId}:`, finalPermissions)
        await this.grantUserPermission({
          userId: userId,
          resourceType: resourceUpdate.resourceType,
          resourceId: resourceUpdate.resourceId,
          permissions: finalPermissions
        })
      }

      console.log("[DatabaseRoles] Batch user permissions updated successfully")
    } catch (error: any) {
      console.error("Database error batch updating user permissions:", error)
      throw new Error(`Failed to batch update user permissions: ${error?.message}`)
    }
  }

  /**
   * Update single user permission using permission name format
   */
  static async updateUserPermission(
    userId: string,
    permissionName: string, // Format: "moduleId:submoduleId:action"
    value: boolean
  ): Promise<void> {
    try {
      console.log("[DatabaseRoles] Updating user permission:", { userId, permissionName, value })

      const parts = permissionName.split(':')
      if (parts.length !== 3) {
        throw new Error(`Invalid permission name format: ${permissionName}`)
      }

      const [moduleId, submoduleId, action] = parts
      let resourceType: 'module' | 'form'
      let resourceId: string

      if (submoduleId === '_module') {
        resourceType = 'module'
        resourceId = moduleId
      } else {
        resourceType = 'module'
        resourceId = submoduleId
      }

      // Check if UserPermission table exists
      let tableExists = true
      try {
        await prisma.userPermission.findFirst({ take: 1 })
      } catch (error) {
        console.log("[DatabaseRoles] UserPermission table not available, skipping permission update")
        return
      }

      if (!tableExists) {
        return
      }

      // Get existing permissions
      const existingPermission = await prisma.userPermission.findFirst({
        where: {
          userId: userId,
          resourceType: resourceType,
          resourceId: resourceId
        }
      })

      // Prepare permission data
      const permissions = {
        canView: existingPermission?.canView ?? false,
        canCreate: existingPermission?.canCreate ?? false,
        canEdit: existingPermission?.canEdit ?? false,
        canDelete: existingPermission?.canDelete ?? false
      }

      // Update the specific permission
      switch (action) {
        case 'view':
          permissions.canView = value
          break
        case 'create':
          permissions.canCreate = value
          break
        case 'edit':
          permissions.canEdit = value
          break
        case 'delete':
          permissions.canDelete = value
          break
        default:
          throw new Error(`Invalid permission action: ${action}`)
      }

      // Grant or update permission
      await this.grantUserPermission({
        userId: userId,
        resourceType: resourceType,
        resourceId: resourceId,
        permissions: permissions
      })

      console.log("[DatabaseRoles] User permission updated successfully")
    } catch (error: any) {
      console.error("Database error updating user permission:", error)
      throw new Error(`Failed to update user permission: ${error?.message}`)
    }
  }

  static async getUserById(userId: string): Promise<any | null> {
    try {
      console.log("[DatabaseRoles] Fetching user by ID:", userId)

      // Try to find user by ID first
      let userRecord = await prisma.formRecord15.findUnique({
        where: { id: userId }
      })

      // If not found by ID, try to find by email in recordData
      if (!userRecord) {
        console.log("[DatabaseRoles] User not found by ID, searching by email pattern...")
        
        // Get all records and search for matching email
        const allRecords = await prisma.formRecord15.findMany()
        
        for (const record of allRecords) {
          const recordData = record.recordData as any
          if (recordData && typeof recordData === 'object') {
            // Check direct email property
            if (recordData.email === userId) {
              userRecord = record
              break
            }
            
            // Check field-based structure for email
            for (const fieldId in recordData) {
              const field = recordData[fieldId]
              if (field && typeof field === 'object' && field.value) {
                if (field.type === 'email' && field.value === userId) {
                  userRecord = record
                  break
                }
              }
            }
            
            if (userRecord) break
          }
        }
      }

      if (!userRecord) {
        console.log("[DatabaseRoles] User not found:", userId)
        return null
      }

      console.log("[DatabaseRoles] User found")

      return {
        id: userRecord.id,
        recordData: userRecord.recordData,
        createdAt: userRecord.createdAt,
        updatedAt: userRecord.updatedAt,
        employee_id: userRecord.employee_id,
        status: userRecord.status
      }
    } catch (error: any) {
      console.error("Database error fetching user:", error)
      throw new Error(`Failed to fetch user: ${error?.message}`)
    }
  }

  /**
   * Get user by email address
   */
  static async getUserByEmail(email: string): Promise<any | null> {
    try {
      console.log("[DatabaseRoles] Fetching user by email:", email)

      // Get all records and search for matching email
      const allRecords = await prisma.formRecord15.findMany()
      
      for (const record of allRecords) {
        const recordData = record.recordData as any
        if (recordData && typeof recordData === 'object') {
          // Check direct email property
          if (recordData.email && recordData.email.toLowerCase() === email.toLowerCase()) {
            console.log("[DatabaseRoles] User found by direct email property")
            return {
              id: record.id,
              recordData: record.recordData,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
              employee_id: record.employee_id,
              status: record.status
            }
          }
          
          // Check field-based structure for email
          for (const fieldId in recordData) {
            const field = recordData[fieldId]
            if (field && typeof field === 'object' && field.value) {
              if (field.type === 'email' && field.value.toLowerCase() === email.toLowerCase()) {
                console.log("[DatabaseRoles] User found by field-based email structure")
                return {
                  id: record.id,
                  recordData: record.recordData,
                  createdAt: record.createdAt,
                  updatedAt: record.updatedAt,
                  employee_id: record.employee_id,
                  status: record.status
                }
              }
            }
          }
        }
      }

      console.log("[DatabaseRoles] User not found by email:", email)
      return null
    } catch (error: any) {
      console.error("Database error fetching user by email:", error)
      throw new Error(`Failed to fetch user by email: ${error?.message}`)
    }
  }

  // Employee Permission Matrix Operations (UPDATED FOR DEDICATED PERMISSIONS TABLE)
  static async getEmployeesWithPermissions(): Promise<Array<{
    id: string
    name: string
    email: string
    role: string
    department: string
    status: string
    permissions: Record<string, Record<string, Record<string, boolean>>>
  }>> {
    try {
      console.log("[DatabaseRoles] Getting employees with permissions from UserPermission table")

      // Get all users from form_records_15
      const userRecords = await prisma.formRecord15.findMany({
        orderBy: { createdAt: "desc" }
      })

      console.log(`[DatabaseRoles] Found ${userRecords.length} total records in form_records_15`)

      const employees = []

      for (const record of userRecords) {
        const recordData = record.recordData as any
        
        // Skip records that don't have basic user information
        if (!recordData || typeof recordData !== 'object') continue
        
        // Extract user information from the dynamic field structure
        let email = null
        let name = null
        
        // Check if recordData has direct properties first
        if (recordData.email) {
          email = recordData.email
          name = recordData.name || recordData.fullName || recordData.firstName
        } else {
          // Check if recordData has field-based structure
          for (const fieldId in recordData) {
            const field = recordData[fieldId]
            if (field && typeof field === 'object' && field.value) {
              if (field.type === 'email' || (field.label && field.label.toLowerCase().includes('email'))) {
                email = field.value
              }
              if (!name && (field.type === 'text' || field.type === 'name') && 
                  (field.label && (field.label.toLowerCase().includes('name') || field.label.toLowerCase().includes('full')))) {
                name = field.value
              }
            }
          }
        }
        
        // Skip if no email found
        if (!email) continue

        // Get user's permissions from UserPermission table
        let userPermissions: any[] = []
        try {
          // Check if UserPermission table exists
          let tableExists = true
          try {
            await prisma.userPermission.findFirst({ take: 1 })
          } catch (error) {
            console.log("[DatabaseRoles] UserPermission table not available, using empty permissions")
            tableExists = false
          }

          if (tableExists) {
            userPermissions = await prisma.userPermission.findMany({
              where: {
                userId: record.id,
                isActive: true,
                OR: [
                  { expiresAt: null },
                  { expiresAt: { gt: new Date() } }
                ]
              }
            })
          }
        } catch (error) {
          console.log(`[DatabaseRoles] Error fetching permissions for ${email}, using empty permissions:`, error)
          userPermissions = []
        }
        
        console.log(`[DatabaseRoles] User ${email} has ${userPermissions.length} permissions`)
        
        // Get resource details for permissions
        const moduleIds = userPermissions
          .filter(p => p.resourceType === 'module')
          .map(p => p.resourceId)
        
        const formIds = userPermissions
          .filter(p => p.resourceType === 'form')
          .map(p => p.resourceId)
        
        const [modules, forms] = await Promise.all([
          moduleIds.length > 0 ? prisma.formModule.findMany({
            where: { id: { in: moduleIds } },
            select: { id: true, name: true }
          }) : [],
          formIds.length > 0 ? prisma.form.findMany({
            where: { id: { in: formIds } },
            select: { id: true, name: true, moduleId: true }
          }) : []
        ])
        
        const moduleMap = new Map(modules.map(m => [m.id, m]))
        const formMap = new Map(forms.map(f => [f.id, f]))
        
        // Transform permissions into module-submodule matrix format
        const permissionMatrix: Record<string, Record<string, Record<string, boolean>>> = {}
        
        for (const perm of userPermissions) {
          const resource = perm.resourceType === 'module' 
            ? moduleMap.get(perm.resourceId)
            : null // We're not using forms anymore, only modules
          
          if (!resource) continue
          
          if (perm.resourceType === 'module') {
            const moduleId = perm.resourceId
            
            // Check if this is a parent module or child module
            const isParentModule = await prisma.formModule.findFirst({
              where: { id: moduleId, parentId: null }
            })
            
            if (!permissionMatrix[moduleId]) {
              permissionMatrix[moduleId] = {}
            }
            
            if (isParentModule) {
              // This is a parent module - create module-level permissions
              permissionMatrix[moduleId]['_module'] = {
                view: perm.canView,
                create: perm.canCreate,
                edit: perm.canEdit,
                delete: perm.canDelete,
              }
            } else {
              // This is a child module - find its parent and add as submodule permission
              const childModule = await prisma.formModule.findUnique({
                where: { id: moduleId },
                select: { parentId: true }
              })
              
              if (childModule && childModule.parentId) {
                const parentId = childModule.parentId
                if (!permissionMatrix[parentId]) {
                  permissionMatrix[parentId] = {}
                }
                
                permissionMatrix[parentId][moduleId] = {
                  view: perm.canView,
                  create: perm.canCreate,
                  edit: perm.canEdit,
                  delete: perm.canDelete,
                }
              }
            }
          }
        }

        console.log(`[DatabaseRoles] Built permission matrix for ${email}:`, {
          moduleCount: Object.keys(permissionMatrix).length,
          permissionMatrix: permissionMatrix
        })
        
        // Get role name from lookup field or direct field
        let roleName = 'No Role'
        if (recordData.roleName) {
          roleName = recordData.roleName
        } else if (recordData.role) {
          roleName = recordData.role
        } else {
          // Check lookup field for role
          for (const fieldId in recordData) {
            const field = recordData[fieldId]
            if (field && field.type === 'lookup' && field.label && field.label.toLowerCase().includes('role')) {
              roleName = field.value || 'No Role'
              break
            }
          }
        }

        employees.push({
          id: record.id,
          name: name || 'Unknown User',
          email: email,
          role: roleName,
          department: recordData.department || 'Unassigned',
          status: recordData.status || 'Active',
          permissions: permissionMatrix
        })
      }

      console.log(`[DatabaseRoles] Found ${employees.length} employees with permissions`)
      
      // Log detailed permission info for debugging
      employees.forEach(emp => {
        const permissionCount = Object.keys(emp.permissions).reduce((total, moduleId) => {
          return total + Object.keys(emp.permissions[moduleId]).length
        }, 0)
        console.log(`[DatabaseRoles] Employee ${emp.name}: ${permissionCount} permission entries`)
      })
      
      return employees
    } catch (error: any) {
      console.error("Database error getting employees with permissions:", error)
      throw new Error(`Failed to get employees with permissions: ${error?.message}`)
    }
  }

  static async getModulesWithSubmodules(): Promise<Array<{
    id: string
    name: string
    description: string
    subModules: Array<{
      id: string
      name: string
    }>
  }>> {
    try {
      console.log("[DatabaseRoles] Getting modules with submodules (child modules)")

      // Get all parent modules with their child modules (treating child modules as submodules)
      const modules = await prisma.formModule.findMany({
        where: {
          parentId: null, // Only get parent modules
          isActive: true
        },
        include: {
          children: {
            where: {
              isActive: true
            },
            select: {
              id: true,
              name: true,
              description: true
            },
            orderBy: { name: "asc" }
          }
        },
        orderBy: { name: "asc" }
      })

      const result = modules.map(module => {
        return {
          id: module.id,
          name: module.name,
          description: module.description || '',
          subModules: module.children.map(child => ({
            id: child.id,
            name: child.name
          }))
        }
      })

      console.log(`[DatabaseRoles] Found ${result.length} parent modules with ${result.reduce((total, m) => total + m.subModules.length, 0)} child modules`)
      return result
    } catch (error: any) {
      console.error("Database error getting modules with submodules:", error)
      throw new Error(`Failed to get modules with submodules: ${error?.message}`)
    }
  }

  /**
   * Update employee permission using dedicated UserPermission table
   */
  static async updateEmployeePermission(
    employeeId: string,
    moduleId: string,
    submoduleId: string,
    permissionType: string,
    value: boolean
  ): Promise<void> {
    try {
      console.log("[DatabaseRoles] Updating employee permission in UserPermission table:", {
        employeeId,
        moduleId,
        submoduleId,
        permissionType,
        value
      })

      // Check if UserPermission table exists
      let tableExists = true
      try {
        await prisma.userPermission.findFirst({ take: 1 })
      } catch (error) {
        console.log("[DatabaseRoles] UserPermission table not available, skipping permission update")
        return
      }

      if (!tableExists) {
        return
      }

      // Validate permission type
      if (!['view', 'create', 'edit', 'delete'].includes(permissionType)) {
        throw new Error(`Invalid permission type: ${permissionType}`)
      }

      // Determine resource type and ID
      let resourceType: 'module' | 'form'
      let resourceId: string

      if (submoduleId === '_module') {
        // Module-level permission
        resourceType = 'module'
        resourceId = moduleId
      } else {
        // Submodule-level permission (child module)
        resourceType = 'module'
        resourceId = submoduleId
      }

      // Get existing permission or create new one
      const existingPermission = await prisma.userPermission.findFirst({
        where: {
          userId: employeeId,
          resourceType: resourceType,
          resourceId: resourceId
        }
      })

      // Prepare permission data
      const permissionData = {
        canView: existingPermission?.canView ?? false,
        canCreate: existingPermission?.canCreate ?? false,
        canEdit: existingPermission?.canEdit ?? false,
        canDelete: existingPermission?.canDelete ?? false,
      }

      // Update the specific permission
      switch (permissionType) {
        case 'view':
          permissionData.canView = value
          break
        case 'create':
          permissionData.canCreate = value
          break
        case 'edit':
          permissionData.canEdit = value
          break
        case 'delete':
          permissionData.canDelete = value
          break
      }

      // Grant or update permission
      await this.grantUserPermission({
        userId: employeeId,
        resourceType: resourceType,
        resourceId: resourceId,
        permissions: permissionData
      })

      console.log("[DatabaseRoles] Employee permission updated successfully")
    } catch (error: any) {
      console.error("Database error updating employee permission:", error)
      throw new Error(`Failed to update employee permission: ${error?.message}`)
    }
  }

  // Utility Methods
  private static transformRole(rawRole: any): Role {
    return {
      id: rawRole.id,
      name: rawRole.name,
      description: rawRole.description || null,
      permissions: [], // No longer used for permissions
      createdAt: rawRole.createdAt,
      updatedAt: rawRole.updatedAt
    }
  }

  // Seed default roles (just for designations now)
  static async seedDefaultRoles(): Promise<void> {
    try {
      console.log("[DatabaseRoles] Seeding default roles (designations)")

      // Create default roles (just for designation purposes)
      const defaultRoles = [
        {
          name: "Super Admin",
          description: "Super Administrator designation"
        },
        {
          name: "Admin",
          description: "Administrator designation"
        },
        {
          name: "Manager",
          description: "Manager designation"
        },
        {
          name: "Editor",
          description: "Editor designation"
        },
        {
          name: "Viewer",
          description: "Viewer designation"
        },
        {
          name: "HR",
          description: "Human Resources designation"
        },
        {
          name: "Finance",
          description: "Finance department designation"
        },
        {
          name: "IT",
          description: "Information Technology designation"
        }
      ]

      for (const roleData of defaultRoles) {
        try {
          const existing = await prisma.role.findUnique({
            where: { name: roleData.name }
          })
          
          if (!existing) {
            await this.createRole({
              name: roleData.name,
              description: roleData.description
            })
          }
        } catch (error) {
          console.error(`Error creating role ${roleData.name}:`, error)
        }
      }

      console.log("[DatabaseRoles] Default roles (designations) seeded successfully")
    } catch (error: any) {
      console.error("Database error seeding default roles:", error)
      throw new Error(`Failed to seed default roles: ${error?.message}`)
    }
  }

  // Legacy methods for backward compatibility
  static async createPermission(): Promise<any> {
    throw new Error("Permission creation is deprecated. Use UserPermission table directly.")
  }

  static async getPermissions(): Promise<any[]> {
    return []
  }

  static async getPermission(): Promise<any> {
    return null
  }

  static async updatePermission(): Promise<any> {
    throw new Error("Permission updates are deprecated. Use UserPermission table directly.")
  }

  static async deletePermission(): Promise<void> {
    throw new Error("Permission deletion is deprecated. Use UserPermission table directly.")
  }

  static async createResourcePermissions(): Promise<void> {
    // No-op - permissions are now managed directly in UserPermission table
  }

  static async deleteResourcePermissions(): Promise<void> {
    // No-op - permissions are now managed directly in UserPermission table
  }
}