"use client";

import { useState, useMemo } from "react";
import { useRoles } from "@/context/role-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Settings,
  Plus,
  Search,
  Shield,
  Eye,
  Edit,
  Trash2,
  Users,
  FileText,
  CheckCircle,
  XCircle,
  ArrowDown,
  ArrowRight,
} from "lucide-react";
import type { Role } from "@/types/role";
import type { Permission, RolePermission } from "@/types/permissions";

// Mock permissions data
const mockPermissions: Permission[] = [
  // Read Permissions
  {
    id: "read-users",
    name: "View Users",
    description: "View user profiles and basic information",
    category: "read",
    resource: "users",
  },
  {
    id: "read-roles",
    name: "View Roles",
    description: "View role definitions and hierarchy",
    category: "read",
    resource: "roles",
  },
  {
    id: "read-units",
    name: "View Units",
    description: "View organizational units",
    category: "read",
    resource: "units",
  },
  {
    id: "read-reports",
    name: "View Reports",
    description: "Access and view reports",
    category: "read",
    resource: "reports",
  },
  {
    id: "read-analytics",
    name: "View Analytics",
    description: "Access analytics and dashboards",
    category: "read",
    resource: "analytics",
  },

  // Write Permissions
  {
    id: "write-users",
    name: "Manage Users",
    description: "Create, edit, and manage user accounts",
    category: "write",
    resource: "users",
  },
  {
    id: "write-roles",
    name: "Manage Roles",
    description: "Create and modify roles",
    category: "write",
    resource: "roles",
  },
  {
    id: "write-units",
    name: "Manage Units",
    description: "Create and modify organizational units",
    category: "write",
    resource: "units",
  },
  {
    id: "write-reports",
    name: "Create Reports",
    description: "Create and modify reports",
    category: "write",
    resource: "reports",
  },

  // Delete Permissions
  {
    id: "delete-users",
    name: "Delete Users",
    description: "Remove user accounts",
    category: "delete",
    resource: "users",
  },
  {
    id: "delete-roles",
    name: "Delete Roles",
    description: "Remove roles from system",
    category: "delete",
    resource: "roles",
  },
  {
    id: "delete-units",
    name: "Delete Units",
    description: "Remove organizational units",
    category: "delete",
    resource: "units",
  },

  // Admin Permissions
  {
    id: "admin-system",
    name: "System Administration",
    description: "Full system administration access",
    category: "admin",
    resource: "system",
  },
  {
    id: "admin-security",
    name: "Security Administration",
    description: "Manage security settings and policies",
    category: "admin",
    resource: "security",
  },
  {
    id: "admin-audit",
    name: "Audit Management",
    description: "Access audit logs and compliance features",
    category: "admin",
    resource: "audit",
  },

  // Special Permissions
  {
    id: "special-export",
    name: "Data Export",
    description: "Export data from the system",
    category: "special",
    resource: "data",
  },
  {
    id: "special-import",
    name: "Data Import",
    description: "Import data into the system",
    category: "special",
    resource: "data",
  },
  {
    id: "special-backup",
    name: "Backup Management",
    description: "Create and manage system backups",
    category: "special",
    resource: "system",
  },
];

// Mock role permissions
const mockRolePermissions: RolePermission[] = [
  // CEO Role - Full access
  {
    roleId: "ceo-role",
    permissionId: "admin-system",
    granted: true,
    canDelegate: true,
  },
  {
    roleId: "ceo-role",
    permissionId: "admin-security",
    granted: true,
    canDelegate: true,
  },
  {
    roleId: "ceo-role",
    permissionId: "admin-audit",
    granted: true,
    canDelegate: true,
  },

  // CTO Role - Technical permissions
  {
    roleId: "cto-role",
    permissionId: "read-users",
    granted: true,
    canDelegate: true,
    inheritedFrom: "ceo-role",
  },
  {
    roleId: "cto-role",
    permissionId: "write-users",
    granted: true,
    canDelegate: true,
  },
  {
    roleId: "cto-role",
    permissionId: "read-roles",
    granted: true,
    canDelegate: true,
  },
  {
    roleId: "cto-role",
    permissionId: "write-roles",
    granted: true,
    canDelegate: false,
  },

  // Engineering roles
  {
    roleId: "engineering-director",
    permissionId: "read-users",
    granted: true,
    canDelegate: false,
    inheritedFrom: "cto-role",
  },
  {
    roleId: "engineering-director",
    permissionId: "read-reports",
    granted: true,
    canDelegate: true,
  },
  {
    roleId: "senior-engineer",
    permissionId: "read-users",
    granted: true,
    canDelegate: false,
    inheritedFrom: "engineering-director",
  },
  {
    roleId: "senior-engineer",
    permissionId: "read-reports",
    granted: true,
    canDelegate: false,
    inheritedFrom: "engineering-director",
  },
];

export function PermissionManagement() {
  const { state } = useRoles();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [rolePermissions, setRolePermissions] =
    useState<RolePermission[]>(mockRolePermissions);

  // Get all roles
  const getAllRoles = (roles: Role[]): Role[] => {
    const result: Role[] = [];
    roles.forEach((role) => {
      result.push(role);
      result.push(...getAllRoles(role.children));
    });
    return result;
  };

  const allRoles = getAllRoles(state.roles);

  // Filter permissions
  const filteredPermissions = useMemo(() => {
    return mockPermissions.filter((permission) => {
      const matchesSearch =
        permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        permission.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory =
        selectedCategory === "all" || permission.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  // Get permissions for a specific role
  const getRolePermissions = (roleId: string) => {
    return rolePermissions.filter((rp) => rp.roleId === roleId);
  };

  // Get inherited permissions for a role
  const getInheritedPermissions = (roleId: string): RolePermission[] => {
    const role = allRoles.find((r) => r.id === roleId);
    if (!role || !role.parentId) return [];

    const parentPermissions = getRolePermissions(role.parentId);
    const inheritedFromParent = getInheritedPermissions(role.parentId);

    return [...parentPermissions, ...inheritedFromParent].filter(
      (p) => p.canDelegate
    );
  };

  // Toggle permission for role
  const toggleRolePermission = (roleId: string, permissionId: string) => {
    setRolePermissions((prev) => {
      const existing = prev.find(
        (rp) => rp.roleId === roleId && rp.permissionId === permissionId
      );

      if (existing) {
        return prev.map((rp) =>
          rp.roleId === roleId && rp.permissionId === permissionId
            ? { ...rp, granted: !rp.granted }
            : rp
        );
      } else {
        return [
          ...prev,
          {
            roleId,
            permissionId,
            granted: true,
            canDelegate: false,
          },
        ];
      }
    });
  };

  // Toggle delegation permission
  const toggleDelegation = (roleId: string, permissionId: string) => {
    setRolePermissions((prev) =>
      prev.map((rp) =>
        rp.roleId === roleId && rp.permissionId === permissionId
          ? { ...rp, canDelegate: !rp.canDelegate }
          : rp
      )
    );
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "read":
        return "bg-blue-100 text-blue-800";
      case "write":
        return "bg-green-100 text-green-800";
      case "delete":
        return "bg-red-100 text-red-800";
      case "admin":
        return "bg-purple-100 text-purple-800";
      case "special":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "read":
        return <Eye className="h-3 w-3" />;
      case "write":
        return <Edit className="h-3 w-3" />;
      case "delete":
        return <Trash2 className="h-3 w-3" />;
      case "admin":
        return <Shield className="h-3 w-3" />;
      case "special":
        return <Settings className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-purple-600" />
            Permission Management
          </h2>
          <p className="text-gray-600 mt-1">
            Configure role-based permissions across the organization
          </p>
        </div>
        <Button className="bg-purple-600 hover:bg-purple-700">
          <Plus className="h-4 w-4 mr-2" />
          Create Permission
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Permissions</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {mockPermissions.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active Permissions</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {rolePermissions.filter((rp) => rp.granted).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Roles with Permissions</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {new Set(rolePermissions.map((rp) => rp.roleId)).size}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <ArrowDown className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Inherited Permissions</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {rolePermissions.filter((rp) => rp.inheritedFrom).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roles">Role Permissions</TabsTrigger>
          <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search permissions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="write">Write</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="special">Special</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Permissions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPermissions.map((permission) => (
              <Card
                key={permission.id}
                className="hover:shadow-md transition-shadow"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(permission.category)}
                      <h3 className="font-semibold text-gray-900">
                        {permission.name}
                      </h3>
                    </div>
                    <Badge className={getCategoryColor(permission.category)}>
                      {permission.category}
                    </Badge>
                  </div>

                  <p className="text-sm text-gray-600 mb-3">
                    {permission.description}
                  </p>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Resource: {permission.resource}</span>
                    <span>
                      {
                        rolePermissions.filter(
                          (rp) =>
                            rp.permissionId === permission.id && rp.granted
                        ).length
                      }{" "}
                      roles
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {allRoles.slice(0, 6).map((role) => {
              const rolePerms = getRolePermissions(role.id);
              const inheritedPerms = getInheritedPermissions(role.id);

              return (
                <Card key={role.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Shield className="h-5 w-5 text-purple-600" />
                      {role.name}
                    </CardTitle>
                    <CardDescription>{role.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Direct Permissions */}
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">
                        Direct Permissions (
                        {
                          rolePerms.filter(
                            (rp) => rp.granted && !rp.inheritedFrom
                          ).length
                        }
                        )
                      </Label>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {mockPermissions.slice(0, 5).map((permission) => {
                          const rolePerm = rolePerms.find(
                            (rp) => rp.permissionId === permission.id
                          );
                          const isGranted = rolePerm?.granted || false;

                          return (
                            <div
                              key={permission.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={isGranted}
                                  onCheckedChange={() =>
                                    toggleRolePermission(role.id, permission.id)
                                  }
                                />
                                <span
                                  className={
                                    isGranted
                                      ? "text-gray-900"
                                      : "text-gray-500"
                                  }
                                >
                                  {permission.name}
                                </span>
                              </div>
                              {isGranted && (
                                <Switch
                                  checked={rolePerm?.canDelegate || false}
                                  onCheckedChange={() =>
                                    toggleDelegation(role.id, permission.id)
                                  }
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inherited Permissions */}
                    {inheritedPerms.length > 0 && (
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                          <ArrowDown className="h-3 w-3" />
                          Inherited Permissions ({inheritedPerms.length})
                        </Label>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {inheritedPerms.slice(0, 3).map((inheritedPerm) => {
                            const permission = mockPermissions.find(
                              (p) => p.id === inheritedPerm.permissionId
                            );
                            if (!permission) return null;

                            return (
                              <div
                                key={inheritedPerm.permissionId}
                                className="flex items-center gap-2 text-xs text-gray-600"
                              >
                                <ArrowRight className="h-3 w-3" />
                                <span>{permission.name}</span>
                                <span className="text-gray-400">
                                  (from{" "}
                                  {
                                    allRoles.find(
                                      (r) =>
                                        r.id === inheritedPerm.inheritedFrom
                                    )?.name
                                  }
                                  )
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="matrix" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Permission Matrix</CardTitle>
              <CardDescription>
                Complete overview of all role permissions and inheritance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Permission</th>
                      {allRoles.slice(0, 5).map((role) => (
                        <th
                          key={role.id}
                          className="text-center p-2 font-medium min-w-[100px]"
                        >
                          {role.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockPermissions.slice(0, 10).map((permission) => (
                      <tr
                        key={permission.id}
                        className="border-b hover:bg-gray-50"
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(permission.category)}
                            <span>{permission.name}</span>
                            <Badge
                              className={getCategoryColor(permission.category)}
                              variant="secondary"
                            >
                              {permission.category}
                            </Badge>
                          </div>
                        </td>
                        {allRoles.slice(0, 5).map((role) => {
                          const rolePerm = rolePermissions.find(
                            (rp) =>
                              rp.roleId === role.id &&
                              rp.permissionId === permission.id
                          );
                          const inherited = getInheritedPermissions(
                            role.id
                          ).find((ip) => ip.permissionId === permission.id);

                          return (
                            <td key={role.id} className="p-2 text-center">
                              {rolePerm?.granted ? (
                                <div className="flex items-center justify-center gap-1">
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                  {rolePerm.canDelegate && (
                                    <ArrowDown className="h-3 w-3 text-blue-600" />
                                  )}
                                </div>
                              ) : inherited ? (
                                <ArrowRight className="h-4 w-4 text-gray-400 mx-auto" />
                              ) : (
                                <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
