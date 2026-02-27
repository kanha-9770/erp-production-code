"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRoles } from "@/context/role-context";
import type {
  OrganizationUnit,
  OrganizationUnitFormData,
  Role,
  User,
} from "@/types/role";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Users, Shield, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function OrganizationUnitFormModal() {
  const { state, dispatch, refreshData } = useRoles();
  const [formData, setFormData] = useState<OrganizationUnitFormData>({
    name: "",
    description: "",
    assignedRoles: [],
    assignedUsers: [],
  });
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const isOpen = state.isOrgFormOpen;
  const isEditing =
    state.selectedOrgUnit &&
    state.selectedOrgUnit.id !== "new" &&
    state.selectedOrgUnit.id !== undefined;

  useEffect(() => {
    if (state.selectedOrgUnit) {
      if (state.selectedOrgUnit.id === "new") {
        // Creating new unit
        setFormData({
          name: "",
          description: "",
          parentId: state.selectedOrgUnit.parentId,
          assignedRoles: [],
          assignedUsers: [],
        });
      } else {
        // Editing existing unit
        setFormData({
          name: state.selectedOrgUnit.name,
          description: state.selectedOrgUnit.description,
          assignedRoles: state.selectedOrgUnit.assignedRoles || [],
          assignedUsers: state.selectedOrgUnit.assignedUsers || [],
        });
      }
    }
  }, [state.selectedOrgUnit]);

  // Fetch users when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
      if (response.ok) {
        const userData = await response.json();
        setUsers(userData);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const handleClose = () => {
    dispatch({ type: "CLOSE_ORG_FORM" });
    setFormData({
      name: "",
      description: "",
      assignedRoles: [],
      assignedUsers: [],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Unit name is required");
      return;
    }

    setLoading(true);

    try {
      if (state.selectedOrgUnit?.id === "new") {
        // Creating new unit
        console.log("organization id", state.organizationId)
        const response = await fetch(
          `/api/organizations/${state.organizationId}/units`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...formData,
              parentId: state.selectedOrgUnit.parentId,
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to create unit");
        }
      } else if (state.selectedOrgUnit && state.selectedOrgUnit.id !== "new") {
        // Editing existing unit
        const response = await fetch(`/api/units/${state.selectedOrgUnit.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          throw new Error("Failed to update unit");
        }
      }

      // Refresh data and close modal
      await refreshData();
      handleClose();
    } catch (error) {
      console.error("Error saving unit:", error);
      alert("Failed to save unit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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

  const availableParents = getAllUnits(state.organizationUnits).filter(
    (unit) => unit.id !== state.selectedOrgUnit?.id
  );
  const availableRoles = getAllRoles(state.roles);

  const handleRoleToggle = (roleId: string, checked: boolean) => {
    const currentRoles = formData.assignedRoles || [];
    if (checked) {
      setFormData({ ...formData, assignedRoles: [...currentRoles, roleId] });
    } else {
      setFormData({
        ...formData,
        assignedRoles: currentRoles.filter((id) => id !== roleId),
      });
    }
  };

  const handleUserAssignment = (userId: string, roleId: string) => {
    const currentUsers = formData.assignedUsers || [];
    const existingUserIndex = currentUsers.findIndex(
      (u) => u.userId === userId
    );

    // Find the user to get their name
    const user = users.find((u) => u.id === userId);
    if (!user) {
      console.warn(`User with ID ${userId} not found`);
      return;
    }
    const userName =
      user.first_name && user.last_name
        ? `${user.first_name} ${user.last_name}`
        : user.email;

    if (existingUserIndex >= 0) {
      // Update existing user's role
      const updatedUsers = [...currentUsers];
      updatedUsers[existingUserIndex] = { userId, roleId, userName };
      setFormData({ ...formData, assignedUsers: updatedUsers });
    } else {
      // Add new user
      setFormData({
        ...formData,
        assignedUsers: [...currentUsers, { userId, roleId, userName }],
      });
    }
  };

  const handleRemoveUser = (userId: string) => {
    const currentUsers = formData.assignedUsers || [];
    setFormData({
      ...formData,
      assignedUsers: currentUsers.filter((u) => u.userId !== userId),
    });
  };

  const getSelectedRoleNames = () => {
    const assignedRoles = formData.assignedRoles || [];
    return availableRoles
      .filter((role) => assignedRoles.includes(role.id))
      .map((role) => role.name);
  };

  const getAssignedUsers = () => {
    const assignedUsers = formData.assignedUsers || [];
    return assignedUsers
      .map((assignment) => {
        const user = users.find((u) => u.id === assignment.userId);
        const role = availableRoles.find((r) => r.id === assignment.roleId);
        return { user, role, assignment };
      })
      .filter((item) => item.user && item.role);
  };

  const getUnassignedUsers = () => {
    const assignedUserIds = (formData.assignedUsers || []).map((u) => u.userId);
    return users.filter((user) => !assignedUserIds.includes(user.id));
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            {isEditing
              ? "Edit Organizational Unit"
              : "Create New Organizational Unit"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Unit Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Enter unit name (e.g., Finance Department)"
                required
                className="focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {state.selectedOrgUnit?.id === "new" && (
              <div className="space-y-2">
                <Label htmlFor="parent">Parent Unit</Label>
                <Select
                  value={formData.parentId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, parentId: value })
                  }
                >
                  <SelectTrigger className="focus:ring-blue-500 focus:border-blue-500">
                    <SelectValue placeholder="Select parent unit (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableParents.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {"  ".repeat(unit.level)} {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Enter unit description and responsibilities"
                rows={3}
                className="focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Tabs for Roles and Users */}
          <Tabs defaultValue="roles" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="roles" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Roles
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
            </TabsList>

            <TabsContent value="roles" className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-600" />
                <Label className="text-base font-medium">
                  Assign Roles to Unit
                </Label>
              </div>

              {/* Selected Roles Display */}
              {formData.assignedRoles && formData.assignedRoles.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  {getSelectedRoleNames().map((roleName) => (
                    <Badge
                      key={roleName}
                      variant="secondary"
                      className="bg-purple-100 text-purple-800"
                    >
                      {roleName}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Role Selection */}
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4 space-y-3">
                {availableRoles.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No roles available. Create roles first to assign them to
                    units.
                  </p>
                ) : (
                  availableRoles.map((role) => (
                    <div key={role.id} className="flex items-center space-x-3">
                      <Checkbox
                        id={`role-${role.id}`}
                        checked={
                          formData.assignedRoles?.includes(role.id) || false
                        }
                        onCheckedChange={(checked) =>
                          handleRoleToggle(role.id, !!checked)
                        }
                        className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={`role-${role.id}`}
                          className="text-sm font-medium cursor-pointer"
                          style={{ paddingLeft: `${role.level * 12}px` }}
                        >
                          {role.name}
                        </Label>
                        {role.description && (
                          <p
                            className="text-xs text-gray-500 mt-1"
                            style={{ paddingLeft: `${role.level * 12}px` }}
                          >
                            {role.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                <Label className="text-base font-medium">
                  Assign Users to Unit
                </Label>
              </div>

              {/* Assigned Users Display */}
              {getAssignedUsers().length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">
                    Assigned Users
                  </Label>
                  <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200 max-h-32 overflow-y-auto">
                    {getAssignedUsers().map(({ user, role, assignment }) => (
                      <div
                        key={assignment.userId}
                        className="flex items-center justify-between bg-white p-2 rounded border"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={user!.avatar || "/placeholder.svg"}
                            />
                            <AvatarFallback>
                              {user!.first_name && user!.last_name
                                ? `${user!.first_name[0]}${user!.last_name[0]}`
                                : user!.email[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {user!.first_name && user!.last_name
                                ? `${user!.first_name} ${user!.last_name}`
                                : user!.email}
                            </p>
                            <p className="text-xs text-gray-500">
                              {user!.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {role!.name}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveUser(assignment.userId)}
                            className="h-6 w-6 p-0 hover:bg-red-100 text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Users */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Available Users
                </Label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4 space-y-2">
                  {getUnassignedUsers().length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      All users have been assigned to this unit.
                    </p>
                  ) : (
                    getUnassignedUsers().map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-2 hover:bg-gray-50 rounded"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={user.avatar || "/placeholder.svg"}
                            />
                            <AvatarFallback>
                              {user.first_name && user.last_name
                                ? `${user.first_name[0]}${user.last_name[0]}`
                                : user.email[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {user.first_name && user.last_name
                                ? `${user.first_name} ${user.last_name}`
                                : user.email}
                            </p>
                            <p className="text-xs text-gray-500">
                              {user.email} • {user.department}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            onValueChange={(roleId) =>
                              handleUserAssignment(user.id, roleId)
                            }
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableRoles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>
                                  {role.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              <Building2 className="h-4 w-4 mr-2" />
              {loading
                ? "Saving..."
                : isEditing
                ? "Update Unit"
                : "Create Unit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
