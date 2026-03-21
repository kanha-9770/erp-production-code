"use client"

import React from "react"
import { Plus, Settings2, Shield, Users, ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRoles } from "@/context/role-context"
import { useToast } from "@/hooks/use-toast"
import { TreeConnectors } from "./tree-connectors"
import { useDeleteOrgUnitMutation } from "@/lib/api/organization"

export function ChartNode({ unit, isFirst = false, isLast = false, isRoot = false }: any) {
  const { state, dispatch, refreshData } = useRoles()
  const { toast } = useToast()
  const [deleteOrgUnit] = useDeleteOrgUnitMutation()

  const hasChildren = unit.children && unit.children.length > 0
  // Node is visible (expanded) when its ID is NOT in the collapsed set
  const isExpanded = !state.expandedOrgNodes?.has(unit.id)

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    dispatch({ type: "TOGGLE_ORG_EXPAND", payload: { unitId: unit.id } })
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${unit.name}" and all descendants?`)) return

    try {
      const wasSelected = state.selectedOrgUnit?.id === unit.id
      await deleteOrgUnit({ organizationId: state.organizationId, unitId: unit.id }).unwrap()
      await refreshData()
      toast({ title: "Success", description: "Organization unit deleted successfully" })
      if (wasSelected) {
        dispatch({ type: "SELECT_ORG_UNIT", payload: { unit: null } })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to delete organization unit",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="flex flex-col items-center relative flex-1">
      <TreeConnectors isRoot={isRoot} isFirst={isFirst} isLast={isLast} />

      <div className="relative group bg-white border-2 border-slate-900 rounded-lg p-3 w-56 text-center z-20 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] mx-4 hover:-translate-y-1 transition-all">
        <h4 className="text-sm font-black text-slate-900 leading-tight">{unit.name}</h4>
        <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
          {unit.description || "Position"}
        </p>

        <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-slate-100">
          <span className="flex items-center text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded">
            <Shield className="h-2.5 w-2.5 mr-1" /> {unit.unitRoles?.length || 0}
          </span>
          <span className="flex items-center text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">
            <Users className="h-2.5 w-2.5 mr-1" /> {unit.userAssignments?.length || 0}
          </span>
        </div>

        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 z-30">
          <button
            onClick={() =>
              dispatch({
                type: "SELECT_ORG_UNIT",
                payload: {
                  unit: {
                    id: "new",
                    parentId: unit.id,
                    name: "",
                    description: "",
                    children: [],
                    unitRoles: [],
                    userAssignments: [],
                  } as any,
                },
              })
            }
            className="bg-slate-900 text-white p-1 rounded-full shadow-lg hover:bg-indigo-600"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={() => dispatch({ type: "SELECT_ORG_UNIT", payload: { unit: { ...unit } } })}
            className="bg-white border border-slate-900 p-1 rounded-full shadow-lg"
          >
            <Settings2 className="h-3 w-3" />
          </button>
          <button
            onClick={handleDelete}
            className="bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-700"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {hasChildren && (
        <>
          <div className="w-px h-8 bg-slate-900 relative">
            <button
              onClick={toggleExpand}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-slate-900 rounded-full flex items-center justify-center z-40 hover:bg-slate-900 hover:text-white transition-all"
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          {isExpanded && (
            <div className="flex items-start justify-center w-full animate-in fade-in slide-in-from-top-2 duration-300">
              {unit.children.map((child: any, idx: number) => (
                <ChartNode
                  key={child.id}
                  unit={child}
                  isFirst={idx === 0}
                  isLast={idx === unit.children.length - 1}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
