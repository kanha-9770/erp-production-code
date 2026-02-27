"use client"

import type React from "react"
import { useState } from "react"
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
  Plus,
  Folder,
  FolderOpen,
  Eye,
  BarChart3,
  Settings,
  Copy,
} from "lucide-react"
import Link from "next/link"
import type { FormModule, Form } from "@/types/form-builder"

interface PerfectTreeViewProps {
  modules: FormModule[]
  onEditModule: (module: FormModule) => void
  onDeleteModule: (moduleId: string) => void
  onCreateSubModule: (parentId: string) => void
}

interface TreeNodeProps {
  module: FormModule
  level: number
  isLast: boolean
  parentLines: boolean[]
  isExpanded: boolean
  onToggleExpanded: (moduleId: string) => void
  onEditModule: (module: FormModule) => void
  onDeleteModule: (moduleId: string) => void
  onCreateSubModule: (parentId: string) => void
}

function TreeNode({
  module,
  level,
  isLast,
  parentLines,
  isExpanded,
  onToggleExpanded,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
}: TreeNodeProps) {
  const hasChildren = module.children && module.children.length > 0
  const hasForms = module.forms && module.forms.length > 0
  const hasContent = hasChildren || hasForms

  const renderTreeLines = () => {
    const lines = []

    // Render parent lines
    for (let i = 0; i < level; i++) {
      if (parentLines[i]) {
        lines.push(
          <div
            key={`parent-line-${i}`}
            className="absolute w-px bg-gray-300"
            style={{
              left: 12 + i * 20,
              top: 0,
              bottom: 0,
            }}
          />,
        )
      }
    }

    // Render current level lines
    if (level > 0) {
      // Horizontal line
      lines.push(
        <div
          key="horizontal-line"
          className="absolute h-px bg-gray-300"
          style={{
            left: 12 + (level - 1) * 20,
            top: 20,
            width: 20,
          }}
        />,
      )

      // Vertical line (only if not last)
      if (!isLast) {
        lines.push(
          <div
            key="vertical-line"
            className="absolute w-px bg-gray-300"
            style={{
              left: 12 + (level - 1) * 20,
              top: 20,
              bottom: 0,
            }}
          />,
        )
      }
    }

    return lines
  }

  return (
    <div className="relative">
      {/* Tree Lines */}
      {renderTreeLines()}

      {/* Module Content */}
      <div
        className="group flex items-center gap-2 py-1 hover:bg-blue-50 transition-colors relative"
        style={{ paddingLeft: 8 + level * 20 }}
      >
        {/* Expand/Collapse Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 hover:bg-gray-200 transition-colors flex-shrink-0"
          onClick={() => hasContent && onToggleExpanded(module.id)}
          disabled={!hasContent}
        >
          {hasContent ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3 text-gray-600" />
            ) : (
              <ChevronRight className="h-3 w-3 text-gray-600" />
            )
          ) : (
            <div className="h-3 w-3" />
          )}
        </Button>

        {/* Module Icon */}
        <div className="flex-shrink-0">
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-600" />
            ) : (
              <Folder className="h-4 w-4 text-blue-600" />
            )
          ) : (
            <FileText className="h-4 w-4 text-gray-600" />
          )}
        </div>

        {/* Module Name and Info */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900 truncate">{module.name}</span>

          {/* Module Type Badge */}
          {module.moduleType === "master" && (
            <Badge variant="outline" className="text-xs px-1 py-0 bg-blue-50 border-blue-200 text-blue-700">
              master
            </Badge>
          )}

          {/* Forms Count */}
          {module.forms && module.forms.length > 0 && (
            <Badge variant="secondary" className="text-xs px-1 py-0">
              {module.forms.length}
            </Badge>
          )}

          {/* Children Count */}
          {hasChildren && (
            <Badge variant="outline" className="text-xs px-1 py-0 text-green-700 border-green-200">
              {module.children?.length} sub
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-blue-100"
            onClick={() => onCreateSubModule(module.id)}
            title="Add Sub-module"
          >
            <Plus className="h-3 w-3 text-blue-600" />
          </Button>

          <Link href={`/modules/${module.id}`}>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs hover:bg-green-100">
              Open
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-gray-200">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onEditModule(module)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Module
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreateSubModule(module.id)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Sub-module
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

      {/* Forms Section - Rendered as tree nodes when expanded */}
      {isExpanded && hasForms && (
        <div className="relative">
          {module.forms.map((form: Form, index: number) => {
            const isLastForm = index === module.forms.length - 1 && (!hasChildren || !isExpanded)
            const formParentLines = [...parentLines, !isLast]

            return (
              <div key={form.id} className="relative">
                {/* Tree Lines for Forms */}
                {formParentLines.map((showLine, lineIndex) =>
                  showLine ? (
                    <div
                      key={`form-parent-line-${lineIndex}`}
                      className="absolute w-px bg-gray-300"
                      style={{
                        left: 12 + lineIndex * 20,
                        top: 0,
                        bottom: 0,
                      }}
                    />
                  ) : null,
                )}

                {/* Horizontal line for form */}
                <div
                  className="absolute h-px bg-gray-300"
                  style={{
                    left: 12 + level * 20,
                    top: 20,
                    width: 20,
                  }}
                />

                {/* Vertical line for form (only if not last) */}
                {!isLastForm && (
                  <div
                    className="absolute w-px bg-gray-300"
                    style={{
                      left: 12 + level * 20,
                      top: 20,
                      bottom: 0,
                    }}
                  />
                )}

                {/* Form Content */}
                <div
                  className="group flex items-center gap-2 py-1 hover:bg-green-50 transition-colors"
                  style={{ paddingLeft: 8 + (level + 1) * 20 }}
                >
                  <div className="h-5 w-5 flex items-center justify-center">
                    <div className="h-3 w-3" />
                  </div>

                  <FileText className="h-4 w-4 text-green-600 flex-shrink-0" />

                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-sm text-gray-900 truncate">{form.name}</span>

                    {form.isPublished && (
                      <Badge
                        variant="outline"
                        className="text-xs px-1 py-0 bg-green-50 border-green-200 text-green-700"
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function renderTreeNodes(
  modules: FormModule[],
  level: number,
  parentLines: boolean[],
  expandedModules: Set<string>,
  onToggleExpanded: (moduleId: string) => void,
  onEditModule: (module: FormModule) => void,
  onDeleteModule: (moduleId: string) => void,
  onCreateSubModule: (parentId: string) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []

  modules.forEach((module, index) => {
    const isLast = index === modules.length - 1
    const isExpanded = expandedModules.has(module.id)

    nodes.push(
      <TreeNode
        key={module.id}
        module={module}
        level={level}
        isLast={isLast}
        parentLines={parentLines}
        isExpanded={isExpanded}
        onToggleExpanded={onToggleExpanded}
        onEditModule={onEditModule}
        onDeleteModule={onDeleteModule}
        onCreateSubModule={onCreateSubModule}
      />,
    )

    // Render children if expanded
    if (isExpanded && module.children && module.children.length > 0) {
      const childParentLines = [...parentLines, !isLast]
      nodes.push(
        ...renderTreeNodes(
          module.children,
          level + 1,
          childParentLines,
          expandedModules,
          onToggleExpanded,
          onEditModule,
          onDeleteModule,
          onCreateSubModule,
        ),
      )
    }
  })

  return nodes
}

export default function PerfectTreeView({
  modules,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
}: PerfectTreeViewProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  const handleToggleExpanded = (moduleId: string) => {
    const newExpanded = new Set(expandedModules)
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId)
    } else {
      newExpanded.add(moduleId)
    }
    setExpandedModules(newExpanded)
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
              <h3 className="font-semibold text-lg text-gray-900">Modules</h3>
              <p className="text-sm text-gray-600">Perfect tree structure with proper hierarchy</p>
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
      <div className="p-4 max-h-[70vh] overflow-y-auto">
        {modules.length > 0 ? (
          <div className="relative">
            {renderTreeNodes(
              modules,
              0,
              [],
              expandedModules,
              handleToggleExpanded,
              onEditModule,
              onDeleteModule,
              onCreateSubModule,
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Folder className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <h4 className="font-medium text-gray-900 mb-2">No modules found</h4>
            <p className="text-sm">Create your first module to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}
