"use client"

/**
 * PageUsersMatrix — per-user overrides for a single static page.
 *
 * Sibling of RoutePermissionMatrix (which handles roles). Same persistence
 * model except we hit RouteUserAccess via the existing access endpoint:
 *   PUT /api/route-permissions/access { routeId, userUpdates: [...] }
 *
 * Tri-state per user:
 *   • Default — no row exists; the user inherits their role grants /
 *               the page's open-by-default semantics.
 *   • Grant   — RouteUserAccess.granted = true (overrides any role deny).
 *   • Deny    — RouteUserAccess.granted = false (overrides any role grant).
 *
 * The user list comes from /api/admin/users (org-scoped). Large orgs get a
 * search box and a sticky toolbar so save/reset are always reachable.
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertCircle,
  Globe,
  Lock,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Users as UsersIcon,
} from "lucide-react"
import { useGetAdminUsersQuery } from "@/lib/api/users"
import {
  useCreateRoutePermissionMutation,
  useGetRoutePermissionsQuery,
  useRefreshAuthMetaMutation,
  useUpdateRouteAccessMutation,
} from "@/lib/api/route-permissions"
import { useToast } from "@/hooks/use-toast"
import { findStaticPage } from "@/lib/static-pages"
import { cn } from "@/lib/utils"

type AccessState = "granted" | "denied" | "inherit"

interface PageUsersMatrixProps {
  /** The route pattern, e.g. "/leave/admin". */
  path: string
}

const STATE_BADGE: Record<AccessState, { label: string; className: string; icon: React.ElementType }> = {
  granted: {
    label: "Granted",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: ShieldCheck,
  },
  denied: {
    label: "Denied",
    className:
      "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400",
    icon: ShieldAlert,
  },
  inherit: {
    label: "Default",
    className:
      "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/40 dark:text-slate-400",
    icon: Globe,
  },
}

export function PageUsersMatrix({ path }: PageUsersMatrixProps) {
  const { toast } = useToast()
  const meta = findStaticPage(path)

  const { data: usersResp, isLoading: usersLoading } = useGetAdminUsersQuery()
  const {
    data: routesResp,
    isLoading: routesLoading,
    refetch: refetchRoutes,
  } = useGetRoutePermissionsQuery()

  const [createRoute] = useCreateRoutePermissionMutation()
  const [updateAccess] = useUpdateRouteAccessMutation()
  const [refreshMeta] = useRefreshAuthMetaMutation()

  const users = usersResp?.data ?? []
  const route = useMemo(
    () => (routesResp?.data ?? []).find((r) => r.pattern === path) ?? null,
    [routesResp, path],
  )

  const savedAccessByUser = useMemo(() => {
    const map = new Map<string, boolean>()
    if (route) {
      for (const ua of route.userAccess ?? []) map.set(ua.userId, ua.granted)
    }
    return map
  }, [route])

  const [pending, setPending] = useState<Map<string, AccessState>>(new Map())
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState("")

  // Reset pending when path changes.
  useEffect(() => {
    setPending(new Map())
  }, [path])

  const baseline = (userId: string): AccessState => {
    if (!savedAccessByUser.has(userId)) return "inherit"
    return savedAccessByUser.get(userId) ? "granted" : "denied"
  }

  const stateFor = (userId: string): AccessState =>
    pending.has(userId) ? pending.get(userId)! : baseline(userId)

  const setStateForUser = (userId: string, next: AccessState) => {
    setPending((prev) => {
      const m = new Map(prev)
      if (next === baseline(userId)) m.delete(userId)
      else m.set(userId, next)
      return m
    })
  }

  const isDirty = pending.size > 0
  const dirtyCount = pending.size
  const reset = () => setPending(new Map())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q),
    )
  }, [users, query])

  const save = async () => {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      // Ensure RoutePermission exists.
      let routeId = route?.id ?? null
      if (!routeId) {
        const created = await createRoute({
          pattern: path,
          description: meta?.label ?? path,
        }).unwrap()
        routeId = created.data.id
      }

      // The access endpoint upserts only — inherit-from-set-row is a no-op
      // for now (no delete endpoint), matching RoutePermissionMatrix's
      // behaviour for roles. Send only grant/deny updates.
      const userUpdates: Array<{ userId: string; granted: boolean }> = []
      for (const [userId, next] of pending) {
        if (next === "granted") userUpdates.push({ userId, granted: true })
        else if (next === "denied") userUpdates.push({ userId, granted: false })
      }

      if (userUpdates.length > 0) {
        await updateAccess({ routeId: routeId!, userUpdates }).unwrap()
      }

      try {
        await refreshMeta().unwrap()
      } catch {
        /* non-fatal */
      }
      await refetchRoutes()

      toast({
        title: "User access saved",
        description: `${userUpdates.length} user${userUpdates.length === 1 ? "" : "s"} updated for ${meta?.label ?? path}.`,
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

  if (!meta) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Unknown page. The path <code className="font-mono">{path}</code> is not in the static-pages registry.
        </CardContent>
      </Card>
    )
  }

  const loading = usersLoading || routesLoading

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersIcon className="h-4 w-4 text-blue-600" />
              Per-user access — {meta.label}
              {meta.adminOnly && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400"
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Admin convention
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Per-user overrides take precedence over role grants. Use "Default"
              to let the user inherit from their role(s).
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={reset} disabled={!isDirty || saving}>
              <Undo2 className="h-4 w-4 mr-1" />
              Reset
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

      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users by name, email, or username…"
            className="pl-8 h-9 max-w-md"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <UsersIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No users in this organization yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No users match "{query}".
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="w-[180px]">Role(s)</TableHead>
                  <TableHead className="w-[120px]">Current</TableHead>
                  <TableHead className="w-[160px]">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => {
                  const state = stateFor(user.id)
                  const isPending = pending.has(user.id)
                  const conf = STATE_BADGE[state]
                  const Icon = conf.icon
                  const roleNames = (user.unitsAndRoles ?? [])
                    .map((ur) => ur.role?.name)
                    .filter(Boolean) as string[]
                  return (
                    <TableRow
                      key={user.id}
                      className={cn(
                        isPending && "bg-amber-50/40 dark:bg-amber-900/10",
                      )}
                    >
                      <TableCell>
                        <div className="font-medium">{user.fullName || user.email}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {roleNames.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">
                              none
                            </span>
                          ) : (
                            Array.from(new Set(roleNames))
                              .slice(0, 3)
                              .map((r) => (
                                <Badge
                                  key={r}
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {r}
                                </Badge>
                              ))
                          )}
                          {roleNames.length > 3 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px]"
                            >
                              +{roleNames.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={conf.className}>
                          <Icon className="h-3 w-3 mr-1" />
                          {conf.label}
                          {isPending && (
                            <span className="ml-1 text-[10px] opacity-70">
                              (unsaved)
                            </span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={state}
                          onValueChange={(v) =>
                            setStateForUser(user.id, v as AccessState)
                          }
                          disabled={saving}
                        >
                          <SelectTrigger className="h-8 text-sm whitespace-nowrap">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inherit">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <Globe className="h-3.5 w-3.5" />
                                Default (inherit role)
                              </div>
                            </SelectItem>
                            <SelectItem value="granted">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                                Grant
                              </div>
                            </SelectItem>
                            <SelectItem value="denied">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                                Deny
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
