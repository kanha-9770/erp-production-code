"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, ChevronDown, ChevronRight, Lock, RefreshCw, CheckCircle2 } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface Form {
  id: string
  name: string
  description?: string
  moduleId: string
  isEmployeeForm?: boolean
  isUserForm?: boolean
}

interface Module {
  id: string
  name: string
  description?: string
  level: number
  children: Module[]
  forms: Form[]
}

interface Role {
  id: string
  name: string
  description?: string
  level: number
  isActive: boolean
  userCount: number
  users: User[]
}

interface User {
  id: string
  first_name: string
  last_name: string
  email: string
  department?: string
  location?: string
  status: string
  unitAssignments: Array<{
    unitId: string
    unit: { name: string }
    roleId: string
  }>
}

interface Permission {
  id: string
  name: string
  category: "READ" | "WRITE" | "DELETE" | "ADMIN" | "SPECIAL"
  resource: string
}

interface RolePermission {
  roleId: string
  permissionId: string
  moduleId: string
  formId?: string
  granted: boolean
  canDelegate: boolean
}

interface UserPermission {
  userId: string
  permissionId: string
  moduleId: string
  formId?: string
  granted: boolean
  reason?: string
  isActive: boolean
}

interface FormsPermissionMatrixProps {
  selectedForm: string | null
  selectedModule: string | null
  selectedSubmodule: string | null
}

const standardPermissions = [
  { id: "1", name: "VIEW", category: "READ", resource: "form" },
  { id: "2", name: "CREATE", category: "WRITE", resource: "form" },
  { id: "3", name: "EDIT", category: "WRITE", resource: "form" },
  { id: "4", name: "DELETE", category: "DELETE", resource: "form" },
]

export function FormsPermissionMatrix({
  selectedForm,
}: FormsPermissionMatrixProps) {
  const [modules, setModules] = useState<Module[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([])
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([])
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map())
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)


  useEffect(() => {
    if (!selectedForm) {
      setLoading(false)
      setFetchError(null)
      return
    }

    let isCurrent = true

    const fetchData = async () => {
      if (!isCurrent) return
      setLoading(true)
      setFetchError(null)

      try {
        const [mRes, rRes, uRes, pRes, rpRes, upRes] = await Promise.all([
          fetch("/api/modules-permission").then(r => r.json()),
          fetch("/api/role").then(r => r.json()),
          fetch("/api/admin/users").then(r => r.json()),
          fetch("/api/permissions").then(r => r.json()),
          fetch(`/api/role-permissions?formId=${selectedForm}`).then(r => r.json()),
          fetch("/api/user-permissions").then(r => r.json()),
        ])

        if (!isCurrent) return

        setModules(mRes.success ? mRes.data : [])
        setRoles(rRes.success ? rRes.data : [])
        setUsers(uRes.success ? uRes.data : [])
        setPermissions(pRes.success && pRes.data?.length ? pRes.data : standardPermissions)
        setRolePermissions(rpRes.success ? rpRes.data : [])
        setUserPermissions(upRes.success ? upRes.data : [])

      } catch (err: any) {
        if (isCurrent) {
          console.error("Permission data fetch failed:", err)
          setFetchError(err.message || "Failed to load permission data")
        }
      } finally {
        if (isCurrent) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      isCurrent = false
    }
  }, [selectedForm])

  const toggleRole = (roleId: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  const hasRolePermission = (roleId: string, formId: string, permId: string) => {
    const key = `role-${roleId}-${formId}-${permId}`
    if (changes.has(key)) return changes.get(key)!
    return rolePermissions.some(rp =>
      rp.roleId === roleId &&
      rp.permissionId === permId &&
      (rp.formId ?? null) === (formId ?? null) &&
      rp.granted
    )
  }

  const hasUserPermission = (userId: string, formId: string, permId: string) => {
    const key = `user-${userId}-${formId}-${permId}`
    if (changes.has(key)) return changes.get(key)!

    const direct = userPermissions.find(
      up => up.userId === userId && up.formId === formId && up.permissionId === permId && up.isActive
    )
    if (direct) return direct.granted

    const user = users.find(u => u.id === userId)
    const roleId = user?.unitAssignments?.[0]?.roleId
    return roleId ? hasRolePermission(roleId, formId, permId) : false
  }

  const togglePermission = (prefix: 'role' | 'user', id: string, formId: string, permId: string) => {
    const key = `${prefix}-${id}-${formId}-${permId}`
    const current = prefix === 'role'
      ? hasRolePermission(id, formId, permId)
      : hasUserPermission(id, formId, permId)
    setChanges(prev => new Map(prev).set(key, !current))
  }

  // ────────────────────────────────────────────────
  //  Save logic (kept almost same, removed heavy logging)
  // ────────────────────────────────────────────────
  const saveChanges = async () => {
    if (changes.size === 0) return
    setSaving(true)

    try {
      const roleUpdates: any[] = []
      const userUpdates: any[] = []
      const formInfo = getSelectedFormDetails()
      const moduleId = formInfo?.form.moduleId ?? null

      changes.forEach((granted, key) => {
        const parts = key.split("-")
        if (key.startsWith("role-")) {
          const [, roleId, formId, permissionId] = parts
          roleUpdates.push({ roleId, moduleId, formId, permissionId, granted, canDelegate: false })
        } else if (key.startsWith("user-")) {
          const [, userId, formId, permissionId] = parts
          userUpdates.push({ userId, moduleId, formId, permissionId, granted, reason: "Manual override", isActive: true })
        }
      })

      const promises = []

      if (roleUpdates.length) {
        promises.push(
          fetch("/api/role-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(roleUpdates),
          }).then(res => {
            if (!res.ok) throw new Error(`Role permissions update failed: ${res.status}`)
            return res
          })
        )
      }

      if (userUpdates.length) {
        promises.push(
          fetch("/api/user-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userUpdates),
          }).then(res => {
            if (!res.ok) throw new Error(`User permissions update failed: ${res.status}`)
            return res
          })
        )
      }

      await Promise.all(promises)

      setChanges(new Map())
      window.location.reload() // ← consider optimistic update later
    } catch (err: any) {
      console.error("Save failed:", err)
      alert("Failed to save permissions. Check console for details.")
    } finally {
      setSaving(false)
    }
  }

  const getUsersForRole = (roleId: string): User[] => {
    return users.filter(u => u.unitAssignments?.some(a => a.roleId === roleId))
  }

  const getSelectedFormDetails = () => {
    if (!selectedForm || !modules.length) return null

    for (const mod of modules) {
      const f = mod.forms?.find(x => x.id === selectedForm)
      if (f) return { form: f, module: mod, submodule: null, path: `${mod.name} > ${f.name}` }

      for (const sub of mod.children ?? []) {
        const sf = sub.forms?.find(x => x.id === selectedForm)
        if (sf) return { form: sf, module: mod, submodule: sub, path: `${mod.name} > ${sub.name} > ${sf.name}` }
      }
    }
    return null
  }

  const formDetails = getSelectedFormDetails()

  const filteredRoles = roles.filter(r => r.name.toLowerCase() !== "admin")

  const getGrantedCountForRole = (roleId: string) => {
    if (!selectedForm) return 0
    return permissions.filter(p => hasRolePermission(roleId, selectedForm, p.id)).length
  }

  // ────────────────────────────────────────────────
  //  Render
  // ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-pulse"></div>
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        </div>
        <p className="mt-5 text-base font-medium">Loading permissions...</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>Error: {fetchError}</p>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Please check the browser console and your backend APIs.
          </p>
        </CardContent>
      </Card>
    )
  }

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

  return (
    <div className="space-y-6">
      {/* Form Header */}
      <Card className="border shadow-sm">
        <CardHeader className="px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{formDetails.path}</p>
              <div className="flex flex-wrap gap-2">
                {formDetails.form.isEmployeeForm && <Badge variant="outline">Employee Form</Badge>}
                {formDetails.form.isUserForm && <Badge variant="outline">User Form</Badge>}
              </div>
            </div>
            <div className="text-right">
              <CardTitle className="text-xl font-semibold">{formDetails.form.name}</CardTitle>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Permissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>
            Control access for each role on this form. Expand rows to override for individual users.
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
                    <TableHead className="min-w-[220px] font-semibold">Role / User</TableHead>
                    {permissions.map(p => (
                      <TableHead key={p.id} className="min-w-[140px] text-center font-semibold">
                        {p.name}
                      </TableHead>
                    ))}
                    <TableHead className="w-[120px] text-center font-semibold">Granted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoles.map(role => {
                    const usersInRole = getUsersForRole(role.id)
                    const isExpanded = expandedRoles.has(role.id)
                    const grantedCount = getGrantedCountForRole(role.id)

                    return (
                      <Collapsible
                        key={role.id}
                        open={isExpanded}
                        onOpenChange={() => toggleRole(role.id)}
                        asChild
                      >
                        <>
                          <TableRow className="hover:bg-muted/60">
                            <TableCell className="font-medium">
                              <CollapsibleTrigger asChild>
                                <button className="flex items-center gap-2 hover:text-primary focus:outline-none">
                                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  {role.name}
                                </button>
                              </CollapsibleTrigger>
                            </TableCell>

                            {permissions.map(p => (
                              <TableCell key={p.id} className="text-center">
                                <Checkbox
                                  checked={hasRolePermission(role.id, selectedForm, p.id)}
                                  onCheckedChange={() => togglePermission('role', role.id, selectedForm, p.id)}
                                />
                              </TableCell>
                            ))}

                            <TableCell className="text-center">
                              <Badge variant="outline">
                                {grantedCount}/{permissions.length}
                              </Badge>
                            </TableCell>
                          </TableRow>

                          <CollapsibleContent asChild>
                            <>
                              {usersInRole.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={permissions.length + 2} className="pl-12 text-sm text-muted-foreground italic">
                                    No users in this role
                                  </TableCell>
                                </TableRow>
                              ) : (
                                usersInRole.map(user => (
                                  <TableRow key={user.id} className="bg-muted/30 hover:bg-muted/50">
                                    <TableCell className="pl-12 text-sm">
                                      {user.first_name} {user.last_name}
                                      <div className="text-xs text-muted-foreground">{user.email}</div>
                                    </TableCell>

                                    {permissions.map(p => (
                                      <TableCell key={p.id} className="text-center">
                                        <Checkbox
                                          checked={hasUserPermission(user.id, selectedForm, p.id)}
                                          onCheckedChange={() => togglePermission('user', user.id, selectedForm, p.id)}
                                        />
                                      </TableCell>
                                    ))}

                                    <TableCell />
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

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end border-t pt-6">
            <Button
              variant="outline"
              disabled={changes.size === 0 || saving}
              onClick={() => setChanges(new Map())}
            >
              Reset Changes
            </Button>
            <Button
              disabled={changes.size === 0 || saving}
              onClick={saveChanges}
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
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}