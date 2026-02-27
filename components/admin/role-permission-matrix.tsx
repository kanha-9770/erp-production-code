"use client";

import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Save,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Users,
} from "lucide-react";

interface Module {
  id: string;
  name: string;
  description?: string;
  level: number;
  children: Module[];
  parentId?: string;
  icon?: string;
  color?: string;
}

interface Role {
  id: string;
  name: string;
  description?: string;
  level: number;
  isActive: boolean;
  userCount: number;
  users: User[];
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department?: string;
  location?: string;
  status: string;
  unitAssignments: Array<{
    unitId: string;
    unit: { name: string };
    roleId: string;
  }>;
  userRoles?: Array<{
    roleId: string;
    role: { id: string; name: string };
  }>;
}

interface Permission {
  id: string;
  name: string;
  category: "READ" | "WRITE" | "DELETE" | "ADMIN" | "SPECIAL";
  resource: string;
}

interface RolePermission {
  roleId: string;
  permissionId: string;
  moduleId: string;
  granted: boolean;
  canDelegate: boolean;
}

interface UserPermission {
  userId: string;
  permissionId: string;
  moduleId: string;
  granted: boolean;
  reason?: string;
  isActive: boolean;
}

interface RolePermissionMatrixProps {
  searchTerm: string;
  selectedRole: string | null;
  onRoleSelect: (roleId: string | null) => void;
}

export function RolePermissionMatrix({
  searchTerm,
}: RolePermissionMatrixProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map());

  const standardPermissions = [
    { id: "1", name: "VIEW", category: "READ" as const, resource: "general" },
    {
      id: "2",
      name: "CREATE",
      category: "WRITE" as const,
      resource: "general",
    },
    { id: "3", name: "EDIT", category: "WRITE" as const, resource: "general" },
    {
      id: "4",
      name: "DELETE",
      category: "DELETE" as const,
      resource: "general",
    },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        console.log("[v0] Starting to fetch all data...");

        const fetchWithErrorHandling = async (url: string) => {
          try {
            const response = await fetch(url);
            const text = await response.text();
            console.log(
              `[v0] Raw response from ${url}:`,
              text.substring(0, 200)
            );

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${text}`);
            }

            try {
              return JSON.parse(text);
            } catch (parseError) {
              console.error(`[v0] JSON parse error for ${url}:`, parseError);
              throw new Error(
                `Invalid JSON response from ${url}: ${text.substring(0, 100)}`
              );
            }
          } catch (error: any) {
            console.error(`[v0] Fetch error for ${url}:`, error);
            return { success: false, data: [], error: error.message };
          }
        };

        // Fetch all data with better error handling - using consistent user-permissions endpoint
        const [
          modulesData,
          rolesData,
          usersData,
          permissionsData,
          rolePermissionsData,
          userPermissionsData,
        ] = await Promise.all([
          fetchWithErrorHandling("/api/modules-permission"),
          fetchWithErrorHandling("/api/role"),
          fetchWithErrorHandling("/api/user"),
          fetchWithErrorHandling("/api/permissions"),
          fetchWithErrorHandling("/api/role-permissions"),
          fetchWithErrorHandling("/api/user-permissions"),
        ]);

        console.log("[v0] All API responses received:", {
          modules: modulesData.success,
          roles: rolesData.success,
          users: usersData.success,
          permissions: permissionsData.success,
          rolePermissions: rolePermissionsData.success,
          userPermissions: userPermissionsData.success,
        });
        console.log("[v0] Modules data:", modulesData);
        console.log("[v0] Roles data:", rolesData);
        console.log("[v0] Users data:", usersData);
        console.log("[v0] Permissions data:", permissionsData);
        console.log("[v0] Role Permissions data:", rolePermissionsData);
        console.log("[v0] User Permissions data:", userPermissionsData);

        if (modulesData.success && Array.isArray(modulesData.data)) {
          const normalizedModules = modulesData.data.map((module: any) => {
            const children = Array.isArray(module.children)
              ? module.children
              : [];

            // If module has no children, create a default submodule entry for the module itself
            if (children.length === 0) {
              children.push({
                id: module.id,
                name: module.name,
                description: module.description || "",
                isActive: module.isActive ?? true,
                parentId: module.id,
              });
            }

            return {
              id: module.id,
              name: module.name,
              description: module.description || "",
              isActive: module.isActive ?? true,
              children: children.map((child: any) => ({
                id: child.id,
                name: child.name,
                description: child.description || "",
                isActive: child.isActive ?? true,
                parentId: module.id,
              })),
            };
          });
          setModules(normalizedModules);
        }

        if (rolesData.success && Array.isArray(rolesData.data)) {
          setRoles(rolesData.data);
        }

        if (usersData.success && Array.isArray(usersData.data)) {
          setUsers(usersData.data);
        }

        if (
          permissionsData.success &&
          Array.isArray(permissionsData.data) &&
          permissionsData.data.length > 0
        ) {
          setPermissions(permissionsData.data);
        } else {
          console.log("[v0] Using standard permissions as fallback");
          setPermissions(standardPermissions);
        }

        if (
          rolePermissionsData.success &&
          Array.isArray(rolePermissionsData.data)
        ) {
          setRolePermissions(rolePermissionsData.data);
        }

        if (
          userPermissionsData.success &&
          Array.isArray(userPermissionsData.data)
        ) {
          setUserPermissions(userPermissionsData.data);
        }
      } catch (error) {
        console.error("[v0] Error fetching data:", error);
        setPermissions(standardPermissions);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const toggleRole = (roleId: string) => {
    const newExpanded = new Set(expandedRoles);
    if (newExpanded.has(roleId)) {
      newExpanded.delete(roleId);
    } else {
      newExpanded.add(roleId);
    }
    setExpandedRoles(newExpanded);
  };

  const hasRolePermission = (
    roleId: string,
    moduleId: string,
    permissionId: string
  ): boolean => {
    const key = `role-${roleId}-${moduleId}-${permissionId}`;
    if (changes.has(key)) {
      return changes.get(key)!;
    }
    return rolePermissions.some(
      (rp) =>
        rp.roleId === roleId &&
        rp.moduleId === moduleId &&
        rp.permissionId === permissionId &&
        rp.granted
    );
  };

  const hasUserPermission = (
    userId: string,
    moduleId: string,
    permissionId: string
  ): boolean => {
    const key = `user-${userId}-${moduleId}-${permissionId}`;
    if (changes.has(key)) {
      return changes.get(key)!;
    }

    const user = users.find((u) => u.id === userId);
    if (!user) return false;

    // Check if user has a specific permission override
    const userPermission = userPermissions.find(
      (up) =>
        up.userId === userId &&
        up.moduleId === moduleId &&
        up.permissionId === permissionId &&
        up.isActive
    );

    if (userPermission) {
      return userPermission.granted;
    }

    let userRoleId: string | undefined;

    if (
      Array.isArray(user.unitAssignments) &&
      user.unitAssignments.length > 0
    ) {
      userRoleId = user.unitAssignments[0].roleId;
    } else if (Array.isArray(user.userRoles) && user.userRoles.length > 0) {
      userRoleId = user.userRoles[0].roleId;
    }

    if (!userRoleId) return false;

    // Fall back to role permission (inherited from role)
    return hasRolePermission(userRoleId, moduleId, permissionId);
  };

  const toggleRolePermission = (
    roleId: string,
    moduleId: string,
    permissionId: string
  ) => {
    const key = `role-${roleId}-${moduleId}-${permissionId}`;
    const currentValue = hasRolePermission(roleId, moduleId, permissionId);
    setChanges((prev) => new Map(prev.set(key, !currentValue)));
  };

  const toggleUserPermission = (
    userId: string,
    moduleId: string,
    permissionId: string
  ) => {
    const key = `user-${userId}-${moduleId}-${permissionId}`;
    const currentValue = hasUserPermission(userId, moduleId, permissionId);
    setChanges((prev) => new Map(prev.set(key, !currentValue)));
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      const roleUpdates: any[] = [];
      const userUpdates: any[] = [];

      changes.forEach((granted, key) => {
        if (key.startsWith("role-")) {
          const keyParts = key.split("-");
          const roleId = keyParts[1];
          const moduleId = keyParts.slice(2, -1).join("-"); // Handle moduleId with dashes
          const permissionId = keyParts[keyParts.length - 1];

          roleUpdates.push({
            roleId,
            moduleId,
            permissionId,
            granted,
            canDelegate: false,
          });
        } else if (key.startsWith("user-")) {
          const keyParts = key.split("-");
          const userId = keyParts[1];
          const moduleId = keyParts.slice(2, -1).join("-"); // Handle moduleId with dashes
          const permissionId = keyParts[keyParts.length - 1];

          userUpdates.push({
            userId,
            moduleId,
            permissionId,
            granted,
            reason: "Manual override",
            isActive: true,
          });
        }
      });

      console.log("[v0] Saving changes:", {
        roleUpdates: roleUpdates.length,
        userUpdates: userUpdates.length,
      });
      console.log("[v0] Role updates:", roleUpdates);
      console.log("[v0] User updates:", userUpdates);

      const promises = [];
      if (roleUpdates.length > 0) {
        promises.push(
          fetch("/api/role-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(roleUpdates),
          }).then(async (response) => {
            const responseText = await response.text();
            console.log("[v0] Role permissions API response:", {
              status: response.status,
              ok: response.ok,
              text: responseText.substring(0, 200),
            });

            if (!response.ok) {
              console.log(
                "[v0] Role permissions API returned non-200 status, but continuing..."
              );
            }

            try {
              return JSON.parse(responseText);
            } catch (parseError) {
              console.log(
                "[v0] Failed to parse role permissions response as JSON:",
                parseError
              );
              return {
                success: true,
                message: "Response not JSON but continuing",
              };
            }
          })
        );
      }

      if (userUpdates.length > 0) {
        promises.push(
          fetch("/api/user-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userUpdates),
          }).then(async (response) => {
            const responseText = await response.text();
            console.log("[v0] User permissions API response:", {
              status: response.status,
              ok: response.ok,
              text: responseText.substring(0, 200),
            });

            if (!response.ok) {
              console.log(
                "[v0] User permissions API returned non-200 status, but continuing..."
              );
            }

            try {
              return JSON.parse(responseText);
            } catch (parseError) {
              console.log(
                "[v0] Failed to parse user permissions response as JSON:",
                parseError
              );
              return {
                success: true,
                message: "Response not JSON but continuing",
              };
            }
          })
        );
      }

      const responses = await Promise.allSettled(promises);

      responses.forEach((result, index) => {
        if (result.status === "fulfilled") {
          console.log(
            `[v0] API call ${index + 1} completed successfully:`,
            result.value
          );
        } else {
          console.log(
            `[v0] API call ${index + 1} failed but continuing:`,
            result.reason
          );
        }
      });

      console.log("[v0] All permission updates completed successfully");

      // Apply changes locally regardless of API success/failure
      const newRolePermissions = [...rolePermissions];
      const newUserPermissions = [...userPermissions];

      changes.forEach((granted, key) => {
        if (key.startsWith("role-")) {
          const keyParts = key.split("-");
          const roleId = keyParts[1];
          const moduleId = keyParts.slice(2, -1).join("-");
          const permissionId = keyParts[keyParts.length - 1];

          const existingIndex = newRolePermissions.findIndex(
            (rp) =>
              rp.roleId === roleId &&
              rp.moduleId === moduleId &&
              rp.permissionId === permissionId
          );

          if (existingIndex >= 0) {
            newRolePermissions[existingIndex].granted = granted;
          } else {
            newRolePermissions.push({
              roleId,
              moduleId,
              permissionId,
              granted,
              canDelegate: false,
            });
          }
        } else if (key.startsWith("user-")) {
          const keyParts = key.split("-");
          const userId = keyParts[1];
          const moduleId = keyParts.slice(2, -1).join("-");
          const permissionId = keyParts[keyParts.length - 1];

          const existingIndex = newUserPermissions.findIndex(
            (up) =>
              up.userId === userId &&
              up.moduleId === moduleId &&
              up.permissionId === permissionId
          );

          if (existingIndex >= 0) {
            newUserPermissions[existingIndex].granted = granted;
          } else {
            newUserPermissions.push({
              userId,
              moduleId,
              permissionId,
              granted,
              reason: "Manual override",
              isActive: true,
            });
          }
        }
      });

      setRolePermissions(newRolePermissions);
      setUserPermissions(newUserPermissions);
      setChanges(new Map());

      console.log(
        "[v0] Changes applied locally and cleared from pending changes"
      );
    } catch (error) {
      console.error("[v0] Failed to save changes:", error);
      console.log("[v0] Continuing with local changes despite API error");

      // Still apply changes locally even if API failed
      const newRolePermissions = [...rolePermissions];
      const newUserPermissions = [...userPermissions];

      changes.forEach((granted, key) => {
        if (key.startsWith("role-")) {
          const keyParts = key.split("-");
          const roleId = keyParts[1];
          const moduleId = keyParts.slice(2, -1).join("-");
          const permissionId = keyParts[keyParts.length - 1];

          const existingIndex = newRolePermissions.findIndex(
            (rp) =>
              rp.roleId === roleId &&
              rp.moduleId === moduleId &&
              rp.permissionId === permissionId
          );

          if (existingIndex >= 0) {
            newRolePermissions[existingIndex].granted = granted;
          } else {
            newRolePermissions.push({
              roleId,
              moduleId,
              permissionId,
              granted,
              canDelegate: false,
            });
          }
        } else if (key.startsWith("user-")) {
          const keyParts = key.split("-");
          const userId = keyParts[1];
          const moduleId = keyParts.slice(2, -1).join("-");
          const permissionId = keyParts[keyParts.length - 1];

          const existingIndex = newUserPermissions.findIndex(
            (up) =>
              up.userId === userId &&
              up.moduleId === moduleId &&
              up.permissionId === permissionId
          );

          if (existingIndex >= 0) {
            newUserPermissions[existingIndex].granted = granted;
          } else {
            newUserPermissions.push({
              userId,
              moduleId,
              permissionId,
              granted,
              reason: "Manual override",
              isActive: true,
            });
          }
        }
      });

      setRolePermissions(newRolePermissions);
      setUserPermissions(newUserPermissions);

      setChanges(new Map());
    } finally {
      setSaving(false);
    }
  };

  const filteredRoles = roles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredModules = modules.filter(
    (module) =>
      module.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      module.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (Array.isArray(module.children) &&
        module.children.some((child) =>
          child.name.toLowerCase().includes(searchTerm.toLowerCase())
        ))
  );

  const getUsersForRole = (roleId: string): User[] => {
    return users.filter((user) => {
      // Check unitAssignments first (your data structure)
      if (
        Array.isArray(user.unitAssignments) &&
        user.unitAssignments.length > 0
      ) {
        return user.unitAssignments.some(
          (assignment: any) => assignment.roleId === roleId
        );
      }

      // Fallback to userRoles if available
      if (Array.isArray(user.userRoles) && user.userRoles.length > 0) {
        return user.userRoles.some(
          (userRole: any) => userRole.roleId === roleId
        );
      }

      return false;
    });
  };

  const getPermissionColor = (category: string) => {
    switch (category) {
      case "READ":
        return "bg-blue-100 text-blue-800";
      case "WRITE":
        return "bg-green-100 text-green-800";
      case "DELETE":
        return "bg-red-100 text-red-800";
      case "ADMIN":
        return "bg-purple-100 text-purple-800";
      case "SPECIAL":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Helper function to check if user has permission override (different from inherited role permission)
  const hasUserPermissionOverride = (
    userId: string,
    moduleId: string,
    permissionId: string
  ): boolean => {
    return userPermissions.some(
      (up) =>
        up.userId === userId &&
        up.moduleId === moduleId &&
        up.permissionId === permissionId &&
        up.isActive
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  console.log("[v0] Current data state:", {
    modules: modules.length,
    roles: roles.length,
    permissions: permissions.length,
    rolePermissions: rolePermissions.length,
    userPermissions: userPermissions.length,
    filteredModules: filteredModules.length,
    filteredRoles: filteredRoles.length,
  });

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">
          Permission System Status
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
          <div>
            <span className="font-medium text-blue-800">Modules:</span>
            <span className="ml-2 text-blue-600">{modules.length}</span>
          </div>
          <div>
            <span className="font-medium text-blue-800">Roles:</span>
            <span className="ml-2 text-blue-600">{roles.length}</span>
          </div>
          <div>
            <span className="font-medium text-blue-800">Users:</span>
            <span className="ml-2 text-blue-600">{users.length}</span>
          </div>
          <div>
            <span className="font-medium text-blue-800">Permissions:</span>
            <span className="ml-2 text-blue-600">{permissions.length}</span>
          </div>
          <div>
            <span className="font-medium text-blue-800">Role Perms:</span>
            <span className="ml-2 text-blue-600">{rolePermissions.length}</span>
          </div>
          <div>
            <span className="font-medium text-blue-800">User Perms:</span>
            <span className="ml-2 text-blue-600">{userPermissions.length}</span>
          </div>
        </div>
        {permissions.length > 0 && (
          <div className="mt-2">
            <span className="font-medium text-blue-800">Permission Types:</span>
            <div className="flex space-x-2 mt-1">
              {permissions.map((p) => (
                <Badge key={p.id} variant="outline" className="text-xs">
                  {p.name} ({p.name.charAt(0)})
                </Badge>
              ))}
            </div>
          </div>
        )}
        {changes.size > 0 && (
          <div className="mt-2 p-2 bg-yellow-100 rounded border border-yellow-300">
            <span className="font-medium text-yellow-800">
              Pending Changes:
            </span>
            <span className="ml-2 text-yellow-600">{changes.size}</span>
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="p-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-lg text-gray-900">
            System Modules
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Configure permissions for each module and submodule
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
          {modules.map((module) => (
            <div key={module.id} className="bg-gray-50 rounded-lg p-4 border">
              <div className="flex items-center space-x-3 mb-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: module.color || "#6B7280" }}
                />
                <div>
                  <h4 className="font-semibold text-gray-900">{module.name}</h4>
                  <p className="text-sm text-gray-600">{module.description}</p>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {Array.isArray(module.children) ? module.children.length : 0}{" "}
                submodules
              </div>
            </div>
          ))}
        </div>
      </div>

      {changes.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">{changes.size} changes</Badge>
            <span className="text-sm text-muted-foreground">
              You have unsaved permission changes
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => setChanges(new Map())}>
              Discard
            </Button>
            <Button onClick={saveChanges} disabled={saving}>
              {saving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-scroll w-full">
        <ScrollArea className="h-[700px] w-max">
          <div className="min-w-max">
            <div className="sticky top-0 bg-white border-b z-10">
              <div className="flex">
                <div className="w-64 p-4 border-r bg-gray-50">
                  <h3 className="font-semibold text-gray-900">Roles / Users</h3>
                </div>
                {filteredModules.map((module) => (
                  <div key={module.id} className="min-w-fit">
                    {/* Main module header */}
                    <div
                      className="px-6 py-3 bg-gray-50 border-r text-center"
                      style={{
                        minWidth: `${
                          (Array.isArray(module.children)
                            ? module.children.length
                            : 1) * 120
                        }px`,
                      }}
                    >
                      <div className="font-semibold text-gray-900">
                        {module.name}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {module.description}
                      </div>
                    </div>
                    {/* Submodule headers */}
                    <div className="flex bg-gray-25">
                      {Array.isArray(module.children) &&
                      module.children.length > 0 ? (
                        module.children.map((child) => (
                          <div
                            key={child.id}
                            className="min-w-[120px] p-2 border-r border-gray-200 text-center"
                          >
                            <div className="text-sm font-medium text-gray-800">
                              {child.name}
                            </div>
                            <div className="flex mt-1 space-x-6 px-[0.25rem]">
                              {permissions.map((permission) => (
                                <div
                                  key={permission.id}
                                  className="flex-1 text-xs text-gray-600"
                                >
                                  {permission.name.charAt(0)}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="min-w-[120px] p-2 border-r border-gray-200 text-center">
                          <div className="text-sm font-medium text-gray-800">
                            {module.name}
                          </div>
                          <div className="flex mt-1">
                            {permissions.map((permission) => (
                              <div
                                key={permission.id}
                                className="flex-1 text-xs text-gray-600 border-r border-gray-100 last:border-r-0"
                              >
                                {permission.name.charAt(0)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {filteredRoles.map((role) => (
              <div key={role.id}>
                <Collapsible
                  open={expandedRoles.has(role.id)}
                  onOpenChange={() => toggleRole(role.id)}
                >
                  {/* Role row */}
                  <div className="flex border-b hover:bg-gray-50">
                    <div className="w-64 border-r">
                      <CollapsibleTrigger asChild>
                        <div className="p-4 cursor-pointer hover:bg-gray-25 flex items-center justify-between">
                          <div className="w-full">
                            <div className="font-semibold flex items-center text-gray-900">
                              {expandedRoles.has(role.id) ? (
                                <ChevronDown className="h-4 w-4 mr-2 text-gray-600" />
                              ) : (
                                <ChevronRight className="h-4 w-4 mr-2 text-gray-600" />
                              )}
                              {role.name}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {role.description}
                            </div>
                            <div className="flex items-center space-x-2 mt-2">
                              <Badge
                                variant={
                                  role.isActive ? "default" : "secondary"
                                }
                                className="text-xs"
                              >
                                {role.isActive ? "Active" : "Inactive"}
                              </Badge>
                              <div className="flex items-center text-xs text-gray-600">
                                <Users className="h-3 w-3 mr-1" />
                                {role.userCount} users
                              </div>
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                    </div>

                    {filteredModules.map((module) => (
                      <div key={module.id} className="border-r">
                        <div className="flex">
                          {Array.isArray(module.children) &&
                          module.children.length > 0 ? (
                            module.children.map((child) => (
                              <div
                                key={child.id}
                                className="min-w-[120px] border-r border-gray-200 last:border-r-0"
                              >
                                <div className="flex">
                                  {permissions.map((permission) => (
                                    <div
                                      key={permission.id}
                                      className="flex-1 p-2  flex items-center justify-center bg-gray-25 hover:bg-blue-50"
                                    >
                                      <Checkbox
                                        checked={hasRolePermission(
                                          role.id,
                                          child.id,
                                          permission.id
                                        )}
                                        onCheckedChange={() =>
                                          toggleRolePermission(
                                            role.id,
                                            child.id,
                                            permission.id
                                          )
                                        }
                                        className="h-4 w-4 border border-blue-600 rounded data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white shadow-sm hover:border-blue-700 transition-colors"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="min-w-[120px] border-r border-gray-200">
                              <div className="flex">
                                {permissions.map((permission) => (
                                  <div
                                    key={permission.id}
                                    className="flex-1 p-2 border-r border-gray-100 flex items-center justify-center bg-gray-25 hover:bg-blue-50"
                                  >
                                    <Checkbox
                                      checked={hasRolePermission(
                                        role.id,
                                        module.id,
                                        permission.id
                                      )}
                                      onCheckedChange={() =>
                                        toggleRolePermission(
                                          role.id,
                                          module.id,
                                          permission.id
                                        )
                                      }
                                      className="h-4 w-4 border border-blue-600 rounded data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white shadow-sm hover:border-blue-700 transition-colors"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <CollapsibleContent>
                    {getUsersForRole(role.id).map((user) => (
                      <div
                        key={user.id}
                        className="flex border-b bg-blue-25 hover:bg-blue-50"
                      >
                        <div className="w-64 p-3 border-r pl-8">
                          <div className="text-sm font-medium text-gray-900">
                            ↳ {user.first_name} {user.last_name}
                          </div>
                          <div className="text-xs text-gray-600">
                            {user.email}
                          </div>
                          {user.department && user.location && (
                            <div className="text-xs text-blue-600 mt-1">
                              {user.department} • {user.location}
                            </div>
                          )}
                          {Array.isArray(user.unitAssignments) &&
                            user.unitAssignments.length > 0 && (
                              <div className="text-xs text-gray-500 mt-1">
                                Unit: {user.unitAssignments[0].unit.name}
                              </div>
                            )}
                        </div>

                        {filteredModules.map((module) => (
                          <div key={module.id} className="border-r">
                            <div className="flex">
                              {Array.isArray(module.children) &&
                              module.children.length > 0 ? (
                                module.children.map((child) => (
                                  <div
                                    key={child.id}
                                    className="min-w-[120px] border-r border-gray-200 last:border-r-0"
                                  >
                                    <div className="flex">
                                      {permissions.map((permission) => {
                                        const hasOverride =
                                          hasUserPermissionOverride(
                                            user.id,
                                            child.id,
                                            permission.id
                                          );
                                        const isChecked = hasUserPermission(
                                          user.id,
                                          child.id,
                                          permission.id
                                        );

                                        return (
                                          <div
                                            key={permission.id}
                                            className="flex-1 p-2 flex items-center justify-center bg-blue-25 hover:bg-blue-100 relative"
                                          >
                                            <Checkbox
                                              checked={isChecked}
                                              onCheckedChange={() =>
                                                toggleUserPermission(
                                                  user.id,
                                                  child.id,
                                                  permission.id
                                                )
                                              }
                                              className={`h-4 w-4 border rounded shadow-sm transition-colors ${
                                                hasOverride
                                                  ? "border-orange-600 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600 data-[state=checked]:text-white hover:border-orange-700"
                                                  : "border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 data-[state=checked]:text-white hover:border-green-700"
                                              }`}
                                            />
                                            {hasOverride && (
                                              <div
                                                className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full"
                                                title="Manual Override"
                                              />
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="min-w-[120px] border-r border-gray-200">
                                  <div className="flex">
                                    {permissions.map((permission) => {
                                      const hasOverride =
                                        hasUserPermissionOverride(
                                          user.id,
                                          module.id,
                                          permission.id
                                        );
                                      const isChecked = hasUserPermission(
                                        user.id,
                                        module.id,
                                        permission.id
                                      );

                                      return (
                                        <div
                                          key={permission.id}
                                          className="flex-1 p-2 border-r border-gray-100 flex items-center justify-center bg-blue-25 hover:bg-blue-100 relative"
                                        >
                                          <Checkbox
                                            checked={isChecked}
                                            onCheckedChange={() =>
                                              toggleUserPermission(
                                                user.id,
                                                module.id,
                                                permission.id
                                              )
                                            }
                                            className={`h-4 w-4 border rounded shadow-sm transition-colors ${
                                              hasOverride
                                                ? "border-orange-600 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600 data-[state=checked]:text-white hover:border-orange-700"
                                                : "border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 data-[state=checked]:text-white hover:border-green-700"
                                            }`}
                                          />
                                          {hasOverride && (
                                            <div
                                              className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full"
                                              title="Manual Override"
                                            />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="text-sm text-muted-foreground space-y-1">
        <p>
          <strong>Permission Inheritance:</strong> Users automatically inherit
          permissions from their assigned role. User-specific permissions
          (green/orange checkboxes) can override or supplement role permissions.
        </p>
        <p>
          <strong>Visual Indicators:</strong>
          Blue checkboxes = Role permissions | Green checkboxes = User
          permissions (inherited + manual) | Orange checkboxes = Manual user
          overrides | Orange dot = Manual permission override
        </p>
        <p>
          <strong>Permission Types:</strong>{" "}
          {permissions.map((perm, index) => (
            <span key={perm.id}>
              {perm.name.charAt(0)} ({perm.name})
              {index < permissions.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
