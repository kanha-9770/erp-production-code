"use client"

import { useState, useEffect, useRef, useMemo } from "react"
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
  Globe,
  Clock,
  Edit3,
  Users,
  Settings,
  Calendar,
  CalendarHeart,
  Inbox,
  Wallet,
  User,
  Sparkles,
  Shield,
  Link2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import type { PermissionModule, PermissionForm } from "@/types/permissions"
import {
  staticPagesByGroup,
  type StaticPage,
  type StaticPageGroup,
} from "@/lib/static-pages"

interface FormsSidebarProps {
  modules: PermissionModule[]
  loading?: boolean
  onFormSelect: (formId: string, moduleId: string, submoduleId?: string) => void
  selectedForm: string | null
  /** Optional — when provided the sidebar shows a "System Pages" section above
   *  the modules tree and allows selecting static-page paths for permissioning. */
  selectedRoute?: string | null
  onRouteSelect?: (path: string) => void
}

export function FormsSidebar({
  modules,
  loading = false,
  onFormSelect,
  selectedForm,
  selectedRoute = null,
  onRouteSelect,
}: FormsSidebarProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [expandedRouteGroups, setExpandedRouteGroups] = useState<Set<StaticPageGroup>>(
    () => new Set(staticPagesByGroup().map((g) => g.group)),
  )
  const [showRoutes, setShowRoutes] = useState(true)
  const [search, setSearch] = useState("")
  const didInitialExpand = useRef(false)

  // Expand all top-level modules once data arrives.
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

  const toggleRouteGroup = (group: StaticPageGroup) => {
    setExpandedRouteGroups((prev) => {
      const next = new Set(prev)
      next.has(group) ? next.delete(group) : next.add(group)
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

  // Group static pages, then filter by search query.
  const visibleRouteGroups = useMemo(() => {
    const grouped = staticPagesByGroup()
    if (!effectiveSearch) return grouped
    return grouped
      .map((g) => ({
        ...g,
        pages: g.pages.filter(
          (p) =>
            p.label.toLowerCase().includes(effectiveSearch) ||
            p.path.toLowerCase().includes(effectiveSearch),
        ),
      }))
      .filter((g) => g.pages.length > 0)
  }, [effectiveSearch])

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
  const showRoutesSection = !!onRouteSelect
  const hasRouteMatches = visibleRouteGroups.length > 0
  const hasModuleMatches = visibleModules.length > 0
  const showEmpty = !hasRouteMatches && !hasModuleMatches

  return (
    <Card className="border shadow-sm overflow-hidden h-full flex flex-col">
      {/* Search */}
      <div className="p-3 border-b bg-muted/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search forms or pages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm focus-visible:ring-primary/70"
          />
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2 min-w-0">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center">
              <AlertCircle className="h-10 w-10 mb-3 opacity-70" />
              <p className="text-sm font-medium">
                {effectiveSearch ? "No matching items" : "Nothing to permission yet"}
              </p>
              {effectiveSearch && (
                <p className="text-xs mt-1">Try a different search term</p>
              )}
            </div>
          ) : (
            <>
              {/* System pages — admin can grant role / user access to a static URL.
                  Sits above modules so it's the first thing admins see. */}
              {showRoutesSection && hasRouteMatches && (
                <Collapsible open={showRoutes} onOpenChange={setShowRoutes}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-md p-2 hover:bg-muted/70 text-left transition-colors">
                    {showRoutes ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <Globe className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-semibold truncate flex-1">
                      System Pages
                    </span>
                    <Badge variant="secondary" className="text-xs px-2 py-0">
                      {visibleRouteGroups.reduce((s, g) => s + g.pages.length, 0)}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-3 mt-0.5 space-y-0.5 border-l border-black/5 pl-1">
                      {visibleRouteGroups.map((g) => (
                        <RouteGroup
                          key={g.group}
                          group={g.group}
                          pages={g.pages}
                          expanded={expandedRouteGroups.has(g.group)}
                          onToggle={() => toggleRouteGroup(g.group)}
                          selectedRoute={selectedRoute}
                          onSelect={onRouteSelect!}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Modules — existing tree, unchanged. */}
              {hasModuleMatches && (
                <div className={cn(showRoutesSection && hasRouteMatches && "mt-2 pt-2 border-t")}>
                  {visibleModules.map((module) => (
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
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}

// ─── Route group ─────────────────────────────────────────────────────────────

interface RouteGroupProps {
  group: StaticPageGroup
  pages: StaticPage[]
  expanded: boolean
  onToggle: () => void
  selectedRoute: string | null
  onSelect: (path: string) => void
}

function RouteGroup({
  group,
  pages,
  expanded,
  onToggle,
  selectedRoute,
  onSelect,
}: RouteGroupProps) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-md p-1.5 hover:bg-muted/60 text-left transition-colors">
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Folder className="h-3.5 w-3.5 shrink-0 text-purple-500/80" />
        <span className="text-xs font-medium truncate flex-1 text-muted-foreground">
          {group}
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {pages.length}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-3 pl-1 space-y-0.5">
          {pages.map((page) => (
            <RouteItem
              key={page.path}
              page={page}
              isSelected={selectedRoute === page.path}
              onSelect={onSelect}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function iconForPage(page: StaticPage) {
  switch (page.icon) {
    case "clock":
      return Clock
    case "edit":
      return Edit3
    case "users":
      return Users
    case "settings":
      return Settings
    case "calendar":
      return Calendar
    case "calendar-heart":
      return CalendarHeart
    case "inbox":
      return Inbox
    case "wallet":
      return Wallet
    case "user":
      return User
    case "sparkles":
      return Sparkles
    case "shield":
      return Shield
    default:
      return Link2
  }
}

interface RouteItemProps {
  page: StaticPage
  isSelected: boolean
  onSelect: (path: string) => void
}

function RouteItem({ page, isSelected, onSelect }: RouteItemProps) {
  const Icon = iconForPage(page)
  return (
    <button
      type="button"
      onClick={() => onSelect(page.path)}
      className={cn(
        "flex items-center gap-2 w-full p-1.5 pl-2 rounded-md text-sm hover:bg-muted/60 transition-colors min-w-0",
        isSelected && "bg-primary/10 text-primary font-medium border-l-2 border-primary pl-[6px]",
      )}
      title={page.path}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate flex-1 text-left text-xs">{page.label}</span>
      {page.adminOnly && (
        <Badge
          variant="outline"
          className="text-[9px] px-1 py-0 h-4 shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-400"
        >
          Admin
        </Badge>
      )}
    </button>
  )
}

// ─── Module sub-components (unchanged from before) ───────────────────────────

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
