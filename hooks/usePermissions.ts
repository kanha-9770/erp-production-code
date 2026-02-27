"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

export interface RolePermission {
  id: string;
  roleId: string;
  permissionId: string;
  moduleId: string | null;
  formId: string | null;
  granted: boolean;
  canDelegate: boolean;
  permission: {
    name: string;
    resource: string;
    category: string;
    description: string;
  };
  module: {
    name: string;
    path: string;
  } | null;
  form: {
    name: string;
    description: string;
  } | null;
}

export interface UserInfo {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  organization: { id: string; name: string } | null;
  unitAssignments: {
    unit: { id: string; name: string };
    role: { id: string; name: string };
    notes: string;
  }[];
}

export interface PermissionsState {
  permissions: RolePermission[];
  user: UserInfo | null;
  isLoading: boolean;
  error: string | null;
  /**
   * Check if the user has a specific permission granted.
   * @param permissionName - The name of the permission (e.g., "create", "read", "update", "delete", "publish", "manage")
   * @param moduleId - Optional module ID to check module-level permission
   * @param formId - Optional form ID to check form-level permission
   */
  hasPermission: (permissionName: string, moduleId?: string | null, formId?: string | null) => boolean;
  /**
   * Check if the user can perform any of the given permissions.
   */
  hasAnyPermission: (permissionNames: string[], moduleId?: string | null, formId?: string | null) => boolean;
  /**
   * Check if user can delegate a specific permission.
   */
  canDelegate: (permissionName: string, moduleId?: string | null, formId?: string | null) => boolean;
  /**
   * Reload permissions from the API.
   */
  refreshPermissions: () => Promise<void>;
}

export function usePermissions(): PermissionsState {
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchUserAndPermissions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Step 1: Fetch the current user to get their role IDs
      const userRes = await fetch("/api/auth/me");
      if (!userRes.ok) {
        throw new Error("Failed to fetch user info");
      }
      const userData = await userRes.json();

      if (!userData.success || !userData.user) {
        throw new Error("User not authenticated");
      }

      setUser(userData.user);

      const unitAssignments = userData.user.unitAssignments || [];
      const isAdminUser = unitAssignments.some((ua: any) => ua.role.name === "ADMIN");
      setIsAdmin(isAdminUser);

      if (isAdminUser || unitAssignments.length === 0) {
        // For admins, no need to fetch permissions (implicit full access)
        // No roles assigned - no permissions
        setPermissions([]);
        setIsLoading(false);
        return;
      }

      // Step 2: Fetch permissions for ALL roles the user has
      const allPermissions: RolePermission[] = [];
      const roleIds = [...new Set(unitAssignments.map((ua: any) => ua.role.id))] as string[];

      const fetchPromises = roleIds.map(async (roleId) => {
        const permRes = await fetch(`/api/role-permissions?roleId=${roleId}`);
        if (permRes.ok) {
          const permData = await permRes.json();
          if (permData.success && Array.isArray(permData.data)) {
            return permData.data as RolePermission[];
          }
        }
        return [] as RolePermission[];
      });

      const results = await Promise.all(fetchPromises);
      results.forEach((perms) => allPermissions.push(...perms));

      setPermissions(allPermissions);
    } catch (err: any) {
      console.error("[usePermissions] Error:", err);
      setError(err.message || "Failed to load permissions");
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserAndPermissions();
  }, [fetchUserAndPermissions]);

  /**
   * Build a lookup map for fast permission checks.
   * Key format: "permName" | "permName:moduleId" | "permName:moduleId:formId"
   */
  const permissionMap = useMemo(() => {
    const map = new Map<string, RolePermission>();

    for (const perm of permissions) {
      if (!perm.granted) continue;

      const permName = perm.permission.name.toLowerCase();

      // Global level key (no module, no form)
      const globalKey = permName;
      if (!map.has(globalKey)) {
        map.set(globalKey, perm);
      }

      // Module level key
      if (perm.moduleId) {
        const moduleKey = `${permName}:${perm.moduleId}`;
        if (!map.has(moduleKey)) {
          map.set(moduleKey, perm);
        }
      }

      // Form level key
      if (perm.moduleId && perm.formId) {
        const formKey = `${permName}:${perm.moduleId}:${perm.formId}`;
        if (!map.has(formKey)) {
          map.set(formKey, perm);
        }
      }

      // Form-only key (form without specifying module)
      if (perm.formId) {
        const formOnlyKey = `${permName}::${perm.formId}`;
        if (!map.has(formOnlyKey)) {
          map.set(formOnlyKey, perm);
        }
      }
    }

    return map;
  }, [permissions]);

  const hasPermission = useCallback(
    (permissionName: string, moduleId?: string | null, formId?: string | null): boolean => {
      if (isAdmin) return true;

      const permName = permissionName.toLowerCase();

      // 1. Check form-level permission (most specific)
      if (moduleId && formId) {
        const formKey = `${permName}:${moduleId}:${formId}`;
        if (permissionMap.has(formKey)) return true;
      }

      // 2. Check form-only key
      if (formId) {
        const formOnlyKey = `${permName}::${formId}`;
        if (permissionMap.has(formOnlyKey)) return true;
      }

      // 3. Check module-level permission
      if (moduleId) {
        const moduleKey = `${permName}:${moduleId}`;
        if (permissionMap.has(moduleKey)) return true;
      }

      // 4. Check global/role-level permission (least specific, broadest)
      const globalKey = permName;
      if (permissionMap.has(globalKey)) return true;

      return false;
    },
    [isAdmin, permissionMap]
  );

  const hasAnyPermission = useCallback(
    (permissionNames: string[], moduleId?: string | null, formId?: string | null): boolean => {
      if (isAdmin) return true;
      return permissionNames.some((name) => hasPermission(name, moduleId, formId));
    },
    [isAdmin, hasPermission]
  );

  const canDelegateFn = useCallback(
    (permissionName: string, moduleId?: string | null, formId?: string | null): boolean => {
      if (isAdmin) return true;

      const permName = permissionName.toLowerCase();

      for (const perm of permissions) {
        if (!perm.granted || !perm.canDelegate) continue;
        if (perm.permission.name.toLowerCase() !== permName) continue;

        // Check scope match
        if (formId && perm.formId === formId) return true;
        if (moduleId && perm.moduleId === moduleId && !formId) return true;
        if (!perm.moduleId && !perm.formId) return true; // global delegate
      }

      return false;
    },
    [isAdmin, permissions]
  );

  return {
    permissions,
    user,
    isLoading,
    error,
    hasPermission,
    hasAnyPermission,
    canDelegate: canDelegateFn,
    refreshPermissions: fetchUserAndPermissions,
  };
}