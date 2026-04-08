"use client"

import React from "react"
import { Shield, Plus, Settings2, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import { useRoles } from "@/context/role-context"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useDeleteRoleMutation } from "@/lib/api/organization"
import { TreeConnectors } from "./tree-connectors"

type RoleChartNodeProps = {
  role: any
  isFirst: boolean
  isLast: boolean
  isRoot: boolean
}

export function RoleChartNode({ role, isFirst, isLast, isRoot }: RoleChartNodeProps) {
  const { state, dispatch, refreshData } = useRoles()
  const { toast } = useToast()
  const [deleteRoleMutation] = useDeleteRoleMutation()

  const hasChildren = Boolean(role?.children?.length)
  // Node is visible (expanded) when its ID is NOT in the collapsed set
  const isExpanded = !state.expandedNodes.has(role.id)

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    dispatch({ type: "TOGGLE_EXPAND", payload: { roleId: role.id } })
  }

  const isAdminRole = !!role.isAdmin

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (isAdminRole) {
      toast({
        variant: "destructive",
        title: "Cannot delete admin role",
        description: "Admin roles are protected and cannot be deleted.",
      })
      return
    }

    const roleName = role.name?.trim() || "this role"
    if (!confirm(`Delete "${roleName}" and all its sub-roles?\nThis cannot be undone.`)) return

    // Optimistic remove
    dispatch({ type: "DELETE_ROLE", payload: { roleId: role.id } })

    try {
      await deleteRoleMutation(role.id).unwrap()
      toast({ title: "Role deleted", description: roleName })
      await refreshData()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't delete role",
        description: err.message || "Something went wrong. Please try again.",
      })
      await refreshData()
    }
  }

  return (
    <div className="flex flex-col items-center relative flex-1">
      <TreeConnectors isRoot={isRoot} isFirst={isFirst} isLast={isLast} />

      <div className={cn(
        "relative group rounded-lg p-3 w-52 text-center z-20 mx-4 hover:-translate-y-1 transition-all",
        isAdminRole
          ? "bg-amber-50 border-2 border-amber-500 shadow-[3px_3px_0px_0px_rgba(217,119,6,1)]"
          : "bg-white border-2 border-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
      )}>
        <h4 className="text-sm font-black text-slate-900 truncate">
          {role.name || "Untitled Role"}
        </h4>
        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Level {role.level ?? "?"}</p>

        {isAdminRole && (
          <div className="mt-2 text-[9px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded border border-amber-300 inline-block">
            ADMIN
          </div>
        )}

        {role.shareDataWithPeers && (
          <div className="mt-2 text-[9px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-200 inline-block">
            Peer Sharing Active
          </div>
        )}

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
                    isAdmin: false,
                    shareDataWithPeers: false,
                    level: (role.level ?? 0) + 1,
                    children: [],
                  },
                },
              })
            }
            className="bg-slate-900 text-white p-1 rounded-full shadow-lg hover:bg-purple-600"
            title="Add child"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => dispatch({ type: "SELECT_ROLE", payload: { role: { ...role } } })}
            className={cn(
              "p-1 rounded-full shadow-lg",
              isAdminRole
                ? "bg-amber-50 border border-amber-400 text-amber-700 hover:bg-amber-100"
                : "bg-white border border-slate-900 text-slate-900 hover:bg-slate-100"
            )}
            title={isAdminRole ? "View (protected)" : "Edit"}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          {!isAdminRole && (
            <button
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white p-1 rounded-full shadow-lg transition-colors"
              title="Delete role"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {hasChildren && (
        <>
          <div className="w-px h-8 bg-slate-900 relative">
            <button
              onClick={toggleExpand}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-white border-2 border-slate-900 rounded-full flex items-center justify-center z-40 hover:bg-slate-100"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
  )
}
