"use client"

import React, { useState } from "react"
import { Shield, Plus, Settings2, Trash2, ChevronDown, ChevronUp, ArrowUpFromLine, Layers, ArrowUpToLine } from "lucide-react"
import { useRoles } from "@/context/role-context"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useDeleteRoleMutation, useDeleteRolePromoteChildrenMutation } from "@/lib/api/organization"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
  const [deleteRolePromoteChildren] = useDeleteRolePromoteChildrenMutation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const hasChildren = Boolean(role?.children?.length)
  // Node is visible (expanded) when its ID is NOT in the collapsed set
  const isExpanded = !state.expandedNodes.has(role.id)

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    dispatch({ type: "TOGGLE_EXPAND", payload: { roleId: role.id } })
  }

  const isAdminRole = !!role.isAdmin
  const roleName = role.name?.trim() || "this role"

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()

    if (isAdminRole) {
      toast({
        variant: "destructive",
        title: "Cannot delete admin role",
        description: "Admin roles are protected and cannot be deleted.",
      })
      return
    }

    // A role with sub-roles offers a choice (promote vs. delete the whole
    // branch); a leaf role just deletes.
    if (hasChildren) {
      setConfirmOpen(true)
      return
    }
    if (!confirm(`Delete "${roleName}"?`)) return
    void runDelete("branch")
  }

  // mode "promote" → lift sub-roles up to this role's parent; "branch" →
  // delete this role and its entire subtree (the original behaviour).
  const runDelete = async (mode: "promote" | "branch") => {
    setConfirmOpen(false)
    setDeleting(true)
    try {
      if (mode === "promote") {
        // No optimistic dispatch here — removing the node locally would also
        // drop its children from view before the promoted tree arrives.
        await deleteRolePromoteChildren(role.id).unwrap()
        toast({
          title: "Role deleted",
          description: `"${roleName}" removed; its sub-roles moved up one level.`,
        })
      } else {
        dispatch({ type: "DELETE_ROLE", payload: { roleId: role.id } }) // optimistic
        await deleteRoleMutation(role.id).unwrap()
        toast({ title: "Role deleted", description: roleName })
      }
      await refreshData()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't delete role",
        description: err?.data?.error || err?.message || "Something went wrong. Please try again.",
      })
      await refreshData()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col items-center relative flex-1">
      <TreeConnectors isRoot={isRoot} isFirst={isFirst} isLast={isLast} />

      {/* Delete choice — only reached for roles that HAVE sub-roles. Lets the
          user keep the sub-roles (promote them up a level) or remove the whole
          branch. Leaf roles never open this; they delete via a plain confirm. */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setConfirmOpen(false) }}>
        <DialogContent className="sm:max-w-[480px] z-[99999]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Delete &ldquo;{roleName}&rdquo;
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This role has sub-roles. Choose what happens to them.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => runDelete("promote")}
                className="w-full text-left rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 hover:bg-indigo-50 transition-colors disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
                  <ArrowUpToLine className="h-4 w-4" />
                  Promote sub-roles
                </span>
                <span className="mt-1 block text-xs text-indigo-700/80">
                  Delete only &ldquo;{roleName}&rdquo;. Its sub-roles move up one level under its parent.
                </span>
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => runDelete("branch")}
                className="w-full text-left rounded-lg border border-red-200 bg-red-50/60 p-3 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-red-700">
                  <Trash2 className="h-4 w-4" />
                  Delete entire branch
                </span>
                <span className="mt-1 block text-xs text-red-700/80">
                  Delete &ldquo;{roleName}&rdquo; and all of its sub-roles.
                </span>
              </button>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
          {/* Insert a NEW role between this role's parent and this role. The
              current node (and its entire subtree) shifts one level down.
              Disabled for the root (there is no parent above it) and for
              admin nodes (admin cannot be displaced). */}
          {!isRoot && !isAdminRole && (
            <button
              onClick={() =>
                dispatch({
                  type: "SELECT_ROLE",
                  payload: {
                    role: {
                      id: "new",
                      // parentId here is the *new* role's parent — i.e. this
                      // node's current parent. If this node was a top-level
                      // role with no parentId, the new role becomes the new
                      // top-level role.
                      parentId: role.parentId,
                      name: "",
                      description: "",
                      isAdmin: false,
                      shareDataWithPeers: false,
                      level: role.level ?? 0,
                      children: [],
                      // Marker consumed by the role-form modal to switch into
                      // "insert between" mode. Carries the id of the child
                      // that will be pushed down one level.
                      _insertBeforeId: role.id,
                      _insertBeforeName: role.name,
                    } as any,
                  },
                })
              }
              className="bg-indigo-600 text-white p-1 rounded-full shadow-lg hover:bg-indigo-700"
              title={`Insert a role above "${role.name || "this role"}"`}
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Insert a NEW role directly BELOW this node that adopts ALL of its
              current children — every direct sub-role (and its subtree) shifts
              one level down under the new role. Only shown when there are
              children to adopt. */}
          {hasChildren && (
            <button
              onClick={() =>
                dispatch({
                  type: "SELECT_ROLE",
                  payload: {
                    role: {
                      id: "new",
                      // The new role's parent is THIS node; it will adopt this
                      // node's existing children on the server.
                      parentId: role.id,
                      name: "",
                      description: "",
                      isAdmin: false,
                      shareDataWithPeers: false,
                      level: (role.level ?? 0) + 1,
                      children: [],
                      // Marker consumed by the role-form modal to switch into
                      // "insert layer" mode.
                      _insertParentId: role.id,
                      _insertParentName: role.name,
                    } as any,
                  },
                })
              }
              className="bg-blue-600 text-white p-1 rounded-full shadow-lg hover:bg-blue-700"
              title={`Insert a role below "${role.name || "this role"}" (all sub-roles move down)`}
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
          )}
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
