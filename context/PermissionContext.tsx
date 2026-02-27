"use client";

import { PermissionsState, usePermissions } from "@/hooks/usePermissions";
import React, { createContext, useContext } from "react";

const PermissionContext = createContext<PermissionsState | null>(null);

/**
 * Wrap your app or layout with this provider to make permissions
 * available everywhere via usePermissionContext().
 */
export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const permissionsState = usePermissions();

  return (
    <PermissionContext.Provider value={permissionsState}>
      {children}
    </PermissionContext.Provider>
  );
}

/**
 * Use this hook to access permission state from any component
 * inside the PermissionProvider tree.
 */
export function usePermissionContext(): PermissionsState {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error("usePermissionContext must be used within a PermissionProvider");
  }
  return ctx;
}

/**
 * A component that conditionally renders children based on permissions.
 * If the user does NOT have the required permission, it renders the `fallback` (or nothing).
 */
export function PermissionGate({
  permission,
  permissions: permissionsList,
  moduleId,
  formId,
  fallback = null,
  children,
}: {
  /** Single permission name to check */
  permission?: string;
  /** Multiple permission names - user needs at least one */
  permissions?: string[];
  moduleId?: string | null;
  formId?: string | null;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { hasPermission, hasAnyPermission, isLoading } = usePermissionContext();

  // While loading, don't render anything (prevents flash of forbidden content)
  if (isLoading) return null;

  if (permission) {
    if (!hasPermission(permission, moduleId, formId)) {
      return <>{fallback}</>;
    }
  }

  if (permissionsList && permissionsList.length > 0) {
    if (!hasAnyPermission(permissionsList, moduleId, formId)) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}
