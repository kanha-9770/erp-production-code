"use client"

import { usePermissions } from "@/lib/permission-context"

interface UseProtectedRouteOptions {
  requireSystemAdmin?: boolean
  requireModuleAccess?: string | string[]
  requireFormAccess?: string | string[]
  requireAction?: "view" | "create" | "edit" | "delete" 
  allowedRoles?: string[]
}

interface ProtectedRouteResult {
  hasAccess: boolean
  isLoading: boolean
  error: string | null
  reason?: string
  missingPermissions?: string[]
  user: any
  isSystemAdmin: boolean
  canAccess: (options: UseProtectedRouteOptions) => boolean
}

export function useProtectedRoute(options: UseProtectedRouteOptions = {}): ProtectedRouteResult {
  const { user, permissions, isLoading, error, isSystemAdmin, hasModuleAccess, hasFormAccess, getAccessibleActions } =
    usePermissions()

  const {
    requireSystemAdmin = false,
    requireModuleAccess,
    requireFormAccess,
    requireAction = "view",
    allowedRoles,
  } = options

  const checkAccess = (checkOptions: UseProtectedRouteOptions = options): boolean => {
    // If still loading, assume no access
    if (isLoading || !user) return false

    // Check system admin requirement
    if (checkOptions.requireSystemAdmin && !isSystemAdmin) return false

    // Check role-based access
    if (checkOptions.allowedRoles && checkOptions.allowedRoles.length > 0) {
      const userRole = user.role?.toLowerCase()
      const hasAllowedRole = checkOptions.allowedRoles.some((role) => role.toLowerCase() === userRole)
      if (!hasAllowedRole && !isSystemAdmin) return false
    }

    // Check module access
    if (checkOptions.requireModuleAccess) {
      const moduleIds = Array.isArray(checkOptions.requireModuleAccess)
        ? checkOptions.requireModuleAccess
        : [checkOptions.requireModuleAccess]

      for (const moduleId of moduleIds) {
        if (!isSystemAdmin && !hasModuleAccess(moduleId)) return false

        // Check action permissions
        if (checkOptions.requireAction && checkOptions.requireAction !== "view" && !isSystemAdmin) {
          const actions = getAccessibleActions(moduleId)
          const hasActionPermission =
            (checkOptions.requireAction === "create" && actions.canAdd) ||
            (checkOptions.requireAction === "edit" && actions.canEdit) ||
            (checkOptions.requireAction === "delete" && actions.canDelete) 

          if (!hasActionPermission) return false
        }
      }
    }

    // Check form access
    if (checkOptions.requireFormAccess) {
      const formIds = Array.isArray(checkOptions.requireFormAccess)
        ? checkOptions.requireFormAccess
        : [checkOptions.requireFormAccess]

      for (const formId of formIds) {
        if (!isSystemAdmin && !hasFormAccess(formId)) return false

        // Check action permissions for forms
        if (checkOptions.requireAction && checkOptions.requireAction !== "view" && !isSystemAdmin) {
          const formPermission = permissions.find((p) => p.resourceType === "form" && p.resourceId === formId)
          const moduleId = formPermission?.resource?.moduleId

          if (moduleId) {
            const actions = getAccessibleActions(moduleId, formId)
            const hasActionPermission =
              (checkOptions.requireAction === "create" && actions.canAdd) ||
              (checkOptions.requireAction === "edit" && actions.canEdit) ||
              (checkOptions.requireAction === "delete" && actions.canDelete)
              
            if (!hasActionPermission) return false
          }
        }
      }
    }

    return true
  }

  const hasAccess = checkAccess()

  return {
    hasAccess,
    isLoading,
    error,
    user,
    isSystemAdmin,
    canAccess: checkAccess,
  }
}
