"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
  Globe,
  Calendar,
} from "lucide-react"
import Link from "next/link"
import type { FormModule, Form } from "@/types/form-builder"

interface PerfectSidebarViewProps {
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

interface SidebarModuleProps {
  module: FormModule
  level: number
  isExpanded: boolean
  onToggleExpanded: (moduleId: string) => void
  onEditModule: (module: FormModule) => void
  onDeleteModule: (moduleId: string) => void
  onCreateSubModule: (parentId: string) => void
  onCreateForm: (moduleId: string) => void
  onContextMenu: (e: React.MouseEvent, moduleId: string, moduleName: string) => void
}

function SidebarModule({
  module,
  level,
  isExpanded,
  onToggleExpanded,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
  onCreateForm,
  onContextMenu,
}: SidebarModuleProps) {
  const hasChildren = module.children && module.children.length > 0
  const hasForms = module.forms && module.forms.length > 0
  const hasContent = hasChildren || hasForms

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* Module Header */}
      <div
        className="group p-4 hover:bg-gray-50 transition-colors cursor-pointer"
        style={{ paddingLeft: 16 + level * 24 }}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e, module.id, module.name)
        }}
        onClick={() => hasContent && onToggleExpanded(module.id)}
      >
        <div className="flex items-center gap-3">
          {/* Expand/Collapse */}
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            {hasContent ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )
            ) : null}
          </div>

          {/* Icon */}
          <div className="flex-shrink-0">
            {hasChildren ? (
              isExpanded ? (
                <FolderOpen className="h-6 w-6 text-blue-600" />
              ) : (
                <Folder className="h-6 w-6 text-blue-600" />
              )
            ) : (
              <Folder className="h-6 w-6 text-gray-500" />
            )}
          </div>

          {/* Module Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 truncate">{module.name}</h3>

              {module.moduleType === "master" && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-blue-50 border-blue-200 text-blue-700">
                  master
                </Badge>
              )}

              {level > 0 && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-gray-50 border-gray-200 text-gray-600">
                  Level {level}
                </Badge>
              )}
            </div>

            {module.description && <p className="text-sm text-gray-600 truncate mb-2">{module.description}</p>}

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                <span>{module.forms?.length || 0} forms</span>
              </div>
              {hasChildren && (
                <div className="flex items-center gap-1">
                  <Folder className="h-3 w-3" />
                  <span>{module.children?.length} sub-modules</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Created {new Date(module.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => {
                e.stopPropagation()
                onCreateSubModule(module.id)
              }}
            >
              <FolderPlus className="h-4 w-4 text-blue-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => {
                e.stopPropagation()
                onCreateForm(module.id)
              }}
            >
              <FilePlus className="h-4 w-4 text-green-600" />
            </Button>
            <Link href={`/modules/${module.id}`} onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-8 px-3 text-sm">
                Open
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Children Content - Submodules appear INSIDE parent */}
      {isExpanded && (
        <div className="bg-gray-50/50">
          {/* Render Child Modules FIRST */}
          {hasChildren &&
            module.children?.map((child) => (
              <SidebarModule
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
              />
            ))}

          {/* Forms Section */}
          {hasForms && (
            <div className="p-4" style={{ paddingLeft: 16 + (level + 1) * 24 }}>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-green-600" />
                <h4 className="font-medium text-gray-700">Forms ({module.forms.length})</h4>
              </div>

              <div className="space-y-2">
                {module.forms.map((form: Form) => (
                  <Card key={form.id} className="shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="h-4 w-4 text-green-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-gray-900 truncate">{form.name}</h5>
                            {form.description && (
                              <p className="text-xs text-gray-600 truncate mt-1">{form.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">{form.recordCount || 0} submissions</span>
                              {form.isPublished && (
                                <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-green-50 border-green-200">
                                  <Globe className="h-2 w-2 mr-1" />
                                  Live
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Link href={`/forms/${form.id}/builder`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-blue-100">
                              <Edit className="h-3 w-3 text-blue-600" />
                            </Button>
                          </Link>
                          <Link href={`/preview/${form.id}`} target="_blank">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-green-100">
                              <Eye className="h-3 w-3 text-green-600" />
                            </Button>
                          </Link>
                          <Link href={`/forms/${form.id}/analytics`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-purple-100">
                              <BarChart3 className="h-3 w-3 text-purple-600" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PerfectSidebarView({
  modules,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
  onCreateForm = () => {},
}: PerfectSidebarViewProps) {
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
      <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Folder className="h-6 w-6 text-blue-600" />
            <div>
              <h3 className="font-semibold text-xl text-gray-900">Module Hierarchy</h3>
              <p className="text-sm text-gray-600">Complete overview with expandable modules and forms</p>
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

      {/* Content */}
      <div className="max-h-[70vh] overflow-y-auto">
        {modules.length > 0 ? (
          <div>
            {modules.map((module) => (
              <SidebarModule
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
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">
            <Folder className="h-16 w-16 mx-auto mb-4 text-gray-300" />
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