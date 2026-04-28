"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Search,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import type { PermissionModule, PermissionForm } from "@/types/permissions"

interface FormsSidebarProps {
  modules: PermissionModule[]
  loading?: boolean
  onFormSelect: (formId: string, moduleId: string, submoduleId?: string) => void
  selectedForm: string | null
}

export function FormsSidebar({
  modules,
  loading = false,
  onFormSelect,
  selectedForm,
}: FormsSidebarProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const didInitialExpand = useRef(false)

  // Expand all top-level modules once data arrives.
  // The useState initializer captures modules as [] (still loading), so we
  // need this effect to set the initial expanded state after the first load.
  useEffect(() => {
    if (!didInitialExpand.current && modules.length > 0) {
      setExpandedModules(new Set(modules.map((m) => m.id)))
      didInitialExpand.current = true
    }
  }, [modules])

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId)
      return next
    })
  }

  const effectiveSearch = search.trim().toLowerCase()

  const matchesForms = (forms: PermissionForm[]) =>
    !effectiveSearch || forms.some((f) => f.name.toLowerCase().includes(effectiveSearch))

  const hasMatchingForms = (mod: PermissionModule): boolean =>
    matchesForms(mod.forms ?? []) ||
    (mod.children ?? []).some((c) => hasMatchingForms(c))

  const filterForms = (forms: PermissionForm[]) =>
    effectiveSearch
      ? forms.filter((f) => f.name.toLowerCase().includes(effectiveSearch))
      : forms

  if (loading) {
    return (
      <Card className="border shadow-sm h-full flex flex-col">
        <div className="p-3 border-b bg-muted/40">
          <div className="h-9 bg-muted/60 rounded animate-pulse" />
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-pulse" />
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="text-sm font-medium">Loading modules...</p>
          </div>
        </div>
      </Card>
    )
  }

  const visibleModules = modules.filter(hasMatchingForms)

  return (
    <Card className="border shadow-sm overflow-hidden h-full flex flex-col">
      {/* Search */}
      <div className="p-3 border-b bg-muted/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search forms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm focus-visible:ring-primary/70"
          />
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {visibleModules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center">
              <AlertCircle className="h-10 w-10 mb-3 opacity-70" />
              <p className="text-sm font-medium">
                {effectiveSearch ? "No matching forms" : "No modules available"}
              </p>
              {effectiveSearch && (
                <p className="text-xs mt-1">Try a different search term</p>
              )}
            </div>
          ) : (
            visibleModules.map((module) => (
              <ModuleNode
                key={module.id}
                module={module}
                parentModuleId={module.id}
                expandedModules={expandedModules}
                selectedForm={selectedForm}
                filterForms={filterForms}
                hasMatchingForms={hasMatchingForms}
                onToggle={toggleModule}
                onFormSelect={onFormSelect}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ModuleNodeProps {
  module: PermissionModule
  parentModuleId: string
  expandedModules: Set<string>
  selectedForm: string | null
  filterForms: (forms: PermissionForm[]) => PermissionForm[]
  hasMatchingForms: (mod: PermissionModule) => boolean
  onToggle: (id: string) => void
  onFormSelect: (formId: string, moduleId: string, submoduleId?: string) => void
}

function ModuleNode({
  module,
  parentModuleId,
  expandedModules,
  selectedForm,
  filterForms,
  hasMatchingForms,
  onToggle,
  onFormSelect,
}: ModuleNodeProps) {
  const isExpanded = expandedModules.has(module.id)
  const countForms = (mod: PermissionModule): number =>
    (mod.forms?.length ?? 0) +
    (mod.children ?? []).reduce((s, c) => s + countForms(c), 0)
  const totalForms = countForms(module)
  const isSubmodule = parentModuleId !== module.id

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={() => onToggle(module.id)}
    >
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2.5 w-full rounded-md hover:bg-muted/70 text-left transition-colors",
          isSubmodule ? "p-2 pl-2" : "p-2.5",
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        {isSubmodule ? (
          <Folder className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
        ) : isExpanded ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        )}

        <span className="text-sm font-medium truncate flex-1">{module.name}</span>

        <Badge
          variant={isSubmodule ? "outline" : "secondary"}
          className="text-xs px-2 py-0"
        >
          {isSubmodule ? module.forms?.length ?? 0 : totalForms}
        </Badge>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className={cn("pb-1", isSubmodule ? "ml-4" : "ml-6")}>
          {/* Direct forms */}
          {filterForms(module.forms ?? []).map((form) => (
            <FormItem
              key={form.id}
              form={form}
              moduleId={parentModuleId}
              submoduleId={isSubmodule ? module.id : undefined}
              isSelected={selectedForm === form.id}
              onSelect={onFormSelect}
            />
          ))}

          {/* Child submodules */}
          {(module.children ?? [])
            .filter(hasMatchingForms)
            .map((sub) => (
              <ModuleNode
                key={sub.id}
                module={sub}
                parentModuleId={parentModuleId}
                expandedModules={expandedModules}
                selectedForm={selectedForm}
                filterForms={filterForms}
                hasMatchingForms={hasMatchingForms}
                onToggle={onToggle}
                onFormSelect={onFormSelect}
              />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

interface FormItemProps {
  form: PermissionForm
  moduleId: string
  submoduleId?: string
  isSelected: boolean
  onSelect: (formId: string, moduleId: string, submoduleId?: string) => void
}

function FormItem({ form, moduleId, submoduleId, isSelected, onSelect }: FormItemProps) {
  return (
    <button
      onClick={() => onSelect(form.id, moduleId, submoduleId)}
      className={cn(
        "flex items-center gap-2.5 w-full p-2 pl-3 rounded-md text-sm hover:bg-muted/60 transition-colors",
        isSelected && "bg-primary/10 text-primary font-medium border-l-2 border-primary pl-[10px]",
      )}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{form.name}</span>
    </button>
  )
}
