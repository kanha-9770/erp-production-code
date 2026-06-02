"use client"

/**
 * RoleStaticPagesMatrix — single-role view of every static page with a
 * GRANULAR permission grid (View / Create / Edit / Delete / Import / Export /
 * Print / Approval), exactly like the form/module permission matrix.
 *
 * Used inside the "By Role" tab on /settings/permission/static-page-permission.
 * Pick a role on the left rail → see every static page grouped by area, with a
 * checkbox per action.
 *
 * Persistence
 * -----------
 * Reuses the SAME RolePermission engine as form modules. Each cell is a row in
 * `role_permissions` scoped by `pagePath` (the page's registry path) instead of
 * moduleId/formId:
 *   - GET  /api/role-permissions?roleId=…&scope=page  → existing page grants.
 *   - GET  /api/permissions?scope=page                → the 8 page actions
 *                                                        (with real permission ids).
 *   - PUT  /api/role-permissions                       → [{ roleId, permissionId,
 *                                                          pagePath, granted }]
 * The sidebar gates each static page on the VIEW action via the same
 * usePermissions resolver that gates modules, so granting VIEW here makes the
 * page appear in that role's sidebar.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Globe,
  Lock,
  RefreshCw,
  Save,
  Search,
  Undo2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  staticPagesByGroup,
  type StaticPage,
  type StaticPageGroup,
} from "@/lib/static-pages"

interface PagePermission {
  id: string
  name: string
}

interface RolePagePermissionRow {
  permissionId: string
  pagePath: string | null
  granted: boolean
}

interface RoleStaticPagesMatrixProps {
  roleId: string
  roleName: string
}

// key = `${pagePath}::${permissionId}`
const cellKey = (path: string, permId: string) => `${path}::${permId}`

export function RoleStaticPagesMatrix({
  roleId,
  roleName,
}: RoleStaticPagesMatrixProps) {
  const { toast } = useToast()

  const [permissions, setPermissions] = useState<PagePermission[]>([])
  const [serverGranted, setServerGranted] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Map<string, boolean>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Set<StaticPageGroup>>(new Set())

  // ── Load the 8 page actions once (stable across roles). ──────────────────
  useEffect(() => {
    let cancelled = false
    fetch("/api/permissions?scope=page", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.success) return
        setPermissions((j.data ?? []).map((p: any) => ({ id: p.id, name: p.name })))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // ── Load this role's existing page grants whenever the role changes. ─────
  const loadRoleGrants = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setPending(new Map())
    fetch(`/api/role-permissions?roleId=${encodeURIComponent(roleId)}&scope=page`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return
        const rows: RolePagePermissionRow[] = j?.success ? j.data ?? [] : []
        const next = new Set<string>()
        for (const row of rows) {
          if (row.granted && row.pagePath) {
            next.add(cellKey(row.pagePath, row.permissionId))
          }
        }
        setServerGranted(next)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [roleId])

  useEffect(() => {
    const cleanup = loadRoleGrants()
    return cleanup
  }, [loadRoleGrants])

  // ── Cell state helpers ────────────────────────────────────────────────────
  const isGranted = useCallback(
    (path: string, permId: string): boolean => {
      const key = cellKey(path, permId)
      if (pending.has(key)) return pending.get(key)!
      return serverGranted.has(key)
    },
    [pending, serverGranted],
  )

  const setCell = useCallback(
    (path: string, permId: string, next: boolean) => {
      const key = cellKey(path, permId)
      setPending((prev) => {
        const m = new Map(prev)
        const baseline = serverGranted.has(key)
        if (next === baseline) m.delete(key)
        else m.set(key, next)
        return m
      })
    },
    [serverGranted],
  )

  const groups = useMemo(() => staticPagesByGroup(), [])
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        pages: g.pages.filter(
          (p) =>
            p.label.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.pages.length > 0)
  }, [groups, search])

  // Grant/clear one action for every page in a group (column bulk action).
  const setColumnForGroup = (pages: StaticPage[], permId: string, next: boolean) => {
    setPending((prev) => {
      const m = new Map(prev)
      for (const p of pages) {
        const key = cellKey(p.path, permId)
        const baseline = serverGranted.has(key)
        if (next === baseline) m.delete(key)
        else m.set(key, next)
      }
      return m
    })
  }

  // Grant/clear every action for one page (row bulk action).
  const setRowForPage = (path: string, next: boolean) => {
    setPending((prev) => {
      const m = new Map(prev)
      for (const perm of permissions) {
        const key = cellKey(path, perm.id)
        const baseline = serverGranted.has(key)
        if (next === baseline) m.delete(key)
        else m.set(key, next)
      }
      return m
    })
  }

  const dirtyCount = pending.size
  const isDirty = dirtyCount > 0
  const reset = () => setPending(new Map())

  const save = async () => {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      const updates = Array.from(pending.entries()).map(([key, granted]) => {
        const sep = key.lastIndexOf("::")
        const pagePath = key.slice(0, sep)
        const permissionId = key.slice(sep + 2)
        return {
          roleId,
          permissionId,
          pagePath,
          moduleId: null,
          formId: null,
          granted,
          canDelegate: false,
        }
      })

      const res = await fetch("/api/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      })
      const j = await res.json()
      if (!res.ok || !j?.success) {
        throw new Error(j?.error || j?.details || "Save failed")
      }

      toast({
        title: "Permissions saved",
        description: `${updates.length} change${updates.length === 1 ? "" : "s"} applied for ${roleName}.`,
      })
      loadRoleGrants()
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-purple-600" />
              Static page permissions — {roleName}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Grant this role granular actions on each static page. Granting{" "}
              <strong>View</strong> makes the page appear in the sidebar, just
              like a module.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button variant="outline" size="sm" onClick={reset} disabled={!isDirty || saving}>
              <Undo2 className="h-4 w-4 mr-1" />
              Undo
            </Button>
            <Button size="sm" onClick={save} disabled={!isDirty || saving}>
              {saving ? (
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save{isDirty ? ` (${dirtyCount})` : ""}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter pages…"
            className="pl-8 h-9 max-w-md"
          />
        </div>

        {loading || permissions.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No pages match "{search}".
          </div>
        ) : (
          <div className="space-y-2">
            {filteredGroups.map((g) => {
              const isCollapsed = collapsed.has(g.group)
              return (
                <Collapsible
                  key={g.group}
                  open={!isCollapsed}
                  onOpenChange={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev)
                      if (next.has(g.group)) next.delete(g.group)
                      else next.add(g.group)
                      return next
                    })
                  }
                >
                  <div className="rounded-lg border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                      <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-semibold">{g.group}</span>
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          {g.pages.length}
                        </Badge>
                      </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[680px] text-sm">
                          <thead>
                            <tr className="border-b bg-muted/10">
                              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                                Page
                              </th>
                              {permissions.map((perm) => (
                                <th
                                  key={perm.id}
                                  className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-tight text-muted-foreground"
                                >
                                  <button
                                    type="button"
                                    className="hover:text-foreground"
                                    title={`Toggle ${perm.name} for all pages in ${g.group}`}
                                    onClick={() => {
                                      const allOn = g.pages.every((p) =>
                                        isGranted(p.path, perm.id),
                                      )
                                      setColumnForGroup(g.pages, perm.id, !allOn)
                                    }}
                                  >
                                    {perm.name}
                                  </button>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {g.pages.map((p) => {
                              const rowAllOn = permissions.every((perm) =>
                                isGranted(p.path, perm.id),
                              )
                              return (
                                <tr
                                  key={p.path}
                                  className="border-b last:border-0 hover:bg-muted/20"
                                >
                                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        className="text-sm font-medium truncate hover:text-primary text-left"
                                        title="Toggle all actions for this page"
                                        onClick={() => setRowForPage(p.path, !rowAllOn)}
                                      >
                                        {p.label}
                                      </button>
                                      {p.adminOnly && (
                                        <Badge
                                          variant="outline"
                                          className="h-4 px-1 text-[9px] border-amber-300 bg-amber-50 text-amber-800"
                                        >
                                          <Lock className="h-2.5 w-2.5 mr-0.5" />
                                          Admin
                                        </Badge>
                                      )}
                                    </div>
                                    <code className="text-[10px] text-muted-foreground">
                                      {p.path}
                                    </code>
                                  </td>
                                  {permissions.map((perm) => {
                                    const key = cellKey(p.path, perm.id)
                                    const checked = isGranted(p.path, perm.id)
                                    const dirty = pending.has(key)
                                    return (
                                      <td
                                        key={perm.id}
                                        className={cn(
                                          "px-1 py-2 text-center",
                                          dirty && "bg-amber-50/50 dark:bg-amber-900/10",
                                        )}
                                      >
                                        <Checkbox
                                          checked={checked}
                                          disabled={saving}
                                          onCheckedChange={(v) =>
                                            setCell(p.path, perm.id, v === true)
                                          }
                                        />
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
