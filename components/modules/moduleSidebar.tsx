

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  ArrowUpDown,
  FileText,
  FolderPlus,
  Edit,
  GripVertical,
  LayoutDashboard,
  ChevronRight,
} from "lucide-react";

interface Form {
  id: string;
  name: string;
  isPublished: boolean;
}

interface Module {
  id: string;
  name: string;
  parentId: string | null;
  children?: Module[];
  forms?: Form[];
}

interface ModuleSidebarProps {
  filteredModules: Module[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (o: "asc" | "desc") => void;
  selectedModule: Module | null;
  setSelectedModule: (m: Module | null) => void;
  setSelectedForm: (f: Form | null) => void;
  openSubmoduleDialog: (m: Module) => void;
  openEditDialog: (m: Module) => void;
  onMoveForm: (formId: string, targetModuleId: string | null) => Promise<void>;
  onMoveModule: (moduleId: string, newParentId: string | null) => Promise<void>;
}

export default function ModuleSidebar({
  filteredModules,
  searchQuery,
  setSearchQuery,
  sortOrder,
  setSortOrder,
  selectedModule,
  setSelectedModule,
  setSelectedForm,
  openSubmoduleDialog,
  openEditDialog,
  onMoveForm,
  onMoveModule,
}: ModuleSidebarProps) {
  const [width, setWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const [drag, setDrag] = useState<{
    type: "form" | "module" | null;
    id: string | null;
    over: string | null;
    position: "inside" | "before" | "after" | null;
    isDragging: boolean;
    dragOffset: { x: number; y: number };
  }>({ type: null, id: null, over: null, position: null, isDragging: false, dragOffset: { x: 0, y: 0 } });

  // Resize logic
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const w = Math.max(240, Math.min(500, e.clientX - rect.left));
      setWidth(w);
    };
    const up = () => setIsResizing(false);

    if (isResizing) {
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [isResizing]);

  const handleDragStart = useCallback((e: React.DragEvent, type: "form" | "module", id: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    setDrag({
      type,
      id,
      over: null,
      position: null,
      isDragging: true,
      dragOffset: { x: offsetX, y: offsetY }
    });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", "");
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: string | null, position: "inside" | "before" | "after" = "inside") => {
      e.preventDefault();
      e.stopPropagation();
      if (!drag.type || !drag.id) return;

      // Prevent dropping a module into itself or its descendants (cycle prevention)
      if (targetId && drag.type === "module" && isDescendantOf(drag.id, targetId, filteredModules)) {
        return;
      }

      setDrag(prev => ({ ...prev, over: targetId, position }));
    },
    [drag, filteredModules]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetId: string | null) => {
      e.preventDefault();
      e.stopPropagation();

      if (!drag.type || !drag.id) return;
      const { type, id } = drag;

      // Prevent self-drop
      if (type === "module" && targetId === id) return;

      if (type === "form") {
        // Optimistic update is handled by onMoveForm
        await onMoveForm(id, targetId).catch(() => { });
      } else if (type === "module") {
        // Optimistic update is handled by onMoveModule
        await onMoveModule(id, targetId).catch(() => { });
      }

      setDrag({ type: null, id: null, over: null, position: null, isDragging: false, dragOffset: { x: 0, y: 0 } });
    },
    [drag, onMoveForm, onMoveModule]
  );

  // Helper to check if target is descendant of dragged module (prevent cycles)
  const isDescendantOf = (draggedId: string, targetId: string, modules: Module[]): boolean => {
    const findModule = (items: Module[]): Module | undefined =>
      items.find(m => m.id === targetId) ||
      items.flatMap(m => (m.children ? findModule(m.children) : undefined)).find(Boolean);

    const targetModule = findModule(modules);
    if (!targetModule) return false;

    let current = targetModule;
    while (current) {
      if (current.id === draggedId) return true;
      // Simulate parent lookup (you might need a better way depending on your data)
      current = modules.find(m => m.children?.some(c => c.id === current.id)) || null;
    }
    return false;
  };


  const renderModules = (modules: Module[], level = 0) => {
    return modules.map(mod => {
      const selected = selectedModule?.id === mod.id;
      const over = drag.over === mod.id;
      const dragging = drag.id === mod.id;

      return (
        <AccordionItem key={mod.id} value={mod.id} className="border-none">
          {/* Drop Indicator Before */}
          <div
            className={`h-0.5 mx-4 transition-all ${over && drag.position === "before" ? "bg-blue-500 my-1" : "bg-transparent"
              }`}
            onDragOver={e => handleDragOver(e, mod.parentId, "before")}
            onDrop={e => handleDrop(e, mod.parentId)}
          />

          <div
            className={`
              group mx-2 rounded-md transition-all duration-200
              ${dragging ? "opacity-50 scale-95 shadow-md" : ""}
              ${selected ? "bg-blue-50 border-blue-100 border" : "hover:bg-gray-50 border border-transparent"}
              ${over && drag.position === "inside" ? "ring-2 ring-blue-500 bg-blue-50/70 shadow-lg scale-105" : ""}
              ${over && !drag.isDragging ? "bg-gradient-to-r from-blue-50 to-transparent" : ""}
            `}
            onDragOver={e => handleDragOver(e, mod.id, "inside")}
            onDrop={e => handleDrop(e, mod.id)}
            onDragLeave={() => { }}
          >
            <div className="flex items-center min-h-[42px]">
              <div
                draggable
                onDragStart={e => handleDragStart(e, "module", mod.id)}
                className="p-2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <GripVertical className="h-4 w-4 text-gray-400" />
              </div>

              <AccordionTrigger className="flex-1 py-2 hover:no-underline">
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className={`h-4 w-4 ${selected ? "text-blue-600" : "text-gray-400"}`} />
                  <span className={`text-[13px] font-bold tracking-wide truncate ${selected ? "text-blue-900" : "text-gray-700"}`}>
                    {mod.name.toUpperCase()}
                  </span>
                </div>
              </AccordionTrigger>

              <div className="flex gap-0.5 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white hover:text-blue-600" onClick={() => openSubmoduleDialog(mod)}>
                  <FolderPlus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white hover:text-blue-600" onClick={() => openEditDialog(mod)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <AccordionContent className="pb-2">
              <div className="ml-6 border-l-2 border-gray-100 pl-2 space-y-1">
                {/* Forms Rendering */}
                {mod.forms?.map(form => {
                  const isFormDragging = drag.id === form.id && drag.isDragging;
                  return (
                    <div
                      key={form.id}
                      draggable
                      onDragStart={e => handleDragStart(e, "form", form.id)}
                      className={`
                        flex items-center gap-3 px-3 py-2 text-[11px] rounded-md border border-transparent
                        cursor-grab active:cursor-grabbing transition-all hover:bg-white hover:border-gray-200 hover:shadow-sm
                        group/form
                        ${isFormDragging ? "opacity-50 scale-95 shadow-lg" : ""}
                        ${drag.over === form.id && drag.position === "inside" ? "ring-2 ring-amber-400 bg-amber-50/50" : ""}
                      `}
                    >
                      <FileText className={`h-3.5 w-3.5 transition-all ${isFormDragging ? "scale-110" : ""} ${form.isPublished ? "text-green-500" : "text-amber-500"}`} />
                      <span className="truncate flex-1 font-bold text-gray-600 tracking-wider">
                        {form.name.toUpperCase()}
                      </span>
                      {form.isPublished && (
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                      )}
                    </div>
                  );
                })}

                {/* View Module Details Action */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-8 text-[11px] font-bold text-gray-400 hover:text-blue-600 hover:bg-blue-50/50"
                  onClick={() => {
                    setSelectedModule(mod);
                    setSelectedForm(null);
                  }}
                >
                  <ChevronRight className="h-3 w-3 mr-1" />
                  VIEW {mod.name.toUpperCase()} DETAILS
                </Button>

                {/* Sub-modules */}
                {mod.children?.length ? (
                  <Accordion type="multiple" className="w-full">
                    {renderModules(mod.children, level + 1)}
                  </Accordion>
                ) : null}
              </div>
            </AccordionContent>
          </div>
        </AccordionItem>
      );
    });
  };

  return (
    <div
      ref={sidebarRef}
      className="bg-white border-r flex flex-col h-full shadow-sm select-none relative"
      style={{ width: `${width}px` }}
    >
      {/* Header */}
      <div className="p-5 space-y-4 border-b bg-gray-50/30">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">
            System Modules
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-blue-600"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="SEARCH MODULES..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-10 text-[12px] font-medium bg-white border-gray-200 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Content with Root Drop Zones */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 py-4 px-2">
        {/* Top Root Drop Zone */}
        <div
          className={`h-12 flex items-center justify-center mx-4 rounded-lg transition-all mb-3 border-2 border-dashed ${drag.over === null && drag.position === "inside" && drag.isDragging
            ? "border-blue-500 bg-blue-100/80 shadow-md scale-105"
            : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30"
            }`}
          onDragOver={e => handleDragOver(e, null, "inside")}
          onDrop={e => handleDrop(e, null)}
        >
          <span className={`text-sm font-medium transition-all ${drag.over === null && drag.position === "inside" && drag.isDragging
            ? "text-blue-600 font-bold"
            : "text-gray-500"
            }`}>
            Drop to move to root level
          </span>
        </div>

        {filteredModules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Search className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs font-bold tracking-widest uppercase">No Modules Found</p>
          </div>
        ) : (
          <Accordion type="multiple" className="w-full space-y-1">
            {renderModules(filteredModules)}
          </Accordion>
        )}

        {/* Bottom Root Drop Zone */}
        <div
          className={`h-12 flex items-center justify-center mx-4 rounded-lg transition-all mt-3 border-2 border-dashed ${drag.over === null && drag.position === "inside" && drag.isDragging
            ? "border-blue-500 bg-blue-100/80 shadow-md scale-105"
            : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30"
            }`}
          onDragOver={e => handleDragOver(e, null, "inside")}
          onDrop={e => handleDrop(e, null)}
        >
          <span className={`text-sm font-medium transition-all ${drag.over === null && drag.position === "inside" && drag.isDragging
            ? "text-blue-600 font-bold"
            : "text-gray-500"
            }`}>
            Drop to move to root level
          </span>
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-all"
        onMouseDown={() => setIsResizing(true)}
      />
    </div>
  );
}
