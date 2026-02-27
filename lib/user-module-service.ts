import { prisma } from "./prisma"

interface ModuleWithAccess {
  user_id: string
  user_email: string
  module_id: string
  module_name: string
  module_description?: string
  module_icon?: string
  module_color?: string
  module_type: string
  module_level: number
  module_path?: string
  is_active: boolean
  access_source: 'role' | 'direct'
  role_name?: string
}

interface UserModuleAccess {
  userId: string
  userEmail: string
  modules: Array<{
    id: string
    name: string
    description?: string
    icon?: string
    color?: string
    moduleType: string
    level: number
    path?: string
    isActive: boolean
    accessSource: 'role' | 'direct'
    roleName?: string
  }>
}

export class UserModuleService {
  /**
   * Get all modules accessible to a user through role-based and direct permissions
   * This implements the same logic as your SQL query but with Prisma
   */
  static async getUserModules(userId: string): Promise<UserModuleAccess | null> {
    try {
      console.log(`[UserModuleService] Getting modules for user: ${userId}`)

      // First verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true }
      })

      if (!user) {
        console.log(`[UserModuleService] User not found: ${userId}`)
        return null
      }

      // Get modules through role-based permissions (first part of UNION)
      const roleBasedModules = await this.getModulesThroughRoles(userId)
      console.log(`[UserModuleService] Found ${roleBasedModules.length} modules through role permissions`)

      // Get modules through direct user permissions (second part of UNION)
      const directModules = await this.getModulesThroughDirectPermissions(userId)
      console.log(`[UserModuleService] Found ${directModules.length} modules through direct permissions`)

      // Combine and deduplicate modules
      const allModules = this.combineAndDeduplicateModules(roleBasedModules, directModules)
      console.log(`[UserModuleService] Total unique modules: ${allModules.length}`)

      return {
        userId: user.id,
        userEmail: user.email,
        modules: allModules
      }
    } catch (error: any) {
      console.error("[UserModuleService] Error getting user modules:", error)
      throw new Error(`Failed to get user modules: ${error.message}`)
    }
  }

  /**
   * Get modules through role-based permissions
   * Equivalent to the first SELECT in your UNION query
   */
  private static async getModulesThroughRoles(userId: string): Promise<ModuleWithAccess[]> {
    const results = await prisma.$queryRaw<ModuleWithAccess[]>`
      SELECT 
        u.id AS user_id,
        u.email AS user_email,
        m.id AS module_id,
        m.name AS module_name,
        m.description AS module_description,
        m.icon AS module_icon,
        m.color AS module_color,
        m.module_type AS module_type,
        m.level AS module_level,
        m.path AS module_path,
        m.is_active,
        'role' AS access_source,
        r.name AS role_name
      FROM users u
      JOIN user_unit_assignments uua ON uua.user_id = u.id
      JOIN roles r ON r.id = uua.role_id
      JOIN role_permissions rp ON rp.role_id = r.id AND rp.granted = true
      JOIN form_modules m ON m.id = rp.module_id AND m.is_active = true
      WHERE u.id = ${userId}
    `

    return results.map(result => ({
      ...result,
      access_source: 'role' as const
    }))
  }

  /**
   * Get modules through direct user permissions
   * Equivalent to the second SELECT in your UNION query
   */
  private static async getModulesThroughDirectPermissions(userId: string): Promise<ModuleWithAccess[]> {
    const results = await prisma.$queryRaw<ModuleWithAccess[]>`
      SELECT 
        u.id AS user_id,
        u.email AS user_email,
        m.id AS module_id,
        m.name AS module_name,
        m.description AS module_description,
        m.icon AS module_icon,
        m.color AS module_color,
        m.module_type AS module_type,
        m.level AS module_level,
        m.path AS module_path,
        m.is_active,
        'direct' AS access_source,
        NULL AS role_name
      FROM users u
      JOIN user_permissions up ON up.user_id = u.id AND up.granted = true
      JOIN form_modules m ON m.id = up.module_id AND m.is_active = true
      WHERE u.id = ${userId}
    `

    return results.map(result => ({
      ...result,
      access_source: 'direct' as const
    }))
  }

  /**
   * Combine role-based and direct modules, removing duplicates
   * Prioritizes role-based access over direct access for the same module
   */
  private static combineAndDeduplicateModules(
    roleModules: ModuleWithAccess[], 
    directModules: ModuleWithAccess[]
  ): Array<{
    id: string
    name: string
    description?: string
    icon?: string
    color?: string
    moduleType: string
    level: number
    path?: string
    isActive: boolean
    accessSource: 'role' | 'direct'
    roleName?: string
  }> {
    const moduleMap = new Map<string, any>()

    // Add role-based modules first (they take priority)
    roleModules.forEach(module => {
      moduleMap.set(module.module_id, {
        id: module.module_id,
        name: module.module_name,
        description: module.module_description,
        icon: module.module_icon,
        color: module.module_color,
        moduleType: module.module_type,
        level: module.module_level,
        path: module.module_path,
        isActive: module.is_active,
        accessSource: module.access_source,
        roleName: module.role_name
      })
    })

    // Add direct modules only if they don't already exist
    directModules.forEach(module => {
      if (!moduleMap.has(module.module_id)) {
        moduleMap.set(module.module_id, {
          id: module.module_id,
          name: module.module_name,
          description: module.module_description,
          icon: module.module_icon,
          color: module.module_color,
          moduleType: module.module_type,
          level: module.module_level,
          path: module.module_path,
          isActive: module.is_active,
          accessSource: module.access_source,
          roleName: undefined
        })
      }
    })

    // Convert map to array and sort by module name
    return Array.from(moduleMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Get module hierarchy with user permissions applied
   * This builds a hierarchical structure of modules based on parent-child relationships
   */
  static async getUserModuleHierarchy(userId: string): Promise<any[]> {
    try {
      const userModules = await this.getUserModules(userId)
      if (!userModules || userModules.modules.length === 0) {
        return []
      }

      // Get complete module hierarchy for accessible modules
      const moduleIds = userModules.modules.map(m => m.id)
      
      const hierarchyModules = await prisma.formModule.findMany({
        where: {
          id: { in: moduleIds },
          isActive: true
        },
        include: {
          parent: true,
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: [
          { level: 'asc' },
          { sortOrder: 'asc' }
        ]
      })

      return this.buildModuleTree(hierarchyModules, userModules.modules)
    } catch (error: any) {
      console.error("[UserModuleService] Error getting user module hierarchy:", error)
      return []
    }
  }

  /**
   * Build a tree structure from flat module list
   */
  private static buildModuleTree(modules: any[], userModules: any[]): any[] {
    const moduleMap = new Map()
    const accessMap = new Map()

    // Create access map for quick lookup
    userModules.forEach(module => {
      accessMap.set(module.id, {
        accessSource: module.accessSource,
        roleName: module.roleName
      })
    })

    // Create module map
    modules.forEach(module => {
      const accessInfo = accessMap.get(module.id)
      moduleMap.set(module.id, {
        id: module.id,
        name: module.name,
        description: module.description,
        icon: module.icon,
        color: module.color,
        moduleType: module.moduleType,
        level: module.level,
        path: module.path,
        isActive: module.isActive,
        sortOrder: module.sortOrder,
        parentId: module.parentId,
        accessSource: accessInfo?.accessSource,
        roleName: accessInfo?.roleName,
        children: []
      })
    })

    // Build tree structure
    const rootModules: any[] = []
    
    moduleMap.forEach(module => {
      if (module.parentId && moduleMap.has(module.parentId)) {
        const parent = moduleMap.get(module.parentId)
        parent.children.push(module)
      } else {
        rootModules.push(module)
      }
    })

    // Sort children recursively
    const sortChildren = (modules: any[]) => {
      modules.sort((a, b) => a.sortOrder - b.sortOrder)
      modules.forEach(module => {
        if (module.children.length > 0) {
          sortChildren(module.children)
        }
      })
    }

    sortChildren(rootModules)
    return rootModules
  }

  /**
   * Check if user has access to a specific module
   */
  static async hasModuleAccess(userId: string, moduleId: string): Promise<boolean> {
    try {
      const userModules = await this.getUserModules(userId)
      return userModules?.modules.some(m => m.id === moduleId) ?? false
    } catch (error: any) {
      console.error("[UserModuleService] Error checking module access:", error)
      return false
    }
  }

  /**
   * Get user's roles and their associated modules
   */
  static async getUserRolesWithModules(userId: string): Promise<{
    roleId: string
    roleName: string
    modules: string[]
  }[]> {
    try {
      const roleModules = await prisma.$queryRaw<Array<{
        role_id: string
        role_name: string
        module_id: string
      }>>`
        SELECT DISTINCT
          r.id AS role_id,
          r.name AS role_name,
          m.id AS module_id
        FROM users u
        JOIN user_unit_assignments uua ON uua.user_id = u.id
        JOIN roles r ON r.id = uua.role_id
        JOIN role_permissions rp ON rp.role_id = r.id AND rp.granted = true
        JOIN form_modules m ON m.id = rp.module_id AND m.is_active = true
        WHERE u.id = ${userId}
        ORDER BY r.name, m.id
      `

      const roleMap = new Map<string, { roleId: string, roleName: string, modules: string[] }>()

      roleModules.forEach(row => {
        if (!roleMap.has(row.role_id)) {
          roleMap.set(row.role_id, {
            roleId: row.role_id,
            roleName: row.role_name,
            modules: []
          })
        }
        roleMap.get(row.role_id)!.modules.push(row.module_id)
      })

      return Array.from(roleMap.values())
    } catch (error: any) {
      console.error("[UserModuleService] Error getting user roles with modules:", error)
      return []
    }
  }
}