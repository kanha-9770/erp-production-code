"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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

// Use "::" separator so IDs never collide with the delimiter
const SEP = "::"

type ChangeKey = string

function makeKey(prefix: "role" | "user", id: string, formId: string, permId: string): ChangeKey {
  return `${prefix}${SEP}${id}${SEP}${formId}${SEP}${permId}`
}

function parseKey(key: string): { prefix: "role" | "user"; id: string; formId: string; permissionId: string } | null {
  const parts = key.split(SEP)
  if (parts.length !== 4) return null
  const prefix = parts[0] as "role" | "user"
  if (prefix !== "role" && prefix !== "user") return null
  return { prefix, id: parts[1], formId: parts[2], permissionId: parts[3] }
}

const EMPTY_ROLES: PermissionRole[] = []
const EMPTY_USERS: PermissionUser[] = []
const EMPTY_ROLE_PERMS: RolePermission[] = []
const EMPTY_USER_PERMS: UserPermission[] = []

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

  const changesFormRef = useRef<string | null>(selectedForm)

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

  // ─── Memoized derived data ────────────────────────────────────────────────

  const roles: PermissionRole[] = useMemo(
    () => (rolesData?.success ? rolesData.data : EMPTY_ROLES),
    [rolesData],
  )

  const users: PermissionUser[] = useMemo(() => {
    if (!usersData?.success) return EMPTY_USERS
    return usersData.data as unknown as PermissionUser[]
  }, [usersData])

  const permissions: Permission[] = useMemo(
    () => (permsData?.success && permsData.data?.length ? permsData.data : STANDARD_PERMISSIONS),
    [permsData],
  )

  const rolePermissions: RolePermission[] = useMemo(
    () => (rpData?.success ? rpData.data : EMPTY_ROLE_PERMS),
    [rpData],
  )

  const userPermissions: UserPermission[] = useMemo(
    () => (upData?.success ? upData.data : EMPTY_USER_PERMS),
    [upData],
  )

  const filteredRoles = useMemo(
    () => roles.filter((r) => r.name.toLowerCase() !== "admin"),
    [roles],
  )

  const loading = rolesLoading || usersLoading || permsLoading || rpLoading || upLoading
  const error = (rolesError || usersError) ? "Failed to load permission data" : null

  // ─── Clear changes when selectedForm changes ─────────────────────────────

  useEffect(() => {
    changesFormRef.current = selectedForm
    setChanges(new Map())
  }, [selectedForm])

  const hasChanges = changes.size > 0 && changesFormRef.current === selectedForm

  // ─── Permission lookup helpers ────────────────────────────────────────────

  const hasRolePermission = useCallback(
    (roleId: string, formId: string, permId: string): boolean => {
      const key = makeKey("role", roleId, formId, permId)
      if (changes.has(key)) return changes.get(key)!
      // The API already filters by formId, so rolePermissions only contains
      // records for the selected form.
      return rolePermissions.some(
        (rp) =>
          rp.roleId === roleId &&
          rp.permissionId === permId &&
          rp.granted
      )
    },
    [changes, rolePermissions]
  )

  const hasUserPermission = useCallback(
    (userId: string, formId: string, permId: string): boolean => {
      const key = makeKey("user", userId, formId, permId)
      if (changes.has(key)) return changes.get(key)!

      const direct = userPermissions.find(
        (up) =>
          up.userId === userId &&
          up.formId === formId &&
          up.permissionId === permId &&
          up.isActive
      )
      if (direct) return direct.granted

      const userRoleIds =
        users.find((u) => u.id === userId)?.unitAssignments?.map((a) => a.roleId) ?? []
      return userRoleIds.some((rid) => hasRolePermission(rid, formId, permId))
    },
    [changes, userPermissions, users, hasRolePermission]
  )

  // ─── Toggle ─────────────────────────────────────────────────────────────

  const togglePermission = useCallback(
    (prefix: "role" | "user", id: string, formId: string, permId: string) => {
      const key = makeKey(prefix, id, formId, permId)

      setChanges((prev) => {
        const next = new Map(prev)

        if (prev.has(key)) {
          next.set(key, !prev.get(key)!)
          return next
        }

        let serverState: boolean

        if (prefix === "role") {
          serverState = rolePermissions.some(
            (rp) => rp.roleId === id && rp.permissionId === permId && rp.granted
          )
        } else {
          const directUp = userPermissions.find(
            (up) =>
              up.userId === id &&
              up.formId === formId &&
              up.permissionId === permId &&
              up.isActive
          )
          if (directUp) {
            serverState = directUp.granted
          } else {
            const userRoleIds =
              users.find((u) => u.id === id)?.unitAssignments?.map((a) => a.roleId) ?? []
            serverState = userRoleIds.some((rid) => {
              const roleKey = makeKey("role", rid, formId, permId)
              if (prev.has(roleKey)) return prev.get(roleKey)!
              return rolePermissions.some(
                (rp) => rp.roleId === rid && rp.permissionId === permId && rp.granted
              )
            })
          }
        }

        next.set(key, !serverState)
        return next
      })
    },
    [rolePermissions, userPermissions, users]
  )

  const resetChanges = useCallback(() => setChanges(new Map()), [])

  // ─── Save ─────────────────────────────────────────────────────────────────

  const saveChanges = useCallback(
    async (modules: PermissionModule[], selectedFormId: string) => {
      if (changes.size === 0) return
      setSaving(true)

      try {
        // Find the moduleId for the selected form. Walk the full tree —
        // forms can live under deeply nested submodules and the row must be
        // saved with moduleId set (computeRouteMeta and the modules-permission
        // query both rely on it; a null moduleId silently strips the module
        // from the user's accessible list).
        const findOwningModuleId = (
          nodes: PermissionModule[],
          formId: string,
        ): string | null => {
          for (const node of nodes) {
            if (node.forms?.some((f) => f.id === formId)) return node.id
            if (node.children?.length) {
              const found = findOwningModuleId(node.children, formId)
              if (found) return found
            }
          }
          return null
        }

        const moduleId = findOwningModuleId(modules, selectedFormId)

        const roleUpdates: object[] = []
        const userUpdates: object[] = []

        changes.forEach((granted, key) => {
          const parsed = parseKey(key)
          if (!parsed) return

          if (parsed.prefix === "role") {
            roleUpdates.push({
              roleId: parsed.id,
              moduleId,
              formId: parsed.formId,
              permissionId: parsed.permissionId,
              granted,
              canDelegate: false,
            })
          } else {
            userUpdates.push({
              userId: parsed.id,
              moduleId,
              formId: parsed.formId,
              permissionId: parsed.permissionId,
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
        await Promise.all([refetchRolePerms(), refetchUserPerms()])
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
    hasChanges,
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
