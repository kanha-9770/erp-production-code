"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  useGetRolesQuery,
  useGetPermissionsQuery,
  useGetRolePermissionsQuery,
  useGetUserPermissionsQuery,
  useUpdateRolePermissionsMutation,
  useUpdateUserPermissionsMutation,
} from "@/lib/api/permissions"
import { useGetAdminUsersQuery } from "@/lib/api/users"
import type {
  PermissionRole,
  PermissionUser,
  Permission,
  RolePermission,
  UserPermission,
  PermissionModule,
} from "@/types/permissions"
import { STANDARD_PERMISSIONS } from "@/types/permissions"

type ChangeKey = string

interface UsePermissionMatrixResult {
  roles: PermissionRole[]
  users: PermissionUser[]
  permissions: Permission[]
  rolePermissions: RolePermission[]
  userPermissions: UserPermission[]
  loading: boolean
  error: string | null
  changes: Map<ChangeKey, boolean>
  saving: boolean
  hasChanges: boolean
  hasRolePermission: (roleId: string, formId: string, permId: string) => boolean
  hasUserPermission: (userId: string, formId: string, permId: string) => boolean
  togglePermission: (prefix: "role" | "user", id: string, formId: string, permId: string) => void
  resetChanges: () => void
  saveChanges: (modules: PermissionModule[], selectedForm: string) => Promise<void>
  getUsersForRole: (roleId: string) => PermissionUser[]
  getGrantedCountForRole: (roleId: string, selectedForm: string) => number
  filteredRoles: PermissionRole[]
}

export function usePermissionMatrix(selectedForm: string | null): UsePermissionMatrixResult {
  const { toast } = useToast()
  const [changes, setChanges] = useState<Map<ChangeKey, boolean>>(new Map())
  const [saving, setSaving] = useState(false)

  // RTK Query hooks — skip when no form is selected
  const {
    data: rolesData,
    isLoading: rolesLoading,
    error: rolesError,
  } = useGetRolesQuery(undefined, { skip: !selectedForm })

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
  } = useGetAdminUsersQuery(undefined, { skip: !selectedForm })

  const {
    data: permsData,
    isLoading: permsLoading,
  } = useGetPermissionsQuery(undefined, { skip: !selectedForm })

  const {
    data: rpData,
    isLoading: rpLoading,
    refetch: refetchRolePerms,
  } = useGetRolePermissionsQuery(
    { formId: selectedForm! },
    { skip: !selectedForm }
  )

  const {
    data: upData,
    isLoading: upLoading,
    refetch: refetchUserPerms,
  } = useGetUserPermissionsQuery(undefined, { skip: !selectedForm })

  const [updateRolePerms] = useUpdateRolePermissionsMutation()
  const [updateUserPerms] = useUpdateUserPermissionsMutation()

  // Derive data from RTK Query responses
  const roles: PermissionRole[] = rolesData?.success ? rolesData.data : []
  const users: PermissionUser[] = useMemo(() => {
    if (!usersData?.success) return []
    return usersData.data as unknown as PermissionUser[]
  }, [usersData])
  const permissions: Permission[] = permsData?.success && permsData.data?.length ? permsData.data : STANDARD_PERMISSIONS
  const rolePermissions: RolePermission[] = rpData?.success ? rpData.data : []
  const userPermissions: UserPermission[] = upData?.success ? upData.data : []

  const loading = rolesLoading || usersLoading || permsLoading || rpLoading || upLoading
  const error = rolesError || usersError
    ? "Failed to load permission data"
    : null

  // Reset changes when selectedForm changes
  useEffect(() => {
    setChanges(new Map())
  }, [selectedForm])

  // ─── Permission lookup helpers ────────────────────────────────────────────

  const hasRolePermission = useCallback(
    (roleId: string, formId: string, permId: string): boolean => {
      const key: ChangeKey = `role-${roleId}-${formId}-${permId}`
      if (changes.has(key)) return changes.get(key)!
      return rolePermissions.some(
        (rp) =>
          rp.roleId === roleId &&
          rp.permissionId === permId &&
          (rp.formId ?? null) === (formId ?? null) &&
          rp.granted
      )
    },
    [changes, rolePermissions]
  )

  const hasUserPermission = useCallback(
    (userId: string, formId: string, permId: string): boolean => {
      const key: ChangeKey = `user-${userId}-${formId}-${permId}`
      if (changes.has(key)) return changes.get(key)!

      const direct = userPermissions.find(
        (up) =>
          up.userId === userId &&
          up.formId === formId &&
          up.permissionId === permId &&
          up.isActive
      )
      if (direct) return direct.granted

      const roleId = users.find((u) => u.id === userId)?.unitAssignments?.[0]?.roleId
      return roleId ? hasRolePermission(roleId, formId, permId) : false
    },
    [changes, userPermissions, users, hasRolePermission]
  )

  const togglePermission = useCallback(
    (prefix: "role" | "user", id: string, formId: string, permId: string) => {
      const key: ChangeKey = `${prefix}-${id}-${formId}-${permId}`
      const current =
        prefix === "role"
          ? hasRolePermission(id, formId, permId)
          : hasUserPermission(id, formId, permId)
      setChanges((prev) => new Map(prev).set(key, !current))
    },
    [hasRolePermission, hasUserPermission]
  )

  const resetChanges = useCallback(() => setChanges(new Map()), [])

  // ─── Save ─────────────────────────────────────────────────────────────────

  const saveChanges = useCallback(
    async (modules: PermissionModule[], selectedFormId: string) => {
      if (changes.size === 0) return
      setSaving(true)

      try {
        let moduleId: string | null = null
        outer: for (const mod of modules) {
          if (mod.forms?.some((f) => f.id === selectedFormId)) {
            moduleId = mod.id
            break
          }
          for (const sub of mod.children ?? []) {
            if (sub.forms?.some((f) => f.id === selectedFormId)) {
              moduleId = mod.id
              break outer
            }
          }
        }

        const roleUpdates: object[] = []
        const userUpdates: object[] = []

        changes.forEach((granted, key) => {
          const parts = key.split("-")
          if (key.startsWith("role-")) {
            const [, roleId, formId, permissionId] = parts
            roleUpdates.push({ roleId, moduleId, formId, permissionId, granted, canDelegate: false })
          } else if (key.startsWith("user-")) {
            const [, userId, formId, permissionId] = parts
            userUpdates.push({
              userId,
              moduleId,
              formId,
              permissionId,
              granted,
              reason: "Manual override",
              isActive: true,
            })
          }
        })

        const promises: Promise<any>[] = []
        if (roleUpdates.length) promises.push(updateRolePerms(roleUpdates).unwrap())
        if (userUpdates.length) promises.push(updateUserPerms(userUpdates).unwrap())

        await Promise.all(promises)

        // Refetch to reflect saved state
        refetchRolePerms()
        refetchUserPerms()
        setChanges(new Map())

        toast({ title: "Permissions saved", description: `${changes.size} change(s) applied.` })
      } catch (err) {
        toast({
          title: "Save failed",
          description: err instanceof Error ? err.message : "Failed to save permissions",
          variant: "destructive",
        })
      } finally {
        setSaving(false)
      }
    },
    [changes, updateRolePerms, updateUserPerms, refetchRolePerms, refetchUserPerms, toast]
  )

  // ─── Derived helpers ──────────────────────────────────────────────────────

  const getUsersForRole = useCallback(
    (roleId: string): PermissionUser[] =>
      users.filter((u) => u.unitAssignments?.some((a) => a.roleId === roleId)),
    [users]
  )

  const getGrantedCountForRole = useCallback(
    (roleId: string, formId: string): number =>
      permissions.filter((p) => hasRolePermission(roleId, formId, p.id)).length,
    [permissions, hasRolePermission]
  )

  const filteredRoles = roles.filter((r) => r.name.toLowerCase() !== "admin")

  return {
    roles,
    users,
    permissions,
    rolePermissions,
    userPermissions,
    loading,
    error,
    changes,
    saving,
    hasChanges: changes.size > 0,
    hasRolePermission,
    hasUserPermission,
    togglePermission,
    resetChanges,
    saveChanges,
    getUsersForRole,
    getGrantedCountForRole,
    filteredRoles,
  }
}
