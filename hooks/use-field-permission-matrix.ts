"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  useGetRolesQuery,
  useGetPermissionsQuery,
  useGetRolePermissionsQuery,
  useGetUserPermissionsQuery,
  useGetSectionRolePermissionsQuery,
  useGetSectionUserPermissionsQuery,
  useGetFieldRolePermissionsQuery,
  useUpdateFieldRolePermissionsMutation,
  useGetFieldUserPermissionsQuery,
  useUpdateFieldUserPermissionsMutation,
} from "@/lib/api/permissions"
import { useGetAdminUsersQuery } from "@/lib/api/users"
import type {
  PermissionRole,
  PermissionUser,
  Permission,
  RolePermission,
  UserPermission,
} from "@/types/permissions"
import { STANDARD_PERMISSIONS } from "@/types/permissions"

const SEP = "::"

type ChangeKey = string

const EMPTY_ROLES: PermissionRole[] = []
const EMPTY_USERS: PermissionUser[] = []
const EMPTY_ROLE_PERMS: RolePermission[] = []
const EMPTY_USER_PERMS: UserPermission[] = []

interface UseFieldPermissionMatrixResult {
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
  hasRolePermission: (roleId: string, fieldId: string, permId: string) => boolean
  hasUserPermission: (userId: string, fieldId: string, permId: string) => boolean
  /** True when the role's checkbox is forced on by a form- or section-level grant. */
  isRoleInherited: (roleId: string, permId: string) => boolean
  /** True when the user's checkbox is forced on by a form- or section-level grant. */
  isUserInherited: (userId: string, permId: string) => boolean
  togglePermission: (
    prefix: "role" | "user",
    id: string,
    fieldId: string,
    permId: string,
  ) => void
  resetChanges: () => void
  saveChanges: (sectionId: string, fieldId: string) => Promise<void>
  getUsersForRole: (roleId: string) => PermissionUser[]
  getGrantedCountForRole: (roleId: string, fieldId: string) => number
  filteredRoles: PermissionRole[]
}

function makeKey(
  prefix: "role" | "user",
  id: string,
  fieldId: string,
  permId: string,
): ChangeKey {
  return `${prefix}${SEP}${id}${SEP}${fieldId}${SEP}${permId}`
}

function parseKey(
  key: string,
): { prefix: "role" | "user"; id: string; fieldId: string; permissionId: string } | null {
  const parts = key.split(SEP)
  if (parts.length !== 4) return null
  const prefix = parts[0] as "role" | "user"
  if (prefix !== "role" && prefix !== "user") return null
  return { prefix, id: parts[1], fieldId: parts[2], permissionId: parts[3] }
}

export function useFieldPermissionMatrix(
  selectedFieldId: string | null,
  sectionId: string | null,
  formId: string | null,
): UseFieldPermissionMatrixResult {
  const { toast } = useToast()
  const [changes, setChanges] = useState<Map<ChangeKey, boolean>>(new Map())
  const [saving, setSaving] = useState(false)

  const changesFieldRef = useRef<string | null>(selectedFieldId)

  const shouldFetch = !!selectedFieldId

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

  const {
    data: rpData,
    isLoading: rpLoading,
    refetch: refetchFieldRolePerms,
  } = useGetFieldRolePermissionsQuery(
    { fieldId: selectedFieldId! },
    { skip: !shouldFetch },
  )

  const {
    data: upData,
    isLoading: upLoading,
    refetch: refetchFieldUserPerms,
  } = useGetFieldUserPermissionsQuery(
    { fieldId: selectedFieldId! },
    { skip: !shouldFetch },
  )

  // Parent (form + section) permissions used as inheritance sources
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

  const {
    data: sectionRpData,
    isLoading: sectionRpLoading,
  } = useGetSectionRolePermissionsQuery(
    { sectionId: sectionId ?? "" },
    { skip: !shouldFetch || !sectionId },
  )

  const {
    data: sectionUpData,
    isLoading: sectionUpLoading,
  } = useGetSectionUserPermissionsQuery(
    { sectionId: sectionId ?? "" },
    { skip: !shouldFetch || !sectionId },
  )

  const [updateFieldRolePerms] = useUpdateFieldRolePermissionsMutation()
  const [updateFieldUserPerms] = useUpdateFieldUserPermissionsMutation()

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

  const formRolePermissions: RolePermission[] = useMemo(
    () => (formRpData?.success ? formRpData.data : EMPTY_ROLE_PERMS),
    [formRpData],
  )

  const formUserPermissions: UserPermission[] = useMemo(
    () => (formUpData?.success ? formUpData.data : EMPTY_USER_PERMS),
    [formUpData],
  )

  const sectionRolePermissions: RolePermission[] = useMemo(
    () => (sectionRpData?.success ? sectionRpData.data : EMPTY_ROLE_PERMS),
    [sectionRpData],
  )

  const sectionUserPermissions: UserPermission[] = useMemo(
    () => (sectionUpData?.success ? sectionUpData.data : EMPTY_USER_PERMS),
    [sectionUpData],
  )

  const filteredRoles = useMemo(
    () => roles.filter((r) => r.name.toLowerCase() !== "admin"),
    [roles],
  )

  const loading =
    rolesLoading ||
    usersLoading ||
    permsLoading ||
    rpLoading ||
    upLoading ||
    formRpLoading ||
    formUpLoading ||
    sectionRpLoading ||
    sectionUpLoading
  const error = rolesError || usersError ? "Failed to load permission data" : null

  useEffect(() => {
    changesFieldRef.current = selectedFieldId
    setChanges(new Map())
  }, [selectedFieldId])

  const hasChanges = changes.size > 0 && changesFieldRef.current === selectedFieldId

  // ── Inheritance helpers (form + section → field) ─────────────────────────
  const isRoleInheritedFromForm = useCallback(
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

  const isRoleInheritedFromSection = useCallback(
    (roleId: string, permId: string): boolean =>
      sectionRolePermissions.some(
        (rp) => rp.roleId === roleId && rp.permissionId === permId && rp.granted,
      ),
    [sectionRolePermissions],
  )

  const isRoleInherited = useCallback(
    (roleId: string, permId: string): boolean =>
      isRoleInheritedFromForm(roleId, permId) || isRoleInheritedFromSection(roleId, permId),
    [isRoleInheritedFromForm, isRoleInheritedFromSection],
  )

  const isUserInherited = useCallback(
    (userId: string, permId: string): boolean => {
      // Direct form-level user override
      const formDirect = formUserPermissions.find(
        (up) =>
          up.userId === userId &&
          up.formId === formId &&
          up.permissionId === permId &&
          up.isActive &&
          !(up as any).resourceType,
      )
      if (formDirect) return formDirect.granted

      // Direct section-level user override
      const sectionDirect = sectionUserPermissions.find(
        (up) => up.userId === userId && up.permissionId === permId && up.isActive,
      )
      if (sectionDirect) return sectionDirect.granted

      // Via any of the user's roles at form or section level
      const userRoleIds =
        users.find((u) => u.id === userId)?.unitAssignments?.map((a) => a.roleId) ?? []
      return userRoleIds.some((rid) => isRoleInherited(rid, permId))
    },
    [formUserPermissions, sectionUserPermissions, formId, users, isRoleInherited],
  )

  // ── Server-effective lookups (no change buffer) ──────────────────────────
  // Most specific explicit row wins: field row > section row > form inherit.
  // An explicit granted:false at any level overrides a higher-level grant.
  const serverRoleEffective = useCallback(
    (roleId: string, permId: string): boolean => {
      // Field row (most specific)
      const fieldExplicit = rolePermissions.find(
        (rp) => rp.roleId === roleId && rp.permissionId === permId,
      )
      if (fieldExplicit) return fieldExplicit.granted

      // Section row
      const sectionExplicit = sectionRolePermissions.find(
        (rp) => rp.roleId === roleId && rp.permissionId === permId,
      )
      if (sectionExplicit) return sectionExplicit.granted

      // Form inherit
      return isRoleInheritedFromForm(roleId, permId)
    },
    [rolePermissions, sectionRolePermissions, isRoleInheritedFromForm],
  )

  const serverUserEffective = useCallback(
    (userId: string, permId: string): boolean => {
      // Field user row
      const fieldDirect = userPermissions.find(
        (up) => up.userId === userId && up.permissionId === permId && up.isActive,
      )
      if (fieldDirect) return fieldDirect.granted

      // Section user row
      const sectionDirect = sectionUserPermissions.find(
        (up) => up.userId === userId && up.permissionId === permId && up.isActive,
      )
      if (sectionDirect) return sectionDirect.granted

      // Form user row
      const formDirect = formUserPermissions.find(
        (up) =>
          up.userId === userId &&
          up.formId === formId &&
          up.permissionId === permId &&
          up.isActive &&
          !(up as any).resourceType,
      )
      if (formDirect) return formDirect.granted

      // Fall back through user's roles
      const userRoleIds =
        users.find((u) => u.id === userId)?.unitAssignments?.map((a) => a.roleId) ?? []
      return userRoleIds.some((rid) => serverRoleEffective(rid, permId))
    },
    [
      userPermissions,
      sectionUserPermissions,
      formUserPermissions,
      formId,
      users,
      serverRoleEffective,
    ],
  )

  // ── Effective permission used by the UI ──────────────────────────────────
  const hasRolePermission = useCallback(
    (roleId: string, fieldId: string, permId: string): boolean => {
      const key = makeKey("role", roleId, fieldId, permId)
      if (changes.has(key)) return changes.get(key)!
      return serverRoleEffective(roleId, permId)
    },
    [changes, serverRoleEffective],
  )

  const hasUserPermission = useCallback(
    (userId: string, fieldId: string, permId: string): boolean => {
      const key = makeKey("user", userId, fieldId, permId)
      if (changes.has(key)) return changes.get(key)!
      return serverUserEffective(userId, permId)
    },
    [changes, serverUserEffective],
  )

  const togglePermission = useCallback(
    (prefix: "role" | "user", id: string, fieldId: string, permId: string) => {
      const key = makeKey(prefix, id, fieldId, permId)

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
    async (savedSectionId: string, fieldId: string) => {
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
              sectionId: savedSectionId,
              fieldId: parsed.fieldId,
              permissionId: parsed.permissionId,
              granted,
            })
          } else {
            userUpdates.push({
              userId: parsed.id,
              fieldId: parsed.fieldId,
              permissionId: parsed.permissionId,
              granted,
            })
          }
        })

        const promises: Promise<any>[] = []
        if (roleUpdates.length) promises.push(updateFieldRolePerms(roleUpdates).unwrap())
        if (userUpdates.length) promises.push(updateFieldUserPerms(userUpdates).unwrap())

        await Promise.all(promises)
        await Promise.all([refetchFieldRolePerms(), refetchFieldUserPerms()])
        setChanges(new Map())

        toast({
          title: "Field permissions saved",
          description: `${changes.size} change(s) applied.`,
        })
      } catch (err) {
        console.error("[useFieldPermissionMatrix] Save failed:", err)
        toast({
          title: "Save failed",
          description: err instanceof Error ? err.message : "Failed to save field permissions",
          variant: "destructive",
        })
      } finally {
        setSaving(false)
      }
    },
    [
      changes,
      updateFieldRolePerms,
      updateFieldUserPerms,
      refetchFieldRolePerms,
      refetchFieldUserPerms,
      toast,
    ],
  )

  const getUsersForRole = useCallback(
    (roleId: string): PermissionUser[] =>
      users.filter((u) => u.unitAssignments?.some((a) => a.roleId === roleId)),
    [users],
  )

  const getGrantedCountForRole = useCallback(
    (roleId: string, fieldId: string): number =>
      permissions.filter((p) => hasRolePermission(roleId, fieldId, p.id)).length,
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
