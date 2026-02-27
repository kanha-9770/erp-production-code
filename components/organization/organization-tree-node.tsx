"use client";

import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronRight, ChevronDown, Plus, Edit, Trash2, 
  Users, Shield, GpripVertical, MoreHorizontal,
  Building2, Briefcase
} from "lucide-react";
import { useRoles } from "@/context/role-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrganizationTreeNodeProps {
  unit: any;
  isLast?: boolean;
}

export function OrganizationTreeNode({ unit, isLast }: OrganizationTreeNodeProps) {
  const { state, dispatch } = useRoles();
  const [isHovered, setIsHovered] = useState(false);
  
  const isExpanded = state.expandedOrgNodes.has(unit.id);
  const hasChildren = unit.children && unit.children.length > 0;

  // --- DND-KIT SETUP ---
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: unit.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  // --- HANDLERS ---
  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "TOGGLE_ORG_EXPAND", payload: { unitId: unit.id } });
  };

  const handleEdit = () => dispatch({ type: "SELECT_ORG_UNIT", payload: { unit: { ...unit } } });
  
  const handleAddChild = () => {
    dispatch({
      type: "SELECT_ORG_UNIT",
      payload: { unit: { id: "new", parentId: unit.id, level: unit.level + 1, children: [] } },
    });
  };

  return (
    <div ref={setNodeRef} style={style} className="relative select-none">
      {/* Connector Lines */}
      {unit.level > 0 && (
        <div className="absolute -left-6 top-0 bottom-0 w-px bg-slate-200/60">
          <div className="absolute top-6 left-0 w-5 h-px bg-slate-200/60" />
        </div>
      )}

      <motion.div
        layout
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "group relative flex items-center gap-2 p-2 rounded-xl border transition-all duration-200 mb-2",
          isDragging ? "bg-indigo-50 border-indigo-200 shadow-xl" : 
          isHovered ? "bg-white border-slate-300 shadow-md translate-x-1" : 
          "bg-white/50 border-transparent"
        )}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
        >
          <GpripVertical className="h-4 w-4" />
        </div>

        {/* Expand Toggle */}
        <div className="w-6 h-6 flex items-center justify-center">
          {hasChildren && (
            <button
              onClick={handleToggleExpand}
              className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-transform"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4 transition-transform group-hover:scale-110" />
              )}
            </button>
          )}
        </div>

        {/* Icon based on level */}
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shadow-sm",
          unit.level === 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
        )}>
          {unit.level === 0 ? <Building2 className="h-5 w-5" /> : <Briefcase className="h-4 w-4" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className={cn(
              "text-sm font-bold truncate transition-colors",
              unit.level === 0 ? "text-slate-900" : "text-slate-700",
              isHovered && "text-indigo-600"
            )}>
              {unit.name || "Untitled Unit"}
            </h4>
            
            <AnimatePresence>
              {isHovered && (
                <motion.div 
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-1"
                >
                  {unit.unitRoles?.length > 0 && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-indigo-50 text-indigo-700 border-indigo-100 font-bold uppercase">
                      <Shield className="h-2.5 w-2.5 mr-1" /> {unit.unitRoles.length} Roles
                    </Badge>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="text-[11px] text-slate-500 font-medium truncate uppercase tracking-tight">
            Level {unit.level} • {unit.userAssignments?.length || 0} Users
          </p>
        </div>

        {/* Action Menu */}
        <div className={cn(
          "flex items-center gap-1 transition-opacity",
          isHovered ? "opacity-100" : "opacity-0"
        )}>
          <Button 
            variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
            onClick={handleAddChild}
          >
            <Plus className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-2" /> Edit Unit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600 focus:text-red-600">
                <Trash2 className="h-4 w-4 mr-2" /> Delete Unit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {/* Recursive Children with Animation */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-10 overflow-hidden"
          >
            {unit.children.map((child: any, index: number) => (
              <OrganizationTreeNode
                key={child.id}
                unit={child}
                isLast={index === unit.children.length - 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}