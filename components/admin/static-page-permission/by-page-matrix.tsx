"use client"

/**
 * ByPageMatrix — page-centric permission tree: ROLES (expandable to their
 * USERS) × actions, for one static page.
 *
 *   Page (Static):  [ Payroll ▾ ]            CREATE  EDIT  DELETE  VIEW
 *   ▾ Manager                                  [✓]    [✓]    [ ]    [✓]   ← role grant
 *       user1  (inherits)                      [✓]    [✓]    [ ]    [✓]
 *       user2  (explicit deny EDIT)            [✓]    [ ]    [ ]    [✓]
 *   ▸ Staff                                    [ ]    [ ]    [ ]    [✓]
 *
 * How permissions resolve (the requirement):
 *   • Check a box on a ROLE row → grants that action to the role. It
 *     PROPAGATES to every user in the role (the inherited baseline).
 *   • Check / uncheck a box on a USER row → writes an EXPLICIT per-user
 *     override that takes precedence over what the role would give them.
 *     Inherited (non-explicit) cells render dimmed; explicit cells are solid.
 *
 * Data:
 *   GET /api/static-page-permission/by-page-users?pagePath=…
 *       → { actions, roles:[{…,users:[…]}], roleGrants:[{roleId,permissionId}],
 *           userGrants:[{userId,permissionId,granted}] }
 *   PUT /api/role-permissions  → [{ roleId, permissionId, pagePath, granted }]
 *   PUT /api/user-permissions  → [{ userId, permissionId, pagePath, granted }]
 *
 * Users in an admin role already have everything → shown checked + disabled.
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChevronRight,
  Globe,
  Lock,
  RefreshCw,
  Save,
  Search,
  Undo2,
  ShieldCheck,
  Users as UsersIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { staticPagesByGroup } from "@/lib/static-pages"

interface PageAction {
  id: string
  name: string
}
interface RoleUser {
  id: string
  name: string
  email: string
}
interface RoleWithUsers {
  id: string
  name: string
  isAdmin: boolean
  users: RoleUser[]
}
interface ApiPayload {
  success: boolean
  actions: PageAction[]
  roles: RoleWithUsers[]
  roleGrants: Array<{ roleId: string; permissionId: string }>
  userGrants: Array<{ userId: string; permissionId: string; granted: boolean }>
  error?: string
}

const rkey = (roleId: string, permId: string) => `${roleId}::${permId}`
const ukey = (userId: string, permId: string) => `${userId}::${permId}`

export function ByPageMatrix() {
  const { toast } = useToast()

  const pageGroups = useMemo(() => staticPagesByGroup(), [])
  const firstPath = pageGroups[0]?.pages[0]?.path ?? ""

  const [pagePath, setPagePath] = useState<string>(firstPath)
  const [actions, setActions] = useState<PageAction[]>([])
  const [roles, setRoles] = useState<RoleWithUsers[]>([])

  // Baselines from the server.
  const [roleGranted, setRoleGranted] = useState<Set<string>>(new Set())
  const [userExplicit, setUserExplicit] = useState<Map<string, boolean>>(new Map())

  // Pending (unsaved) edits, kept per scope.
  const [rolePending, setRolePending] = useState<Map<string, boolean>>(new Map())
  const [userPending, setUserPending] = useState<Map<string, boolean>>(new Map())

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

  const selectedPage = useMemo(() => {
    for (const g of pageGroups) {
      const p = g.pages.find((x) => x.path === pagePath)
      if (p) return p
    }
    return null
  }, [pageGroups, pagePath])

  // ── Load whenever the page changes. ──────────────────────────────────────
  const load = useCallback(() => {
    if (!pagePath) return
    let cancelled = false
    setLoading(true)
    setRolePending(new Map())
    setUserPending(new Map())
    fetch(
      `/api/static-page-permission/by-page-users?pagePath=${encodeURIComponent(pagePath)}`,
      { credentials: "include", cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j: ApiPayload | null) => {
        if (cancelled) return
        if (!j?.success) {
          toast({
            title: "Failed to load",
            description: j?.error ?? "Try again",
            variant: "destructive",
          })
          setActions([])
          setRoles([])
          setRoleGranted(new Set())
          setUserExplicit(new Map())
          return
        }
        setActions(j.actions ?? [])
        setRoles(j.roles ?? [])
        const rg = new Set<string>()
        for (const g of j.roleGrants ?? []) rg.add(rkey(g.roleId, g.permissionId))
        setRoleGranted(rg)
        const ue = new Map<string, boolean>()
        for (const g of j.userGrants ?? []) ue.set(ukey(g.userId, g.permissionId), g.granted)
        setUserExplicit(ue)
      })
      .catch(() => {
        if (!cancelled) toast({ title: "Failed to load", variant: "destructive" })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pagePath, toast])

  useEffect(() => {
    const cleanup = load()
    return cleanup
  }, [load])

  // ── Effective-state resolution ───────────────────────────────────────────
  // Role: pending value if edited, else the saved role grant.
  const roleEffective = useCallback(
    (roleId: string, permId: string): boolean => {
      const k = rkey(roleId, permId)
      if (rolePending.has(k)) return rolePending.get(k)!
      return roleGranted.has(k)
    },
    [rolePending, roleGranted],
  )

  // Does the user have an EXPLICIT override (pending or saved) for this cell?
  const userIsExplicit = useCallback(
    (userId: string, permId: string): boolean => {
      const k = ukey(userId, permId)
      return userPending.has(k) || userExplicit.has(k)
    },
    [userPending, userExplicit],
  )

  // User: explicit override wins (pending → saved); otherwise inherit the role.
  const userEffective = useCallback(
    (userId: string, roleId: string, permId: string): boolean => {
      const k = ukey(userId, permId)
      if (userPending.has(k)) return userPending.get(k)!
      if (userExplicit.has(k)) return userExplicit.get(k)!
      return roleEffective(roleId, permId)
    },
    [userPending, userExplicit, roleEffective],
  )

  // ── Mutations ──────────────────────────────────────────────────────────--
  const toggleRoleCell = (roleId: string, permId: string, next: boolean) => {
    setRolePending((prev) => {
      const m = new Map(prev)
      const k = rkey(roleId, permId)
      if (next === roleGranted.has(k)) m.delete(k)
      else m.set(k, next)
      return m
    })
  }

  const toggleUserCell = (userId: string, permId: string, next: boolean) => {
    setUserPending((prev) => {
      const m = new Map(prev)
      const k = ukey(userId, permId)
      // Baseline is the SAVED explicit value (or "no override" = undefined).
      const baseline = userExplicit.has(k) ? userExplicit.get(k)! : undefined
      if (next === baseline) m.delete(k)
      else m.set(k, next)
      return m
    })
  }

  // Role row bulk: flip every action for the role.
  const toggleRoleRow = (role: RoleWithUsers, next: boolean) => {
    if (role.isAdmin) return
    setRolePending((prev) => {
      const m = new Map(prev)
      for (const a of actions) {
        const k = rkey(role.id, a.id)
        if (next === roleGranted.has(k)) m.delete(k)
        else m.set(k, next)
      }
      return m
    })
  }

  // User row bulk: set an explicit override for every action.
  const toggleUserRow = (userId: string, next: boolean) => {
    setUserPending((prev) => {
      const m = new Map(prev)
      for (const a of actions) {
        const k = ukey(userId, a.id)
        const baseline = userExplicit.has(k) ? userExplicit.get(k)! : undefined
        if (next === baseline) m.delete(k)
        else m.set(k, next)
      }
      return m
    })
  }

  const toggleExpand = (roleId: string) =>
    setExpanded((prev) => {
      const m = new Set(prev)
      m.has(roleId) ? m.delete(roleId) : m.add(roleId)
      return m
    })

  // ── Search: narrow each role to matching users; auto-expand the hits. ─────
  const visibleRoles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roles
    return roles
      .map((r) => ({
        ...r,
        users: r.users.filter(
          (u) =>
            u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        ),
      }))
      .filter((r) => r.users.length > 0 || r.name.toLowerCase().includes(q))
  }, [roles, search])

  useEffect(() => {
    if (!search.trim()) return
    setExpanded((prev) => new Set([...prev, ...visibleRoles.map((r) => r.id)]))
  }, [search, visibleRoles])

  const totalUsers = useMemo(
    () => new Set(roles.flatMap((r) => r.users.map((u) => u.id))).size,
    [roles],
  )

  const allExpanded = roles.length > 0 && roles.every((r) => expanded.has(r.id))
  const toggleExpandAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(roles.map((r) => r.id)))

  const dirtyCount = rolePending.size + userPending.size
  const isDirty = dirtyCount > 0
  const reset = () => {
    setRolePending(new Map())
    setUserPending(new Map())
  }

  // The VIEW action's permission id — used to mirror VIEW changes into the
  // route-access system (the engine the sidebar / middleware actually read).
  const viewActionId = useMemo(
    () => actions.find((a) => a.name === "VIEW")?.id ?? null,
    [actions],
  )

  const save = async () => {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      const reqs: Promise<Response>[] = []

      // 1. Granular ROLE grants → RolePermission (page-level action engine).
      if (rolePending.size > 0) {
        const roleUpdates = Array.from(rolePending.entries()).map(([k, granted]) => {
          const sep = k.indexOf("::")
          return {
            roleId: k.slice(0, sep),
            permissionId: k.slice(sep + 2),
            pagePath,
            moduleId: null,
            formId: null,
            granted,
            canDelegate: false,
          }
        })
        reqs.push(
          fetch("/api/role-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(roleUpdates),
          }),
        )
      }

      // 2. Granular USER overrides → UserPermission (page-level action engine).
      if (userPending.size > 0) {
        const userUpdates = Array.from(userPending.entries()).map(([k, granted]) => {
          const sep = k.indexOf("::")
          return {
            userId: k.slice(0, sep),
            permissionId: k.slice(sep + 2),
            pagePath,
            moduleId: null,
            formId: null,
            granted,
          }
        })
        reqs.push(
          fetch("/api/user-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(userUpdates),
          }),
        )
      }

      // 3. VIEW→visibility bridge → RoutePermission role/user access (the engine
      //    the sidebar + middleware read). Only the VIEW column matters here.
      if (viewActionId) {
        const roleViewUpdates = Array.from(rolePending.entries())
          .filter(([k]) => k.endsWith(`::${viewActionId}`))
          .map(([k, granted]) => ({ roleId: k.slice(0, k.indexOf("::")), granted }))
        const userViewUpdates = Array.from(userPending.entries())
          .filter(([k]) => k.endsWith(`::${viewActionId}`))
          .map(([k, granted]) => ({ userId: k.slice(0, k.indexOf("::")), granted }))
        if (roleViewUpdates.length || userViewUpdates.length) {
          reqs.push(
            fetch("/api/static-page-permission/by-page-users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ pagePath, roleUpdates: roleViewUpdates, userUpdates: userViewUpdates }),
            }),
          )
        }
      }

      const results = await Promise.all(reqs)
      for (const res of results) {
        const j = await res.json().catch(() => null)
        if (!res.ok || !j?.success) {
          throw new Error(j?.error || j?.details || "Save failed")
        }
      }

      // Refresh the caller's own route meta so any change affecting them is
      // reflected immediately. Other users pick it up on their next meta
      // refresh; the server-side guard reads the DB live regardless.
      fetch("/api/auth/refresh-meta", { method: "POST", credentials: "include" }).catch(
        () => {},
      )

      toast({
        title: "Permissions saved",
        description: `${dirtyCount} change${dirtyCount === 1 ? "" : "s"} applied for ${selectedPage?.label ?? pagePath}.`,
      })
      load()
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
              Page permissions — roles &amp; users
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Pick a page, then grant a <strong>role</strong> (propagates to all
              its users) or expand a role to grant a single <strong>user</strong>{" "}
              explicitly. Checking <strong>View</strong> makes the page appear in
              that user's sidebar.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={!isDirty || saving}
            >
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
        {/* Page selector + user search */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-muted-foreground shrink-0">
              Page (Static)
            </span>
            <Select value={pagePath} onValueChange={setPagePath}>
              <SelectTrigger className="h-9 w-full sm:w-[280px]">
                <SelectValue placeholder="Select a static page" />
              </SelectTrigger>
              <SelectContent className="max-h-[60vh]">
                {pageGroups.map((g) => (
                  <SelectGroup key={g.group}>
                    <SelectLabel>{g.group}</SelectLabel>
                    {g.pages.map((p) => (
                      <SelectItem key={p.path} value={p.path}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter users…"
              className="pl-8 h-9 max-w-md"
            />
          </div>
        </div>

        {selectedPage && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <Badge variant="outline" className="h-5 px-1.5 font-normal">
                {selectedPage.group}
              </Badge>
              <code className="text-[10px]">{selectedPage.path}</code>
              {selectedPage.adminOnly && (
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[10px] border-amber-300 bg-amber-50 text-amber-800"
                >
                  <Lock className="h-2.5 w-2.5 mr-0.5" />
                  Admin page
                </Badge>
              )}
            </div>
            {totalUsers > 0 && (
              <button
                type="button"
                onClick={toggleExpandAll}
                className="text-[11px] font-medium text-muted-foreground hover:text-primary"
              >
                {allExpanded ? "Collapse all" : "Expand all"}
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : actions.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No page actions configured.
          </div>
        ) : roles.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <UsersIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
            No roles in this organization yet.
          </div>
        ) : visibleRoles.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No users match "{search}".
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="sticky left-0 z-10 bg-card px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    Role / User
                  </th>
                  {actions.map((a) => (
                    <th
                      key={a.id}
                      className="px-1 py-2.5 text-center text-[10px] font-semibold uppercase tracking-tight text-muted-foreground w-[88px]"
                    >
                      {a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRoles.map((role) => (
                  <RoleGroup
                    key={role.id}
                    role={role}
                    actions={actions}
                    saving={saving}
                    expanded={expanded.has(role.id)}
                    onToggleExpand={() => toggleExpand(role.id)}
                    roleEffective={roleEffective}
                    userEffective={userEffective}
                    userIsExplicit={userIsExplicit}
                    rolePending={rolePending}
                    userPending={userPending}
                    onToggleRoleCell={toggleRoleCell}
                    onToggleUserCell={toggleUserCell}
                    onToggleRoleRow={toggleRoleRow}
                    onToggleUserRow={toggleUserRow}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── One role group: the role row + (when expanded) its user rows ───────────
function RoleGroup({
  role,
  actions,
  saving,
  expanded,
  onToggleExpand,
  roleEffective,
  userEffective,
  userIsExplicit,
  rolePending,
  userPending,
  onToggleRoleCell,
  onToggleUserCell,
  onToggleRoleRow,
  onToggleUserRow,
}: {
  role: RoleWithUsers
  actions: PageAction[]
  saving: boolean
  expanded: boolean
  onToggleExpand: () => void
  roleEffective: (roleId: string, permId: string) => boolean
  userEffective: (userId: string, roleId: string, permId: string) => boolean
  userIsExplicit: (userId: string, permId: string) => boolean
  rolePending: Map<string, boolean>
  userPending: Map<string, boolean>
  onToggleRoleCell: (roleId: string, permId: string, next: boolean) => void
  onToggleUserCell: (userId: string, permId: string, next: boolean) => void
  onToggleRoleRow: (role: RoleWithUsers, next: boolean) => void
  onToggleUserRow: (userId: string, next: boolean) => void
}) {
  const roleRowAllOn =
    role.isAdmin || actions.every((a) => roleEffective(role.id, a.id))

  return (
    <>
      {/* Role row — a real permission row whose grants propagate to users. */}
      <tr className="border-b bg-muted/40 hover:bg-muted/60">
        <td className="sticky left-0 z-10 bg-muted/40 px-2 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
              title={expanded ? "Collapse" : "Expand users"}
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  expanded && "rotate-90",
                )}
              />
            </button>
            <button
              type="button"
              disabled={role.isAdmin || saving}
              onClick={() => onToggleRoleRow(role, !roleRowAllOn)}
              title="Toggle all actions for this role"
              className="flex items-center gap-1.5 text-left disabled:cursor-default"
            >
              <span className="text-sm font-semibold">{role.name}</span>
              {role.isAdmin && (
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[9px] border-emerald-300 bg-emerald-50 text-emerald-700"
                >
                  <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                  Admin
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground font-normal">
                · {role.users.length} user{role.users.length === 1 ? "" : "s"}
              </span>
            </button>
          </div>
        </td>
        {actions.map((a) => {
          const checked = role.isAdmin || roleEffective(role.id, a.id)
          const dirty = rolePending.has(rkey(role.id, a.id))
          return (
            <td
              key={a.id}
              className={cn(
                "px-1 py-2 text-center",
                dirty && "bg-amber-100/60 dark:bg-amber-900/20",
              )}
            >
              <Checkbox
                checked={checked}
                disabled={saving || role.isAdmin}
                onCheckedChange={(v) => onToggleRoleCell(role.id, a.id, v === true)}
                title={`${a.name} for role ${role.name}`}
              />
            </td>
          )
        })}
      </tr>

      {/* User rows (only when expanded). */}
      {expanded &&
        role.users.map((u) => {
          const userRowAllOn =
            role.isAdmin || actions.every((a) => userEffective(u.id, role.id, a.id))
          return (
            <tr
              key={`${role.id}:${u.id}`}
              className="border-b last:border-0 hover:bg-muted/20"
            >
              <td className="sticky left-0 z-10 bg-card px-2 py-2 pl-9">
                <button
                  type="button"
                  disabled={role.isAdmin || saving}
                  onClick={() => onToggleUserRow(u.id, !userRowAllOn)}
                  title="Set an explicit override for every action"
                  className="text-left disabled:cursor-default"
                >
                  <div className="font-medium truncate max-w-[220px]">{u.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                    {u.email}
                  </div>
                </button>
              </td>
              {actions.map((a) => {
                const checked = role.isAdmin || userEffective(u.id, role.id, a.id)
                const explicit = role.isAdmin ? false : userIsExplicit(u.id, a.id)
                const dirty = userPending.has(ukey(u.id, a.id))
                return (
                  <td
                    key={a.id}
                    className={cn(
                      "px-1 py-2 text-center",
                      dirty && "bg-amber-100/60 dark:bg-amber-900/20",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex",
                        // Inherited (non-explicit) cells render dimmed so it's
                        // obvious the value comes from the role, not the user.
                        !explicit && !role.isAdmin && "opacity-40",
                      )}
                      title={
                        role.isAdmin
                          ? "Admin — implicit full access"
                          : explicit
                            ? `Explicit ${checked ? "grant" : "deny"} for ${u.name}`
                            : `Inherited from role ${role.name}`
                      }
                    >
                      <Checkbox
                        checked={checked}
                        disabled={saving || role.isAdmin}
                        onCheckedChange={(v) => onToggleUserCell(u.id, a.id, v === true)}
                      />
                    </span>
                  </td>
                )
              })}
            </tr>
          )
        })}
    </>
  )
}
