"use client"

import { useState, useEffect, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import type {
  PermissionRole,
  PermissionUser,
  Permission,
  RolePermission,
  UserPermission,
  PermissionModule,
} from "@/types/permissions"
import { STANDARD_PERMISSIONS } from "@/types/permissions"

// change-map key: "role-{roleId}-{formId}-{permId}" or "user-{userId}-{formId}-{permId}"
type ChangeKey = string

interface PermissionMatrixData {
  roles: PermissionRole[]
  users: PermissionUser[]
  permissions: Permission[]
  rolePermissions: RolePermission[]
  userPermissions: UserPermission[]
}

interface UsePermissionMatrixResult extends PermissionMatrixData {
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

/**
 * Encapsulates all permission data fetching, optimistic change tracking, and save logic
 * for the FormsPermissionMatrix. Accepts selectedForm as a trigger for data loading.
 */
export function usePermissionMatrix(selectedForm: string | null): UsePermissionMatrixResult {
  const { toast } = useToast()

  const [data, setData] = useState<PermissionMatrixData>({
    roles: [],
    users: [],
    permissions: STANDARD_PERMISSIONS,
    rolePermissions: [],
    userPermissions: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changes, setChanges] = useState<Map<ChangeKey, boolean>>(new Map())
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async (formId: string) => {
    setLoading(true)
    setError(null)
    setChanges(new Map())

    try {
      const [rRes, uRes, pRes, rpRes, upRes] = await Promise.all([
        fetch("/api/role").then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/permissions").then((r) => r.json()),
        fetch(`/api/role-permissions?formId=${formId}`).then((r) => r.json()),
        fetch("/api/user-permissions").then((r) => r.json()),
      ])

      setData({
        roles: rRes.success ? rRes.data : [],
        users: uRes.success ? uRes.data : [],
        permissions: pRes.success && pRes.data?.length ? pRes.data : STANDARD_PERMISSIONS,
        rolePermissions: rpRes.success ? rpRes.data : [],
        userPermissions: upRes.success ? upRes.data : [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load permission data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedForm) {
      setLoading(false)
      setError(null)
      return
    }
    fetchData(selectedForm)
  }, [selectedForm, fetchData])

  // ─── Permission lookup helpers ────────────────────────────────────────────

  const hasRolePermission = useCallback(
    (roleId: string, formId: string, permId: string): boolean => {
      const key: ChangeKey = `role-${roleId}-${formId}-${permId}`
      if (changes.has(key)) return changes.get(key)!
      return data.rolePermissions.some(
        (rp) =>
          rp.roleId === roleId &&
          rp.permissionId === permId &&
          (rp.formId ?? null) === (formId ?? null) &&
          rp.granted,
      )
    },
    [changes, data.rolePermissions],
  )

  const hasUserPermission = useCallback(
    (userId: string, formId: string, permId: string): boolean => {
      const key: ChangeKey = `user-${userId}-${formId}-${permId}`
      if (changes.has(key)) return changes.get(key)!

      const direct = data.userPermissions.find(
        (up) =>
          up.userId === userId &&
          up.formId === formId &&
          up.permissionId === permId &&
          up.isActive,
      )
      if (direct) return direct.granted

      // Fall back to the user's role permission
      const roleId = data.users.find((u) => u.id === userId)?.unitAssignments?.[0]?.roleId
      return roleId ? hasRolePermission(roleId, formId, permId) : false
    },
    [changes, data.userPermissions, data.users, hasRolePermission],
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
    [hasRolePermission, hasUserPermission],
  )

  const resetChanges = useCallback(() => setChanges(new Map()), [])

  // ─── Save ─────────────────────────────────────────────────────────────────

  const saveChanges = useCallback(
    async (modules: PermissionModule[], selectedFormId: string) => {
      if (changes.size === 0) return
      setSaving(true)

      try {
        // Resolve moduleId from the selected form
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

        const requests: Promise<Response>[] = []

        if (roleUpdates.length) {
          requests.push(
            fetch("/api/role-permissions", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(roleUpdates),
            }).then((res) => {
              if (!res.ok) throw new Error(`Role permissions update failed: ${res.status}`)
              return res
            }),
          )
        }

        if (userUpdates.length) {
          requests.push(
            fetch("/api/user-permissions", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(userUpdates),
            }).then((res) => {
              if (!res.ok) throw new Error(`User permissions update failed: ${res.status}`)
              return res
            }),
          )
        }

        await Promise.all(requests)

        // Refresh data from server so UI reflects saved state
        await fetchData(selectedFormId)

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
    [changes, fetchData, toast],
  )

  // ─── Derived helpers ──────────────────────────────────────────────────────

  const getUsersForRole = useCallback(
    (roleId: string): PermissionUser[] =>
      data.users.filter((u) => u.unitAssignments?.some((a) => a.roleId === roleId)),
    [data.users],
  )

  const getGrantedCountForRole = useCallback(
    (roleId: string, formId: string): number =>
      data.permissions.filter((p) => hasRolePermission(roleId, formId, p.id)).length,
    [data.permissions, hasRolePermission],
  )

  // Exclude admin role — it always has full access
  const filteredRoles = data.roles.filter((r) => r.name.toLowerCase() !== "admin")

  return {
    ...data,
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
