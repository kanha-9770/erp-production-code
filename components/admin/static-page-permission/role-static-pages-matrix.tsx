"use client"

/**
 * RoleStaticPagesMatrix — single-role view of every static page with a
 * tri-state cell (Default / Grant / Deny).
 *
 * Used inside the "By Role" tab on /settings/permission/static-page-permission
 * so an admin who picks a role from the left rail immediately sees ALL static
 * pages and can grant / deny them in one save.
 *
 * Persistence
 * -----------
 * Same RoutePermission + RouteRoleAccess plumbing as StaticPagesRolesMatrix:
 *   - Each path gets a RoutePermission row (auto-created on first save).
 *   - Per-role grant/deny lives on RouteRoleAccess (granted: true|false).
 *   - "Default" leaves the row alone — open-by-default semantics in
 *     resolveRouteAccess decide.
 *   - After save, refreshAuthMeta is called so the caller's sidebar reflects
 *     the change without a hard reload.
 */

import { useEffect, useMemo, useState } from "react"
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Globe,
  Info,
  Lock,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  useCreateRoutePermissionMutation,
  useGetRoutePermissionsQuery,
  useRefreshAuthMetaMutation,
  useUpdateRouteAccessMutation,
} from "@/lib/api/route-permissions"
import { useToast } from "@/hooks/use-toast"
import {
  STATIC_PAGES,
  STATIC_PAGE_GROUP_ORDER,
  staticPagesByGroup,
  type StaticPage,
  type StaticPageGroup,
} from "@/lib/static-pages"

type AccessState = "granted" | "denied" | "inherit"

const STATE_META: Record<AccessState, {
  short: string
  badgeClass: string
  Icon: React.ElementType
}> = {
  granted: {
    short: "Grant",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400",
    Icon: ShieldCheck,
  },
  denied: {
    short: "Deny",
    badgeClass:
      "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400",
    Icon: ShieldAlert,
  },
  inherit: {
    short: "Default",
    badgeClass:
      "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/40 dark:text-slate-400",
    Icon: Globe,
  },
}

const CYCLE_NEXT: Record<AccessState, AccessState> = {
  inherit: "granted",
  granted: "denied",
  denied: "inherit",
}

interface RoleStaticPagesMatrixProps {
  roleId: string
  roleName: string
}

export function RoleStaticPagesMatrix({
  roleId,
  roleName,
}: RoleStaticPagesMatrixProps) {
  const { toast } = useToast()
  const {
    data: routesResp,
    isLoading: routesLoading,
    refetch: refetchRoutes,
  } = useGetRoutePermissionsQuery()
  const [createRoute] = useCreateRoutePermissionMutation()
  const [updateAccess] = useUpdateRouteAccessMutation()
  const [refreshMeta] = useRefreshAuthMetaMutation()

  const routes = routesResp?.data ?? []
  const routeByPath = useMemo(() => {
    const m = new Map<string, (typeof routes)[number]>()
    for (const r of routes) m.set(r.pattern, r)
    return m
  }, [routes])

  const savedState = (path: string): AccessState => {
    const route = routeByPath.get(path)
    if (!route) return "inherit"
    const ra = route.roleAccess.find((x) => x.roleId === roleId)
    if (!ra) return "inherit"
    return ra.granted ? "granted" : "denied"
  }

  const [pending, setPending] = useState<Map<string, AccessState>>(new Map())
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Set<StaticPageGroup>>(new Set())

  // Reset pending when role switches so changes from a previous role don't
  // leak into the newly selected one.
  useEffect(() => {
    setPending(new Map())
  }, [roleId])

  // If a refetch caught us up, prune pending entries that now match server.
  useEffect(() => {
    setPending((prev) => {
      const next = new Map(prev)
      for (const [p, state] of Array.from(next)) {
        if (savedState(p) === state) next.delete(p)
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes])

  const stateFor = (path: string): AccessState =>
    pending.has(path) ? pending.get(path)! : savedState(path)

  const setStateForPath = (path: string, next: AccessState) => {
    setPending((prev) => {
      const m = new Map(prev)
      const baseline = savedState(path)
      if (next === baseline) m.delete(path)
      else m.set(path, next)
      return m
    })
  }

  const cycle = (path: string) => setStateForPath(path, CYCLE_NEXT[stateFor(path)])

  const setGroup = (g: StaticPageGroup, next: AccessState) => {
    setPending((prev) => {
      const m = new Map(prev)
      for (const p of STATIC_PAGES.filter((x) => x.group === g)) {
        const baseline = savedState(p.path)
        if (next === baseline) m.delete(p.path)
        else m.set(p.path, next)
      }
      return m
    })
  }

  const setAll = (next: AccessState) => {
    setPending((prev) => {
      const m = new Map(prev)
      for (const p of STATIC_PAGES) {
        const baseline = savedState(p.path)
        if (next === baseline) m.delete(p.path)
        else m.set(p.path, next)
      }
      return m
    })
  }

  const dirtyCount = pending.size
  const isDirty = dirtyCount > 0
  const reset = () => setPending(new Map())

  const groups = useMemo(() => staticPagesByGroup(), [])
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        pages: g.pages.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.path.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.pages.length > 0)
  }, [groups, search])

  const save = async () => {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      // Walk pending in the same order pages appear in the registry so a
      // partial-failure trail is predictable.
      const orderedPaths = Array.from(pending.keys()).sort((a, b) => {
        const ga = STATIC_PAGES.find((p) => p.path === a)?.group
        const gb = STATIC_PAGES.find((p) => p.path === b)?.group
        const oa = ga ? STATIC_PAGE_GROUP_ORDER.indexOf(ga) : 99
        const ob = gb ? STATIC_PAGE_GROUP_ORDER.indexOf(gb) : 99
        if (oa !== ob) return oa - ob
        return a.localeCompare(b)
      })

      let savedRows = 0
      for (const path of orderedPaths) {
        const next = pending.get(path)!
        if (next === "inherit") continue // API has no delete; inherit is a no-op for already-absent rows
        let routeId = routeByPath.get(path)?.id
        if (!routeId) {
          const meta = STATIC_PAGES.find((p) => p.path === path)
          const created = await createRoute({
            pattern: path,
            description: meta?.label ?? path,
          }).unwrap()
          routeId = created.data.id
        }
        await updateAccess({
          routeId: routeId!,
          roleUpdates: [{ roleId, granted: next === "granted" }],
        }).unwrap()
        savedRows++
      }

      try {
        await refreshMeta().unwrap()
      } catch {
        /* non-fatal */
      }
      await refetchRoutes()

      toast({
        title: "Permissions saved",
        description: `${savedRows} static page${savedRows === 1 ? "" : "s"} updated for ${roleName}.`,
      })
      setPending(new Map())
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.data?.error ?? e?.message ?? "Try again",
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
              Static page access — {roleName}
              <span
                title="Click a cell to cycle Default → Grant → Deny. Once any role is granted, the page is whitelist-only."
                className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-help"
              >
                <Info className="h-4 w-4" />
              </span>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Grant or deny this role access to each static page. Use the group
              buttons or "All" to apply changes in bulk.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <BulkButton onClick={() => setAll("granted")} label="Grant all" tone="grant" />
            <BulkButton onClick={() => setAll("denied")} label="Deny all" tone="deny" />
            <BulkButton onClick={() => setAll("inherit")} label="Reset all" tone="neutral" />
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

        {routesLoading ? (
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
              const grantedCount = g.pages.filter((p) => stateFor(p.path) === "granted").length
              const deniedCount = g.pages.filter((p) => stateFor(p.path) === "denied").length

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
                        {grantedCount > 0 && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] border-emerald-200 bg-emerald-50 text-emerald-800"
                          >
                            {grantedCount} grant
                          </Badge>
                        )}
                        {deniedCount > 0 && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] border-rose-200 bg-rose-50 text-rose-800"
                          >
                            {deniedCount} deny
                          </Badge>
                        )}
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-1 shrink-0">
                        <BulkButton
                          onClick={() => setGroup(g.group, "granted")}
                          label="Grant group"
                          tone="grant"
                          compact
                        />
                        <BulkButton
                          onClick={() => setGroup(g.group, "denied")}
                          label="Deny group"
                          tone="deny"
                          compact
                        />
                        <BulkButton
                          onClick={() => setGroup(g.group, "inherit")}
                          label="Reset"
                          tone="neutral"
                          compact
                        />
                      </div>
                    </div>

                    <CollapsibleContent>
                      <ul className="divide-y">
                        {g.pages.map((p) => (
                          <PageRow
                            key={p.path}
                            page={p}
                            state={stateFor(p.path)}
                            isPending={pending.has(p.path)}
                            onCycle={() => cycle(p.path)}
                            onSet={(s) => setStateForPath(p.path, s)}
                          />
                        ))}
                      </ul>
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

function PageRow({
  page,
  state,
  isPending,
  onCycle,
  onSet,
}: {
  page: StaticPage
  state: AccessState
  isPending: boolean
  onCycle: () => void
  onSet: (s: AccessState) => void
}) {
  const meta = STATE_META[state]
  const Icon = meta.Icon
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2",
        isPending && "bg-amber-50/40 dark:bg-amber-900/10",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{page.label}</span>
          {page.adminOnly && (
            <Badge
              variant="outline"
              className="h-4 px-1 text-[9px] border-amber-300 bg-amber-50 text-amber-800"
            >
              <Lock className="h-2.5 w-2.5 mr-0.5" />
              Admin
            </Badge>
          )}
        </div>
        <code className="text-[10px] text-muted-foreground">{page.path}</code>
      </div>
      <button
        type="button"
        onClick={onCycle}
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-medium transition-colors",
          meta.badgeClass,
        )}
        title="Click to cycle: Default → Grant → Deny"
      >
        <Icon className="h-3 w-3" />
        {meta.short}
        {isPending && <span className="ml-1 opacity-60">·</span>}
      </button>
      <div className="hidden sm:flex items-center gap-0.5">
        <SmallToggle
          active={state === "inherit"}
          onClick={() => onSet("inherit")}
          icon={<Globe className="h-3 w-3" />}
          tone="neutral"
          title="Default"
        />
        <SmallToggle
          active={state === "granted"}
          onClick={() => onSet("granted")}
          icon={<ShieldCheck className="h-3 w-3" />}
          tone="grant"
          title="Grant"
        />
        <SmallToggle
          active={state === "denied"}
          onClick={() => onSet("denied")}
          icon={<ShieldAlert className="h-3 w-3" />}
          tone="deny"
          title="Deny"
        />
      </div>
    </li>
  )
}

function SmallToggle({
  active,
  onClick,
  icon,
  tone,
  title,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  tone: "neutral" | "grant" | "deny"
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "h-6 w-6 inline-flex items-center justify-center rounded transition-colors",
        active
          ? tone === "grant"
            ? "bg-emerald-500 text-white"
            : tone === "deny"
            ? "bg-rose-500 text-white"
            : "bg-slate-600 text-white"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
    </button>
  )
}

function BulkButton({
  onClick,
  label,
  tone,
  compact,
}: {
  onClick: () => void
  label: string
  tone: "grant" | "deny" | "neutral"
  compact?: boolean
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        compact ? "h-6 px-1.5 text-[10px]" : "",
        tone === "grant" &&
          "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
        tone === "deny" && "border-rose-300 text-rose-700 hover:bg-rose-50",
      )}
    >
      {label}
    </Button>
  )
}
