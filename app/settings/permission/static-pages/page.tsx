"use client"

/**
 * Admin UI — anchor static pages to dynamic modules.
 *
 * Resolution priority (matches the API):
 *   1. Per-page override   — admin chose a specific module for THIS page.
 *   2. Group anchor        — admin chose a module for the whole group.
 *   3. Auto anchor         — derived from /settings/attendance-config form
 *                            bindings (the bound form's parent module).
 *   4. Hidden              — page is URL-accessible but not in the sidebar.
 *
 * The most common workflow is "anchor entire group to module X" — the per-row
 * override is for the rare case where one page in the group should land
 * somewhere different.
 *
 * Save persists the entire set in one transaction (PUT /api/static-page-anchors).
 */

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertCircle,
  Anchor,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Undo2,
  Lock,
  Sparkles,
  Layers,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useModules } from "@/hooks/use-modules"
import { staticPagesByGroup, type StaticPage } from "@/lib/static-pages"
import type { PermissionModule } from "@/types/permissions"

const NO_GROUP = "__no_group__" // sentinel: clear group anchor
const INHERIT = "__inherit__"   // sentinel: clear per-page override

interface FlatModule {
  id: string
  label: string
  path: string
  depth: number
}

export default function StaticPagesAnchorPage() {
  const { toast } = useToast()
  const { modules, loading: modulesLoading } = useModules()

  // Edit state — separate from server snapshot so we can compare.
  const [pageAnchors, setPageAnchors] = useState<Map<string, string>>(new Map())
  const [groupAnchors, setGroupAnchors] = useState<Map<string, string>>(new Map())
  // Derived (read-only) — populated by the server, not editable here.
  const [autoAnchors, setAutoAnchors] = useState<Map<string, string>>(new Map())

  // Snapshots for dirty detection / reset.
  const [origPageAnchors, setOrigPageAnchors] = useState<Map<string, string>>(new Map())
  const [origGroupAnchors, setOrigGroupAnchors] = useState<Map<string, string>>(new Map())

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [search, setSearch] = useState("")

  const groups = useMemo(() => staticPagesByGroup(), [])

  const flatModules = useMemo<FlatModule[]>(() => {
    const out: FlatModule[] = []
    const walk = (nodes: PermissionModule[], path: string[], depth: number) => {
      for (const n of nodes) {
        const nextPath = [...path, n.name]
        out.push({
          id: n.id,
          label: n.name,
          path: nextPath.join(" › "),
          depth,
        })
        if (n.children?.length) walk(n.children, nextPath, depth + 1)
      }
    }
    walk(modules, [], 0)
    return out
  }, [modules])

  // Map for quick "module name lookup" when rendering source badges.
  const moduleNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of flatModules) m.set(f.id, f.label)
    return m
  }, [flatModules])

  // Apply a server response to local state. Used by initial load + post-save.
  const applyResponse = (j: any) => {
    const newPage = new Map<string, string>()
    if (j.manualAnchors && typeof j.manualAnchors === "object") {
      for (const [path, mod] of Object.entries(j.manualAnchors)) {
        if (typeof mod === "string") newPage.set(path, mod)
      }
    }
    const newGroup = new Map<string, string>()
    if (j.groupAnchors && typeof j.groupAnchors === "object") {
      for (const [name, mod] of Object.entries(j.groupAnchors)) {
        if (typeof mod === "string") newGroup.set(name, mod)
      }
    }
    const newAuto = new Map<string, string>()
    if (j.autoAnchors && typeof j.autoAnchors === "object") {
      for (const [path, mod] of Object.entries(j.autoAnchors)) {
        if (typeof mod === "string") newAuto.set(path, mod)
      }
    }
    setPageAnchors(newPage)
    setGroupAnchors(newGroup)
    setAutoAnchors(newAuto)
    setOrigPageAnchors(new Map(newPage))
    setOrigGroupAnchors(new Map(newGroup))
  }

  // Initial load
  useEffect(() => {
    let cancelled = false
    fetch("/api/static-page-anchors", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          if (!cancelled) setForbidden(true)
          return null
        }
        return r.json()
      })
      .then((j) => {
        if (cancelled || !j?.success) return
        applyResponse(j)
      })
      .catch(() => {
        toast({ title: "Failed to load anchors", variant: "destructive" })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const setGroupAnchor = (group: string, moduleId: string) => {
    setGroupAnchors((prev) => {
      const next = new Map(prev)
      if (moduleId === NO_GROUP) next.delete(group)
      else next.set(group, moduleId)
      return next
    })
  }

  const setPageAnchor = (path: string, moduleId: string) => {
    setPageAnchors((prev) => {
      const next = new Map(prev)
      if (moduleId === INHERIT) next.delete(path)
      else next.set(path, moduleId)
      return next
    })
  }

  // Dirty detection — compares page + group state independently.
  const dirty = useMemo(() => {
    const pageDirty = new Set<string>()
    const allPaths = new Set<string>([
      ...Array.from(origPageAnchors.keys()),
      ...Array.from(pageAnchors.keys()),
    ])
    for (const p of allPaths) {
      if (origPageAnchors.get(p) !== pageAnchors.get(p)) pageDirty.add(p)
    }
    const groupDirty = new Set<string>()
    const allGroups = new Set<string>([
      ...Array.from(origGroupAnchors.keys()),
      ...Array.from(groupAnchors.keys()),
    ])
    for (const g of allGroups) {
      if (origGroupAnchors.get(g) !== groupAnchors.get(g)) groupDirty.add(g)
    }
    return { pageDirty, groupDirty, total: pageDirty.size + groupDirty.size }
  }, [pageAnchors, groupAnchors, origPageAnchors, origGroupAnchors])
  const isDirty = dirty.total > 0

  const reset = () => {
    setPageAnchors(new Map(origPageAnchors))
    setGroupAnchors(new Map(origGroupAnchors))
  }

  const save = async () => {
    setSaving(true)
    try {
      const anchors = Array.from(pageAnchors.entries()).map(([path, moduleId]) => ({
        path,
        moduleId,
      }))
      const groupPayload: Record<string, string> = {}
      for (const [name, mod] of groupAnchors) groupPayload[name] = mod

      const res = await fetch("/api/static-page-anchors", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchors, groupAnchors: groupPayload }),
      })
      const j = await res.json()
      if (!res.ok || !j.success) throw new Error(j.error || "Save failed")
      applyResponse(j)
      toast({
        title: "Anchors saved",
        description: "Sidebar will reflect changes on next page load.",
      })
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message ?? "Try again",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (forbidden) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Admin access required</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const effectiveSearch = search.trim().toLowerCase()
  const visibleGroups = effectiveSearch
    ? groups
        .map((g) => ({
          ...g,
          pages: g.pages.filter(
            (p) =>
              p.label.toLowerCase().includes(effectiveSearch) ||
              p.path.toLowerCase().includes(effectiveSearch),
          ),
        }))
        .filter((g) => g.pages.length > 0)
    : groups

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Anchor className="h-8 w-8 text-primary" />
            Static Page Placement
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Anchor each system page (Leaves, Attendance, Payroll, Holidays...) under a
            dynamic module so it shows up in the sidebar there. Set the{" "}
            <strong>group anchor</strong> at the top of each section to point an entire
            group at one module in one click — pages inherit it. Use the per-page
            override only when one page should land somewhere different.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Resolution order:{" "}
            <span className="font-medium">per-page override</span> →{" "}
            <span className="font-medium">group anchor</span> →{" "}
            <span className="font-medium inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-emerald-600" />
              auto
            </span>{" "}
            (from <code className="text-xs">/settings/attendance-config</code>) →{" "}
            <span className="font-medium">hidden</span>.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={reset} disabled={!isDirty || saving}>
            <Undo2 className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={save} disabled={!isDirty || saving}>
            {saving ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save{isDirty ? ` (${dirty.total})` : ""}
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search pages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {loading || modulesLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : flatModules.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium">No modules to anchor under yet.</p>
            <p className="text-xs mt-1">Create a module first; then come back to assign pages.</p>
          </CardContent>
        </Card>
      ) : visibleGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No pages match "{search}".
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => {
            const groupModule = groupAnchors.get(group.group) ?? null
            const groupModuleName = groupModule
              ? moduleNameById.get(groupModule) ?? "(unknown module)"
              : null
            const isGroupDirty = dirty.groupDirty.has(group.group)

            return (
              <Card key={group.group}>
                <CardHeader className="pb-3 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle className="text-base">{group.group}</CardTitle>
                      <CardDescription className="text-xs">
                        {group.pages.length} page{group.pages.length === 1 ? "" : "s"}
                      </CardDescription>
                    </div>
                  </div>
                  <div
                    className={
                      "rounded-md border p-3 space-y-2 " +
                      (isGroupDirty
                        ? "border-amber-300 bg-amber-50/50 dark:bg-amber-900/10"
                        : "border-muted bg-muted/30")
                    }
                  >
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      Anchor entire {group.group} group to:
                      {isGroupDirty && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          Unsaved
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Select
                        value={groupModule ?? NO_GROUP}
                        onValueChange={(v) => setGroupAnchor(group.group, v)}
                      >
                        <SelectTrigger className="h-9 text-sm w-[280px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_GROUP}>
                            <span className="text-muted-foreground">
                              Not configured (pages fall through to per-page / auto)
                            </span>
                          </SelectItem>
                          {flatModules.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <span style={{ paddingLeft: m.depth * 12 }} className="block">
                                {m.depth > 0 ? "↳ " : ""}
                                {m.label}
                              </span>
                              {m.depth > 0 && (
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  ({m.path})
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {groupModuleName && (
                        <Badge variant="secondary" className="text-[10px]">
                          All {group.pages.length} pages → {groupModuleName}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead className="border-y bg-muted/30 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left p-3 w-[35%]">Page</th>
                        <th className="text-left p-3">Path</th>
                        <th className="text-left p-3 w-[260px]">Per-page override</th>
                        <th className="text-left p-3 w-[180px]">Resolved → module</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.pages.map((page) => {
                        const manual = pageAnchors.get(page.path) ?? null
                        const groupVal = groupAnchors.get(group.group) ?? null
                        const auto = autoAnchors.get(page.path) ?? null
                        const resolvedModuleId = manual ?? groupVal ?? auto ?? null
                        const source: "manual" | "group" | "auto" | "hidden" = manual
                          ? "manual"
                          : groupVal
                            ? "group"
                            : auto
                              ? "auto"
                              : "hidden"
                        const resolvedName = resolvedModuleId
                          ? moduleNameById.get(resolvedModuleId) ?? "(unknown)"
                          : null
                        const rowDirty = dirty.pageDirty.has(page.path)

                        return (
                          <PageRow
                            key={page.path}
                            page={page}
                            manualValue={manual}
                            flatModules={flatModules}
                            isDirty={rowDirty}
                            onChange={setPageAnchor}
                            source={source}
                            resolvedName={resolvedName}
                          />
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PageRow({
  page,
  manualValue,
  flatModules,
  isDirty,
  onChange,
  source,
  resolvedName,
}: {
  page: StaticPage
  manualValue: string | null
  flatModules: FlatModule[]
  isDirty: boolean
  onChange: (path: string, moduleId: string) => void
  source: "manual" | "group" | "auto" | "hidden"
  resolvedName: string | null
}) {
  return (
    <tr className={isDirty ? "bg-amber-50/40 dark:bg-amber-900/10 border-b" : "border-b"}>
      <td className="p-3">
        <div className="font-medium flex items-center gap-2">
          {page.label}
          {page.adminOnly && (
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400">
              <Lock className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          )}
        </div>
        {page.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{page.description}</div>
        )}
      </td>
      <td className="p-3">
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{page.path}</code>
      </td>
      <td className="p-3">
        <Select
          value={manualValue ?? INHERIT}
          onValueChange={(v) => onChange(page.path, v)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT}>
              <span className="text-muted-foreground">Inherit (group / auto)</span>
            </SelectItem>
            {flatModules.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span style={{ paddingLeft: m.depth * 12 }} className="block">
                  {m.depth > 0 ? "↳ " : ""}
                  {m.label}
                </span>
                {m.depth > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    ({m.path})
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-3 text-xs">
        {source === "hidden" ? (
          <span className="text-muted-foreground italic">Hidden — not in sidebar</span>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <SourceBadge source={source} />
            <span className="text-foreground/80 truncate" title={resolvedName ?? ""}>
              {resolvedName}
            </span>
          </div>
        )}
        {isDirty && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
            Unsaved
          </div>
        )}
      </td>
    </tr>
  )
}

function SourceBadge({ source }: { source: "manual" | "group" | "auto" }) {
  if (source === "manual") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        Override
      </Badge>
    )
  }
  if (source === "group") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] border-blue-500/40 text-blue-700 dark:text-blue-400"
      >
        <Layers className="h-3 w-3 mr-1" />
        Group
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
      title="Auto-derived from /settings/attendance-config bindings"
    >
      <Sparkles className="h-3 w-3 mr-1" />
      Auto
    </Badge>
  )
}
