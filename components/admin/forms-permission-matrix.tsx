"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Lock,
  RefreshCw,
  CheckCircle2,
} from "lucide-react"
import { useState, useMemo, useEffect, type MutableRefObject } from "react"
import { usePermissionMatrix } from "@/hooks/use-permission-matrix"
import type { PermissionModule, Permission, PermissionUser } from "@/types/permissions"

interface FormsPermissionMatrixProps {
  modules: PermissionModule[]
  selectedForm: string | null
  /** Ref updated with the current unsaved-changes flag so the parent can
   *  guard form switches without needing to own the hook. */
  unsavedChangesRef?: MutableRefObject<boolean>
}

export function FormsPermissionMatrix({
  modules,
  selectedForm,
  unsavedChangesRef,
}: FormsPermissionMatrixProps) {
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())

  const {
    permissions,
    loading,
    error,
    changes,
    saving,
    hasChanges,
    hasRolePermission,
    hasUserPermission,
    togglePermission,
    resetChanges,
    saveChanges,
    getUsersForRole,
    getGrantedCountForRole,
    filteredRoles,
  } = usePermissionMatrix(selectedForm)

  // Keep the parent's ref in sync so it can guard form switches
  useEffect(() => {
    if (unsavedChangesRef) unsavedChangesRef.current = hasChanges
  }, [hasChanges, unsavedChangesRef])

  const toggleRole = (roleId: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev)
      next.has(roleId) ? next.delete(roleId) : next.add(roleId)
      return next
    })
  }

  // Recursively locate the selected form at any depth in the module tree and
  // build a breadcrumb path from the ancestors visited along the way.
  const formDetails = useMemo(() => {
    if (!selectedForm) return null

    const search = (
      nodes: PermissionModule[],
      ancestors: PermissionModule[],
    ): {
      form: PermissionModule["forms"][number]
      module: PermissionModule
      submodule: PermissionModule | null
      path: string
    } | null => {
      for (const node of nodes) {
        const form = node.forms?.find((f) => f.id === selectedForm)
        if (form) {
          const trail = [...ancestors, node]
          return {
            form,
            module: trail[0],
            submodule: trail.length > 1 ? trail[trail.length - 1] : null,
            path: [...trail.map((n) => n.name), form.name].join(" > "),
          }
        }
        const found = search(node.children ?? [], [...ancestors, node])
        if (found) return found
      }
      return null
    }

    return search(modules, [])
  }, [selectedForm, modules])

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="mt-5 text-base font-medium">Loading permissions...</p>
      </div>
    )
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>Error: {error}</p>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Please check the browser console and your backend APIs.
          </p>
        </CardContent>
      </Card>
    )
  }

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (!selectedForm || !formDetails) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
          <Lock className="h-12 w-12 text-muted-foreground/60" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">No Form Selected</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Select a form from the sidebar to configure permissions
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Matrix ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Form header */}
      <Card className="border shadow-sm">
        <CardHeader className="px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{formDetails.path}</p>
              <div className="flex flex-wrap gap-2">
                {formDetails.form.isEmployeeForm && (
                  <Badge variant="outline">Employee Form</Badge>
                )}
                {formDetails.form.isUserForm && (
                  <Badge variant="outline">User Form</Badge>
                )}
              </div>
            </div>
            <CardTitle className="text-xl font-semibold">{formDetails.form.name}</CardTitle>
          </div>
        </CardHeader>
      </Card>

      {/* Permission table */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>
            Control access for each role on this form. Expand rows to override for individual users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredRoles.length === 0 ? (
            <EmptyRoles />
          ) : (
            <ScrollArea className="h-[calc(100vh-420px)] min-h-[500px] rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[160px] min-w-[160px] px-2 font-semibold">Role / User</TableHead>
                    {permissions.map((p) => (
                      <TableHead
                        key={p.id}
                        className="w-[88px] min-w-[88px] px-1 text-center text-xs font-semibold uppercase tracking-tight"
                      >
                        {p.name}
                      </TableHead>
                    ))}
                    <TableHead className="w-[72px] min-w-[72px] px-1 text-center text-xs font-semibold">Granted</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredRoles.map((role) => {
                    const usersInRole = getUsersForRole(role.id)
                    const isExpanded = expandedRoles.has(role.id)
                    const grantedCount = getGrantedCountForRole(role.id, selectedForm)

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
                            <TableCell className="px-2 font-medium">
                              <CollapsibleTrigger asChild>
                                <button className="flex items-center gap-1.5 text-sm hover:text-primary focus:outline-none">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0" />
                                  )}
                                  <span className="truncate">{role.name}</span>
                                </button>
                              </CollapsibleTrigger>
                            </TableCell>

                            {permissions.map((p) => (
                              <PermissionCell
                                key={p.id}
                                checked={hasRolePermission(role.id, selectedForm, p.id)}
                                disabled={saving}
                                onChange={() =>
                                  togglePermission("role", role.id, selectedForm, p.id)
                                }
                              />
                            ))}

                            <TableCell className="px-1 text-center">
                              <Badge variant="outline" className="px-1.5 py-0 text-[11px]">
                                {grantedCount}/{permissions.length}
                              </Badge>
                            </TableCell>
                          </TableRow>

                          {/* User override rows */}
                          <CollapsibleContent asChild>
                            <>
                              {usersInRole.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={permissions.length + 2}
                                    className="pl-12 text-sm text-muted-foreground italic"
                                  >
                                    No users in this role
                                  </TableCell>
                                </TableRow>
                              ) : (
                                usersInRole.map((user) => (
                                  <UserRow
                                    key={user.id}
                                    user={user}
                                    selectedForm={selectedForm}
                                    permissions={permissions}
                                    saving={saving}
                                    hasUserPermission={hasUserPermission}
                                    togglePermission={togglePermission}
                                  />
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
            <Button
              disabled={!hasChanges || saving}
              onClick={() => saveChanges(modules, selectedForm)}
            >
              {saving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Save Permissions
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

// ─── Extracted sub-components ─────────────────────────────────────────────────

function EmptyRoles() {
  return (
    <div className="py-12 text-center text-muted-foreground">
      <AlertCircle className="mx-auto h-10 w-10 opacity-70 mb-3" />
      <p>No roles available (admin role excluded)</p>
    </div>
  )
}

interface PermissionCellProps {
  checked: boolean
  disabled?: boolean
  onChange: () => void
}

function PermissionCell({ checked, disabled, onChange }: PermissionCellProps) {
  return (
    <TableCell className="px-1 text-center">
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </TableCell>
  )
}

interface UserRowProps {
  user: PermissionUser
  selectedForm: string
  permissions: Permission[]
  saving: boolean
  hasUserPermission: (userId: string, formId: string, permId: string) => boolean
  togglePermission: (prefix: "role" | "user", id: string, formId: string, permId: string) => void
}

function UserRow({
  user,
  selectedForm,
  permissions,
  saving,
  hasUserPermission,
  togglePermission,
}: UserRowProps) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/50">
      <TableCell className="pl-8 pr-2 text-sm">
        <div className="truncate">{user.first_name} {user.last_name}</div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </TableCell>

      {permissions.map((p) => (
        <PermissionCell
          key={p.id}
          checked={hasUserPermission(user.id, selectedForm, p.id)}
          disabled={saving}
          onChange={() => togglePermission("user", user.id, selectedForm, p.id)}
        />
      ))}

      <TableCell />
    </TableRow>
  )
}