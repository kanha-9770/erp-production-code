"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  useGetRolesQuery,
  useGetPermissionsQuery,
  useGetSectionRolePermissionsQuery,
  useUpdateSectionRolePermissionsMutation,
} from "@/lib/api/permissions"
import type {
  PermissionRole,
  Permission,
  RolePermission,
} from "@/types/permissions"
import { STANDARD_PERMISSIONS } from "@/types/permissions"

type ChangeKey = string

const EMPTY_ROLES: PermissionRole[] = []
const EMPTY_ROLE_PERMS: RolePermission[] = []

interface UseSectionPermissionMatrixResult {
  roles: PermissionRole[]
  permissions: Permission[]
  rolePermissions: RolePermission[]
  loading: boolean
  error: string | null
  changes: Map<ChangeKey, boolean>
  saving: boolean
  hasChanges: boolean
  hasRolePermission: (roleId: string, sectionId: string, permId: string) => boolean
  togglePermission: (roleId: string, sectionId: string, permId: string) => void
  resetChanges: () => void
  saveChanges: (sectionId: string) => Promise<void>
  getGrantedCountForRole: (roleId: string, sectionId: string) => number
  filteredRoles: PermissionRole[]
}

export function useSectionPermissionMatrix(
  selectedSectionId: string | null
): UseSectionPermissionMatrixResult {
  const { toast } = useToast()
  const [changes, setChanges] = useState<Map<ChangeKey, boolean>>(new Map())
  const [saving, setSaving] = useState(false)

  const changesSectionRef = useRef<string | null>(selectedSectionId)

  // RTK Query hooks
  const {
    data: rolesData,
    isLoading: rolesLoading,
    error: rolesError,
  } = useGetRolesQuery(undefined, { skip: !selectedSectionId })

  const {
    data: permsData,
    isLoading: permsLoading,
  } = useGetPermissionsQuery(undefined, { skip: !selectedSectionId })

  const {
    data: rpData,
    isLoading: rpLoading,
    refetch: refetchSectionRolePerms,
  } = useGetSectionRolePermissionsQuery(
    { sectionId: selectedSectionId! },
    { skip: !selectedSectionId }
  )

  const [updateSectionRolePerms] = useUpdateSectionRolePermissionsMutation()

  // ─── Memoized derived data ────────────────────────────────────────────────

  const roles: PermissionRole[] = useMemo(
    () => (rolesData?.success ? rolesData.data : EMPTY_ROLES),
    [rolesData],
  )

  const permissions: Permission[] = useMemo(
    () => (permsData?.success && permsData.data?.length ? permsData.data : STANDARD_PERMISSIONS),
    [permsData],
  )

  const rolePermissions: RolePermission[] = useMemo(
    () => (rpData?.success ? rpData.data : EMPTY_ROLE_PERMS),
    [rpData],
  )

  const filteredRoles = useMemo(
    () => roles.filter((r) => r.name.toLowerCase() !== "admin"),
    [roles],
  )

  const loading = rolesLoading || permsLoading || rpLoading
  const error = rolesError ? "Failed to load permission data" : null

  // ─── Clear changes when selectedSectionId changes ─────────────────────────

  useEffect(() => {
    changesSectionRef.current = selectedSectionId
    setChanges(new Map())
  }, [selectedSectionId])

  const hasChanges = changes.size > 0 && changesSectionRef.current === selectedSectionId

  // ─── Permission lookup ────────────────────────────────────────────────────

  const hasRolePermission = useCallback(
    (roleId: string, sectionId: string, permId: string): boolean => {
      const key: ChangeKey = `role-${roleId}-${sectionId}-${permId}`
      if (changes.has(key)) return changes.get(key)!
      return rolePermissions.some(
        (rp) =>
          rp.roleId === roleId &&
          rp.permissionId === permId &&
          rp.granted
      )
    },
    [changes, rolePermissions]
  )

  // ─── Toggle ───────────────────────────────────────────────────────────────

  const togglePermission = useCallback(
    (roleId: string, sectionId: string, permId: string) => {
      const key: ChangeKey = `role-${roleId}-${sectionId}-${permId}`

      setChanges((prev) => {
        const next = new Map(prev)

        if (prev.has(key)) {
          next.set(key, !prev.get(key)!)
          return next
        }

        const serverState = rolePermissions.some(
          (rp) => rp.roleId === roleId && rp.permissionId === permId && rp.granted
        )

        next.set(key, !serverState)
        return next
      })
    },
    [rolePermissions]
  )

  const resetChanges = useCallback(() => setChanges(new Map()), [])

  // ─── Save ─────────────────────────────────────────────────────────────────

  const saveChanges = useCallback(
    async (sectionId: string) => {
      if (changes.size === 0) return
      setSaving(true)

      try {
        const roleUpdates: object[] = []

        changes.forEach((granted, key) => {
          const parts = key.split("-")
          // key format: "role-{roleId}-{sectionId}-{permissionId}"
          const [, roleId, secId, permissionId] = parts
          roleUpdates.push({
            roleId,
            sectionId: secId,
            permissionId,
            granted,
            canDelegate: false,
          })
        })

        if (roleUpdates.length) {
          await updateSectionRolePerms(roleUpdates).unwrap()
        }

        await refetchSectionRolePerms()
        setChanges(new Map())

        toast({ title: "Section permissions saved", description: `${changes.size} change(s) applied.` })
      } catch (err) {
        toast({
          title: "Save failed",
          description: err instanceof Error ? err.message : "Failed to save section permissions",
          variant: "destructive",
        })
      } finally {
        setSaving(false)
      }
    },
    [changes, updateSectionRolePerms, refetchSectionRolePerms, toast]
  )

  // ─── Derived helpers ──────────────────────────────────────────────────────

  const getGrantedCountForRole = useCallback(
    (roleId: string, sectionId: string): number =>
      permissions.filter((p) => hasRolePermission(roleId, sectionId, p.id)).length,
    [permissions, hasRolePermission]
  )

  return {
    roles,
    permissions,
    rolePermissions,
    loading,
    error,
    changes,
    saving,
    hasChanges,
    hasRolePermission,
    togglePermission,
    resetChanges,
    saveChanges,
    getGrantedCountForRole,
    filteredRoles,
  }
}
