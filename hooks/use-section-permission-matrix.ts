"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  useGetRolesQuery,
  useGetPermissionsQuery,
  useGetRolePermissionsQuery,
  useGetUserPermissionsQuery,
  useGetSectionRolePermissionsQuery,
  useUpdateSectionRolePermissionsMutation,
  useGetSectionUserPermissionsQuery,
  useUpdateSectionUserPermissionsMutation,
} from "@/lib/api/permissions"
import { useGetAdminUsersQuery } from "@/lib/api/users"
import type {
  PermissionRole,
  PermissionUser,
  Permission,
  RolePermission,
  UserPermission,
} from "@/types/permissions"
import { STANDARD_PERMISSIONS, FORM_ONLY_PERMISSIONS } from "@/types/permissions"

const SEP = "::"

type ChangeKey = string

const EMPTY_ROLES: PermissionRole[] = []
const EMPTY_USERS: PermissionUser[] = []
const EMPTY_ROLE_PERMS: RolePermission[] = []
const EMPTY_USER_PERMS: UserPermission[] = []

interface UseSectionPermissionMatrixResult {
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
  hasRolePermission: (roleId: string, sectionId: string, permId: string) => boolean
  hasUserPermission: (userId: string, sectionId: string, permId: string) => boolean
  /** True when the role's checkbox is forced on by a form-level grant. */
  isRoleInherited: (roleId: string, permId: string) => boolean
  /** True when the user's checkbox is forced on by a form-level grant (direct or via role). */
  isUserInherited: (userId: string, permId: string) => boolean
  togglePermission: (
    prefix: "role" | "user",
    id: string,
    sectionId: string,
    permId: string,
  ) => void
  resetChanges: () => void
  saveChanges: (sectionId: string) => Promise<void>
  getUsersForRole: (roleId: string) => PermissionUser[]
  getGrantedCountForRole: (roleId: string, sectionId: string) => number
  filteredRoles: PermissionRole[]
}

function makeKey(
  prefix: "role" | "user",
  id: string,
  sectionId: string,
  permId: string,
): ChangeKey {
  return `${prefix}${SEP}${id}${SEP}${sectionId}${SEP}${permId}`
}

function parseKey(
  key: string,
): { prefix: "role" | "user"; id: string; sectionId: string; permissionId: string } | null {
  const parts = key.split(SEP)
  if (parts.length !== 4) return null
  const prefix = parts[0] as "role" | "user"
  if (prefix !== "role" && prefix !== "user") return null
  return { prefix, id: parts[1], sectionId: parts[2], permissionId: parts[3] }
}

export function useSectionPermissionMatrix(
  selectedSectionId: string | null,
  formId: string | null,
): UseSectionPermissionMatrixResult {
  const { toast } = useToast()
  const [changes, setChanges] = useState<Map<ChangeKey, boolean>>(new Map())
  const [saving, setSaving] = useState(false)

  const changesSectionRef = useRef<string | null>(selectedSectionId)

  const shouldFetch = !!selectedSectionId

  const {
    data: rolesData,
    isLoading: rolesLoading,
    error: rolesError,
  } = useGetRolesQuery(undefined, { skip: !shouldFetch })

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
  } = useGetAdminUsersQuery(undefined, { skip: !shouldFetch })

  const {
    data: permsData,
    isLoading: permsLoading,
  } = useGetPermissionsQuery(undefined, { skip: !shouldFetch })

  // Section-level explicit permissions
  const {
    data: rpData,
    isLoading: rpLoading,
    refetch: refetchSectionRolePerms,
  } = useGetSectionRolePermissionsQuery(
    { sectionId: selectedSectionId! },
    { skip: !shouldFetch },
  )

  const {
    data: upData,
    isLoading: upLoading,
    refetch: refetchSectionUserPerms,
  } = useGetSectionUserPermissionsQuery(
    { sectionId: selectedSectionId! },
    { skip: !shouldFetch },
  )

  // Form-level permissions used as inheritance source
  const {
    data: formRpData,
    isLoading: formRpLoading,
  } = useGetRolePermissionsQuery(
    { formId: formId ?? undefined },
    { skip: !shouldFetch || !formId },
  )

  const {
    data: formUpData,
    isLoading: formUpLoading,
  } = useGetUserPermissionsQuery(undefined, { skip: !shouldFetch || !formId })

  const [updateSectionRolePerms] = useUpdateSectionRolePermissionsMutation()
  const [updateSectionUserPerms] = useUpdateSectionUserPermissionsMutation()

  const roles: PermissionRole[] = useMemo(
    () => (rolesData?.success ? rolesData.data : EMPTY_ROLES),
    [rolesData],
  )

  const users: PermissionUser[] = useMemo(() => {
    if (!usersData?.success) return EMPTY_USERS
    return usersData.data as unknown as PermissionUser[]
  }, [usersData])

  const permissions: Permission[] = useMemo(() => {
    const base: Permission[] =
      permsData?.success && permsData.data?.length
        ? permsData.data
        : STANDARD_PERMISSIONS
    // Section-level matrix hides form-only permissions (IMPORT/EXPORT/PRINT).
    return base.filter((p) => !FORM_ONLY_PERMISSIONS.has((p.name || "").toUpperCase()))
  }, [permsData])

  const rolePermissions: RolePermission[] = useMemo(
    () => (rpData?.success ? rpData.data : EMPTY_ROLE_PERMS),
    [rpData],
  )

  const userPermissions: UserPermission[] = useMemo(
    () => (upData?.success ? upData.data : EMPTY_USER_PERMS),
    [upData],
  )

  const formRolePermissions: RolePermission[] = useMemo(
    () => (formRpData?.success ? formRpData.data : EMPTY_ROLE_PERMS),
    [formRpData],
  )

  const formUserPermissions: UserPermission[] = useMemo(
    () => (formUpData?.success ? formUpData.data : EMPTY_USER_PERMS),
    [formUpData],
  )

  const filteredRoles = useMemo(
    () => roles.filter((r) => r.name.toLowerCase() !== "admin"),
    [roles],
  )

  const loading =
    rolesLoading || usersLoading || permsLoading || rpLoading || upLoading || formRpLoading || formUpLoading
  const error = rolesError || usersError ? "Failed to load permission data" : null

  useEffect(() => {
    changesSectionRef.current = selectedSectionId
    setChanges(new Map())
  }, [selectedSectionId])

  const hasChanges = changes.size > 0 && changesSectionRef.current === selectedSectionId

  // ── Inheritance helpers (form → section) ─────────────────────────────────
  const isRoleInherited = useCallback(
    (roleId: string, permId: string): boolean =>
      formRolePermissions.some(
        (rp) =>
          rp.roleId === roleId &&
          rp.permissionId === permId &&
          rp.granted &&
          rp.formId === formId &&
          !rp.sectionId &&
          !(rp as any).formFieldId,
      ),
    [formRolePermissions, formId],
  )

  const isUserInherited = useCallback(
    (userId: string, permId: string): boolean => {
      // Direct form-level user override
      const direct = formUserPermissions.find(
        (up) =>
          up.userId === userId &&
          up.formId === formId &&
          up.permissionId === permId &&
          up.isActive &&
          !(up as any).resourceType,
      )
      if (direct) return direct.granted

      // Via any of the user's roles at form level
      const userRoleIds =
        users.find((u) => u.id === userId)?.unitAssignments?.map((a) => a.roleId) ?? []
      return userRoleIds.some((rid) => isRoleInherited(rid, permId))
    },
    [formUserPermissions, formId, users, isRoleInherited],
  )

  // ── Server-effective lookups (no change buffer) ──────────────────────────
  // Most specific explicit row wins. An explicit section row with granted:false
  // overrides an inherited form-level grant. If no section row exists, inherit
  // from form.
  const serverRoleEffective = useCallback(
    (roleId: string, permId: string): boolean => {
      const explicit = rolePermissions.find(
        (rp) => rp.roleId === roleId && rp.permissionId === permId,
      )
      if (explicit) return explicit.granted
      return isRoleInherited(roleId, permId)
    },
    [rolePermissions, isRoleInherited],
  )

  const serverUserEffective = useCallback(
    (userId: string, permId: string): boolean => {
      const sectionDirect = userPermissions.find(
        (up) => up.userId === userId && up.permissionId === permId && up.isActive,
      )
      if (sectionDirect) return sectionDirect.granted

      const formDirect = formUserPermissions.find(
        (up) =>
          up.userId === userId &&
          up.formId === formId &&
          up.permissionId === permId &&
          up.isActive &&
          !(up as any).resourceType,
      )
      if (formDirect) return formDirect.granted

      const userRoleIds =
        users.find((u) => u.id === userId)?.unitAssignments?.map((a) => a.roleId) ?? []
      return userRoleIds.some((rid) => serverRoleEffective(rid, permId))
    },
    [userPermissions, formUserPermissions, formId, users, serverRoleEffective],
  )

  // ── Effective permission used by the UI (pending buffer first) ───────────
  const hasRolePermission = useCallback(
    (roleId: string, sectionId: string, permId: string): boolean => {
      const key = makeKey("role", roleId, sectionId, permId)
      if (changes.has(key)) return changes.get(key)!
      return serverRoleEffective(roleId, permId)
    },
    [changes, serverRoleEffective],
  )

  const hasUserPermission = useCallback(
    (userId: string, sectionId: string, permId: string): boolean => {
      const key = makeKey("user", userId, sectionId, permId)
      if (changes.has(key)) return changes.get(key)!
      return serverUserEffective(userId, permId)
    },
    [changes, serverUserEffective],
  )

  const togglePermission = useCallback(
    (prefix: "role" | "user", id: string, sectionId: string, permId: string) => {
      const key = makeKey(prefix, id, sectionId, permId)

      setChanges((prev) => {
        const next = new Map(prev)

        if (prev.has(key)) {
          next.set(key, !prev.get(key)!)
          return next
        }

        const serverState =
          prefix === "role"
            ? serverRoleEffective(id, permId)
            : serverUserEffective(id, permId)

        next.set(key, !serverState)
        return next
      })
    },
    [serverRoleEffective, serverUserEffective],
  )

  const resetChanges = useCallback(() => setChanges(new Map()), [])

  const saveChanges = useCallback(
    async (sectionId: string) => {
      if (changes.size === 0) return
      setSaving(true)

      try {
        const roleUpdates: object[] = []
        const userUpdates: object[] = []

        changes.forEach((granted, key) => {
          const parsed = parseKey(key)
          if (!parsed) return
          if (parsed.prefix === "role") {
            roleUpdates.push({
              roleId: parsed.id,
              sectionId: parsed.sectionId,
              permissionId: parsed.permissionId,
              granted,
            })
          } else {
            userUpdates.push({
              userId: parsed.id,
              sectionId: parsed.sectionId,
              permissionId: parsed.permissionId,
              granted,
            })
          }
        })

        const promises: Promise<any>[] = []
        if (roleUpdates.length) promises.push(updateSectionRolePerms(roleUpdates).unwrap())
        if (userUpdates.length) promises.push(updateSectionUserPerms(userUpdates).unwrap())

        await Promise.all(promises)
        await Promise.all([refetchSectionRolePerms(), refetchSectionUserPerms()])
        setChanges(new Map())

        toast({
          title: "Section permissions saved",
          description: `${changes.size} change(s) applied.`,
        })
      } catch (err: any) {
        console.error("[useSectionPermissionMatrix] Save failed:", err)
        toast({
          title: "Save failed",
          // RTK Query rejections are { status, data } objects, not Error instances.
          description:
            err?.data?.error ||
            err?.data?.details ||
            err?.data?.message ||
            err?.error ||
            (err instanceof Error ? err.message : null) ||
            "Failed to save section permissions",
          variant: "destructive",
        })
      } finally {
        setSaving(false)
      }
    },
    [
      changes,
      updateSectionRolePerms,
      updateSectionUserPerms,
      refetchSectionRolePerms,
      refetchSectionUserPerms,
      toast,
    ],
  )

  const getUsersForRole = useCallback(
    (roleId: string): PermissionUser[] =>
      users.filter((u) => u.unitAssignments?.some((a) => a.roleId === roleId)),
    [users],
  )

  const getGrantedCountForRole = useCallback(
    (roleId: string, sectionId: string): number =>
      permissions.filter((p) => hasRolePermission(roleId, sectionId, p.id)).length,
    [permissions, hasRolePermission],
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
    isRoleInherited,
    isUserInherited,
    togglePermission,
    resetChanges,
    saveChanges,
    getUsersForRole,
    getGrantedCountForRole,
    filteredRoles,
  }
}
