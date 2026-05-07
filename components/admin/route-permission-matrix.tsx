"use client"

/**
 * RoutePermissionMatrix — admin matrix for granting / denying a static page
 * to roles, mirroring the FormsPermissionMatrix UX so the experience stays
 * uniform across modules and static pages.
 *
 * Persistence model
 * -----------------
 * The runtime resolver in lib/route-permissions.ts reads two arrays from
 * the auth-meta cookie: allowedRoutes and deniedRoutes. Those arrays come
 * from RouteRoleAccess + RouteUserAccess, which join to RoutePermission via
 * the route's pattern. So to grant role X access to "/leave/admin" we need:
 *   1. A RoutePermission row with pattern="/leave/admin" (auto-created on
 *      first save if missing).
 *   2. A RouteRoleAccess row with granted=true|false.
 *   3. A refresh-auth-meta call so the cookie picks up the change.
 *
 * Tri-state per role:
 *   • Granted   — RouteRoleAccess.granted = true
 *   • Denied    — RouteRoleAccess.granted = false
 *   • Default   — no row exists; the route's "open by default" semantics
 *                 (resolveRouteAccess) decide.
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
  ShieldAlert,
  ShieldCheck,
  Undo2,
} from "lucide-react"
import { useGetRolesQuery } from "@/lib/api/permissions"
import {
  useCreateRoutePermissionMutation,
  useGetRoutePermissionsQuery,
  useRefreshAuthMetaMutation,
  useUpdateRouteAccessMutation,
} from "@/lib/api/route-permissions"
import { useToast } from "@/hooks/use-toast"
import { findStaticPage } from "@/lib/static-pages"

type AccessState = "granted" | "denied" | "inherit"

interface RoutePermissionMatrixProps {
  /** The route pattern being edited, e.g. "/leave/admin". */
  path: string
}

const STATE_BADGE: Record<AccessState, { label: string; className: string; icon: React.ElementType }> = {
  granted: {
    label: "Granted",
    className: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: ShieldCheck,
  },
  denied: {
    label: "Denied",
    className: "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400",
    icon: ShieldAlert,
  },
  inherit: {
    label: "Default",
    className: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/40 dark:text-slate-400",
    icon: Globe,
  },
}

export function RoutePermissionMatrix({ path }: RoutePermissionMatrixProps) {
  const { toast } = useToast()
  const meta = findStaticPage(path)

  const { data: rolesResp, isLoading: rolesLoading } = useGetRolesQuery()
  const {
    data: routesResp,
    isLoading: routesLoading,
    refetch: refetchRoutes,
  } = useGetRoutePermissionsQuery()

  const [createRoute] = useCreateRoutePermissionMutation()
  const [updateAccess] = useUpdateRouteAccessMutation()
  const [refreshMeta] = useRefreshAuthMetaMutation()

  const roles = rolesResp?.data ?? []
  const route = useMemo(
    () => (routesResp?.data ?? []).find((r) => r.pattern === path) ?? null,
    [routesResp, path],
  )

  // The "saved" state we'd revert to with Reset.
  const savedAccessByRole = useMemo(() => {
    const map = new Map<string, boolean>()
    if (route) {
      for (const ra of route.roleAccess) map.set(ra.roleId, ra.granted)
    }
    return map
  }, [route])

  // Local pending edits — replaces the saved value when present.
  const [pending, setPending] = useState<Map<string, AccessState>>(new Map())
  const [saving, setSaving] = useState(false)

  // Reset pending edits whenever path changes — switching pages must not
  // leak stale changes from the previous selection.
  useEffect(() => {
    setPending(new Map())
  }, [path])

  const stateForRole = (roleId: string): AccessState => {
    if (pending.has(roleId)) return pending.get(roleId)!
    if (savedAccessByRole.has(roleId)) return savedAccessByRole.get(roleId) ? "granted" : "denied"
    return "inherit"
  }

  const isDirty = pending.size > 0
  const dirtyCount = pending.size

  const setStateForRole = (roleId: string, next: AccessState) => {
    setPending((prev) => {
      const m = new Map(prev)
      const baseline: AccessState = savedAccessByRole.has(roleId)
        ? savedAccessByRole.get(roleId)
          ? "granted"
          : "denied"
        : "inherit"
      if (next === baseline) {
        m.delete(roleId)
      } else {
        m.set(roleId, next)
      }
      return m
    })
  }

  const reset = () => setPending(new Map())

  const save = async () => {
    if (!isDirty) return
    setSaving(true)
    try {
      // Step 1: ensure a RoutePermission row exists for this pattern.
      let routeId = route?.id ?? null
      if (!routeId) {
        const created = await createRoute({
          pattern: path,
          description: meta?.label ?? path,
        }).unwrap()
        routeId = created.data.id
      }

      // Step 2: collect role updates. "inherit" means we want to remove the
      // role's record. The current API only upserts; for v1 we treat
      // inherit-from-currently-set as "leave the row alone" since there's no
      // delete endpoint. UX-wise admins rarely undo a rule — they flip it.
      const roleUpdates: Array<{ roleId: string; granted: boolean }> = []
      for (const [roleId, next] of pending) {
        if (next === "granted") roleUpdates.push({ roleId, granted: true })
        else if (next === "denied") roleUpdates.push({ roleId, granted: false })
        // "inherit" → ignored (server has no delete endpoint yet).
      }

      if (roleUpdates.length > 0) {
        await updateAccess({ routeId: routeId!, roleUpdates }).unwrap()
      }

      // Step 3: refresh the caller's auth-meta cookie so their own sidebar /
      // route guard reflects the change immediately. Failure is non-fatal —
      // other users will see the change on their next /api/auth/me poll.
      try {
        await refreshMeta().unwrap()
      } catch {
        /* non-fatal */
      }

      await refetchRoutes()

      toast({
        title: "Permissions saved",
        description: `${roleUpdates.length} role${roleUpdates.length === 1 ? "" : "s"} updated for ${meta?.label ?? path}.`,
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

  const loading = rolesLoading || routesLoading

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-purple-600" />
              {meta.label}
              {meta.adminOnly && (
                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400">
                  <Lock className="h-3 w-3 mr-1" />
                  Admin convention
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                {meta.path}
              </code>
              <span className="text-muted-foreground">·</span>
              <span>{meta.group}</span>
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

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No roles configured. Create roles before granting page access.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-[80px]">Users</TableHead>
                  <TableHead className="w-[120px]">Current</TableHead>
                  <TableHead className="w-[160px]">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => {
                  const state = stateForRole(role.id)
                  const isPending = pending.has(role.id)
                  const conf = STATE_BADGE[state]
                  const Icon = conf.icon
                  return (
                    <TableRow key={role.id} className={isPending ? "bg-amber-50/40 dark:bg-amber-900/10" : undefined}>
                      <TableCell>
                        <div className="font-medium">{role.name}</div>
                        {role.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {role.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {role.userCount ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={conf.className}>
                          <Icon className="h-3 w-3 mr-1" />
                          {conf.label}
                          {isPending && (
                            <span className="ml-1 text-[10px] opacity-70">(unsaved)</span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={state}
                          onValueChange={(v) => setStateForRole(role.id, v as AccessState)}
                          disabled={saving}
                        >
                          <SelectTrigger className="h-8 text-sm whitespace-nowrap">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inherit">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <Globe className="h-3.5 w-3.5" />
                                Default
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
          </>
        )}
      </CardContent>
    </Card>
  )
}
