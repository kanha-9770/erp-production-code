"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Lock, AlertCircle, ChevronDown, ChevronRight, RefreshCw, CheckCircle2 } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

// ────────────────────────────────────────────────
// Interfaces (unchanged)
// ────────────────────────────────────────────────
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
  parentId?: string
  icon?: string
  color?: string
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
  searchTerm: string
  selectedForm: string | null
  selectedModule: string | null
  selectedSubmodule: string | null
}

// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────
export function FormsPermissionMatrix({
  searchTerm,
  selectedForm,
  selectedModule,
  selectedSubmodule,
}: FormsPermissionMatrixProps) {
  const [modules, setModules] = useState<Module[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([])
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([])
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map())

  const standardFormPermissions = [
    { id: "1", name: "VIEW", category: "READ" as const, resource: "form" },
    { id: "2", name: "CREATE", category: "WRITE" as const, resource: "form" },
    { id: "3", name: "EDIT", category: "WRITE" as const, resource: "form" },
    { id: "4", name: "DELETE", category: "DELETE" as const, resource: "form" },
  ]

  // ────────────────────────────────────────────────
  // Fetch all data + debug logs
  // ────────────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true)
        console.log("[FETCH] Starting data load... selectedForm =", selectedForm)

        const [modRes, roleRes, userRes, permRes, rolePermRes, userPermRes] = await Promise.all([
          fetch("/api/modules-permission").then(r => r.json()),
          fetch("/api/role").then(r => r.json()),
          fetch("/api/admin/users").then(r => r.json()),
          fetch("/api/permissions").then(r => r.json()),
          fetch(`/api/role-permissions?formId=${selectedForm || ''}`).then(r => r.json()),
          fetch("/api/user-permissions").then(r => r.json()),
        ])

        console.log("[FETCH] Modules count:", modRes?.data?.length ?? 0)
        console.log("[FETCH] Roles count:", roleRes?.data?.length ?? 0)
        console.log("[FETCH] Users count:", userRes?.data?.length ?? 0)
        console.log("[FETCH] Permissions count:", permRes?.data?.length ?? standardFormPermissions.length)
        console.log("[FETCH] RolePermissions count:", rolePermRes?.data?.length ?? 0)
        console.log("[FETCH] First few rolePermissions:", rolePermRes?.data?.slice(0, 3) ?? [])
        console.log("[FETCH] UserPermissions count:", userPermRes?.data?.length ?? 0)

        setModules(modRes.success ? modRes.data : [])
        setRoles(roleRes.success ? roleRes.data : [])
        setUsers(userRes.success ? userRes.data : [])
        setPermissions(permRes.success && permRes.data?.length ? permRes.data : standardFormPermissions)
        setRolePermissions(rolePermRes.success ? rolePermRes.data : [])
        setUserPermissions(userPermRes.success ? userPermRes.data : [])
      } catch (e) {
        console.error("[FETCH ERROR]", e)
        setPermissions(standardFormPermissions)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const toggleRole = (roleId: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  const hasRolePermission = (roleId: string, formId: string, permissionId: string): boolean => {
    const key = `role-${roleId}-${formId}-${permissionId}`
    if (changes.has(key)) {
      const changedValue = changes.get(key)!
      console.log(`[hasRolePermission] Using local change → ${key} = ${changedValue}`)
      return changedValue
    }

    const rp = rolePermissions.find(r =>
      r.roleId === roleId &&
      r.permissionId === permissionId &&
      (r.formId ?? null) === (formId ?? null)
    )

    const value = rp?.granted ?? false
    // console.log(`[hasRolePermission] DB value → ${key} = ${value}`) // uncomment if you want very detailed logs
    return value
  }

  const hasUserPermission = (userId: string, formId: string, permissionId: string): boolean => {
    const key = `user-${userId}-${formId}-${permissionId}`
    if (changes.has(key)) return changes.get(key)!

    const direct = userPermissions.find(up => up.userId === userId && up.formId === formId && up.permissionId === permissionId && up.isActive)
    if (direct !== undefined) return direct.granted

    const user = users.find(u => u.id === userId)
    const roleId = user?.unitAssignments?.[0]?.roleId
    return roleId ? hasRolePermission(roleId, formId, permissionId) : false
  }

  const toggleRolePermission = (roleId: string, formId: string, permissionId: string) => {
    const key = `role-${roleId}-${formId}-${permissionId}`
    const current = hasRolePermission(roleId, formId, permissionId)
    const nextValue = !current
    console.log(`[TOGGLE ROLE] ${key} → ${current} becomes ${nextValue}`)
    setChanges(prev => new Map(prev).set(key, nextValue))
  }

  const toggleUserPermission = (userId: string, formId: string, permissionId: string) => {
    const key = `user-${userId}-${formId}-${permissionId}`
    const current = hasUserPermission(userId, formId, permissionId)
    const nextValue = !current
    console.log(`[TOGGLE USER] ${key} → ${current} becomes ${nextValue}`)
    setChanges(prev => new Map(prev).set(key, nextValue))
  }

  // ────────────────────────────────────────────────
  // SAVE - with very detailed logging
  // ────────────────────────────────────────────────
  const saveChanges = async () => {
    setSaving(true)
    console.log("[SAVE] Starting save. Pending changes count:", changes.size)
    console.log("[SAVE] Current changes map:", Array.from(changes.entries()))

    try {
      const roleUpdates: any[] = []
      const userUpdates: any[] = []
      const formInfo = getSelectedFormDetails()
      const moduleId = formInfo?.form.moduleId ?? null

      console.log("[SAVE] Selected form info:", formInfo)
      console.log("[SAVE] Using moduleId:", moduleId)

      changes.forEach((granted, key) => {
        const parts = key.split("-")
        if (key.startsWith("role-")) {
          const [, roleId, formId, permissionId] = parts
          const update = { roleId, moduleId, formId, permissionId, granted, canDelegate: false }
          roleUpdates.push(update)
          console.log("[SAVE] Role update queued:", update)
        } else if (key.startsWith("user-")) {
          const [, userId, formId, permissionId] = parts
          const update = { userId, moduleId, formId, permissionId, granted, reason: "Manual override", isActive: true }
          userUpdates.push(update)
          console.log("[SAVE] User update queued:", update)
        }
      })

      console.log("[SAVE] Final role updates to send:", roleUpdates)
      console.log("[SAVE] Final user updates to send:", userUpdates)

      const promises = []

      if (roleUpdates.length) {
        console.log("[SAVE] Sending PUT to /api/role-permissions with", roleUpdates.length, "items")
        promises.push(
          fetch("/api/role-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(roleUpdates),
          }).then(async res => {
            const text = await res.text()
            console.log("[SAVE] role-permissions response status:", res.status)
            console.log("[SAVE] role-permissions response body:", text)
            if (!res.ok) throw new Error(`role-permissions failed: ${res.status} - ${text}`)
            return res
          })
        )
      }

      if (userUpdates.length) {
        console.log("[SAVE] Sending PUT to /api/user-permissions with", userUpdates.length, "items")
        promises.push(
          fetch("/api/user-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userUpdates),
          }).then(async res => {
            const text = await res.text()
            console.log("[SAVE] user-permissions response status:", res.status)
            console.log("[SAVE] user-permissions response body:", text)
            if (!res.ok) throw new Error(`user-permissions failed: ${res.status} - ${text}`)
            return res
          })
        )
      }

      await Promise.all(promises)

      console.log("[SAVE] All API calls successful → clearing changes")
      setChanges(new Map())
      window.location.reload()
    } catch (e) {
      console.error("[SAVE ERROR]", e)
      alert("Failed to save changes. Check browser console for details.")
    } finally {
      setSaving(false)
    }
  }

  const getUsersForRole = (roleId: string): User[] => {
    return users.filter(u => u.unitAssignments?.some(a => a.roleId === roleId))
  }

  const getSelectedFormDetails = () => {
    if (!selectedForm) return null
    for (const mod of modules) {
      const f = mod.forms?.find(x => x.id === selectedForm)
      if (f) return { form: f, module: mod, submodule: null, path: `${mod.name} > ${f.name}` }

      for (const sub of mod.children ?? []) {
        const sf = sub.forms?.find(x => x.id === selectedForm)
        if (sf) return { form: sf, module: mod, submodule: sub, path: `${mod.name} > ${sub.name} > ${sf.name}` }
      }
    }
    console.warn("[getSelectedFormDetails] Form not found:", selectedForm)
    return null
  }

  const formDetails = getSelectedFormDetails()
  const filteredRoles = roles.filter(
    r =>
      r.name.toLowerCase() !== "admin" &&
      (r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.description?.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const getGrantedCountForRole = (roleId: string) => {
    return permissions.filter(p => hasRolePermission(roleId, selectedForm!, p.id)).length
  }

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

      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>
            Control access for each role on this form. Expand to override for individual users.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                                checked={hasRolePermission(role.id, selectedForm!, p.id)}
                                onCheckedChange={() => toggleRolePermission(role.id, selectedForm!, p.id)}
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
                                        checked={hasUserPermission(user.id, selectedForm!, p.id)}
                                        onCheckedChange={() => toggleUserPermission(user.id, selectedForm!, p.id)}
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

                {filteredRoles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={permissions.length + 2} className="h-32 text-center text-muted-foreground">
                      <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-70" />
                      <p>No roles match your search</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end border-t pt-6">
            <Button variant="outline" disabled={changes.size === 0} onClick={() => setChanges(new Map())}>
              Reset Changes
            </Button>
            <Button disabled={changes.size === 0 || saving} onClick={saveChanges}>
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