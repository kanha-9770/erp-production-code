"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  ChevronRight,
  ChevronDown,
  FileText,
  MoreHorizontal,
  Edit,
  Trash2,
  Folder,
  FolderOpen,
  Eye,
  BarChart3,
  Settings,
  Copy,
  FolderPlus,
  FilePlus,
  Info,
} from "lucide-react"
import Link from "next/link"
import type { FormModule, Form } from "@/types/form-builder"

interface PerfectHierarchicalTreeProps {
  modules: FormModule[]
  onEditModule: (module: FormModule) => void
  onDeleteModule: (moduleId: string) => void
  onCreateSubModule: (parentId: string) => void
  onCreateForm?: (moduleId: string) => void
  onSelectModule?: (module: FormModule) => void
  selectedModuleId?: string
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
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">{moduleName}</div>

      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
        onClick={() => {
          onCreateSubModule(moduleId)
          onClose()
        }}
      >
        <FolderPlus className="h-4 w-4 text-blue-600" />
        Create Sub-module
      </button>

      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-2"
        onClick={() => {
          onCreateForm(moduleId)
          onClose()
        }}
      >
        <FilePlus className="h-4 w-4 text-green-600" />
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
          <Edit className="h-4 w-4 text-gray-600" />
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

interface TreeNodeProps {
  module: FormModule
  level: number
  isExpanded: boolean
  onToggleExpanded: (moduleId: string) => void
  onEditModule: (module: FormModule) => void
  onDeleteModule: (moduleId: string) => void
  onCreateSubModule: (parentId: string) => void
  onCreateForm: (moduleId: string) => void
  onContextMenu: (e: React.MouseEvent, moduleId: string, moduleName: string) => void
  onSelectModule?: (module: FormModule) => void
  selectedModuleId?: string
  isLastChild?: boolean
  parentLines?: boolean[]
}

function TreeNode({
  module,
  level,
  isExpanded,
  onToggleExpanded,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
  onCreateForm,
  onContextMenu,
  onSelectModule,
  selectedModuleId,
  isLastChild = false,
  parentLines = [],
}: TreeNodeProps) {
  const hasChildren = module.children && module.children.length > 0
  const hasForms = module.forms && module.forms.length > 0
  const hasContent = hasChildren || hasForms
  const isSelected = selectedModuleId === module.id

  // Calculate indentation - each level gets 24px
  const indentWidth = level * 24

  return (
    <div className="select-none">
      {/* Module Row */}
      <div
        className={`group flex items-center gap-2 py-2 px-3 hover:bg-blue-50 transition-colors cursor-pointer rounded-md mx-1 relative ${
          isSelected ? "bg-blue-100 border-l-4 border-blue-500" : ""
        }`}
        style={{ paddingLeft: 12 + indentWidth }}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e, module.id, module.name)
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (onSelectModule) {
            onSelectModule(module)
          }
          if (hasContent) {
            onToggleExpanded(module.id)
          }
        }}
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
                      left: 12 + index * 24 + 12,
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
                  left: 12 + (level - 1) * 24 + 12,
                  top: "50%",
                  bottom: 0,
                }}
              />
            )}

            {/* Horizontal line to item */}
            <div
              className="absolute h-px bg-gray-300"
              style={{
                left: 12 + (level - 1) * 24 + 12,
                top: "50%",
                width: 12,
              }}
            />

            {/* Vertical line to middle of item */}
            <div
              className="absolute w-px bg-gray-300"
              style={{
                left: 12 + (level - 1) * 24 + 12,
                top: 0,
                height: "50%",
              }}
            />
          </>
        )}

        {/* Expand/Collapse Button */}
        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          {hasContent ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-600" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
        </div>

        {/* Module Icon */}
        <div className="flex-shrink-0">
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-5 w-5 text-blue-600" />
            ) : (
              <Folder className="h-5 w-5 text-blue-600" />
            )
          ) : (
            <Folder className="h-5 w-5 text-gray-600" />
          )}
        </div>

        {/* Module Info */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className={`font-medium text-sm truncate ${isSelected ? "text-blue-900" : "text-gray-900"}`}>
            {module.name}
          </span>

          {/* Badges */}
          <div className="flex items-center gap-1">
            {module.moduleType === "master" && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-blue-50 border-blue-200 text-blue-700">
                master
              </Badge>
            )}

            {module.moduleType === "child" && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-green-50 border-green-200 text-green-700">
                sub
              </Badge>
            )}

            {module.forms && module.forms.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                {module.forms.length} forms
              </Badge>
            )}

            {hasChildren && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5 text-purple-700 border-purple-200">
                {module.children?.length} sub
              </Badge>
            )}

            <Badge variant="outline" className="text-xs px-1.5 py-0.5 text-gray-600 border-gray-200">
              L{module.level}
            </Badge>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-blue-100"
            onClick={(e) => {
              e.stopPropagation()
              onCreateSubModule(module.id)
            }}
            title="Add Sub-module"
          >
            <FolderPlus className="h-3 w-3 text-blue-600" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-green-100"
            onClick={(e) => {
              e.stopPropagation()
              onCreateForm(module.id)
            }}
            title="Add Form"
          >
            <FilePlus className="h-3 w-3 text-green-600" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-gray-100"
            onClick={(e) => {
              e.stopPropagation()
              if (onSelectModule) {
                onSelectModule(module)
              }
            }}
            title="View Details"
          >
            <Info className="h-3 w-3 text-gray-600" />
          </Button>

          <Link href={`/modules/${module.id}`} onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs hover:bg-gray-100">
              Open
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-gray-200"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onEditModule(module)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Module
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreateSubModule(module.id)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Add Sub-module
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreateForm(module.id)}>
                <FilePlus className="mr-2 h-4 w-4" />
                Add Form
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDeleteModule(module.id)} className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Module
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Children Container - This is where submodules appear INSIDE the parent */}
      {isExpanded && (
        <div className="relative">
          {/* Render Child Modules FIRST - This ensures perfect nesting */}
          {hasChildren &&
            module.children.map((child, index) => {
              const isLastChildModule = index === module.children.length - 1 && (!hasForms || module.forms.length === 0)
              const newParentLines = [...parentLines, !isLastChild]

              return (
                <TreeNode
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
                  onSelectModule={onSelectModule}
                  selectedModuleId={selectedModuleId}
                  isLastChild={isLastChildModule}
                  parentLines={newParentLines}
                />
              )
            })}

          {/* Render Forms */}
          {hasForms &&
            module.forms.map((form: Form, index) => (
              <div
                key={form.id}
                className="group flex items-center gap-2 py-1.5 px-2 hover:bg-green-50 transition-colors rounded-md mx-1 relative"
                style={{ paddingLeft: 12 + (level + 1) * 24 }}
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
                          left: 12 + lineIndex * 24 + 12,
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
                      left: 12 + level * 24 + 12,
                      top: "50%",
                      bottom: 0,
                    }}
                  />
                )}

                {/* Horizontal line to form */}
                <div
                  className="absolute h-px bg-gray-300"
                  style={{
                    left: 12 + level * 24 + 12,
                    top: "50%",
                    width: 12,
                  }}
                />

                {/* Vertical line to middle of form */}
                <div
                  className="absolute w-px bg-gray-300"
                  style={{
                    left: 12 + level * 24 + 12,
                    top: 0,
                    height: "50%",
                  }}
                />

                <div className="w-5 h-5" />

                <FileText className="h-4 w-4 text-green-600 flex-shrink-0" />

                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-sm text-gray-900 truncate">{form.name}</span>

                  {form.isPublished && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0.5 bg-green-50 border-green-200 text-green-700"
                    >
                      live
                    </Badge>
                  )}

                  <span className="text-xs text-gray-500">{form.recordCount || 0} submissions</span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link href={`/forms/${form.id}/builder`}>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-blue-100" title="Edit Form">
                      <Edit className="h-3 w-3 text-blue-600" />
                    </Button>
                  </Link>
                  <Link href={`/preview/${form.id}`} target="_blank">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-green-100" title="Preview Form">
                      <Eye className="h-3 w-3 text-green-600" />
                    </Button>
                  </Link>
                  <Link href={`/forms/${form.id}/analytics`}>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-purple-100" title="Analytics">
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

export default function PerfectHierarchicalTree({
  modules,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
  onCreateForm = () => {},
  onSelectModule,
  selectedModuleId,
}: PerfectHierarchicalTreeProps) {
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

  const handleEditModuleFromContext = (moduleId: string) => {
    const module = findModuleById(modules, moduleId)
    if (module) {
      onEditModule(module)
    }
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

  const getAllModuleIds = (moduleList: FormModule[]): string[] => {
    const ids: string[] = []
    for (const module of moduleList) {
      if ((module.children && module.children.length > 0) || (module.forms && module.forms.length > 0)) {
        ids.push(module.id)
      }
      if (module.children) {
        ids.push(...getAllModuleIds(module.children))
      }
    }
    return ids
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Folder className="h-6 w-6 text-blue-600" />
            <div>
              <h3 className="font-semibold text-lg text-gray-900">Module Hierarchy</h3>
              <p className="text-sm text-gray-600">
                Perfect nested structure • Click to select • Right-click for actions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setExpandedModules(new Set())} className="text-xs">
              Collapse All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const allIds = new Set(getAllModuleIds(modules))
                setExpandedModules(allIds)
              }}
              className="text-xs"
            >
              Expand All
            </Button>
          </div>
        </div>
      </div>

      {/* Tree Content */}
      <div className="p-4 max-h-[70vh] overflow-y-auto relative">
        {modules.length > 0 ? (
          <div className="space-y-1">
            {modules.map((module, index) => (
              <TreeNode
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
                onSelectModule={onSelectModule}
                selectedModuleId={selectedModuleId}
                isLastChild={index === modules.length - 1}
                parentLines={[]}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Folder className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <h4 className="font-medium text-gray-900 mb-2">No modules found</h4>
            <p className="text-sm">Right-click in empty space or create your first module</p>
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
