"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Route,
  Search,
  ChevronDown,
  ChevronRight,
  Lock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  useDiscoverRoutesQuery,
  useSyncRoutePermissionsMutation,
  useGetRouteAccessQuery,
  useUpdateRouteAccessMutation,
  type RouteRule,
} from "@/lib/api/route-permissions"
import { useGetRolesQuery } from "@/lib/api/permissions"
import { useGetAdminUsersQuery } from "@/lib/api/users"
import type { PermissionRole, PermissionUser } from "@/types/permissions"

// ─── Types ──────────────────────────────────────────────────────────────────

type ChangeKey = string
const SEP = "::"
function makeKey(prefix: "role" | "user", id: string): ChangeKey {
  return `${prefix}${SEP}${id}`
}

// ─── Categorize routes into groups for the sidebar ──────────────────────────

interface RouteGroup {
  label: string
  prefix: string
  routes: RouteRule[]
}

function groupRoutes(routes: RouteRule[]): RouteGroup[] {
  const groups: Map<string, RouteRule[]> = new Map()

  for (const route of routes) {
    const parts = route.pattern.split("/").filter(Boolean)
    const prefix = parts[0] ?? "root"
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(route)
  }

  const result: RouteGroup[] = []
  for (const [prefix, groupRoutes] of groups) {
    result.push({
      label: prefix === "root" ? "Root" : `/${prefix}`,
      prefix,
      routes: groupRoutes.sort((a, b) => a.pattern.localeCompare(b.pattern)),
    })
  }

  return result.sort((a, b) => a.label.localeCompare(b.label))
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function RoutePermissionsPage() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [sidebarSearch, setSidebarSearch] = useState("")
  const [routes, setRoutes] = useState<RouteRule[]>([])
  const synced = useRef(false)

  // Discover all static routes and sync to DB
  const { data: discoverData, isLoading: discovering } = useDiscoverRoutesQuery()
  const [syncRoutes, { isLoading: syncing }] = useSyncRoutePermissionsMutation()

  // Auto-sync discovered routes into DB on first load
  useEffect(() => {
    if (synced.current || !discoverData?.success) return
    synced.current = true

    syncRoutes(discoverData.data)
      .unwrap()
      .then((result) => {
        if (result.success) {
          setRoutes(result.data)
          if (result.meta.created > 0) {
            toast.success(`${result.meta.created} new route(s) synced`)
          }
        }
      })
      .catch(() => toast.error("Failed to sync routes"))
  }, [discoverData, syncRoutes])

  const loading = discovering || syncing

  const filteredRoutes = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase()
    if (!q) return routes
    return routes.filter((r) => r.pattern.toLowerCase().includes(q))
  }, [routes, sidebarSearch])

  const routeGroups = useMemo(() => groupRoutes(filteredRoutes), [filteredRoutes])

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null

  const handleRouteSelect = useCallback((routeId: string) => {
    setSelectedRouteId(routeId)
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="mt-5 text-base font-medium">
          {discovering ? "Discovering routes..." : "Syncing routes..."}
        </p>
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <RouteSidebar
            routeGroups={routeGroups}
            selectedRouteId={selectedRouteId}
            search={sidebarSearch}
            onSearchChange={setSidebarSearch}
            onRouteSelect={handleRouteSelect}
            totalCount={routes.length}
          />
        </div>

        {/* Matrix */}
        <div className="lg:col-span-4">
          {selectedRoute ? (
            <RouteAccessMatrix route={selectedRoute} />
          ) : (
            <Card className="border-dashed border-border">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
                <Lock className="h-12 w-12 text-muted-foreground/60" />
                <div className="text-center">
                  <h3 className="font-semibold text-lg">No Route Selected</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Select a route from the sidebar to configure role and user access
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

interface RouteSidebarProps {
  routeGroups: RouteGroup[]
  selectedRouteId: string | null
  search: string
  onSearchChange: (v: string) => void
  onRouteSelect: (id: string) => void
  totalCount: number
}

function RouteSidebar({
  routeGroups,
  selectedRouteId,
  search,
  onSearchChange,
  onRouteSelect,
  totalCount,
}: RouteSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Expand all groups on first render
  const didInit = useRef(false)
  useEffect(() => {
    if (!didInit.current && routeGroups.length > 0) {
      setExpandedGroups(new Set(routeGroups.map((g) => g.prefix)))
      didInit.current = true
    }
  }, [routeGroups])

  const toggleGroup = (prefix: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(prefix) ? next.delete(prefix) : next.add(prefix)
      return next
    })
  }

  return (
    <Card className="border shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b bg-muted/40 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Routes
            <Badge variant="secondary" className="ml-2 text-xs">
              {totalCount}
            </Badge>
          </h3>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search routes..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Grouped list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {routeGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center">
              <AlertCircle className="h-10 w-10 mb-3 opacity-70" />
              <p className="text-sm font-medium">
                {search ? "No matching routes" : "No routes found"}
              </p>
            </div>
          ) : (
            routeGroups.map((group) => (
              <Collapsible
                key={group.prefix}
                open={expandedGroups.has(group.prefix)}
                onOpenChange={() => toggleGroup(group.prefix)}
              >
                <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/70 text-left">
                  {expandedGroups.has(group.prefix) ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold flex-1">{group.label}</span>
                  <Badge variant="outline" className="text-xs px-2 py-0">
                    {group.routes.length}
                  </Badge>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="ml-4 pb-1">
                    {group.routes.map((route) => {
                      const isSelected = selectedRouteId === route.id
                      const grantedRoles = route.roleAccess.filter((r) => r.granted).length
                      return (
                        <button
                          key={route.id}
                          onClick={() => onRouteSelect(route.id)}
                          className={cn(
                            "flex items-center gap-2 w-full p-2 pl-3 rounded-md text-sm transition-colors",
                            isSelected
                              ? "bg-primary/10 text-primary font-medium border-l-2 border-primary pl-[10px]"
                              : "hover:bg-muted/60"
                          )}
                        >
                          <Route className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-mono text-xs truncate flex-1 text-left">
                            {route.pattern}
                          </span>
                          {grantedRoles > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {grantedRoles}
                            </Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}

// ─── Access Matrix ──────────────────────────────────────────────────────────

interface RouteAccessMatrixProps {
  route: RouteRule
}

function RouteAccessMatrix({ route }: RouteAccessMatrixProps) {
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())
  const [changes, setChanges] = useState<Map<ChangeKey, boolean>>(new Map())
  const [saving, setSaving] = useState(false)

  // Reset changes when route changes
  const prevRouteId = useRef(route.id)
  useEffect(() => {
    if (prevRouteId.current !== route.id) {
      setChanges(new Map())
      setExpandedRoles(new Set())
      prevRouteId.current = route.id
    }
  }, [route.id])

  // Fetch roles, users, and current access
  const { data: rolesData, isLoading: rolesLoading } = useGetRolesQuery()
  const { data: usersData, isLoading: usersLoading } = useGetAdminUsersQuery()
  const {
    data: accessData,
    isLoading: accessLoading,
    refetch: refetchAccess,
  } = useGetRouteAccessQuery(route.id)
  const [updateAccess] = useUpdateRouteAccessMutation()

  const roles: PermissionRole[] = useMemo(
    () => (rolesData?.success ? rolesData.data : []),
    [rolesData]
  )
  const users: PermissionUser[] = useMemo(() => {
    if (!usersData?.success) return []
    return usersData.data as unknown as PermissionUser[]
  }, [usersData])

  const filteredRoles = useMemo(
    () => roles.filter((r) => r.name.toLowerCase() !== "admin"),
    [roles]
  )

  const roleAccessSet = useMemo(() => {
    const set = new Set<string>()
    if (accessData?.success) {
      for (const ra of accessData.data.roleAccess) {
        if (ra.granted) set.add(ra.roleId)
      }
    }
    return set
  }, [accessData])

  const userAccessSet = useMemo(() => {
    const set = new Set<string>()
    if (accessData?.success) {
      for (const ua of accessData.data.userAccess) {
        if (ua.granted) set.add(ua.userId)
      }
    }
    return set
  }, [accessData])

  const loading = rolesLoading || usersLoading || accessLoading
  const hasChanges = changes.size > 0

  const toggleRole = (roleId: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev)
      next.has(roleId) ? next.delete(roleId) : next.add(roleId)
      return next
    })
  }

  const hasRoleAccess = useCallback(
    (roleId: string): boolean => {
      const key = makeKey("role", roleId)
      if (changes.has(key)) return changes.get(key)!
      return roleAccessSet.has(roleId)
    },
    [changes, roleAccessSet]
  )

  const hasUserAccess = useCallback(
    (userId: string): boolean => {
      const key = makeKey("user", userId)
      if (changes.has(key)) return changes.get(key)!
      if (userAccessSet.has(userId)) return true
      // Inherit from role
      const userRoleIds =
        users.find((u) => u.id === userId)?.unitAssignments?.map((a) => a.roleId) ?? []
      return userRoleIds.some((rid) => hasRoleAccess(rid))
    },
    [changes, userAccessSet, users, hasRoleAccess]
  )

  const toggleAccess = useCallback(
    (prefix: "role" | "user", id: string) => {
      const key = makeKey(prefix, id)
      setChanges((prev) => {
        const next = new Map(prev)
        if (prev.has(key)) {
          next.set(key, !prev.get(key)!)
        } else {
          const current =
            prefix === "role" ? roleAccessSet.has(id) : userAccessSet.has(id)
          next.set(key, !current)
        }
        return next
      })
    },
    [roleAccessSet, userAccessSet]
  )

  const resetChanges = () => setChanges(new Map())

  const getUsersForRole = useCallback(
    (roleId: string): PermissionUser[] =>
      users.filter((u) => u.unitAssignments?.some((a) => a.roleId === roleId)),
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
        if (prefix === "role") {
          roleUpdates.push({ roleId: id, granted })
        } else {
          userUpdates.push({ userId: id, granted })
        }
      })

      await updateAccess({
        routeId: route.id,
        roleUpdates: roleUpdates.length ? roleUpdates : undefined,
        userUpdates: userUpdates.length ? userUpdates : undefined,
      }).unwrap()

      await refetchAccess()
      setChanges(new Map())
      toast.success(`${changes.size} change(s) saved`)
    } catch {
      toast.error("Failed to save access changes")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="mt-5 text-base font-medium">Loading access data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Route header */}
      <Card className="border shadow-sm">
        <CardHeader className="px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold font-mono">
                {route.pattern}
              </CardTitle>
              {route.description && (
                <p className="text-sm text-muted-foreground">
                  {route.description}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {route.redirectTo && (
                <Badge variant="outline">Redirect: {route.redirectTo}</Badge>
              )}
              <Badge variant="secondary">
                {roleAccessSet.size} role(s) granted
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Access table */}
      <Card>
        <CardHeader>
          <CardTitle>Route Access</CardTitle>
          <CardDescription>
            Control which roles and users can access this route. Expand a role to
            override access for individual users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredRoles.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 opacity-70 mb-3" />
              <p>No roles available (admin role excluded)</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-420px)] min-h-[500px] rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[280px] font-semibold">
                      Role / User
                    </TableHead>
                    <TableHead className="w-[120px] text-center font-semibold">
                      Access
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoles.map((role) => {
                    const usersInRole = getUsersForRole(role.id)
                    const isExpanded = expandedRoles.has(role.id)
                    const roleGranted = hasRoleAccess(role.id)

                    return (
                      <Collapsible
                        key={role.id}
                        open={isExpanded}
                        onOpenChange={() => toggleRole(role.id)}
                        asChild
                      >
                        <>
                          {/* Role row */}
                          <TableRow className="hover:bg-muted/60">
                            <TableCell className="font-medium">
                              <CollapsibleTrigger asChild>
                                <button className="flex items-center gap-2 hover:text-primary focus:outline-none">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                  {role.name}
                                  <Badge variant="outline" className="text-xs ml-1">
                                    {usersInRole.length} user(s)
                                  </Badge>
                                </button>
                              </CollapsibleTrigger>
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={roleGranted}
                                disabled={saving}
                                onCheckedChange={() => toggleAccess("role", role.id)}
                              />
                            </TableCell>
                          </TableRow>

                          {/* User rows */}
                          <CollapsibleContent asChild>
                            <>
                              {usersInRole.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={2}
                                    className="pl-12 text-sm text-muted-foreground italic"
                                  >
                                    No users in this role
                                  </TableCell>
                                </TableRow>
                              ) : (
                                usersInRole.map((user) => (
                                  <TableRow
                                    key={user.id}
                                    className="bg-muted/30 hover:bg-muted/50"
                                  >
                                    <TableCell className="pl-12 text-sm">
                                      {user.first_name} {user.last_name}
                                      <div className="text-xs text-muted-foreground">
                                        {user.email}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox
                                        checked={hasUserAccess(user.id)}
                                        disabled={saving}
                                        onCheckedChange={() =>
                                          toggleAccess("user", user.id)
                                        }
                                      />
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </>
                          </CollapsibleContent>
                        </>
                      </Collapsible>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {/* Action bar */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end border-t pt-6">
            <Button
              variant="outline"
              disabled={!hasChanges || saving}
              onClick={resetChanges}
            >
              Reset Changes
            </Button>
            <Button disabled={!hasChanges || saving} onClick={handleSave}>
              {saving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Save Access
                  {hasChanges && (
                    <Badge variant="secondary" className="ml-2">
                      {changes.size}
                    </Badge>
                  )}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
