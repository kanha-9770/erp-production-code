"use client"

/**
 * Approvals & Permissions — role-first master-detail.
 *
 * Left pane  : searchable list of roles (with a granted-count + admin badge).
 * Right pane : the SELECTED role's capabilities only, grouped into
 *              "Approval Actions" and "Form Section Access", each module a
 *              collapsible block of toggles with a per-block grant/revoke-all.
 *              A role expands to per-user overrides at the bottom.
 *
 * Replaces the old N-wide-tables matrix that repeated every role in every
 * module table. Same backend: /api/action-permissions (catalog + roleGrants +
 * userGrants) and the batched PUT — a checked toggle grants the named
 * permission to the role (RolePermission) or user (UserPermissionOverride),
 * exactly what hasPermission() resolves. Admin roles bypass all checks.
 */

import { useMemo, useState } from "react"
import {
  useGetActionPermissionsQuery,
  useUpdateActionPermissionsMutation,
  useGetRolesQuery,
} from "@/lib/api/permissions"
import { useGetAdminUsersQuery } from "@/lib/api/users"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  RotateCcw,
  ShieldCheck,
  Info,
  Search,
  UserCircle,
  Shield,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type Kind = "role" | "user"
interface Change {
  kind: Kind
  id: string
  name: string
  granted: boolean
}
const keyOf = (kind: Kind, id: string, name: string) => `${kind}|${id}|${name}`

type RoleRow = {
  id: string
  name: string
  isAdmin?: boolean
  userCount?: number
  userAssignments?: Array<{ userId: string }>
}

/** Section-access groups carry a `-sections-` module key (see section-catalog). */
const isSectionGroup = (moduleKey: string) => moduleKey.includes("-sections-")

export function ActionPermissionMatrix() {
  const { data, isLoading, isError, refetch } = useGetActionPermissionsQuery()
  const { data: rolesResp, isLoading: rolesLoading } = useGetRolesQuery()
  const { data: usersResp, isLoading: usersLoading } = useGetAdminUsersQuery()
  const [save, { isLoading: saving }] = useUpdateActionPermissionsMutation()
  const { toast } = useToast()

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [roleQuery, setRoleQuery] = useState("")
  const [capQuery, setCapQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [showUsers, setShowUsers] = useState(false)
  const [changes, setChanges] = useState<Map<string, Change>>(new Map())

  const roles = (rolesResp?.data ?? []) as unknown as RoleRow[]
  const users = usersResp?.data ?? []
  const catalog = data?.data.catalog ?? []
  const roleGrants = data?.data.roleGrants ?? {}
  const userGrants = data?.data.userGrants ?? {}

  // Split the catalog into the two conceptual categories so approval actions
  // and per-section edit access stop blurring together.
  const categories = useMemo(() => {
    const actions = catalog.filter((g) => !isSectionGroup(g.module))
    const sections = catalog.filter((g) => isSectionGroup(g.module))
    return [
      { key: "actions", label: "Approval Actions", groups: actions },
      { key: "sections", label: "Form Section Access", groups: sections },
    ].filter((c) => c.groups.length > 0)
  }, [catalog])

  const allActionNames = useMemo(
    () => catalog.flatMap((g) => g.functionalities.map((f) => f.name)),
    [catalog],
  )

  const usersByRole = useMemo(() => {
    const byId = new Map(users.map((u) => [u.id, u]))
    const map = new Map<string, typeof users>()
    for (const r of roles) {
      const list = (r.userAssignments ?? [])
        .map((a) => byId.get(a.userId))
        .filter(Boolean) as typeof users
      map.set(r.id, list)
    }
    return map
  }, [roles, users])

  const baseGranted = (kind: Kind, id: string, name: string) =>
    kind === "role"
      ? (roleGrants[name] ?? []).includes(id)
      : (userGrants[name] ?? []).includes(id)

  const effective = (kind: Kind, id: string, name: string) => {
    const c = changes.get(keyOf(kind, id, name))
    return c ? c.granted : baseGranted(kind, id, name)
  }

  const toggle = (kind: Kind, id: string, name: string, granted: boolean) => {
    setChanges((prev) => {
      const next = new Map(prev)
      const k = keyOf(kind, id, name)
      if (granted === baseGranted(kind, id, name)) next.delete(k)
      else next.set(k, { kind, id, name, granted })
      return next
    })
  }

  // Grant/revoke a whole block (one module / form) for a subject in one click.
  const setMany = (kind: Kind, id: string, names: string[], granted: boolean) => {
    setChanges((prev) => {
      const next = new Map(prev)
      for (const name of names) {
        const k = keyOf(kind, id, name)
        if (granted === baseGranted(kind, id, name)) next.delete(k)
        else next.set(k, { kind, id, name, granted })
      }
      return next
    })
  }

  const grantedCount = (kind: Kind, id: string) =>
    allActionNames.reduce((n, name) => n + (effective(kind, id, name) ? 1 : 0), 0)

  const onSave = async () => {
    const payload = Array.from(changes.values())
    if (!payload.length) return
    try {
      await save({ changes: payload }).unwrap()
      toast({ title: "Permissions updated", description: `${payload.length} change(s) saved.` })
      setChanges(new Map())
      refetch()
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Could not save",
        description: e?.data?.error ?? "Please try again.",
      })
    }
  }

  const loading = isLoading || rolesLoading || usersLoading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading permissions…
      </div>
    )
  }
  if (isError) {
    return (
      <div className="py-24 text-center text-destructive">
        Failed to load action permissions. You must be an administrator to view this page.
      </div>
    )
  }

  const filteredRoles = roles.filter((r) =>
    r.name.toLowerCase().includes(roleQuery.trim().toLowerCase()),
  )
  const selectedRole =
    roles.find((r) => r.id === selectedRoleId) ??
    roles.find((r) => !r.isAdmin) ??
    roles[0] ??
    null

  const capMatch = (label: string, description: string) => {
    const q = capQuery.trim().toLowerCase()
    if (!q) return true
    return label.toLowerCase().includes(q) || (description ?? "").toLowerCase().includes(q)
  }

  // Renders every category → module block → toggle list for one subject
  // (a role or a single user override). Reused by the role detail and the
  // per-user override rows so the two stay in lockstep.
  const renderCapabilities = (kind: Kind, id: string) => (
    <div className="space-y-5">
      {categories.map((cat) => {
        const visibleGroups = cat.groups
          .map((g) => ({
            ...g,
            functionalities: g.functionalities.filter((f) => capMatch(f.label, f.description)),
          }))
          .filter((g) => g.functionalities.length > 0)
        if (visibleGroups.length === 0) return null

        return (
          <section key={cat.key} className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {cat.label}
            </h3>
            <div className="space-y-2">
              {visibleGroups.map((group) => {
                const names = group.functionalities.map((f) => f.name)
                const blockKey = `${kind}:${id}:${group.module}`
                const isCollapsed = collapsed.has(blockKey)
                const grantedHere = names.filter((n) => effective(kind, id, n)).length
                const allGranted = grantedHere === names.length && names.length > 0

                return (
                  <div key={group.module} className="rounded-md border">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev)
                            next.has(blockKey) ? next.delete(blockKey) : next.add(blockKey)
                            return next
                          })
                        }
                        className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="font-medium text-sm truncate">{group.label}</span>
                        <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                          {grantedHere}/{names.length}
                        </Badge>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2 shrink-0"
                        onClick={() => setMany(kind, id, names, !allGranted)}
                      >
                        {allGranted ? "Revoke all" : "Grant all"}
                      </Button>
                    </div>

                    {!isCollapsed && (
                      <div className="divide-y">
                        {group.functionalities.map((f) => (
                          <label
                            key={f.name}
                            className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30"
                          >
                            <Switch
                              checked={effective(kind, id, f.name)}
                              onCheckedChange={(v) => toggle(kind, id, f.name, v === true)}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium">{f.label}</span>
                                {!f.enforced && (
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    not enforced yet
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )

  const roleUsers = selectedRole ? usersByRole.get(selectedRole.id) ?? [] : []

  return (
    <div className="pb-24">
      {/* How-it-works banner */}
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Pick a <strong>role</strong> on the left, then grant its capabilities. A role grant applies to
          everyone in it; use <strong>Per-user overrides</strong> to tune a single person. Admin roles bypass
          all checks. Actions marked{" "}
          <Badge variant="outline" className="mx-0.5">not enforced yet</Badge> are recorded but not yet checked
          by the server. Assigned users pick up changes on their next page load.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[280px_1fr] rounded-lg border overflow-hidden bg-background md:h-[calc(100vh-320px)] md:min-h-[540px]">
        {/* ── LEFT: role list ─────────────────────────────────────────── */}
        <div className="flex flex-col min-h-0 border-b md:border-b-0 md:border-r">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Roles
              </span>
              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {roles.length}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search roles…"
                value={roleQuery}
                onChange={(e) => setRoleQuery(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="flex-1 max-h-[260px] md:max-h-none">
            <div className="py-1">
              {filteredRoles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No roles match.</p>
              ) : (
                filteredRoles.map((role) => {
                  const isActive = selectedRole?.id === role.id
                  const count = grantedCount("role", role.id)
                  return (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRoleId(role.id)}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 text-left transition-colors",
                        isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted/70",
                      )}
                    >
                      <Shield
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isActive ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      />
                      <span className="text-sm font-medium truncate flex-1">{role.name}</span>
                      {role.isAdmin ? (
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px]", isActive && "bg-primary-foreground/20 text-primary-foreground")}
                        >
                          admin
                        </Badge>
                      ) : count > 0 ? (
                        <span
                          className={cn(
                            "text-[10px] tabular-nums rounded-full px-1.5 py-0.5",
                            isActive
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── RIGHT: selected role detail ─────────────────────────────── */}
        <div className="flex flex-col min-h-0">
          {!selectedRole ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a role to manage its permissions.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="font-semibold truncate">{selectedRole.name}</span>
                {selectedRole.isAdmin && (
                  <Badge variant="secondary" className="text-[10px]">admin</Badge>
                )}
                <Badge variant="outline" className="text-[10px] font-normal ml-auto">
                  {selectedRole.userCount ?? roleUsers.length} user
                  {(selectedRole.userCount ?? roleUsers.length) === 1 ? "" : "s"}
                </Badge>
              </div>

              {selectedRole.isAdmin ? (
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                  <div className="space-y-2 max-w-sm">
                    <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      Admin roles bypass every permission check, so there is nothing to configure here.
                      Manage admin status from the role settings.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Filter capabilities…"
                        value={capQuery}
                        onChange={(e) => setCapQuery(e.target.value)}
                        className="pl-7 h-8 text-sm"
                      />
                    </div>
                  </div>

                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-6">
                      {renderCapabilities("role", selectedRole.id)}

                      {/* Per-user overrides */}
                      <section className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowUsers((v) => !v)}
                          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                        >
                          {showUsers ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          Per-user overrides ({roleUsers.length})
                        </button>

                        {showUsers && (
                          <div className="rounded-md border divide-y">
                            {roleUsers.length === 0 ? (
                              <p className="text-xs text-muted-foreground px-3 py-3 italic">
                                No users in this role.
                              </p>
                            ) : (
                              roleUsers.map((u) => {
                                const isOpen = expandedUsers.has(u.id)
                                const name =
                                  u.fullName ||
                                  `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() ||
                                  u.email
                                const overrides = grantedCount("user", u.id)
                                return (
                                  <div key={u.id}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedUsers((prev) => {
                                          const next = new Set(prev)
                                          next.has(u.id) ? next.delete(u.id) : next.add(u.id)
                                          return next
                                        })
                                      }
                                      className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-muted/30"
                                    >
                                      {isOpen ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      )}
                                      <UserCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                                      <span className="text-sm truncate flex-1">{name}</span>
                                      {overrides > 0 && (
                                        <Badge variant="outline" className="text-[10px] font-normal">
                                          {overrides} direct
                                        </Badge>
                                      )}
                                    </button>
                                    {isOpen && (
                                      <div className="px-3 pb-3 pt-1 bg-muted/20">
                                        <p className="text-[11px] text-muted-foreground mb-2">
                                          Direct grants for this user, in addition to the role above.
                                        </p>
                                        {renderCapabilities("user", u.id)}
                                      </div>
                                    )}
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </section>
                    </div>
                  </ScrollArea>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sticky save bar */}
      {changes.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-end gap-3 shadow-lg">
          <span className="text-sm text-muted-foreground mr-auto">
            {changes.size} unsaved change(s)
          </span>
          <Button variant="outline" size="sm" onClick={() => setChanges(new Map())} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Discard
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save changes
          </Button>
        </div>
      )}
    </div>
  )
}
