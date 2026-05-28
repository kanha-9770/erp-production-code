"use client"

/**
 * Sidebar listing every static page, grouped exactly like the form-builder
 * sidebar groups dynamic forms. Mirrors the FormsSidebar UX (collapsible
 * groups, search, selection highlight) so the static-page permissions page
 * feels identical to /settings/permission/roles.
 *
 * Selection model: a single static-page path. The parent decides what to
 * render on the right (RoutePermissionMatrix for roles, a user grants matrix,
 * etc.) — this component stays presentation-only.
 */

import { useMemo, useState } from "react"
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
  Globe,
  Lock,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  staticPagesByGroup,
  type StaticPage,
  type StaticPageGroup,
} from "@/lib/static-pages"

interface StaticPagesSidebarProps {
  selectedPath: string | null
  onSelect: (path: string) => void
  /** Optional summary count to render next to each page (e.g. "3 roles"). */
  pageBadgeText?: (page: StaticPage) => string | null
  /** Optional bulk shortcut button at the top — used by the parent to expose
   *  the "all pages × roles" view. */
  bulkHeader?: React.ReactNode
}

export function StaticPagesSidebar({
  selectedPath,
  onSelect,
  pageBadgeText,
  bulkHeader,
}: StaticPagesSidebarProps) {
  const groups = useMemo(() => staticPagesByGroup(), [])
  const [search, setSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Set<StaticPageGroup>>(new Set())

  const toggleGroup = (g: StaticPageGroup) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        pages: g.pages.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.path.toLowerCase().includes(q) ||
            (p.description ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.pages.length > 0)
  }, [groups, search])

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-2 space-y-2">
        {bulkHeader}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pages…"
            className="pl-8 h-9"
            aria-label="Search static pages"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-3 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground px-3">
              No pages match "{search}".
            </div>
          ) : (
            filtered.map((g) => (
              <Collapsible
                key={g.group}
                open={!collapsed.has(g.group)}
                onOpenChange={() => toggleGroup(g.group)}
              >
                <CollapsibleTrigger className="w-full">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide",
                      "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {collapsed.has(g.group) ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    <Layers className="h-3 w-3" />
                    <span className="flex-1 text-left">{g.group}</span>
                    <Badge
                      variant="outline"
                      className="h-4 px-1 text-[9px] font-normal"
                    >
                      {g.pages.length}
                    </Badge>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5 pt-0.5">
                  {g.pages.map((p) => {
                    const selected = selectedPath === p.path
                    const badge = pageBadgeText?.(p) ?? null
                    return (
                      <button
                        key={p.path}
                        type="button"
                        onClick={() => onSelect(p.path)}
                        aria-current={selected ? "true" : undefined}
                        className={cn(
                          "group w-full text-left rounded-md px-2 py-1.5 ml-3 transition-colors border border-transparent",
                          "hover:bg-muted/50",
                          selected &&
                            "bg-primary/10 border-primary/30 hover:bg-primary/10",
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <Globe
                            className={cn(
                              "h-3.5 w-3.5 mt-0.5 shrink-0",
                              selected
                                ? "text-primary"
                                : "text-muted-foreground",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "text-sm truncate",
                                  selected
                                    ? "text-primary font-medium"
                                    : "text-foreground",
                                )}
                              >
                                {p.label}
                              </span>
                              {p.adminOnly && (
                                <Lock className="h-3 w-3 text-amber-600 shrink-0" />
                              )}
                            </div>
                            {p.description && (
                              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                {p.description}
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <code className="text-[10px] text-muted-foreground truncate">
                                {p.path}
                              </code>
                              {badge && (
                                <Badge
                                  variant="secondary"
                                  className="h-3.5 px-1 text-[9px] font-normal ml-auto"
                                >
                                  {badge}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
