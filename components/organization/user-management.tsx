"use client";
import { useState, useMemo, useEffect } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Users,
  Search,
  UserPlus,
  Edit,
  Trash2,
  Shield,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Award,
  AlertCircle,
} from "lucide-react";
import type { User, OrganizationUnit, Role } from "@/types/role";

interface ExtendedUser extends User {
  phone?: string;
  location?: string;
  joinDate?: string;
  status: "active" | "inactive" | "pending";
  permissions?: string[];
}

export function UserManagement() {
  const { state, refreshData } = useRoles();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<ExtendedUser | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [users, setUsers] = useState<ExtendedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    unitId: "",
    roleId: "",
    notes: "",
  });

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/users");
      if (response.ok) {
        const userData = await response.json();
        // Transform user data to match ExtendedUser interface
        const extendedUsers: ExtendedUser[] = userData.map((user: any) => ({
          ...user,
          phone:
            user.phone || `+1-555-${Math.floor(Math.random() * 9000) + 1000}`,
          location:
            user.location ||
            ["New York", "San Francisco", "London", "Mumbai", "Singapore"][
              Math.floor(Math.random() * 5)
            ],
          joinDate:
            user.joinDate ||
            new Date(
              2020 + Math.floor(Math.random() * 4),
              Math.floor(Math.random() * 12),
              Math.floor(Math.random() * 28)
            )
              .toISOString()
              .split("T")[0],
          status:
            user.status === "ACTIVE"
              ? "active"
              : user.status === "INACTIVE"
              ? "inactive"
              : "pending",
          permissions: [],
        }));
        setUsers(extendedUsers);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get all organizational units and roles
  const getAllUnits = (units: OrganizationUnit[]): OrganizationUnit[] => {
    const result: OrganizationUnit[] = [];
    units.forEach((unit) => {
      result.push(unit);
      result.push(...getAllUnits(unit.children));
    });
    return result;
  };

  const getAllRoles = (roles: Role[]): Role[] => {
    const result: Role[] = [];
    roles.forEach((role) => {
      result.push(role);
      result.push(...getAllRoles(role.children));
    });
    return result;
  };

  const allUnits = getAllUnits(state.organizationUnits);
  const allRoles = getAllRoles(state.roles);

  // Get user assignments
  const getUserAssignments = (userId: string) => {
    const assignments: Array<{ unit: OrganizationUnit; role: Role }> = [];

    allUnits.forEach((unit) => {
      if (unit.userAssignments) {
        const userAssignment = unit.userAssignments.find(
          (u: any) => u.userId === userId
        );
        if (userAssignment) {
          const role = allRoles.find((r) => r.id === userAssignment.roleId);
          if (role) {
            assignments.push({ unit, role });
          }
        }
      }
    });

    return assignments;
  };

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        (user.first_name &&
          user.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.last_name &&
          user.last_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDepartment =
        selectedDepartment === "all" || user.department === selectedDepartment;
      const matchesStatus =
        selectedStatus === "all" || user.status === selectedStatus;

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [searchTerm, selectedDepartment, selectedStatus, users]);

  // Get unique departments
  const departments = [...new Set(users.map((user) => user.department))].filter(
    Boolean
  );

  const handleAssignUser = async () => {
    if (!selectedUser || !assignmentForm.unitId || !assignmentForm.roleId)
      return;

    try {
      const response = await fetch(
        `/api/users/${selectedUser.id}/assignments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            unitId: assignmentForm.unitId,
            roleId: assignmentForm.roleId,
            notes: assignmentForm.notes,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to assign user");
      }

      // Refresh data
      await refreshData();
      await fetchUsers();

      setIsAssignDialogOpen(false);
      setAssignmentForm({ unitId: "", roleId: "", notes: "" });
      setSelectedUser(null);
    } catch (error) {
      console.error("Error assigning user:", error);
      alert("Failed to assign user. Please try again.");
    }
  };

  const handleRemoveAssignment = async (userId: string, unitId: string) => {
    try {
      const response = await fetch(
        `/api/users/${userId}/assignments?unitId=${unitId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to remove assignment");
      }

      // Refresh data
      await refreshData();
      await fetchUsers();
    } catch (error) {
      console.error("Error removing assignment:", error);
      alert("Failed to remove assignment. Please try again.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "inactive":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            User Management
          </h2>
          <p className="text-gray-600 mt-1">
            Assign users to organizational units and manage their roles
          </p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <UserPlus className="h-4 w-4 mr-2" />
          Add New User
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Users</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {users.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Award className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active Users</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {users.filter((u) => u.status === "active").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Building2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Assigned Users</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {
                    users.filter(
                      (user) => getUserAssignments(user.id).length > 0
                    ).length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {users.filter((u) => u.status === "pending").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search users by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select
              value={selectedDepartment}
              onValueChange={setSelectedDepartment}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept!}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Grid */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Loading users...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((user) => {
            const assignments = getUserAssignments(user.id);

            return (
              <Card key={user.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={user.avatar || "/placeholder.svg"} />
                        <AvatarFallback>
                          {user.first_name && user.last_name
                            ? `${user.first_name[0]}${user.last_name[0]}`
                            : user.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {user.first_name && user.last_name
                            ? `${user.first_name} ${user.last_name}`
                            : user.email}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {user.department}
                        </p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(user.status)}>
                      {user.status}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600 mb-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    {user.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3" />
                        <span>{user.phone}</span>
                      </div>
                    )}
                    {user.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3" />
                        <span>{user.location}</span>
                      </div>
                    )}
                    {user.joinDate && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        <span>Joined {user.joinDate}</span>
                      </div>
                    )}
                  </div>

                  {/* Assignments */}
                  <div className="mb-4">
                    <Label className="text-xs font-medium text-gray-700 mb-2 block">
                      Assignments
                    </Label>
                    {assignments.length > 0 ? (
                      <div className="space-y-1">
                        {assignments.slice(0, 2).map((assignment, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded"
                          >
                            <div>
                              <span className="font-medium">
                                {assignment.unit.name}
                              </span>
                              <span className="text-gray-500">
                                {" "}
                                • {assignment.role.name}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleRemoveAssignment(
                                  user.id,
                                  assignment.unit.id
                                )
                              }
                              className="h-5 w-5 p-0 text-red-600 hover:bg-red-100"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        {assignments.length > 2 && (
                          <p className="text-xs text-gray-500">
                            +{assignments.length - 2} more assignments
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic">
                        No assignments
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user);
                        setIsAssignDialogOpen(true);
                      }}
                      className="flex-1"
                    >
                      <Shield className="h-3 w-3 mr-1" />
                      Assign
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Assignment Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Assign User to Unit
            </DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={selectedUser.avatar || "/placeholder.svg"}
                  />
                  <AvatarFallback>
                    {selectedUser.first_name && selectedUser.last_name
                      ? `${selectedUser.first_name[0]}${selectedUser.last_name[0]}`
                      : selectedUser.email[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {selectedUser.first_name && selectedUser.last_name
                      ? `${selectedUser.first_name} ${selectedUser.last_name}`
                      : selectedUser.email}
                  </p>
                  <p className="text-sm text-gray-600">{selectedUser.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Organizational Unit</Label>
                <Select
                  value={assignmentForm.unitId}
                  onValueChange={(value) =>
                    setAssignmentForm((prev) => ({ ...prev, unitId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select organizational unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {"  ".repeat(unit.level)} {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={assignmentForm.roleId}
                  onValueChange={(value) =>
                    setAssignmentForm((prev) => ({ ...prev, roleId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {allRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {"  ".repeat(role.level)} {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={assignmentForm.notes}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  placeholder="Add any notes about this assignment..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsAssignDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAssignUser}
                  disabled={!assignmentForm.unitId || !assignmentForm.roleId}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Assign User
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
