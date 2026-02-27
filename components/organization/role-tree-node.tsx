"use client";

import React from "react";
import {
  Shield,
  Plus,
  Settings2,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useRoles } from "@/context/role-context";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast"; // shadcn toast (or sonner, whatever you use)

type RoleChartNodeProps = {
  role: any;
  isFirst: boolean;
  isLast: boolean;
  isRoot: boolean;
};

export function RoleChartNode({
  role,
  isFirst,
  isLast,
  isRoot,
}: RoleChartNodeProps) {
  const { state, dispatch, refreshData } = useRoles();

  const hasChildren = Boolean(role?.children?.length);
  const isExpanded = !state.expandedNodes.has(role.id);

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "TOGGLE_EXPAND", payload: { roleId: role.id } });
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    const roleName = role.name?.trim() || "this role";

    if (
      !confirm(
        `Delete "${roleName}" and all its sub-roles?\nThis cannot be undone.`
      )
    ) {
      return;
    }

    // ────────────────────────────────────────────────────────────────
    // 1. Optimistic update – remove from UI instantly
    // ────────────────────────────────────────────────────────────────
    dispatch({
      type: "DELETE_ROLE",
      payload: { roleId: role.id },
    });

    // Immediate friendly feedback
    const toastId = toast({
      title: "Removing role...",
      description: roleName,
      duration: 7000, // long enough to be replaced
    }).id;

    try {
      // ────────────────────────────────────────────────────────────────
      // 2. Real API call
      // ────────────────────────────────────────────────────────────────
      const response = await fetch(`/api/roles/${role.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        let message = "Failed to delete role";
        try {
          const data = await response.json();
          message = data.error || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      // ────────────────────────────────────────────────────────────────
      // 3. Success case
      // ────────────────────────────────────────────────────────────────
      toast({
        id: toastId, // replace previous toast
        title: "Role deleted",
        description: roleName,
        variant: "success", // or "default" depending on your toast config
        duration: 4500,
      });

      // Final sync with server
      await refreshData();
    } catch (err: any) {
      // ────────────────────────────────────────────────────────────────
      // 4. Error case → rollback + feedback
      // ────────────────────────────────────────────────────────────────
      console.error("[DELETE ROLE FAILED]", err);

      toast({
        id: toastId, // replace loading toast
        variant: "destructive",
        title: "Couldn't delete role",
        description: err.message || "Something went wrong. Please try again.",
        duration: 6500,
      });

      // Most reliable rollback method
      await refreshData();
    }
  };

  return (
    <div className="flex flex-col items-center relative flex-1">
      {/* Top connector line */}
      <div className="flex w-full justify-center h-8 relative">
        {!isRoot && (
          <>
            <div
              className={cn(
                "absolute top-0 left-0 w-1/2 h-px bg-slate-900",
                isFirst && "hidden"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 w-1/2 h-px bg-slate-900",
                isLast && "hidden"
              )}
            />
            <div className="w-px h-full bg-slate-900 z-10" />
          </>
        )}
      </div>

      {/* Role card */}
      <div className="relative group bg-white border-2 border-slate-900 rounded-lg p-3 w-52 text-center z-20 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] mx-4 hover:-translate-y-1 transition-all">
        <h4 className="text-sm font-black text-slate-900 truncate">
          {role.name || "Untitled Role"}
        </h4>
        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
          Level {role.level ?? "?"}
        </p>

        {role.shareDataWithPeers && (
          <div className="mt-2 text-[9px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-200 inline-block">
            Peer Sharing Active
          </div>
        )}

        {/* Action buttons */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 z-30">
          <button
            onClick={() =>
              dispatch({
                type: "SELECT_ROLE",
                payload: {
                  role: {
                    id: "new",
                    parentId: role.id,
                    name: "",
                    description: "",
                    level: (role.level ?? 0) + 1,
                    children: [],
                  } as any,
                },
              })
            }
            className="bg-slate-900 text-white p-1 rounded-full shadow-lg hover:bg-purple-600"
            title="Add child"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() =>
              dispatch({ type: "SELECT_ROLE", payload: { role: { ...role } } })
            }
            className="bg-white border border-slate-900 text-slate-900 p-1 rounded-full shadow-lg hover:bg-slate-100"
            title="Edit"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 text-white p-1 rounded-full shadow-lg transition-colors"
            title="Delete role"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && (
        <>
          <div className="w-px h-8 bg-slate-900 relative">
            <button
              onClick={toggleExpand}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-white border-2 border-slate-900 rounded-full flex items-center justify-center z-40 hover:bg-slate-100"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>

          {isExpanded && (
            <div className="flex items-start justify-center w-full pt-1">
              {role.children.map((child: any, idx: number) => (
                <RoleChartNode
                  key={child.id}
                  role={child}
                  isFirst={idx === 0}
                  isLast={idx === role.children.length - 1}
                  isRoot={false}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
