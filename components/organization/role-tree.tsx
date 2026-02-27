"use client";

import { useRoles } from "@/context/role-context";
import { RoleTreeNode } from "./role-tree-node";
import { Button } from "@/components/ui/button";
import {
  ExpandIcon,
  ShrinkIcon,
  Plus,
  Building2,
  Users,
  Database,
} from "lucide-react";
import type { Role } from "@/types/role";

export function RoleTree() {
  const { state, dispatch } = useRoles();

  const handleExpandAll = () => {
    dispatch({ type: "EXPAND_ALL" });
  };

  const handleCollapseAll = () => {
    dispatch({ type: "COLLAPSE_ALL" });
  };

  const handleCreateRoot = () => {
    dispatch({
      type: "SELECT_ROLE",
      payload: {
        role: {
          id: "new",
          name: "",
          description: "",
          shareDataWithPeers: false,
          level: 0,
          children: [],
          parentId: undefined, // No parent means root role
        },
      },
    });
  };

  const getTotalNodes = (roles: Role[]): number => {
    return roles.reduce((total, role) => {
      return total + 1 + getTotalNodes(role.children);
    }, 0);
  };

  const getMaxDepth = (roles: Role[]): number => {
    if (roles.length === 0) return 0;
    return Math.max(...roles.map((role) => 1 + getMaxDepth(role.children)));
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Units</p>
              <p className="text-2xl font-semibold text-gray-900">
                {getTotalNodes(state.roles)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Database className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Max Depth</p>
              <p className="text-2xl font-semibold text-gray-900">
                {getMaxDepth(state.roles)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Expanded</p>
              <p className="text-2xl font-semibold text-gray-900">
                {state.expandedNodes.size}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            onClick={handleCreateRoot}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Root Role
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            className="text-blue-600 hover:text-blue-700 bg-transparent"
          >
            <ExpandIcon className="h-4 w-4 mr-1" />
            Expand All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            className="text-blue-600 hover:text-blue-700 bg-transparent"
          >
            <ShrinkIcon className="h-4 w-4 mr-1" />
            Collapse All
          </Button>
        </div>
      </div>

      {/* Tree */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 min-h-[600px] overflow-auto">
        {state.roles.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              No organizational units defined yet
            </p>
            <Button
              onClick={handleCreateRoot}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create Your First Unit
            </Button>
          </div>
        ) : (
          <div className="space-y-0">
            {state.roles.map((role, index) => (
              <RoleTreeNode
                key={role.id}
                role={role}
                isLast={index === state.roles.length - 1}
                siblingIndex={index}
                totalSiblings={state.roles.length}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
