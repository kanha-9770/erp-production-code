"use client"

import { useMemo } from "react"
import { useGetAdminPermissionsQuery } from "@/lib/api/permissions"

// ─── Public API ──────────────────────────────────────────────────────────────

export interface FormPermissions {
  /** All raw permission items returned by the backend */
  permissions: PermissionEntry[]
  /** True when the user holds an admin role */
  isAdmin: boolean
  /** True while the permission query is in-flight */
  loading: boolean
  /** Non-null when the query failed */
  error: string | null

  // ── Convenience booleans (admin always gets true) ───────────────────────
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean

  /** Generic check — `hasPermission("EXPORT")` */
  hasPermission: (permName: string) => boolean
}

interface PermissionEntry {
  id: string
  name: string
  category: string
  resource: string
  source?: string
  module?: { id: string; name: string }
  form?: { id: string; name: string }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Lightweight, reusable hook that answers "can the current user VIEW / CREATE /
 * EDIT / DELETE this form?" — usable in any component with just a formId.
 *
 * Backed by the same `/api/admin/permissions` endpoint the module page already
 * uses, so the data shape is identical and RTK Query deduplicates concurrent
 * calls for the same formId.
 *
 * @param formId  The form to check permissions for.  Pass `null` / `undefined`
 *                to skip the query (e.g. while the form hasn't been selected).
 *
 * @example
 * ```tsx
 * const { canEdit, canDelete, loading } = useFormPermissions(form.id)
 * ```
 */
export function useFormPermissions(formId: string | null | undefined): FormPermissions {
  const {
    data,
    isLoading,
    error: queryError,
  } = useGetAdminPermissionsQuery(
    { formId: formId ?? undefined },
    { skip: !formId },
  )

  const permissions: PermissionEntry[] = useMemo(() => {
    if (!data?.success || !data.data) return []
    return (data.data.permissions ?? []) as PermissionEntry[]
  }, [data])

  const isAdmin: boolean = data?.success ? (data.data?.isAdmin ?? false) : false

  // Check whether the user holds a specific named permission for this form.
  // Admin bypasses all checks.
  const hasPermission = useMemo(() => {
    return (permName: string): boolean => {
      if (isAdmin) return true
      return permissions.some(
        (p) =>
          p.name === permName &&
          p.resource === "form" &&
          // Match if the permission is form-specific or module-wide (form.id empty)
          (p.form?.id === formId || !p.form?.id || p.form.id === ""),
      )
    }
  }, [permissions, isAdmin, formId])

  const canView = useMemo(() => hasPermission("VIEW"), [hasPermission])
  const canCreate = useMemo(() => hasPermission("CREATE"), [hasPermission])
  const canEdit = useMemo(() => hasPermission("EDIT"), [hasPermission])
  const canDelete = useMemo(() => hasPermission("DELETE"), [hasPermission])

  return {
    permissions,
    isAdmin,
    loading: isLoading,
    error: queryError ? "Failed to load permissions" : null,
    canView,
    canCreate,
    canEdit,
    canDelete,
    hasPermission,
  }
}
