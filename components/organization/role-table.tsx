"use client";

/**
 * RoleTable — tabular view of the role hierarchy. Flattens the tree into
 * indented rows (respecting expand/collapse) with Level / Type / Peer Sharing /
 * Sub-roles columns and row actions. Shares the role context + actions with the
 * canvas chart, so click-to-edit, add child, and delete behave identically.
 */

import React from "react";
import { useRoles } from "@/context/role-context";
import { useToast } from "@/hooks/use-toast";
import { useDeleteRoleMutation } from "@/lib/api/organization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/role";

interface Row {
  role: Role;
  depth: number;
}

export function RoleTable() {
  const { state, dispatch, refreshData } = useRoles();
  const { toast } = useToast();
  const [deleteRoleMutation] = useDeleteRoleMutation();

  const roles = state.roles ?? [];

  // Flatten the tree into rows, skipping the children of collapsed nodes.
  // A node is collapsed when its id IS in expandedNodes (collapsed set).
  const rows: Row[] = [];
  const walk = (list: Role[], depth: number) => {
    for (const role of list) {
      rows.push({ role, depth });
      const children = role.children ?? [];
      if (children.length && !state.expandedNodes.has(role.id)) {
        walk(children, depth + 1);
      }
    }
  };
  walk(roles, 0);

  const edit = (role: Role) =>
    dispatch({ type: "SELECT_ROLE", payload: { role: { ...role } } });

  const addChild = (e: React.MouseEvent, role: Role) => {
    e.stopPropagation();
    dispatch({
      type: "SELECT_ROLE",
      payload: {
        role: {
          id: "new",
          parentId: role.id,
          name: "",
          description: "",
          isAdmin: false,
          shareDataWithPeers: false,
          level: (role.level ?? 0) + 1,
          children: [],
        } as unknown as Role,
      },
    });
  };

  const toggle = (e: React.MouseEvent, role: Role) => {
    e.stopPropagation();
    dispatch({ type: "TOGGLE_EXPAND", payload: { roleId: role.id } });
  };

  const remove = async (e: React.MouseEvent, role: Role) => {
    e.stopPropagation();
    if (role.isAdmin) {
      toast({
        variant: "destructive",
        title: "Cannot delete admin role",
        description: "Admin roles are protected.",
      });
      return;
    }
    const name = role.name?.trim() || "this role";
    if (!confirm(`Delete "${name}" and all its sub-roles?\nThis cannot be undone.`))
      return;
    dispatch({ type: "DELETE_ROLE", payload: { roleId: role.id } });
    try {
      await deleteRoleMutation(role.id).unwrap();
      toast({ title: "Role deleted", description: name });
      await refreshData();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't delete role",
        description: (err as Error).message || "Please try again.",
      });
      await refreshData();
    }
  };

  if (state.loading && roles.length === 0) {
    return (
      <div className="space-y-2 p-3 sm:p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No roles yet. Use “New Role” above to create the first one.
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3 max-h-[72vh] overflow-auto">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60">
              <th className="border-b border-r px-4 py-2.5 text-left font-medium text-muted-foreground">
                Role Name
              </th>
              <th className="border-b border-r px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Level
              </th>
              <th className="border-b border-r px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Type
              </th>
              <th className="border-b border-r px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Peer Sharing
              </th>
              <th className="border-b border-r px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                Sub-roles
              </th>
              <th className="border-b w-[80px] px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ role, depth }) => {
              const children = role.children ?? [];
              const hasChildren = children.length > 0;
              const isExpanded = !state.expandedNodes.has(role.id);
              return (
                <tr
                  key={role.id}
                  className="group hover:bg-muted/30 cursor-pointer"
                  onClick={() => edit(role)}
                >
                  <td className="border-b border-r px-4 py-3 align-middle">
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: depth * 18 }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => toggle(e, role)}
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                        >
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 transition-transform",
                              isExpanded && "rotate-90",
                            )}
                          />
                        </button>
                      ) : (
                        <span className="h-5 w-5 shrink-0" />
                      )}
                      <span className="font-medium text-foreground">
                        {role.name || "Untitled Role"}
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-r px-4 py-3 align-middle tabular-nums">
                    {role.level ?? "—"}
                  </td>
                  <td className="border-b border-r px-4 py-3 align-middle">
                    {role.isAdmin ? (
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent hover:bg-amber-500/15">
                        Admin
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Standard</span>
                    )}
                  </td>
                  <td className="border-b border-r px-4 py-3 align-middle">
                    {role.shareDataWithPeers ? (
                      <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-transparent hover:bg-blue-500/15">
                        On
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="border-b border-r px-4 py-3 align-middle tabular-nums">
                    {children.length}
                  </td>
                  <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                    <span className="inline-flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => addChild(e, role)}
                        aria-label="Add child role"
                        title="Add child role"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          edit(role);
                        }}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!role.isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => remove(e, role)}
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
