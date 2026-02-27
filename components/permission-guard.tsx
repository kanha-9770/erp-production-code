"use client"

import { usePermissions } from "@/lib/permission-context"
import type { ReactNode } from "react"

interface PermissionGuardProps {
  children: ReactNode
  moduleId?: string
  formId?: string
  action?: "view" | "create" | "edit" | "delete"
  fallback?: ReactNode
  requireAll?: boolean
}

export function PermissionGuard({
  children,
  moduleId,
  formId,
  action = "view",
  fallback = null,
  requireAll = false,
}: PermissionGuardProps) {
  const { user, isSystemAdmin, hasModuleAccess, hasFormAccess, getAccessibleActions } = usePermissions()

  // If no user is logged in, deny access
  if (!user) {
    return <>{fallback}</>
  }

  // System admin has access to everything
  if (isSystemAdmin) {
    return <>{children}</>
  }

  // Check permissions based on what's provided
  let hasPermission = false

  if (formId && moduleId) {
    // Check form-specific permission
    const actions = getAccessibleActions(moduleId, formId)
    switch (action) {
      case "view":
        hasPermission = actions.canView
        break
      case "create":
        hasPermission = actions.canAdd
        break
      case "edit":
        hasPermission = actions.canEdit
        break
      case "delete":
        hasPermission = actions.canDelete
        break
    }
  } else if (moduleId) {
    // Check module-level permission
    const actions = getAccessibleActions(moduleId)
    switch (action) {
      case "view":
        hasPermission = actions.canView
        break
      case "create":
        hasPermission = actions.canAdd
        break
      case "edit":
        hasPermission = actions.canEdit
        break
      case "delete":
        hasPermission = actions.canDelete
        break
    }
  } else if (formId) {
    // Check form access without module context
    hasPermission = hasFormAccess(formId)
  }

  return hasPermission ? <>{children}</> : <>{fallback}</>
}

// Convenience components for common use cases
export function ViewGuard({ children, moduleId, formId, fallback }: Omit<PermissionGuardProps, "action">) {
  return (
    <PermissionGuard moduleId={moduleId} formId={formId} action="view" fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}

export function EditGuard({ children, moduleId, formId, fallback }: Omit<PermissionGuardProps, "action">) {
  return (
    <PermissionGuard moduleId={moduleId} formId={formId} action="edit" fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}

export function CreateGuard({ children, moduleId, formId, fallback }: Omit<PermissionGuardProps, "action">) {
  return (
    <PermissionGuard moduleId={moduleId} formId={formId} action="create" fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}

export function DeleteGuard({ children, moduleId, formId, fallback }: Omit<PermissionGuardProps, "action">) {
  return (
    <PermissionGuard moduleId={moduleId} formId={formId} action="delete" fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}

export function AdminGuard({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { isSystemAdmin } = usePermissions()

  return isSystemAdmin ? <>{children}</> : <>{fallback}</>
}