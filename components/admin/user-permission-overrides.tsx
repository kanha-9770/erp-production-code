"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CalendarIcon,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
  department?: string;
}

interface Permission {
  id: string;
  name: string;
  category: "READ" | "WRITE" | "DELETE" | "ADMIN" | "SPECIAL";
  resource: string;
  description?: string;
}

interface UserPermissionOverride {
  id: string;
  userId: string;
  permissionId: string;
  granted: boolean;
  reason: string;
  expiresAt?: string;
  createdAt: string;
}

interface UserPermissionOverridesProps {
  searchTerm: string;
  selectedUser: string | null;
  onUserSelect: (userId: string | null) => void;
}

export function UserPermissionOverrides({
  searchTerm,
  selectedUser,
  onUserSelect,
}: UserPermissionOverridesProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [overrides, setOverrides] = useState<UserPermissionOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState("");
  const [expiryDate, setExpiryDate] = useState<Date>();
  const [grantPermission, setGrantPermission] = useState(true);

  // Mock data - replace with actual API calls
  useEffect(() => {
    const mockUsers: User[] = [
      {
        id: "u1",
        email: "admin@company.com",
        firstName: "John",
        lastName: "Admin",
        status: "ACTIVE",
        department: "IT",
      },
      {
        id: "u2",
        email: "manager@company.com",
        firstName: "Sarah",
        lastName: "Manager",
        status: "ACTIVE",
        department: "Operations",
      },
      {
        id: "u3",
        email: "user1@company.com",
        firstName: "Mike",
        lastName: "Johnson",
        status: "ACTIVE",
        department: "Sales",
      },
      {
        id: "u4",
        email: "user2@company.com",
        firstName: "Emily",
        lastName: "Davis",
        status: "ACTIVE",
        department: "Marketing",
      },
    ];

    const mockPermissions: Permission[] = [
      {
        id: "p1",
        name: "View User Management",
        category: "READ",
        resource: "user_management",
        description: "View user profiles and data",
      },
      {
        id: "p2",
        name: "Create Users",
        category: "WRITE",
        resource: "user_management",
        description: "Create new user accounts",
      },
      {
        id: "p3",
        name: "Delete Users",
        category: "DELETE",
        resource: "user_management",
        description: "Delete user accounts",
      },
      {
        id: "p4",
        name: "Manage Forms",
        category: "ADMIN",
        resource: "form_management",
        description: "Full form management access",
      },
      {
        id: "p5",
        name: "View Reports",
        category: "READ",
        resource: "reports",
        description: "Access to system reports",
      },
      {
        id: "p6",
        name: "Export Data",
        category: "SPECIAL",
        resource: "data_export",
        description: "Export system data",
      },
    ];

    const mockOverrides: UserPermissionOverride[] = [
      {
        id: "o1",
        userId: "u2",
        permissionId: "p6",
        granted: true,
        reason: "Temporary access for quarterly report generation",
        expiresAt: "2024-03-31",
        createdAt: "2024-01-15",
      },
      {
        id: "o2",
        userId: "u3",
        permissionId: "p2",
        granted: false,
        reason: "Revoked due to security incident",
        createdAt: "2024-02-10",
      },
      {
        id: "o3",
        userId: "u4",
        permissionId: "p5",
        granted: true,
        reason: "Marketing campaign analysis access",
        expiresAt: "2024-06-30",
        createdAt: "2024-01-20",
      },
    ];

    setUsers(mockUsers);
    setPermissions(mockPermissions);
    setOverrides(mockOverrides);
    setLoading(false);
  }, []);

  const getOverridesForUser = (userId: string) => {
    return overrides.filter((o) => o.userId === userId);
  };

  const getPermissionById = (permissionId: string) => {
    return permissions.find((p) => p.id === permissionId);
  };

  const getUserById = (userId: string) => {
    return users.find((u) => u.id === userId);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800";
      case "INACTIVE":
        return "bg-gray-100 text-gray-800";
      case "SUSPENDED":
        return "bg-red-100 text-red-800";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const addOverride = () => {
    if (!selectedUser || !selectedPermission || !overrideReason) return;

    const newOverride: UserPermissionOverride = {
      id: `o${Date.now()}`,
      userId: selectedUser,
      permissionId: selectedPermission,
      granted: grantPermission,
      reason: overrideReason,
      expiresAt: expiryDate?.toISOString().split("T")[0],
      createdAt: new Date().toISOString().split("T")[0],
    };

    setOverrides((prev) => [...prev, newOverride]);
    setShowAddDialog(false);
    setSelectedPermission("");
    setOverrideReason("");
    setExpiryDate(undefined);
    setGrantPermission(true);
  };

  const removeOverride = (overrideId: string) => {
    setOverrides((prev) => prev.filter((o) => o.id !== overrideId));
  };

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${user.firstName} ${user.lastName}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      user.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">Loading...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">User Permission Overrides</h3>
          <p className="text-sm text-muted-foreground">
            Manage individual user permissions that override their role-based
            permissions
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Override
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Permission Override</DialogTitle>
              <DialogDescription>
                Grant or revoke specific permissions for a user
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="user">User</Label>
                <Select value={selectedUser || ""} onValueChange={onUserSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="permission">Permission</Label>
                <Select
                  value={selectedPermission}
                  onValueChange={setSelectedPermission}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select permission" />
                  </SelectTrigger>
                  <SelectContent>
                    {permissions.map((permission) => (
                      <SelectItem key={permission.id} value={permission.id}>
                        <div className="flex items-center space-x-2">
                          <Badge
                            variant="outline"
                            className={getPermissionColor(permission.category)}
                          >
                            {permission.category}
                          </Badge>
                          <span>{permission.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="action">Action</Label>
                <Select
                  value={grantPermission ? "grant" : "revoke"}
                  onValueChange={(value) =>
                    setGrantPermission(value === "grant")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grant">Grant Permission</SelectItem>
                    <SelectItem value="revoke">Revoke Permission</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="reason">Reason</Label>
                <Textarea
                  id="reason"
                  placeholder="Explain why this override is needed..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>

              <div>
                <Label>Expiry Date (Optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal bg-transparent"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expiryDate ? format(expiryDate, "PPP") : "No expiry"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={expiryDate}
                      onSelect={setExpiryDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAddDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={addOverride}
                  disabled={
                    !selectedUser || !selectedPermission || !overrideReason
                  }
                >
                  Add Override
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users list */}
        <div className="space-y-4">
          <h4 className="font-medium">Users with Overrides</h4>
          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {filteredUsers
                .filter((user) => getOverridesForUser(user.id).length > 0)
                .map((user) => (
                  <div
                    key={user.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedUser === user.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-gray-50"
                    }`}
                    onClick={() =>
                      onUserSelect(selectedUser === user.id ? null : user.id)
                    }
                  >
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar || "/placeholder.svg"} />
                        <AvatarFallback>
                          {user.firstName?.[0]}
                          {user.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium truncate">
                            {user.firstName} {user.lastName}
                          </span>
                          <Badge
                            variant="outline"
                            className={getStatusColor(user.status)}
                          >
                            {user.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {user.email} • {user.department}
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {getOverridesForUser(user.id).length} overrides
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </div>

        {/* Override details */}
        <div className="space-y-4">
          <h4 className="font-medium">
            {selectedUser
              ? `Overrides for ${getUserById(selectedUser)?.firstName} ${
                  getUserById(selectedUser)?.lastName
                }`
              : "Select a user to view overrides"}
          </h4>

          {selectedUser ? (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {getOverridesForUser(selectedUser).map((override) => {
                  const permission = getPermissionById(override.permissionId);
                  const expired = isExpired(override.expiresAt);

                  return (
                    <div key={override.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          {override.granted ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <div className="font-medium">
                              {permission?.name}
                            </div>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge
                                variant="outline"
                                className={getPermissionColor(
                                  permission?.category || ""
                                )}
                              >
                                {permission?.category}
                              </Badge>
                              <Badge
                                variant={
                                  override.granted ? "default" : "destructive"
                                }
                              >
                                {override.granted ? "Granted" : "Revoked"}
                              </Badge>
                              {expired && (
                                <Badge
                                  variant="outline"
                                  className="bg-red-100 text-red-800"
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Expired
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOverride(override.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">Reason:</span>
                          <p className="text-muted-foreground mt-1">
                            {override.reason}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>
                            Created:{" "}
                            {new Date(override.createdAt).toLocaleDateString()}
                          </span>
                          {override.expiresAt && (
                            <span className={expired ? "text-red-600" : ""}>
                              Expires:{" "}
                              {new Date(
                                override.expiresAt
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {getOverridesForUser(selectedUser).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No permission overrides for this user
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
              Select a user to view their permission overrides
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
