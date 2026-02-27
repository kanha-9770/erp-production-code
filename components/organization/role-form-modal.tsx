"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRoles } from "@/context/role-context";
import type { Role, RoleFormData } from "@/types/role";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield } from "lucide-react";

export function RoleFormModal() {
  console.log("[RoleFormModal] Component rendering started");
  const { state, dispatch, refreshData } = useRoles();
  const [formData, setFormData] = useState<RoleFormData>({
    name: "",
    description: "",
    shareDataWithPeers: false,
  });
  const [loading, setLoading] = useState(false);

  const isOpen = state.selectedRole !== null;
  const isEditing =
    state.selectedRole &&
    state.selectedRole.id !== "new" &&
    !state.selectedRole.hasOwnProperty("parentId");

  console.log("[RoleFormModal] Current state:", {
    isOpen,
    isEditing,
    selectedRole: state.selectedRole,
    formData,
    loading,
  });

  useEffect(() => {
    console.log(
      "[RoleFormModal] useEffect triggered with selectedRole:",
      state.selectedRole
    );
    if (state.selectedRole) {
      if (state.selectedRole.id === "new") {
        console.log("[RoleFormModal] Setting formData for new role");
        setFormData({
          name: "",
          description: "",
          parentId: state.selectedRole.parentId,
          shareDataWithPeers: false,
        });
      } else if (state.selectedRole.hasOwnProperty("parentId")) {
        console.log("[RoleFormModal] Setting formData for child role");
        setFormData({
          name: "",
          description: "",
          parentId: state.selectedRole.parentId,
          shareDataWithPeers: false,
        });
      } else {
        console.log(
          "[RoleFormModal] Setting formData for editing existing role"
        );
        setFormData({
          name: state.selectedRole.name,
          description: state.selectedRole.description,
          shareDataWithPeers: state.selectedRole.shareDataWithPeers,
        });
      }
    }
  }, [state.selectedRole]);

  const handleClose = () => {
    console.log("[RoleFormModal] handleClose called");
    dispatch({ type: "SELECT_ROLE", payload: { role: null } });
    setFormData({
      name: "",
      description: "",
      shareDataWithPeers: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[RoleFormModal] handleSubmit called with formData:", formData);

    if (!formData.name.trim()) {
      console.warn("[RoleFormModal] Validation failed: Role name is required");
      alert("Role name is required");
      return;
    }

    setLoading(true);
    console.log("[RoleFormModal] Setting loading to true");

    try {
      if (
        state.selectedRole?.id === "new" ||
        state.selectedRole?.hasOwnProperty("parentId")
      ) {
        console.log("[RoleFormModal] Creating new role. Sending POST request");
        const response = await fetch(
          `/api/organizations/${state.organizationId}/roles`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...formData,
              parentId: state.selectedRole.parentId,
            }),
          }
        );

        console.log("[RoleFormModal] POST response status:", response.status);

        if (!response.ok) {
          throw new Error("Failed to create role");
        }
      } else if (state.selectedRole && state.selectedRole.id !== "new") {
        console.log(
          "[RoleFormModal] Updating existing role. Sending PUT request"
        );
        const response = await fetch(`/api/roles/${state.selectedRole.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });

        console.log("[RoleFormModal] PUT response status:", response.status);

        if (!response.ok) {
          throw new Error("Failed to update role");
        }
      }

      console.log("[RoleFormModal] Refreshing data after successful save");
      await refreshData();
      handleClose();
    } catch (error) {
      console.error("[RoleFormModal] Error saving role:", error);
      alert("Failed to save role. Please try again.");
    } finally {
      setLoading(false);
      console.log("[RoleFormModal] Setting loading to false");
    }
  };

  const getAllRoles = (roles: Role[]): Role[] => {
    console.log("[RoleFormModal] getAllRoles called with roles:", roles);
    const result: Role[] = [];
    roles.forEach((role) => {
      result.push(role);
      result.push(...getAllRoles(role.children));
    });
    console.log("[RoleFormModal] getAllRoles returning:", result);
    return result;
  };

  const availableParents = getAllRoles(state.roles).filter(
    (role) => role.id !== state.selectedRole?.id
  );
  console.log("[RoleFormModal] Available parents:", availableParents);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        console.log(
          "[RoleFormModal] Dialog onOpenChange called with open:",
          open
        );
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[600px] z-[99999]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            {state.selectedRole?.id === "new" ||
            state.selectedRole?.hasOwnProperty("parentId")
              ? "Create New Role"
              : "Edit Role"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Role Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                console.log(
                  "[RoleFormModal] Name input changed to:",
                  e.target.value
                );
                setFormData({ ...formData, name: e.target.value });
              }}
              placeholder="Enter role name (e.g., Senior Software Engineer)"
              required
              className="focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {(state.selectedRole?.id === "new" ||
            state.selectedRole?.hasOwnProperty("parentId")) && (
            <div className="space-y-2">
              <Label htmlFor="parent">Reports To</Label>
              <Select
                value={formData.parentId}
                onValueChange={(value) => {
                  console.log(
                    "[RoleFormModal] Parent select changed to:",
                    value
                  );
                  setFormData({ ...formData, parentId: value });
                }}
              >
                <SelectTrigger className="focus:ring-purple-500 focus:border-purple-500">
                  <SelectValue placeholder="Select parent role" />
                </SelectTrigger>
                <SelectContent>
                  {availableParents.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {"  ".repeat(role.level)} {role.name}
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
              onChange={(e) => {
                console.log(
                  "[RoleFormModal] Description textarea changed to:",
                  e.target.value
                );
                setFormData({ ...formData, description: e.target.value });
              }}
              placeholder="Enter role description and responsibilities"
              rows={3}
              className="focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <Checkbox
              id="shareData"
              checked={formData.shareDataWithPeers}
              onCheckedChange={(checked) => {
                console.log(
                  "[RoleFormModal] Share data checkbox changed to:",
                  !!checked
                );
                setFormData({ ...formData, shareDataWithPeers: !!checked });
              }}
              className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
            />
            <div>
              <Label
                htmlFor="shareData"
                className="text-sm font-medium text-blue-900"
              >
                Share Data with Peers
              </Label>
              <p className="text-xs text-blue-700">
                Allow this role to share data with roles at the same
                hierarchical level
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
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
              className="bg-purple-600 hover:bg-purple-700"
              disabled={loading}
            >
              <Shield className="h-4 w-4 mr-2" />
              {loading
                ? "Saving..."
                : state.selectedRole?.id === "new" ||
                  state.selectedRole?.hasOwnProperty("parentId")
                ? "Create Role"
                : "Update Role"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
