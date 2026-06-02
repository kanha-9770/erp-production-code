"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useGetUserQuery } from "@/lib/api/auth"

export interface RolePermission {
  id: string
  roleId: string
  permissionId: string
  moduleId: string | null
  formId: string | null
  pagePath?: string | null
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
  pagePath?: string | null
  resourceType: string | null
  resourceId: string | null
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
  hasPermission: (permissionName: string, moduleId?: string | null, formId?: string | null, pagePath?: string | null) => boolean
  hasAnyPermission: (permissionNames: string[], moduleId?: string | null, formId?: string | null, pagePath?: string | null) => boolean
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

  // Stable array of role IDs derived from the user object.
  //
  // ── Why this is written so carefully ─────────────────────────────────────
  // The naive `user?.unitAssignments || []` returns a brand-new `[]` on
  // every render when `user` (or `unitAssignments`) is null/undefined,
  // because `||` evaluates its right-hand side every time. Feeding that
  // into the `useMemo` below — and then into the effect's dep array —
  // makes the effect re-fire on every render, which in turn calls
  // `setPermissions([]) / setUserPermissions([])` with fresh empty-array
  // references on every render, triggering a re-render, and so on. That's
  // the "Maximum update depth exceeded" loop we hit on /real-estate/my-team
  // after creating an invite: the createInvite mutation churned the redux
  // store enough that this unstable-reference cascade compounded over
  // React's update-depth limit.
  //
  // The fix: derive `roleIds` from `user` directly, sort the ids so a
  // re-ordered (but equal) assignments list doesn't produce a different
  // key, and key the effect on the joined string instead of the array
  // reference.
  const roleIds = useMemo<string[]>(() => {
    const ids = (user?.unitAssignments ?? []).map((ua) => ua.role.id)
    return Array.from(new Set(ids)).sort()
  }, [user])
  const roleIdsKey = roleIds.join(",")
  const userId = user?.id ?? null

  // Fetch role permissions AND user-level permissions in parallel
  useEffect(() => {
    if (userLoading) return

    // Admin (or signed-out) → clear permissions. Use the functional form
    // and bail out when state is already empty, so we don't push a fresh
    // `[]` reference into state on every effect run.
    if (!user || isAdmin) {
      setPermissions((prev) => (prev.length === 0 ? prev : []))
      setUserPermissions((prev) => (prev.length === 0 ? prev : []))
      setPermissionsLoading(false)
      return
    }

    let cancelled = false
    setPermissionsLoading(true)

    const fetchAll = async () => {
      try {
        // ── PERFORMANCE: one batched role-permissions call ──────────────────
        // Old behaviour: Promise.all of N fetches, one per role. For a user
        // with 5 roles that's 5 separate round-trips even though they were
        // started concurrently — Upstash routing + TLS handshake repeated N
        // times. New behaviour: pass roleIds=a,b,c as a single CSV param;
        // the backend uses `roleId IN (...)` and returns everything in one
        // payload. Single request, single round-trip.
        const roleIdsCsv = roleIds.join(",")
        const [roleRes, userPermsRes] = await Promise.all([
          roleIds.length > 0
            ? fetch(`/api/role-permissions?roleIds=${encodeURIComponent(roleIdsCsv)}`, {
                credentials: "include",
              })
                .then((res) => (res.ok ? res.json() : { success: false, data: [] }))
                .catch(() => ({ success: false, data: [] }))
            : Promise.resolve({ success: true, data: [] as RolePermission[] }),
          fetch(`/api/user-permissions?userId=${user.id}`, { credentials: "include" })
            .then((res) => (res.ok ? res.json() : { success: false, data: [] }))
            .catch(() => ({ success: false, data: [] })),
        ])

        if (!cancelled) {
          const allRolePerms: RolePermission[] =
            roleRes && roleRes.success && Array.isArray(roleRes.data) ? roleRes.data : []
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
    // ── Deps are intentionally NOT [user, ..., roleIds] ──────────────────
    // `user` is a new object reference on every redux re-render even when
    // contents are identical, and `roleIds` is a new array reference each
    // time `useMemo` re-evaluates. Keying on the stable primitive `userId`
    // and the joined-string `roleIdsKey` means the effect only refires
    // when the *content* actually changes — which is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userLoading, isAdmin, roleIdsKey])

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

      // Static-page scope — gated exactly like a module's VIEW permission,
      // keyed on the page's path so it never collides with module/form keys.
      if (perm.pagePath) {
        const pageKey = `${permName}:page:${perm.pagePath}`
        if (!map.has(pageKey)) map.set(pageKey, perm)
      }
    }

    // 2. User-level permissions (override role-level)
    for (const up of userPermissions) {
      // Skip section/field scoped rows — they are enforced by a separate
      // layer (record/field visibility). Including them here would let a
      // field-level deny poison the global form-level permission map.
      if (up.resourceType === "section" || up.resourceType === "field") continue

      const flagPerms: { name: string; granted: boolean }[] = []

      // Permission-tied row (the matrix UI saves these): one row affects ONE
      // permission name with the row's `granted` value. Do NOT also apply the
      // can* flags here — those default to false in the schema and would
      // incorrectly deny VIEW/CREATE/EDIT/DELETE at this scope.
      if (up.permission && up.permissionId) {
        flagPerms.push({ name: up.permission.name.toLowerCase(), granted: up.granted })
      } else {
        // Legacy / flag-based row (no permissionId): use the can* booleans.
        flagPerms.push(
          { name: "view", granted: up.canView },
          { name: "create", granted: up.canCreate },
          { name: "edit", granted: up.canEdit },
          { name: "delete", granted: up.canDelete },
        )
      }

      for (const { name: permName, granted } of flagPerms) {
        if (granted) {
          // Granted user override propagates to all applicable scope keys so
          // hasPermission lookups at any scope find the grant.
          const keys: string[] = up.pagePath ? [] : [permName]
          if (up.moduleId) keys.push(`${permName}:${up.moduleId}`)
          if (up.moduleId && up.formId) keys.push(`${permName}:${up.moduleId}:${up.formId}`)
          if (up.formId) keys.push(`${permName}::${up.formId}`)
          if (up.pagePath) keys.push(`${permName}:page:${up.pagePath}`)

          for (const key of keys) {
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
          }
        } else {
          // Denied user override: only deny at the EXACT scope of this row.
          // A form-specific deny must NOT remove a sibling form's role grant
          // recorded at the broader module-wide key.
          const denyKeys: string[] = []
          if (up.moduleId && up.formId) {
            denyKeys.push(`${permName}:${up.moduleId}:${up.formId}`)
            denyKeys.push(`${permName}::${up.formId}`)
          } else if (up.moduleId) {
            denyKeys.push(`${permName}:${up.moduleId}`)
          } else if (up.formId) {
            denyKeys.push(`${permName}::${up.formId}`)
          } else if (up.pagePath) {
            // Page-specific deny — only this page, never a global deny.
            denyKeys.push(`${permName}:page:${up.pagePath}`)
          } else {
            denyKeys.push(permName)
          }

          for (const key of denyKeys) {
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
    (permissionName: string, moduleId?: string | null, formId?: string | null, pagePath?: string | null): boolean => {
      if (isAdmin) return true
      const permName = permissionName.toLowerCase()
      const denied = (permissionMap as any).__denied as Set<string> | undefined

      // Static-page scope — checked first (most specific). A page deny wins;
      // a page grant returns true. Otherwise fall through to a global grant.
      if (pagePath) {
        const pageKey = `${permName}:page:${pagePath}`
        if (denied?.has(pageKey)) return false
        if (permissionMap.has(pageKey)) return true
      }

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
    (permissionNames: string[], moduleId?: string | null, formId?: string | null, pagePath?: string | null): boolean => {
      if (isAdmin) return true
      return permissionNames.some((name) => hasPermission(name, moduleId, formId, pagePath))
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
