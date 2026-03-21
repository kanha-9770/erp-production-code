"use client";

import type React from "react";
import { createContext, useContext, useCallback } from "react";
import { useGetUserQuery } from "@/lib/api/auth";
import {
  usePermissions as useRolePermissions,
  type PermissionsState,
} from "@/hooks/usePermissions";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  status: string;
}

interface Permission {
  id: string;
  userId: string;
  resourceType: "module" | "form";
  resourceId: string;
  resource?: {
    id: string;
    name: string;
    description?: string;
    moduleId?: string;
  };
  permissions: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };
  isSystemAdmin: boolean;
  grantedBy?: string;
  grantedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

interface PermissionContextType {
  user: User | null;
  permissions: Permission[];
  isLoading: boolean;
  error: string | null;
  isSystemAdmin: boolean;
  hasModuleAccess: (moduleId: string) => boolean;
  hasFormAccess: (formId: string) => boolean;
  getAccessibleActions: (
    moduleId: string,
    formId?: string
  ) => {
    canView: boolean;
    canAdd: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };
  refreshPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(
  undefined
);

export function PermissionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use RTK Query for user data
  const { data: userData, isLoading: userLoading } = useGetUserQuery();

  // Use the already-migrated usePermissions hook for role-based permissions
  const rolePerms = useRolePermissions();

  const user: User | null = userData?.user
    ? {
        id: userData.user.id,
        email: userData.user.email,
        name: [userData.user.first_name, userData.user.last_name]
          .filter(Boolean)
          .join(" ") || userData.user.username || "",
        role:
          userData.user.unitAssignments?.[0]?.role?.name || "",
        department: userData.user.department || "",
        status: userData.user.status || "",
      }
    : null;

  const isSystemAdmin =
    userData?.user?.unitAssignments?.some(
      (ua) => ua.role.name === "ADMIN"
    ) ?? false;

  const isLoading = userLoading || rolePerms.isLoading;
  const error = rolePerms.error;

  const hasModuleAccess = useCallback(
    (moduleId: string): boolean => {
      if (!user) return false;
      if (isSystemAdmin) return true;
      // Check if user has any permission (read/create/update/delete) for this module
      return rolePerms.hasAnyPermission(
        ["read", "create", "update", "delete", "view", "manage"],
        moduleId
      );
    },
    [user, isSystemAdmin, rolePerms]
  );

  const hasFormAccess = useCallback(
    (formId: string): boolean => {
      if (!user) return false;
      if (isSystemAdmin) return true;
      return rolePerms.hasAnyPermission(
        ["read", "create", "update", "delete", "view", "manage"],
        null,
        formId
      );
    },
    [user, isSystemAdmin, rolePerms]
  );

  const getAccessibleActions = useCallback(
    (
      moduleId: string,
      formId?: string
    ): {
      canView: boolean;
      canAdd: boolean;
      canEdit: boolean;
      canDelete: boolean;
    } => {
      if (!user) {
        return { canView: false, canAdd: false, canEdit: false, canDelete: false };
      }
      if (isSystemAdmin) {
        return { canView: true, canAdd: true, canEdit: true, canDelete: true };
      }

      return {
        canView: rolePerms.hasAnyPermission(["read", "view"], moduleId, formId),
        canAdd: rolePerms.hasPermission("create", moduleId, formId),
        canEdit: rolePerms.hasPermission("update", moduleId, formId),
        canDelete: rolePerms.hasPermission("delete", moduleId, formId),
      };
    },
    [user, isSystemAdmin, rolePerms]
  );

  const refreshPermissions = useCallback(async () => {
    await rolePerms.refreshPermissions();
  }, [rolePerms]);

  const contextValue: PermissionContextType = {
    user,
    permissions: [],
    isLoading,
    error,
    isSystemAdmin,
    hasModuleAccess,
    hasFormAccess,
    getAccessibleActions,
    refreshPermissions,
  };

  return (
    <PermissionContext.Provider value={contextValue}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermissions must be used within a PermissionProvider");
  }
  return context;
}
