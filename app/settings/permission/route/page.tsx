"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Save,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Globe,
  UserCircle,
  ChevronUp,
  Info,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  useDiscoverRoutesQuery,
  useSyncRoutePermissionsMutation,
  useGetRouteAccessQuery,
  useUpdateRouteAccessMutation,
  useRefreshAuthMetaMutation,
  type RouteRule,
} from "@/lib/api/route-permissions"
import { useGetRolesQuery } from "@/lib/api/permissions"
import { useGetAdminUsersQuery } from "@/lib/api/users"
import type { PermissionRole, PermissionUser } from "@/types/permissions"

// ─── Helpers ────────────────────────────────────────────────────────────────

type ChangeKey = string
const SEP = "::"
function makeKey(prefix: "role" | "user", id: string): ChangeKey {
  return `${prefix}${SEP}${id}`
}

interface RouteGroup {
  label: string
  prefix: string
  routes: RouteRule[]
}

function groupRoutes(routes: RouteRule[]): RouteGroup[] {
  const groups = new Map<string, RouteRule[]>()
  for (const route of routes) {
    const prefix = route.pattern.split("/").filter(Boolean)[0] ?? "root"
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(route)
  }
  return [...groups.entries()]
    .map(([prefix, rts]) => ({
      label: prefix === "root" ? "Root" : `/${prefix}`,
      prefix,
      routes: rts.sort((a, b) => a.pattern.localeCompare(b.pattern)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function RoutePermissionsPage() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [sidebarSearch, setSidebarSearch] = useState("")
  const [routes, setRoutes] = useState<RouteRule[]>([])
  const synced = useRef(false)

  const { data: discoverData, isLoading: discovering } = useDiscoverRoutesQuery()
  const [syncRoutes, { isLoading: syncing }] = useSyncRoutePermissionsMutation()

  useEffect(() => {
    if (synced.current || !discoverData?.success) return
    synced.current = true
    syncRoutes(discoverData.data)
      .unwrap()
      .then((r) => {
        if (r.success) {
          setRoutes(r.data)
          if (r.meta.created > 0) toast.success(`${r.meta.created} new route(s) synced`)
        }
      })
      .catch(() => toast.error("Failed to sync routes"))
  }, [discoverData, syncRoutes])

  const loading = discovering || syncing

  const filteredRoutes = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase()
    return q ? routes.filter((r) => r.pattern.toLowerCase().includes(q)) : routes
  }, [routes, sidebarSearch])

  const routeGroups = useMemo(() => groupRoutes(filteredRoutes), [filteredRoutes])
  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            {discovering ? "Scanning routes..." : "Syncing..."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-[calc(100vh-140px)] flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between pb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Route Permissions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage page-level access for roles and users
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            <span>Admin role always has full access</span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex gap-0 border rounded-lg overflow-hidden bg-background min-h-0">
          {/* ── Left: Route list ──────────────────────────────────────────── */}
          <div className="w-[280px] shrink-0 border-r flex flex-col bg-muted/30">
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Routes
                </span>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {routes.length}
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="pl-7 h-7 text-xs bg-background"
                />
              </div>
            </div>

            <Separator />

            <ScrollArea className="flex-1">
              <div className="py-1">
                {routeGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {sidebarSearch ? "No matches" : "No routes"}
                  </p>
                ) : (
                  routeGroups.map((group) => (
                    <RouteGroupItem
                      key={group.prefix}
                      group={group}
                      selectedRouteId={selectedRouteId}
                      onSelect={setSelectedRouteId}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* ── Right: Access panel ──────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-h-0">
            {selectedRoute ? (
              <AccessPanel route={selectedRoute} />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">Select a route to manage access</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

// ─── Route Group (sidebar) ──────────────────────────────────────────────────

function RouteGroupItem({
  group,
  selectedRouteId,
  onSelect,
}: {
  group: RouteGroup
  selectedRouteId: string | null
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left hover:bg-muted/60 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex-1">
          {group.label}
        </span>
        <span className="text-[10px] text-muted-foreground/60">{group.routes.length}</span>
      </button>

      {open && (
        <div className="pb-1">
          {group.routes.map((route) => {
            const isActive = selectedRouteId === route.id
            const granted = route.roleAccess.filter((r) => r.granted).length
            return (
              <button
                key={route.id}
                onClick={() => onSelect(route.id)}
                className={cn(
                  "flex items-center gap-2 w-full pl-7 pr-3 py-[5px] text-left transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/80 text-foreground/80"
                )}
              >
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0",
                  granted > 0 ? "bg-emerald-500" : "bg-orange-400"
                )} />
                <span className="font-mono text-[11px] truncate flex-1">
                  {route.pattern}
                </span>
                {granted > 0 && (
                  <span className={cn(
                    "text-[10px] tabular-nums",
                    isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {granted}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Access Panel (right side) ──────────────────────────────────────────────

function AccessPanel({ route }: { route: RouteRule }) {
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())
  const [changes, setChanges] = useState<Map<ChangeKey, boolean>>(new Map())
  const [saving, setSaving] = useState(false)

  const prevId = useRef(route.id)
  useEffect(() => {
    if (prevId.current !== route.id) {
      setChanges(new Map())
      setExpandedRoles(new Set())
      prevId.current = route.id
    }
  }, [route.id])

  const { data: rolesData, isLoading: rl } = useGetRolesQuery()
  const { data: usersData, isLoading: ul } = useGetAdminUsersQuery()
  const { data: accessData, isLoading: al, refetch } = useGetRouteAccessQuery(route.id)
  const [updateAccess] = useUpdateRouteAccessMutation()
  const [refreshMeta] = useRefreshAuthMetaMutation()

  const roles: PermissionRole[] = useMemo(() => (rolesData?.success ? rolesData.data : []), [rolesData])
  const users: PermissionUser[] = useMemo(() => {
    if (!usersData?.success) return []
    return usersData.data as unknown as PermissionUser[]
  }, [usersData])

  const filteredRoles = useMemo(() => roles.filter((r) => r.name.toLowerCase() !== "admin"), [roles])

  const roleAccessMap = useMemo(() => {
    const m = new Map<string, boolean>()
    if (accessData?.success) accessData.data.roleAccess.forEach((ra) => m.set(ra.roleId, ra.granted))
    return m
  }, [accessData])

  const userAccessMap = useMemo(() => {
    const m = new Map<string, boolean>()
    if (accessData?.success) accessData.data.userAccess.forEach((ua) => m.set(ua.userId, ua.granted))
    return m
  }, [accessData])

  const hasRoleAccess = useCallback(
    (roleId: string) => changes.has(makeKey("role", roleId)) ? changes.get(makeKey("role", roleId))! : roleAccessMap.get(roleId) === true,
    [changes, roleAccessMap]
  )

  const hasUserAccess = useCallback(
    (userId: string) => {
      const key = makeKey("user", userId)
      if (changes.has(key)) return changes.get(key)!
      if (userAccessMap.has(userId)) return userAccessMap.get(userId)!
      const userRoleIds = users.find((u) => u.id === userId)?.unitAssignments?.map((a) => a.roleId) ?? []
      return userRoleIds.some((rid) => hasRoleAccess(rid))
    },
    [changes, userAccessMap, users, hasRoleAccess]
  )

  const toggleAccess = useCallback(
    (prefix: "role" | "user", id: string) => {
      const key = makeKey(prefix, id)
      setChanges((prev) => {
        const next = new Map(prev)
        const current = prev.has(key)
          ? prev.get(key)!
          : prefix === "role"
            ? roleAccessMap.get(id) === true
            : userAccessMap.get(id) === true
        next.set(key, !current)
        return next
      })
    },
    [roleAccessMap, userAccessMap]
  )

  const getUsersForRole = useCallback(
    (roleId: string) => users.filter((u) => u.unitAssignments?.some((a) => a.roleId === roleId)),
    [users]
  )

  const handleSave = async () => {
    if (changes.size === 0) return
    setSaving(true)
    try {
      const roleUpdates: Array<{ roleId: string; granted: boolean }> = []
      const userUpdates: Array<{ userId: string; granted: boolean }> = []
      changes.forEach((granted, key) => {
        const [prefix, id] = key.split(SEP)
        if (prefix === "role") roleUpdates.push({ roleId: id, granted })
        else userUpdates.push({ userId: id, granted })
      })

      await updateAccess({
        routeId: route.id,
        roleUpdates: roleUpdates.length ? roleUpdates : undefined,
        userUpdates: userUpdates.length ? userUpdates : undefined,
      }).unwrap()

      await refetch()
      try { await refreshMeta().unwrap() } catch {}
      setChanges(new Map())
      toast.success("Permissions saved")
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const loading = rl || ul || al
  const hasChanges = changes.size > 0
  const grantedCount = [...roleAccessMap.values()].filter(Boolean).length

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-5 py-3 border-b flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-semibold truncate">{route.pattern}</code>
            {grantedCount > 0 ? (
              <Badge variant="default" className="shrink-0 text-[10px] h-5 bg-emerald-600 hover:bg-emerald-600">
                <ShieldCheck className="h-3 w-3 mr-1" />
                {grantedCount} role{grantedCount !== 1 ? "s" : ""}
              </Badge>
            ) : (
              <Badge variant="destructive" className="shrink-0 text-[10px] h-5">
                <ShieldX className="h-3 w-3 mr-1" />
                No access
              </Badge>
            )}
          </div>
          {route.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{route.description}</p>
          )}
        </div>

        {/* Save actions */}
        <div className="flex items-center gap-2 shrink-0">
          {hasChanges && (
            <>
              <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30">
                {changes.size} unsaved
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                disabled={saving}
                onClick={() => setChanges(new Map())}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            </>
          )}
          <Button
            size="sm"
            className="h-7 text-xs px-3"
            disabled={!hasChanges || saving}
            onClick={handleSave}
          >
            {saving ? (
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Role list */}
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {filteredRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No roles found</p>
          ) : (
            filteredRoles.map((role) => {
              const usersInRole = getUsersForRole(role.id)
              const isExpanded = expandedRoles.has(role.id)
              const roleGranted = hasRoleAccess(role.id)
              const isChanged = changes.has(makeKey("role", role.id))

              return (
                <div key={role.id}>
                  {/* Role row */}
                  <div
                    className={cn(
                      "flex items-center gap-3 px-5 py-3 transition-colors",
                      isChanged && "bg-amber-50/80 dark:bg-amber-950/20"
                    )}
                  >
                    {/* Expand toggle */}
                    <button
                      onClick={() => {
                        setExpandedRoles((prev) => {
                          const n = new Set(prev)
                          n.has(role.id) ? n.delete(role.id) : n.add(role.id)
                          return n
                        })
                      }}
                      className="p-0.5 rounded hover:bg-muted transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>

                    {/* Role info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{role.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {usersInRole.length} user{usersInRole.length !== 1 ? "s" : ""}
                        </span>
                        {isChanged && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        )}
                      </div>
                    </div>

                    {/* Status indicator */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          "text-[10px] font-medium px-2 py-0.5 rounded-full",
                          roleGranted
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                            : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                        )}>
                          {roleGranted ? "Allowed" : "Denied"}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        {roleGranted
                          ? `${role.name} can access this route`
                          : `${role.name} cannot access this route`}
                      </TooltipContent>
                    </Tooltip>

                    {/* Switch */}
                    <Switch
                      checked={roleGranted}
                      disabled={saving}
                      onCheckedChange={() => toggleAccess("role", role.id)}
                    />
                  </div>

                  {/* Expanded: users in role */}
                  {isExpanded && (
                    <div className="bg-muted/30 border-t">
                      {usersInRole.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-14 py-3 italic">
                          No users in this role
                        </p>
                      ) : (
                        usersInRole.map((user, idx) => {
                          const userGranted = hasUserAccess(user.id)
                          const userChanged = changes.has(makeKey("user", user.id))
                          return (
                            <div
                              key={user.id}
                              className={cn(
                                "flex items-center gap-3 pl-14 pr-5 py-2.5",
                                idx < usersInRole.length - 1 && "border-b border-muted/50",
                                userChanged && "bg-amber-50/60 dark:bg-amber-950/15"
                              )}
                            >
                              <UserCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">
                                  {user.first_name} {user.last_name}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {user.email}
                                </p>
                              </div>
                              {userChanged && (
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                              )}
                              <Switch
                                checked={userGranted}
                                disabled={saving}
                                onCheckedChange={() => toggleAccess("user", user.id)}
                                className="scale-90"
                              />
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-5 py-2 border-t bg-muted/20">
        <p className="text-[10px] text-muted-foreground">
          Changes apply to your session instantly. Other users must re-login.
        </p>
      </div>
    </div>
  )
}
