"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useGetUserQuery } from "@/lib/api/auth"

export interface RolePermission {
  id: string
  roleId: string
  permissionId: string
  moduleId: string | null
  formId: string | null
  granted: boolean
  canDelegate: boolean
  permission: {
    name: string
    resource: string
    category: string
    description: string
  }
  module: {
    name: string
    path: string
  } | null
  form: {
    name: string
    description: string
  } | null
}

/** Shape returned by /api/user-permissions?userId=xxx */
interface UserPermissionRecord {
  id: string
  userId: string
  permissionId: string | null
  moduleId: string | null
  formId: string | null
  granted: boolean
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  isActive: boolean
  expiresAt: string | null
  permission: {
    id: string
    name: string
    category: string
    resource: string
  } | null
  module: {
    id: string
    name: string
  } | null
}

export interface UserInfo {
  id: string
  email: string
  username: string
  first_name: string
  last_name: string
  isAdmin: boolean
  organization: { id: string; name: string } | null
  unitAssignments: {
    unit: { id: string; name: string }
    role: { id: string; name: string; isAdmin?: boolean }
    notes: string
  }[]
}

export interface PermissionsState {
  permissions: RolePermission[]
  user: UserInfo | null
  isLoading: boolean
  error: string | null
  isAdmin: boolean
  hasPermission: (permissionName: string, moduleId?: string | null, formId?: string | null) => boolean
  hasAnyPermission: (permissionNames: string[], moduleId?: string | null, formId?: string | null) => boolean
  canDelegate: (permissionName: string, moduleId?: string | null, formId?: string | null) => boolean
  refreshPermissions: () => Promise<void>
}

export function usePermissions(): PermissionsState {
  const { data: userData, error: userError, isLoading: userLoading, refetch: refetchUser } = useGetUserQuery()

  const [permissions, setPermissions] = useState<RolePermission[]>([])
  const [userPermissions, setUserPermissions] = useState<UserPermissionRecord[]>([])
  const [permissionsLoading, setPermissionsLoading] = useState(true)
  const [permissionsError, setPermissionsError] = useState<string | null>(null)

  // Use isAdmin directly from /api/auth/me — it already checks:
  // 1. role.isAdmin flag
  // 2. role name contains "admin"
  // 3. user is organization owner
  const user = (userData?.user as unknown as UserInfo) ?? null
  const isAdmin = user?.isAdmin ?? false

  const unitAssignments = user?.unitAssignments || []
  const roleIds = useMemo(
    () => [...new Set(unitAssignments.map((ua) => ua.role.id))],
    [unitAssignments]
  )

  // Fetch role permissions AND user-level permissions in parallel
  useEffect(() => {
    if (userLoading) return

    // Admin gets full access — no need to fetch permissions
    if (!user || isAdmin) {
      setPermissions([])
      setUserPermissions([])
      setPermissionsLoading(false)
      return
    }

    let cancelled = false
    setPermissionsLoading(true)

    const fetchAll = async () => {
      try {
        const [roleResults, userPermsRes] = await Promise.all([
          // Role permissions (one request per role)
          roleIds.length > 0
            ? Promise.all(
                roleIds.map(async (roleId) => {
                  const res = await fetch(`/api/role-permissions?roleId=${roleId}`, { credentials: "include" })
                  if (!res.ok) return []
                  const json = await res.json()
                  return json.success && Array.isArray(json.data) ? json.data : []
                })
              )
            : Promise.resolve([]),
          // User-level permissions for the current user
          fetch(`/api/user-permissions?userId=${user.id}`, { credentials: "include" })
            .then((res) => (res.ok ? res.json() : { success: false, data: [] }))
            .catch(() => ({ success: false, data: [] })),
        ])

        if (!cancelled) {
          const allRolePerms: RolePermission[] = []
          roleResults.forEach((perms) => allRolePerms.push(...perms))
          setPermissions(allRolePerms)

          const uPerms: UserPermissionRecord[] =
            userPermsRes.success && Array.isArray(userPermsRes.data) ? userPermsRes.data : []
          setUserPermissions(
            uPerms.filter((up) => up.isActive && (!up.expiresAt || new Date(up.expiresAt) > new Date()))
          )
          setPermissionsError(null)
        }
      } catch (err: any) {
        if (!cancelled) {
          setPermissionsError(err.message || "Failed to load permissions")
          setPermissions([])
          setUserPermissions([])
        }
      } finally {
        if (!cancelled) setPermissionsLoading(false)
      }
    }

    fetchAll()
    return () => { cancelled = true }
  }, [user, userLoading, isAdmin, roleIds])

  const isLoading = userLoading || permissionsLoading
  const error = userError ? "Failed to fetch user info" : permissionsError

  // Build lookup map for fast permission checks.
  // User-level permissions override role-level permissions.
  const permissionMap = useMemo(() => {
    const map = new Map<string, RolePermission>()
    const denied = new Set<string>()

    // 1. Role-based permissions
    for (const perm of permissions) {
      if (!perm.granted) continue
      const permName = perm.permission.name.toLowerCase()

      if (!map.has(permName)) map.set(permName, perm)

      if (perm.moduleId) {
        const moduleKey = `${permName}:${perm.moduleId}`
        if (!map.has(moduleKey)) map.set(moduleKey, perm)
      }

      if (perm.moduleId && perm.formId) {
        const formKey = `${permName}:${perm.moduleId}:${perm.formId}`
        if (!map.has(formKey)) map.set(formKey, perm)
      }

      if (perm.formId) {
        const formOnlyKey = `${permName}::${perm.formId}`
        if (!map.has(formOnlyKey)) map.set(formOnlyKey, perm)
      }
    }

    // 2. User-level permissions (override role-level)
    for (const up of userPermissions) {
      const flagPerms: { name: string; granted: boolean }[] = [
        { name: "view", granted: up.canView },
        { name: "create", granted: up.canCreate },
        { name: "edit", granted: up.canEdit },
        { name: "delete", granted: up.canDelete },
      ]

      if (up.permission) {
        flagPerms.push({ name: up.permission.name.toLowerCase(), granted: up.granted })
      }

      for (const { name: permName, granted } of flagPerms) {
        const keys: string[] = [permName]
        if (up.moduleId) keys.push(`${permName}:${up.moduleId}`)
        if (up.moduleId && up.formId) keys.push(`${permName}:${up.moduleId}:${up.formId}`)
        if (up.formId) keys.push(`${permName}::${up.formId}`)

        for (const key of keys) {
          if (granted) {
            map.set(key, {
              id: up.id,
              roleId: "",
              permissionId: up.permissionId || "",
              moduleId: up.moduleId,
              formId: up.formId,
              granted: true,
              canDelegate: false,
              permission: up.permission
                ? { name: up.permission.name, resource: up.permission.resource, category: up.permission.category, description: "" }
                : { name: permName.toUpperCase(), resource: "form", category: "READ", description: "" },
              module: up.module ? { name: up.module.name, path: "" } : null,
              form: null,
            })
            denied.delete(key)
          } else {
            map.delete(key)
            denied.add(key)
          }
        }
      }
    }

    ;(map as any).__denied = denied
    return map
  }, [permissions, userPermissions])

  const hasPermission = useCallback(
    (permissionName: string, moduleId?: string | null, formId?: string | null): boolean => {
      if (isAdmin) return true
      const permName = permissionName.toLowerCase()
      const denied = (permissionMap as any).__denied as Set<string> | undefined

      if (moduleId && formId) {
        const formKey = `${permName}:${moduleId}:${formId}`
        if (denied?.has(formKey)) return false
        if (permissionMap.has(formKey)) return true
      }
      if (formId) {
        const formOnlyKey = `${permName}::${formId}`
        if (denied?.has(formOnlyKey)) return false
        if (permissionMap.has(formOnlyKey)) return true
      }
      if (moduleId) {
        const moduleKey = `${permName}:${moduleId}`
        if (denied?.has(moduleKey)) return false
        if (permissionMap.has(moduleKey)) return true
      }
      if (denied?.has(permName)) return false
      if (permissionMap.has(permName)) return true

      return false
    },
    [isAdmin, permissionMap]
  )

  const hasAnyPermission = useCallback(
    (permissionNames: string[], moduleId?: string | null, formId?: string | null): boolean => {
      if (isAdmin) return true
      return permissionNames.some((name) => hasPermission(name, moduleId, formId))
    },
    [isAdmin, hasPermission]
  )

  const canDelegateFn = useCallback(
    (permissionName: string, moduleId?: string | null, formId?: string | null): boolean => {
      if (isAdmin) return true
      const permName = permissionName.toLowerCase()

      for (const perm of permissions) {
        if (!perm.granted || !perm.canDelegate) continue
        if (perm.permission.name.toLowerCase() !== permName) continue

        if (formId && perm.formId === formId) return true
        if (moduleId && perm.moduleId === moduleId && !formId) return true
        if (!perm.moduleId && !perm.formId) return true
      }

      return false
    },
    [isAdmin, permissions]
  )

  const refreshPermissions = useCallback(async () => {
    refetchUser()
  }, [refetchUser])

  return {
    permissions,
    user,
    isLoading,
    isAdmin,
    error,
    hasPermission,
    hasAnyPermission,
    canDelegate: canDelegateFn,
    refreshPermissions,
  }
}
