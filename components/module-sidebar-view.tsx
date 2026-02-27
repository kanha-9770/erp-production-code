"use client"

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
  Globe,
  Eye,
  BarChart3,
} from "lucide-react"
import Link from "next/link"
import type { FormModule, Form } from "@/types/form-builder"
import type { JSX } from "react/jsx-runtime" // Import JSX to fix the undeclared variable error

interface ModuleSidebarViewProps {
  modules: FormModule[]
  onEditModule: (module: FormModule) => void
  onDeleteModule: (moduleId: string) => void
  onCreateSubModule: (parentId: string) => void
}

interface SidebarModuleItemProps {
  module: FormModule
  level: number
  isExpanded: boolean
  onToggleExpanded: (moduleId: string) => void
  onEditModule: (module: FormModule) => void
  onDeleteModule: (moduleId: string) => void
  onCreateSubModule: (parentId: string) => void
}

function SidebarModuleItem({
  module,
  level,
  isExpanded,
  onToggleExpanded,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
}: SidebarModuleItemProps) {
  const hasChildren = module.children && module.children.length > 0
  const paddingLeft = level * 20 + 12

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* Module Header */}
      <div className="group flex items-center gap-2 p-3 hover:bg-gray-50 transition-colors" style={{ paddingLeft }}>
        {/* Expand/Collapse Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => hasChildren && onToggleExpanded(module.id)}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
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

        {/* Module Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{module.name}</span>
            <Badge variant="secondary" className="text-xs">
              {module.forms?.length || 0}
            </Badge>
            {module.level > 0 && (
              <Badge variant="outline" className="text-xs">
                Level {module.level}
              </Badge>
            )}
          </div>
          {module.description && <p className="text-xs text-gray-600 truncate mt-1">{module.description}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onCreateSubModule(module.id)}>
            <Plus className="h-3 w-3" />
          </Button>

          <Link href={`/modules/${module.id}`}>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              Open
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditModule(module)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreateSubModule(module.id)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Sub-module
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDeleteModule(module.id)} className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Forms List */}
      {module.forms && module.forms.length > 0 && (
        <div className="bg-gray-50" style={{ paddingLeft: paddingLeft + 32 }}>
          {module.forms.slice(0, 3).map((form: Form) => (
            <div
              key={form.id}
              className="flex items-center justify-between p-2 border-b border-gray-200 last:border-b-0"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="h-3 w-3 text-gray-400 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-700 truncate">{form.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {form.isPublished && (
                  <Badge variant="outline" className="text-xs px-1 py-0">
                    <Globe className="h-2 w-2 mr-1" />
                    Live
                  </Badge>
                )}
                <div className="flex gap-1">
                  <Link href={`/preview/${form.id}`} target="_blank">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                      <Eye className="h-2 w-2" />
                    </Button>
                  </Link>
                  <Link href={`/forms/${form.id}/analytics`}>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                      <BarChart3 className="h-2 w-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
          {module.forms.length > 3 && (
            <div className="p-2 text-center">
              <p className="text-xs text-gray-500">+{module.forms.length - 3} more forms</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ModuleSidebarView({
  modules,
  onEditModule,
  onDeleteModule,
  onCreateSubModule,
}: ModuleSidebarViewProps) {
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

  const renderModuleTree = (moduleList: FormModule[], level = 0): JSX.Element[] => {
    const elements: JSX.Element[] = []

    for (const module of moduleList) {
      elements.push(
        <SidebarModuleItem
          key={module.id}
          module={module}
          level={level}
          isExpanded={expandedModules.has(module.id)}
          onToggleExpanded={handleToggleExpanded}
          onEditModule={onEditModule}
          onDeleteModule={onDeleteModule}
          onCreateSubModule={onCreateSubModule}
        />,
      )

      // Render children if expanded
      if (expandedModules.has(module.id) && module.children && module.children.length > 0) {
        elements.push(...renderModuleTree(module.children, level + 1))
      }
    }

    return elements
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-lg">Module Hierarchy</h3>
        <p className="text-sm text-gray-600">Organized view of all modules and their forms</p>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {modules.length > 0 ? (
          renderModuleTree(modules)
        ) : (
          <div className="p-8 text-center text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No modules found</p>
          </div>
        )}
      </div>
    </div>
  )
}
