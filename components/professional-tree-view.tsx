"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  Eye,
  BarChart3,
  Edit,
  Trash2,
  FolderPlus,
  FilePlus,
} from "lucide-react"
import Link from "next/link"
import type { FormModule, Form } from "@/types/form-builder"

interface ProfessionalTreeViewProps {
  modules: FormModule[]
  onEditModule: (module: FormModule) => void
  onDeleteModule: (moduleId: string) => void
  onCreateSubModule: (parentId: string) => void
  onCreateForm?: (moduleId: string) => void
}

interface ContextMenuProps {
  x: number
  y: number
  moduleId: string
  moduleName: string
  onClose: () => void
  onCreateSubModule: (parentId: string) => void
  onCreateForm: (moduleId: string) => void
  onEditModule: (moduleId: string) => void
  onDeleteModule: (moduleId: string) => void
}

function ContextMenu({
  x,
  y,
  moduleId,
  moduleName,
  onClose,
  onCreateSubModule,
  onCreateForm,
  onEditModule,
  onDeleteModule,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-48"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b border-gray-100 bg-gray-50">
        {moduleName}
      </div>
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 text-blue-700"
        onClick={() => {
          onCreateSubModule(moduleId)
          onClose()
        }}
      >
        <FolderPlus className="h-4 w-4" />
        Create Sub-module
      </button>
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-2 text-green-700"
        onClick={() => {
          onCreateForm(moduleId)
          onClose()
        }}
      >
        <FilePlus className="h-4 w-4" />
        Create Form
      </button>
      <div className="border-t border-gray-100 mt-1 pt-1">
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
          onClick={() => {
            onEditModule(moduleId)
            onClose()
          }}
        >
          <Edit className="h-4 w-4" />
          Edit Module
        </button>
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 text-red-600"
          onClick={() => {
            onDeleteModule(moduleId)
            onClose()
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete Module
        </button>
      </div>
    </div>
  )
}

interface TreeItemProps {
  module: FormModule
  level: number
  isExpanded: boolean
  onToggleExpanded: (moduleId: string) => void
  onEditModule: (module: FormModule) => void
  onDeleteModule: (moduleId: string) => void
  onCreateSubModule: (parentId: string) => void
  onCreateForm: (moduleId: string) => void
  onContextMenu: (e: React.MouseEvent, moduleId: string, moduleName: string) => void
  isLastChild?: boolean
  parentLines?: boolean[]
}

function TreeItem({
  module,
  level,
  isExpanded,
  onToggleExpanded,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
  onCreateForm,
  onContextMenu,
  isLastChild = false,
  parentLines = [],
}: TreeItemProps) {
  const hasChildren = module.children && module.children.length > 0
  const hasForms = module.forms && module.forms.length > 0
  const hasContent = hasChildren || hasForms

  return (
    <div className="select-none">
      {/* Module Row */}
      <div
        className="group flex items-center gap-2 py-1.5 px-2 hover:bg-blue-50 transition-colors cursor-pointer relative"
        style={{ paddingLeft: 8 + level * 20 }}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e, module.id, module.name)
        }}
        onClick={() => hasContent && onToggleExpanded(module.id)}
      >
        {/* Tree Lines */}
        {level > 0 && (
          <>
            {/* Draw vertical lines for all parent levels */}
            {parentLines.map(
              (shouldDraw, index) =>
                shouldDraw && (
                  <div
                    key={index}
                    className="absolute w-px bg-gray-300"
                    style={{
                      left: 8 + index * 20 + 10,
                      top: 0,
                      bottom: 0,
                    }}
                  />
                ),
            )}

            {/* Vertical line from parent (only if not last child) */}
            {!isLastChild && (
              <div
                className="absolute w-px bg-gray-300"
                style={{
                  left: 8 + (level - 1) * 20 + 10,
                  top: "50%",
                  bottom: 0,
                }}
              />
            )}

            {/* Horizontal line to item */}
            <div
              className="absolute h-px bg-gray-300"
              style={{
                left: 8 + (level - 1) * 20 + 10,
                top: "50%",
                width: 10,
              }}
            />

            {/* Vertical line to middle of item */}
            <div
              className="absolute w-px bg-gray-300"
              style={{
                left: 8 + (level - 1) * 20 + 10,
                top: 0,
                height: "50%",
              }}
            />
          </>
        )}

        {/* Expand/Collapse */}
        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {hasContent ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3 text-gray-500" />
            ) : (
              <ChevronRight className="h-3 w-3 text-gray-500" />
            )
          ) : null}
        </div>

        {/* Icon */}
        <div className="flex-shrink-0">
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-600" />
            ) : (
              <Folder className="h-4 w-4 text-blue-600" />
            )
          ) : (
            <Folder className="h-4 w-4 text-gray-500" />
          )}
        </div>

        {/* Name and Info */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900 truncate">{module.name}</span>

          {module.moduleType === "master" && (
            <Badge variant="outline" className="text-xs px-1 py-0 bg-blue-50 border-blue-200 text-blue-700">
              master
            </Badge>
          )}

          {module.forms && module.forms.length > 0 && (
            <Badge variant="secondary" className="text-xs px-1 py-0">
              {module.forms.length}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation()
              onCreateSubModule(module.id)
            }}
          >
            <FolderPlus className="h-3 w-3 text-blue-600" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation()
              onCreateForm(module.id)
            }}
          >
            <FilePlus className="h-3 w-3 text-green-600" />
          </Button>
          <Link href={`/modules/${module.id}`} onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              Open
            </Button>
          </Link>
        </div>
      </div>

      {/* Children - This is where submodules appear INSIDE the parent */}
      {isExpanded && (
        <div>
          Render Child Modules FIRST - so they appear inside the parent
          {hasChildren &&
            module.children?.map((child, index) => {
              const isLastChildModule = index === (module.children?.length ?? 0) - 1 && (!hasForms || module.forms.length === 0)
              const newParentLines = [...parentLines, !isLastChild]

              return (
                <TreeItem
                  key={child.id}
                  module={child}
                  level={level + 1}
                  isExpanded={isExpanded}
                  onToggleExpanded={onToggleExpanded}
                  onEditModule={onEditModule}
                  onDeleteModule={onDeleteModule}
                  onCreateSubModule={onCreateSubModule}
                  onCreateForm={onCreateForm}
                  onContextMenu={onContextMenu}
                  isLastChild={isLastChildModule}
                  parentLines={newParentLines}
                />
              )
            })}

          {/* Render Forms AFTER submodules */}
          {hasForms &&
            module.forms.map((form: Form, index) => (
              <div
                key={form.id}
                className="group flex items-center gap-2 py-1 px-2 hover:bg-green-50 transition-colors relative"
                style={{ paddingLeft: 8 + (level + 1) * 20 }}
              >
                {/* Tree lines for forms */}
                {/* Draw vertical lines for all parent levels */}
                {[...parentLines, !isLastChild].map(
                  (shouldDraw, lineIndex) =>
                    shouldDraw && (
                      <div
                        key={lineIndex}
                        className="absolute w-px bg-gray-300"
                        style={{
                          left: 8 + lineIndex * 20 + 10,
                          top: 0,
                          bottom: 0,
                        }}
                      />
                    ),
                )}

                {/* Vertical line from parent (only if not last form) */}
                {index < module.forms.length - 1 && (
                  <div
                    className="absolute w-px bg-gray-300"
                    style={{
                      left: 8 + level * 20 + 10,
                      top: "50%",
                      bottom: 0,
                    }}
                  />
                )}

                {/* Horizontal line to form */}
                <div
                  className="absolute h-px bg-gray-300"
                  style={{
                    left: 8 + level * 20 + 10,
                    top: "50%",
                    width: 10,
                  }}
                />

                {/* Vertical line to middle of form */}
                <div
                  className="absolute w-px bg-gray-300"
                  style={{
                    left: 8 + level * 20 + 10,
                    top: 0,
                    height: "50%",
                  }}
                />

                <div className="w-4 h-4" />
                <FileText className="h-4 w-4 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-sm text-gray-900 truncate">{form.name}</span>
                  {form.isPublished && (
                    <Badge variant="outline" className="text-xs px-1 py-0 bg-green-50 border-green-200 text-green-700">
                      live
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link href={`/forms/${form.id}/builder`}>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                      <Edit className="h-3 w-3 text-blue-600" />
                    </Button>
                  </Link>
                  <Link href={`/preview/${form.id}`} target="_blank">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                      <Eye className="h-3 w-3 text-green-600" />
                    </Button>
                  </Link>
                  <Link href={`/forms/${form.id}/analytics`}>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                      <BarChart3 className="h-3 w-3 text-purple-600" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

export default function ProfessionalTreeView({
  modules,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
  onCreateForm = () => {},
}: ProfessionalTreeViewProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    moduleId: string
    moduleName: string
  } | null>(null)

  const handleToggleExpanded = (moduleId: string) => {
    const newExpanded = new Set(expandedModules)
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId)
    } else {
      newExpanded.add(moduleId)
    }
    setExpandedModules(newExpanded)
  }

  const handleContextMenu = (e: React.MouseEvent, moduleId: string, moduleName: string) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      moduleId,
      moduleName,
    })
  }

  const findModuleById = (moduleList: FormModule[], id: string): FormModule | null => {
    for (const module of moduleList) {
      if (module.id === id) return module
      if (module.children) {
        const found = findModuleById(module.children, id)
        if (found) return found
      }
    }
    return null
  }

  const handleEditModuleFromContext = (moduleId: string) => {
    const module = findModuleById(modules, moduleId)
    if (module) {
      onEditModule(module)
    }
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Folder className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-gray-900">Modules</h3>
              <p className="text-sm text-gray-600">Right-click to create forms & submodules</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setExpandedModules(new Set())}>
              Collapse All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const allIds = new Set<string>()
                const collectIds = (mods: FormModule[]) => {
                  mods.forEach((mod) => {
                    if ((mod.children && mod.children.length > 0) || (mod.forms && mod.forms.length > 0)) {
                      allIds.add(mod.id)
                    }
                    if (mod.children) collectIds(mod.children)
                  })
                }
                collectIds(modules)
                setExpandedModules(allIds)
              }}
            >
              Expand All
            </Button>
          </div>
        </div>
      </div>

      {/* Tree Content */}
      <div className="p-2 max-h-[70vh] overflow-y-auto">
        {modules.length > 0 ? (
          <div className="space-y-0.5">
            {modules.map((module, index) => (
              <TreeItem
                key={module.id}
                module={module}
                level={0}
                isExpanded={expandedModules.has(module.id)}
                onToggleExpanded={handleToggleExpanded}
                onEditModule={onEditModule}
                onDeleteModule={onDeleteModule}
                onCreateSubModule={onCreateSubModule}
                onCreateForm={onCreateForm}
                onContextMenu={handleContextMenu}
                isLastChild={index === modules.length - 1}
                parentLines={[]}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Folder className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <h4 className="font-medium text-gray-900 mb-2">No modules found</h4>
            <p className="text-sm">Create your first module to get started</p>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          moduleId={contextMenu.moduleId}
          moduleName={contextMenu.moduleName}
          onClose={() => setContextMenu(null)}
          onCreateSubModule={onCreateSubModule}
          onCreateForm={onCreateForm}
          onEditModule={handleEditModuleFromContext}
          onDeleteModule={onDeleteModule}
        />
      )}
    </div>
  )
}
