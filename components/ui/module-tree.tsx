"use client"

import React, { useState } from "react"
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  FileText, 
  Plus, 
  MoreHorizontal,
  Edit,
  Trash2,
  Move,
  Copy
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { FormModule, Form } from "@/types/form-builder"

interface ModuleTreeProps {
  modules: FormModule[]
  selectedModule?: FormModule | null
  selectedForm?: Form | null
  onModuleSelect?: (module: FormModule) => void
  onFormSelect?: (form: Form) => void
  onCreateSubmodule?: (parentId: string) => void
  onEditModule?: (module: FormModule) => void
  onDeleteModule?: (moduleId: string) => void
  onMoveModule?: (moduleId: string, newParentId?: string) => void
  level?: number
  className?: string
}

export function ModuleTree({
  modules,
  selectedModule,
  selectedForm,
  onModuleSelect,
  onFormSelect,
  onCreateSubmodule,
  onEditModule,
  onDeleteModule,
  onMoveModule,
  level = 0,
  className = ""
}: ModuleTreeProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  const toggleExpanded = (moduleId: string) => {
    const newExpanded = new Set(expandedModules)
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId)
    } else {
      newExpanded.add(moduleId)
    }
    setExpandedModules(newExpanded)
  }

  const isExpanded = (moduleId: string) => expandedModules.has(moduleId)

  const getIndentClass = (currentLevel: number) => {
    const indents = [
      "pl-0",
      "pl-4", 
      "pl-8", 
      "pl-12", 
      "pl-16", 
      "pl-20"
    ]
    return indents[Math.min(currentLevel, indents.length - 1)] || "pl-20"
  }

  const renderModule = (module: FormModule, currentLevel: number) => {
    const hasChildren = module.children && module.children.length > 0
    const hasForms = module.forms && module.forms.length > 0
    const expanded = isExpanded(module.id)
    const isSelected = selectedModule?.id === module.id

    return (
      <div key={module.id} className="w-full">
        <div 
          className={`
            flex items-center justify-between p-2 rounded-md cursor-pointer transition-all duration-200 group
            ${getIndentClass(currentLevel)}
            ${isSelected 
              ? "bg-blue-50 border border-blue-200 shadow-sm" 
              : "hover:bg-gray-50 border border-transparent"
            }
          `}
          onClick={() => onModuleSelect?.(module)}
        >
          <div className="flex items-center flex-1 min-w-0">
            {/* Expand/Collapse Button */}
            <div className="flex-shrink-0 w-5 h-5 mr-2">
              {(hasChildren || hasForms) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 hover:bg-gray-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpanded(module.id)
                  }}
                >
                  {expanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>
              ) : (
                <div className="w-5 h-5" />
              )}
            </div>

            {/* Module Icon */}
            <div className="flex-shrink-0 mr-2">
              {expanded && (hasChildren || hasForms) ? (
                <FolderOpen className="h-4 w-4 text-blue-600" />
              ) : (
                <Folder className="h-4 w-4 text-blue-500" />
              )}
            </div>

            {/* Module Name and Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium truncate ${isSelected ? "text-blue-700" : "text-gray-900"}`}>
                  {module.name}
                </span>
                
                {/* Badges */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {module.moduleType === "child" && (
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      Sub
                    </Badge>
                  )}
                  
                  {hasChildren && (
                    <Badge variant="secondary" className="text-xs px-1 py-0">
                      {module.children?.length} sub
                    </Badge>
                  )}
                  
                  {hasForms && (
                    <Badge variant="secondary" className="text-xs px-1 py-0">
                      {module.forms?.length} forms
                    </Badge>
                  )}
                </div>
              </div>
              
              {module.description && (
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {module.description}
                </p>
              )}
            </div>
          </div>

          {/* Actions Menu */}
          <div className="flex-shrink-0 ml-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onCreateSubmodule?.(module.id)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Submodule
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEditModule?.(module)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Module
                </DropdownMenuItem>
                {currentLevel > 0 && (
                  <DropdownMenuItem onClick={() => onMoveModule?.(module.id)}>
                    <Move className="mr-2 h-4 w-4" />
                    Move Module
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => onDeleteModule?.(module.id)} 
                  className="text-red-600"
                  disabled={hasChildren}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Module
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Child Elements */}
        {expanded && (
          <div className="mt-1">
            {/* Child Modules (Submodules) */}
            {hasChildren && (
              <ModuleTree
                modules={module.children!}
                selectedModule={selectedModule}
                selectedForm={selectedForm}
                onModuleSelect={onModuleSelect}
                onFormSelect={onFormSelect}
                onCreateSubmodule={onCreateSubmodule}
                onEditModule={onEditModule}
                onDeleteModule={onDeleteModule}
                onMoveModule={onMoveModule}
                level={currentLevel + 1}
              />
            )}

            {/* Forms */}
            {hasForms && module.forms?.map((form) => {
              const isFormSelected = selectedForm?.id === form.id
              
              return (
                <div
                  key={form.id}
                  className={`
                    flex items-center justify-between p-2 rounded-md cursor-pointer transition-all duration-200 group
                    ${getIndentClass(currentLevel + 1)} ml-4
                    ${isFormSelected 
                      ? "bg-green-50 border border-green-200 shadow-sm" 
                      : "hover:bg-gray-50 border border-transparent"
                    }
                  `}
                  onClick={() => onFormSelect?.(form)}
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="flex-shrink-0 w-5 h-5 mr-2" />
                    
                    <div className="flex-shrink-0 mr-2">
                      <FileText className="h-4 w-4 text-green-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm truncate ${isFormSelected ? "text-green-700 font-medium" : "text-gray-700"}`}>
                          {form.name}
                        </span>
                        
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {form.isPublished && (
                            <Badge variant="default" className="text-xs px-1 py-0 bg-green-500">
                              Live
                            </Badge>
                          )}
                          
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            {form.recordCount || 0} records
                          </Badge>
                        </div>
                      </div>
                      
                      {form.description && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {form.description}
                        </p>
                      )}
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

  return (
    <div className={`space-y-1 ${className}`}>
      {modules.map((module) => renderModule(module, level))}
    </div>
  )
}