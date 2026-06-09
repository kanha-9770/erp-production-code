"use client"

/**
 * Approvals & Permissions matrix.
 *
 * One table per module from the action catalog (/api/action-permissions).
 * Rows = roles (expandable to the users assigned to that role); columns = the
 * module's privileged functionalities. A checked cell grants that named
 * permission to the role (RolePermission) or user (UserPermissionOverride) —
 * the exact tables hasPermission() resolves. Admin roles bypass every check, so
 * their cells are shown as "—". Changes are staged locally and saved in a batch.
 */

import { Fragment, useMemo, useState } from "react"
import {
  useGetActionPermissionsQuery,
  useUpdateActionPermissionsMutation,
  useGetRolesQuery,
} from "@/lib/api/permissions"
import { useGetAdminUsersQuery } from "@/lib/api/users"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  RotateCcw,
  ShieldCheck,
  Info,
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

export function ActionPermissionMatrix() {
  const { data, isLoading, isError, refetch } = useGetActionPermissionsQuery()
  const { data: rolesResp, isLoading: rolesLoading } = useGetRolesQuery()
  const { data: usersResp, isLoading: usersLoading } = useGetAdminUsersQuery()
  const [save, { isLoading: saving }] = useUpdateActionPermissionsMutation()
  const { toast } = useToast()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [changes, setChanges] = useState<Map<string, Change>>(new Map())

  const roles = (rolesResp?.data ?? []) as unknown as RoleRow[]
  const users = usersResp?.data ?? []
  const catalog = data?.data.catalog ?? []
  const roleGrants = data?.data.roleGrants ?? {}
  const userGrants = data?.data.userGrants ?? {}

  // Users assigned to each role, by id.
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

  const toggleExpand = (roleId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(roleId) ? next.delete(roleId) : next.add(roleId)
      return next
    })

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

  const Cell = ({ kind, id, name, disabled }: { kind: Kind; id: string; name: string; disabled?: boolean }) => (
    <TableCell className="text-center">
      {disabled ? (
        <span className="text-muted-foreground" title="Admins bypass all permission checks">—</span>
      ) : (
        <Checkbox
          checked={effective(kind, id, name)}
          onCheckedChange={(v) => toggle(kind, id, name, v === true)}
        />
      )}
    </TableCell>
  )

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Grant a module functionality to a <strong>role</strong> (applies to everyone in it) or expand a role to grant a
          specific <strong>user</strong>. Admin roles bypass all checks. Actions marked{" "}
          <Badge variant="outline" className="mx-0.5">not enforced yet</Badge> are recorded but not yet checked by the
          server (no backend). Assigned users pick up changes on their next page load.
        </p>
      </div>

      {catalog.map((group) => (
        <Card key={group.module}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" /> {group.label}
            </CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[220px]">Role / User</TableHead>
                  {group.functionalities.map((f) => (
                    <TableHead key={f.name} className="text-center align-bottom min-w-[140px]">
                      <div className="font-medium" title={f.description}>{f.label}</div>
                      {!f.enforced && (
                        <Badge variant="outline" className="mt-1 text-[10px] font-normal">not enforced yet</Badge>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => {
                  const roleUsers = usersByRole.get(role.id) ?? []
                  const isExpanded = expanded.has(role.id)
                  return (
                    <Fragment key={role.id}>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background z-10">
                          <button
                            type="button"
                            onClick={() => toggleExpand(role.id)}
                            className="flex items-center gap-1.5 font-medium hover:underline"
                          >
                            {roleUsers.length > 0 ? (
                              isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                            ) : (
                              <span className="w-4" />
                            )}
                            {role.name}
                            {role.isAdmin && <Badge variant="secondary" className="text-[10px]">admin</Badge>}
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {role.userCount ?? roleUsers.length} users
                            </Badge>
                          </button>
                        </TableCell>
                        {group.functionalities.map((f) => (
                          <Cell key={f.name} kind="role" id={role.id} name={f.name} disabled={role.isAdmin} />
                        ))}
                      </TableRow>
                      {isExpanded &&
                        roleUsers.map((u) => (
                          <TableRow key={role.id + ":" + u.id} className="bg-muted/30">
                            <TableCell className="sticky left-0 bg-muted/30 z-10">
                              <span className="pl-7 block truncate text-sm">
                                {u.fullName || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email}
                              </span>
                            </TableCell>
                            {group.functionalities.map((f) => (
                              <Cell key={f.name} kind="user" id={u.id} name={f.name} />
                            ))}
                          </TableRow>
                        ))}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Sticky save bar */}
      {changes.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-end gap-3 shadow-lg">
          <span className="text-sm text-muted-foreground mr-auto">{changes.size} unsaved change(s)</span>
          <Button variant="outline" size="sm" onClick={() => setChanges(new Map())} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Discard
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save changes
          </Button>
        </div>
      )}
    </div>
  )
}
