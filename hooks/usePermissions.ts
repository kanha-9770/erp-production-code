"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useGetUserQuery } from "@/lib/api/auth"
import { useGetRolePermissionsQuery } from "@/lib/api/permissions"

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

export interface UserInfo {
  id: string
  email: string
  username: string
  first_name: string
  last_name: string
  organization: { id: string; name: string } | null
  unitAssignments: {
    unit: { id: string; name: string }
    role: { id: string; name: string }
    notes: string
  }[]
}

export interface PermissionsState {
  permissions: RolePermission[]
  user: UserInfo | null
  isLoading: boolean
  error: string | null
  hasPermission: (permissionName: string, moduleId?: string | null, formId?: string | null) => boolean
  hasAnyPermission: (permissionNames: string[], moduleId?: string | null, formId?: string | null) => boolean
  canDelegate: (permissionName: string, moduleId?: string | null, formId?: string | null) => boolean
  refreshPermissions: () => Promise<void>
}

export function usePermissions(): PermissionsState {
  const { data: userData, error: userError, isLoading: userLoading, refetch: refetchUser } = useGetUserQuery()

  const [permissions, setPermissions] = useState<RolePermission[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [permissionsLoading, setPermissionsLoading] = useState(true)
  const [permissionsError, setPermissionsError] = useState<string | null>(null)

  const user = (userData?.user as unknown as UserInfo) ?? null
  const unitAssignments = user?.unitAssignments || []
  const roleIds = useMemo(
    () => [...new Set(unitAssignments.map((ua) => ua.role.id))],
    [unitAssignments]
  )

  // Determine admin status
  useEffect(() => {
    const isAdminUser = unitAssignments.some((ua) => ua.role.name === "ADMIN")
    setIsAdmin(isAdminUser)
  }, [unitAssignments])

  // Fetch permissions for all roles the user has
  useEffect(() => {
    if (userLoading) return
    if (!user || isAdmin || roleIds.length === 0) {
      setPermissions([])
      setPermissionsLoading(false)
      return
    }

    let cancelled = false
    setPermissionsLoading(true)

    const fetchAll = async () => {
      try {
        const results = await Promise.all(
          roleIds.map(async (roleId) => {
            const res = await fetch(`/api/role-permissions?roleId=${roleId}`, { credentials: "include" })
            if (!res.ok) return []
            const json = await res.json()
            return json.success && Array.isArray(json.data) ? json.data : []
          })
        )
        if (!cancelled) {
          const allPerms: RolePermission[] = []
          results.forEach((perms) => allPerms.push(...perms))
          setPermissions(allPerms)
          setPermissionsError(null)
        }
      } catch (err: any) {
        if (!cancelled) {
          setPermissionsError(err.message || "Failed to load permissions")
          setPermissions([])
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

  // Build lookup map for fast permission checks
  const permissionMap = useMemo(() => {
    const map = new Map<string, RolePermission>()

    for (const perm of permissions) {
      if (!perm.granted) continue
      const permName = perm.permission.name.toLowerCase()

      const globalKey = permName
      if (!map.has(globalKey)) map.set(globalKey, perm)

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

    return map
  }, [permissions])

  const hasPermission = useCallback(
    (permissionName: string, moduleId?: string | null, formId?: string | null): boolean => {
      if (isAdmin) return true
      const permName = permissionName.toLowerCase()

      if (moduleId && formId && permissionMap.has(`${permName}:${moduleId}:${formId}`)) return true
      if (formId && permissionMap.has(`${permName}::${formId}`)) return true
      if (moduleId && permissionMap.has(`${permName}:${moduleId}`)) return true
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
    error,
    hasPermission,
    hasAnyPermission,
    canDelegate: canDelegateFn,
    refreshPermissions,
  }
}
