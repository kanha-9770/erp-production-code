// "use client"

// import type React from "react"
// import { useState, useEffect } from "react"
// import { useRoles } from "@/context/role-context"
// import { useToast } from "@/hooks/use-toast"
// import type { OrganizationUnitFormData, User } from "@/types/role"
// import { flattenRoles, flattenUnits, getUserDisplayName, getUserInitials } from "@/lib/organization-utils"
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog"
// import { Button } from "@/components/ui/button"
// import { Input } from "@/components/ui/input"
// import { Label } from "@/components/ui/label"
// import { Textarea } from "@/components/ui/textarea"
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select"
// import { Checkbox } from "@/components/ui/checkbox"
// import { Building2, Users, Shield, X } from "lucide-react"
// import { Badge } from "@/components/ui/badge"
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// const EMPTY_FORM: OrganizationUnitFormData = {
//   name: "",
//   description: "",
//   assignedRoles: [],
//   assignedUsers: [],
// }

// export function OrganizationUnitFormModal() {
//   const { state, dispatch, refreshData } = useRoles()
//   const { toast } = useToast()
//   const [formData, setFormData] = useState<OrganizationUnitFormData>(EMPTY_FORM)
//   const [users, setUsers] = useState<User[]>([])
//   const [loading, setLoading] = useState(false)

//   const isOpen = state.isOrgFormOpen
//   const isEditing =
//     state.selectedOrgUnit &&
//     state.selectedOrgUnit.id !== "new" &&
//     state.selectedOrgUnit.id !== undefined

//   useEffect(() => {
//     if (!state.selectedOrgUnit) return
//     if (state.selectedOrgUnit.id === "new") {
//       setFormData({ ...EMPTY_FORM, parentId: state.selectedOrgUnit.parentId })
//     } else {
//       setFormData({
//         name: state.selectedOrgUnit.name,
//         description: state.selectedOrgUnit.description,
//         assignedRoles: state.selectedOrgUnit.assignedRoles || [],
//         assignedUsers: state.selectedOrgUnit.assignedUsers || [],
//       })
//     }
//   }, [state.selectedOrgUnit])

//   useEffect(() => {
//     if (!isOpen) return
//     fetch("/api/users")
//       .then((res) => (res.ok ? res.json() : []))
//       .then(setUsers)
//       .catch(() => {/* silently ignore fetch errors */})
//   }, [isOpen])

//   const handleClose = () => {
//     dispatch({ type: "CLOSE_ORG_FORM" })
//     setFormData(EMPTY_FORM)
//   }

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     if (!formData.name.trim()) {
//       toast({ title: "Validation Error", description: "Unit name is required", variant: "destructive" })
//       return
//     }

//     setLoading(true)
//     try {
//       if (state.selectedOrgUnit?.id === "new") {
//         const response = await fetch(`/api/organizations/${state.organizationId}/units`, {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ ...formData, parentId: state.selectedOrgUnit.parentId }),
//         })
//         if (!response.ok) throw new Error("Failed to create unit")
//       } else if (state.selectedOrgUnit) {
//         const response = await fetch(`/api/units/${state.selectedOrgUnit.id}`, {
//           method: "PUT",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify(formData),
//         })
//         if (!response.ok) throw new Error("Failed to update unit")
//       }

//       await refreshData()
//       handleClose()
//       toast({ title: "Success", description: isEditing ? "Unit updated" : "Unit created" })
//     } catch (error) {
//       toast({
//         title: "Error",
//         description: (error as Error).message || "Failed to save unit. Please try again.",
//         variant: "destructive",
//       })
//     } finally {
//       setLoading(false)
//     }
//   }

//   const availableParents = flattenUnits(state.organizationUnits).filter(
//     (unit) => unit.id !== state.selectedOrgUnit?.id
//   )
//   const availableRoles = flattenRoles(state.roles)

//   const handleRoleToggle = (roleId: string, checked: boolean) => {
//     const current = formData.assignedRoles || []
//     setFormData({
//       ...formData,
//       assignedRoles: checked ? [...current, roleId] : current.filter((id) => id !== roleId),
//     })
//   }

//   const handleUserAssignment = (userId: string, roleId: string) => {
//     const current = formData.assignedUsers || []
//     const user = users.find((u) => u.id === userId)
//     if (!user) return

//     const userName = getUserDisplayName(user)
//     const existingIdx = current.findIndex((u) => u.userId === userId)

//     if (existingIdx >= 0) {
//       const updated = [...current]
//       updated[existingIdx] = { userId, roleId, userName }
//       setFormData({ ...formData, assignedUsers: updated })
//     } else {
//       setFormData({ ...formData, assignedUsers: [...current, { userId, roleId, userName }] })
//     }
//   }

//   const handleRemoveUser = (userId: string) => {
//     setFormData({
//       ...formData,
//       assignedUsers: (formData.assignedUsers || []).filter((u) => u.userId !== userId),
//     })
//   }

//   const selectedRoleNames = availableRoles
//     .filter((role) => (formData.assignedRoles || []).includes(role.id))
//     .map((role) => role.name)

//   const assignedUsers = (formData.assignedUsers || [])
//     .map((assignment) => ({
//       user: users.find((u) => u.id === assignment.userId),
//       role: availableRoles.find((r) => r.id === assignment.roleId),
//       assignment,
//     }))
//     .filter((item) => item.user && item.role)

//   const assignedUserIds = new Set((formData.assignedUsers || []).map((u) => u.userId))
//   const unassignedUsers = users.filter((u) => !assignedUserIds.has(u.id))

//   return (
//     <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
//       <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <Building2 className="h-5 w-5 text-blue-600" />
//             {isEditing ? "Edit Organizational Unit" : "Create New Organizational Unit"}
//           </DialogTitle>
//         </DialogHeader>

//         <form onSubmit={handleSubmit} className="space-y-6">
//           {/* Basic Info */}
//           <div className="space-y-4">
//             <div className="space-y-2">
//               <Label htmlFor="unit-name">Unit Name *</Label>
//               <Input
//                 id="unit-name"
//                 value={formData.name}
//                 onChange={(e) => setFormData({ ...formData, name: e.target.value })}
//                 placeholder="Enter unit name (e.g., Finance Department)"
//                 required
//                 className="focus:ring-blue-500 focus:border-blue-500"
//               />
//             </div>

//             {state.selectedOrgUnit?.id === "new" && (
//               <div className="space-y-2">
//                 <Label htmlFor="unit-parent">Parent Unit</Label>
//                 <Select
//                   value={formData.parentId}
//                   onValueChange={(value) => setFormData({ ...formData, parentId: value })}
//                 >
//                   <SelectTrigger className="focus:ring-blue-500 focus:border-blue-500">
//                     <SelectValue placeholder="Select parent unit (optional)" />
//                   </SelectTrigger>
//                   <SelectContent>
//                     {availableParents.map((unit) => (
//                       <SelectItem key={unit.id} value={unit.id}>
//                         {"  ".repeat(unit.level)} {unit.name}
//                       </SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
//               </div>
//             )}

//             <div className="space-y-2">
//               <Label htmlFor="unit-description">Description</Label>
//               <Textarea
//                 id="unit-description"
//                 value={formData.description}
//                 onChange={(e) => setFormData({ ...formData, description: e.target.value })}
//                 placeholder="Enter unit description and responsibilities"
//                 rows={3}
//                 className="focus:ring-blue-500 focus:border-blue-500"
//               />
//             </div>
//           </div>

//           {/* Roles & Users Tabs */}
//           <Tabs defaultValue="roles" className="w-full">
//             <TabsList className="grid w-full grid-cols-2">
//               <TabsTrigger value="roles" className="flex items-center gap-2">
//                 <Shield className="h-4 w-4" /> Roles
//               </TabsTrigger>
//               <TabsTrigger value="users" className="flex items-center gap-2">
//                 <Users className="h-4 w-4" /> Users
//               </TabsTrigger>
//             </TabsList>

//             <TabsContent value="roles" className="space-y-4">
//               <div className="flex items-center gap-2">
//                 <Shield className="h-4 w-4 text-purple-600" />
//                 <Label className="text-base font-medium">Assign Roles to Unit</Label>
//               </div>

//               {selectedRoleNames.length > 0 && (
//                 <div className="flex flex-wrap gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
//                   {selectedRoleNames.map((name) => (
//                     <Badge key={name} variant="secondary" className="bg-purple-100 text-purple-800">
//                       {name}
//                     </Badge>
//                   ))}
//                 </div>
//               )}

//               <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4 space-y-3">
//                 {availableRoles.length === 0 ? (
//                   <p className="text-sm text-gray-500 text-center py-4">
//                     No roles available. Create roles first to assign them to units.
//                   </p>
//                 ) : (
//                   availableRoles.map((role) => (
//                     <div key={role.id} className="flex items-center space-x-3">
//                       <Checkbox
//                         id={`role-${role.id}`}
//                         checked={formData.assignedRoles?.includes(role.id) || false}
//                         onCheckedChange={(checked) => handleRoleToggle(role.id, !!checked)}
//                         className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
//                       />
//                       <div className="flex-1">
//                         <Label
//                           htmlFor={`role-${role.id}`}
//                           className="text-sm font-medium cursor-pointer"
//                           style={{ paddingLeft: `${role.level * 12}px` }}
//                         >
//                           {role.name}
//                         </Label>
//                         {role.description && (
//                           <p className="text-xs text-gray-500 mt-1" style={{ paddingLeft: `${role.level * 12}px` }}>
//                             {role.description}
//                           </p>
//                         )}
//                       </div>
//                     </div>
//                   ))
//                 )}
//               </div>
//             </TabsContent>

//             <TabsContent value="users" className="space-y-4">
//               <div className="flex items-center gap-2">
//                 <Users className="h-4 w-4 text-blue-600" />
//                 <Label className="text-base font-medium">Assign Users to Unit</Label>
//               </div>

//               {assignedUsers.length > 0 && (
//                 <div className="space-y-2">
//                   <Label className="text-sm font-medium text-gray-700">Assigned Users</Label>
//                   <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200 max-h-32 overflow-y-auto">
//                     {assignedUsers.map(({ user, role, assignment }) => (
//                       <div key={assignment.userId} className="flex items-center justify-between bg-white p-2 rounded border">
//                         <div className="flex items-center gap-3">
//                           <Avatar className="h-8 w-8">
//                             <AvatarImage src={user!.avatar || "/placeholder.svg"} />
//                             <AvatarFallback>{getUserInitials(user!)}</AvatarFallback>
//                           </Avatar>
//                           <div>
//                             <p className="text-sm font-medium">{getUserDisplayName(user!)}</p>
//                             <p className="text-xs text-gray-500">{user!.email}</p>
//                           </div>
//                         </div>
//                         <div className="flex items-center gap-2">
//                           <Badge variant="outline" className="text-xs">{role!.name}</Badge>
//                           <Button
//                             type="button"
//                             variant="ghost"
//                             size="sm"
//                             onClick={() => handleRemoveUser(assignment.userId)}
//                             className="h-6 w-6 p-0 hover:bg-red-100 text-red-600"
//                           >
//                             <X className="h-3 w-3" />
//                           </Button>
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               )}

//               <div className="space-y-2">
//                 <Label className="text-sm font-medium text-gray-700">Available Users</Label>
//                 <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4 space-y-2">
//                   {unassignedUsers.length === 0 ? (
//                     <p className="text-sm text-gray-500 text-center py-4">
//                       All users have been assigned to this unit.
//                     </p>
//                   ) : (
//                     unassignedUsers.map((user) => (
//                       <div key={user.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
//                         <div className="flex items-center gap-3">
//                           <Avatar className="h-8 w-8">
//                             <AvatarImage src={user.avatar || "/placeholder.svg"} />
//                             <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
//                           </Avatar>
//                           <div>
//                             <p className="text-sm font-medium">{getUserDisplayName(user)}</p>
//                             <p className="text-xs text-gray-500">
//                               {user.email} • {user.department}
//                             </p>
//                           </div>
//                         </div>
//                         <Select onValueChange={(roleId) => handleUserAssignment(user.id, roleId)}>
//                           <SelectTrigger className="w-40">
//                             <SelectValue placeholder="Select role" />
//                           </SelectTrigger>
//                           <SelectContent>
//                             {availableRoles.map((role) => (
//                               <SelectItem key={role.id} value={role.id}>
//                                 {role.name}
//                               </SelectItem>
//                             ))}
//                           </SelectContent>
//                         </Select>
//                       </div>
//                     ))
//                   )}
//                 </div>
//               </div>
//             </TabsContent>
//           </Tabs>

//           <div className="flex justify-end space-x-3 pt-4 border-t">
//             <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
//               Cancel
//             </Button>
//             <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={loading}>
//               <Building2 className="h-4 w-4 mr-2" />
//               {loading ? "Saving..." : isEditing ? "Update Unit" : "Create Unit"}
//             </Button>
//           </div>
//         </form>
//       </DialogContent>
//     </Dialog>
//   )
// }


"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRoles } from "@/context/role-context"
import { useToast } from "@/hooks/use-toast"
import type { OrganizationUnitFormData, User } from "@/types/role"
import { flattenRoles, flattenUnits, getUserDisplayName, getUserInitials } from "@/lib/organization-utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Building2, Users, Shield, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

const EMPTY_FORM: OrganizationUnitFormData = {
  name: "",
  description: "",
  assignedRoles: [],
  assignedUsers: [],
}

export function OrganizationUnitFormModal() {
  const { state, dispatch, refreshData } = useRoles()
  const { toast } = useToast()
  const [formData, setFormData] = useState<OrganizationUnitFormData>(EMPTY_FORM)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)

  const isOpen = state.isOrgFormOpen
  const isEditing =
    state.selectedOrgUnit &&
    state.selectedOrgUnit.id !== "new" &&
    state.selectedOrgUnit.id !== undefined

  useEffect(() => {
    if (!state.selectedOrgUnit) return
    if (state.selectedOrgUnit.id === "new") {
      setFormData({ ...EMPTY_FORM, parentId: state.selectedOrgUnit.parentId })
    } else {
      setFormData({
        name: state.selectedOrgUnit.name,
        description: state.selectedOrgUnit.description,
        assignedRoles: state.selectedOrgUnit.assignedRoles || [],
        assignedUsers: state.selectedOrgUnit.assignedUsers || [],
      })
    }
  }, [state.selectedOrgUnit])

  useEffect(() => {
    if (!isOpen) return
    fetch("/api/users")
      .then((res) => (res.ok ? res.json() : []))
      .then(setUsers)
      .catch(() => {/* silently ignore fetch errors */})
  }, [isOpen])

  const handleClose = () => {
    dispatch({ type: "CLOSE_ORG_FORM" })
    setFormData(EMPTY_FORM)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast({ title: "Validation Error", description: "Unit name is required", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      if (state.selectedOrgUnit?.id === "new") {
        const response = await fetch(`/api/organizations/${state.organizationId}/units`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formData, parentId: state.selectedOrgUnit.parentId }),
        })
        if (!response.ok) throw new Error("Failed to create unit")
      } else if (state.selectedOrgUnit) {
        const response = await fetch(`/api/units/${state.selectedOrgUnit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        })
        if (!response.ok) throw new Error("Failed to update unit")
      }

      await refreshData()
      handleClose()
      toast({ title: "Success", description: isEditing ? "Unit updated" : "Unit created" })
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to save unit. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const availableParents = flattenUnits(state.organizationUnits).filter(
    (unit) => unit.id !== state.selectedOrgUnit?.id
  )
  const availableRoles = flattenRoles(state.roles)

  const handleRoleToggle = (roleId: string, checked: boolean) => {
    const current = formData.assignedRoles || []
    setFormData({
      ...formData,
      assignedRoles: checked ? [...current, roleId] : current.filter((id) => id !== roleId),
    })
  }

  const handleUserAssignment = (userId: string, roleId: string) => {
    const current = formData.assignedUsers || []
    const user = users.find((u) => u.id === userId)
    if (!user) return

    const userName = getUserDisplayName(user)
    const existingIdx = current.findIndex((u) => u.userId === userId)

    if (existingIdx >= 0) {
      const updated = [...current]
      updated[existingIdx] = { userId, roleId, userName }
      setFormData({ ...formData, assignedUsers: updated })
    } else {
      setFormData({ ...formData, assignedUsers: [...current, { userId, roleId, userName }] })
    }
  }

  const handleRemoveUser = (userId: string) => {
    setFormData({
      ...formData,
      assignedUsers: (formData.assignedUsers || []).filter((u) => u.userId !== userId),
    })
  }

  const selectedRoleNames = availableRoles
    .filter((role) => (formData.assignedRoles || []).includes(role.id))
    .map((role) => role.name)

  const assignedUsers = (formData.assignedUsers || [])
    .map((assignment) => ({
      user: users.find((u) => u.id === assignment.userId),
      role: availableRoles.find((r) => r.id === assignment.roleId),
      assignment,
    }))
    .filter((item) => item.user && item.role)

  const assignedUserIds = new Set((formData.assignedUsers || []).map((u) => u.userId))
  const unassignedUsers = users.filter((u) => !assignedUserIds.has(u.id))

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent 
        className={cn(
          "sm:max-w-[800px] lg:max-w-[900px] max-h-[92vh] overflow-y-auto",
          "p-4 sm:p-5 md:p-6",
          "bg-gradient-to-b from-white to-slate-50/40",
          "border border-slate-200 shadow-xl rounded-xl sm:rounded-2xl"
        )}
      >
        <DialogHeader className="mb-5 sm:mb-6 pb-4 border-b border-slate-200">
          <DialogTitle className="flex items-center gap-3 text-xl sm:text-2xl font-bold text-slate-900">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-blue-600 shadow-md">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            {isEditing ? "Edit Organizational Unit" : "Create New Organizational Unit"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-7">
          {/* Basic Info Section */}
          <div className="space-y-4 sm:space-y-5 bg-white/60 p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="unit-name" className="text-sm sm:text-base font-medium">
                Unit Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="unit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Finance Department, Engineering Team, Sales Division"
                required
                className="h-10 sm:h-11 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            {state.selectedOrgUnit?.id === "new" && (
              <div className="space-y-2">
                <Label htmlFor="unit-parent" className="text-sm sm:text-base font-medium">
                  Parent Unit
                </Label>
                <Select
                  value={formData.parentId || "none"}
                  onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? "" : value })}
                >
                  <SelectTrigger className="h-10 sm:h-11 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <SelectValue placeholder="Select parent unit (optional)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[40vh]">
                    <SelectItem value="none">— No parent (Top-level unit) —</SelectItem>
                    {availableParents.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {"  ".repeat(unit.level)} {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="unit-description" className="text-sm sm:text-base font-medium">
                Description
              </Label>
              <Textarea
                id="unit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the purpose, scope, and responsibilities of this organizational unit..."
                rows={4}
                className="min-h-[100px] sm:min-h-[120px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y transition-all"
              />
            </div>
          </div>

          {/* Tabs: Roles & Users */}
          <Tabs defaultValue="roles" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-10 sm:h-11 rounded-lg bg-slate-100/80 border border-slate-200">
              <TabsTrigger 
                value="roles" 
                className="text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Shield className="h-4 w-4 sm:h-4.5 sm:w-4.5 mr-1.5 sm:mr-2" />
                Roles
              </TabsTrigger>
              <TabsTrigger 
                value="users" 
                className="text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Users className="h-4 w-4 sm:h-4.5 sm:w-4.5 mr-1.5 sm:mr-2" />
                Users
              </TabsTrigger>
            </TabsList>

            <TabsContent value="roles" className="mt-4 sm:mt-5 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-purple-600" />
                <Label className="text-base sm:text-lg font-semibold text-slate-800">
                  Assign Roles to Unit
                </Label>
              </div>

              {selectedRoleNames.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 sm:p-4 bg-purple-50/70 rounded-xl border border-purple-200/70">
                  {selectedRoleNames.map((name) => (
                    <Badge 
                      key={name} 
                      variant="secondary" 
                      className="bg-purple-100 text-purple-800 px-3 py-1 text-xs sm:text-sm"
                    >
                      {name}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="max-h-[35vh] sm:max-h-[45vh] overflow-y-auto border border-slate-200 rounded-xl p-3 sm:p-4 bg-white/60 shadow-inner space-y-3">
                {availableRoles.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6 sm:py-8 italic">
                    No roles available yet. Create roles first to assign them here.
                  </p>
                ) : (
                  availableRoles.map((role) => (
                    <div 
                      key={role.id} 
                      className="flex items-start sm:items-center gap-3 py-1.5 px-2 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <Checkbox
                        id={`role-${role.id}`}
                        checked={formData.assignedRoles?.includes(role.id) || false}
                        onCheckedChange={(checked) => handleRoleToggle(role.id, !!checked)}
                        className="mt-1 sm:mt-0 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600 h-5 w-5 sm:h-6 sm:w-6"
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={`role-${role.id}`}
                          className="text-sm sm:text-base font-medium cursor-pointer block truncate"
                          style={{ paddingLeft: `${role.level * 14}px` }}
                        >
                          {role.name}
                        </Label>
                        {role.description && (
                          <p 
                            className="text-xs sm:text-sm text-slate-600 mt-1 line-clamp-2"
                            style={{ paddingLeft: `${role.level * 14}px` }}
                          >
                            {role.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="users" className="mt-4 sm:mt-5 space-y-5 sm:space-y-6">
              <div className="flex items-center gap-2">
                <Users className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-blue-600" />
                <Label className="text-base sm:text-lg font-semibold text-slate-800">
                  Assign Users to Unit
                </Label>
              </div>

              {/* Assigned Users */}
              {assignedUsers.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm sm:text-base font-medium text-slate-700">
                    Currently Assigned ({assignedUsers.length})
                  </Label>
                  <div className="space-y-2.5 max-h-[30vh] sm:max-h-[40vh] overflow-y-auto p-3 sm:p-4 bg-blue-50/40 rounded-xl border border-blue-200/60">
                    {assignedUsers.map(({ user, role, assignment }) => (
                      <div 
                        key={assignment.userId} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 sm:p-4 rounded-lg border border-slate-200 shadow-sm gap-3"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0">
                            <AvatarImage src={user!.avatar || "/placeholder.svg"} alt={getUserDisplayName(user!)} />
                            <AvatarFallback className="text-xs sm:text-sm bg-blue-100 text-blue-800">
                              {getUserInitials(user!)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm sm:text-base font-medium truncate">
                              {getUserDisplayName(user!)}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {user!.email}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                          <Badge 
                            variant="outline" 
                            className="text-xs sm:text-sm px-2.5 py-0.5 border-blue-300 text-blue-700 bg-blue-50/50"
                          >
                            {role!.name}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveUser(assignment.userId)}
                            className="h-8 w-8 sm:h-9 sm:w-9 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full"
                          >
                            <X className="h-4 w-4 sm:h-5 sm:w-5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Users */}
              <div className="space-y-3">
                <Label className="text-sm sm:text-base font-medium text-slate-700">
                  Available Users ({unassignedUsers.length})
                </Label>
                <div className="max-h-[35vh] sm:max-h-[45vh] overflow-y-auto border border-slate-200 rounded-xl p-3 sm:p-4 bg-white/60 shadow-inner space-y-2.5">
                  {unassignedUsers.length === 0 ? (
                    <p className="text-sm sm:text-base text-slate-500 text-center py-8 sm:py-10 italic">
                      All users are already assigned to this unit.
                    </p>
                  ) : (
                    unassignedUsers.map((user) => (
                      <div 
                        key={user.id} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 hover:bg-slate-50 rounded-lg border border-slate-100 transition-colors gap-3"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0">
                            <AvatarImage src={user.avatar || "/placeholder.svg"} alt={getUserDisplayName(user)} />
                            <AvatarFallback className="text-xs sm:text-sm bg-slate-100 text-slate-700">
                              {getUserInitials(user)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm sm:text-base font-medium truncate">
                              {getUserDisplayName(user)}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {user.email} {user.department && `• ${user.department}`}
                            </p>
                          </div>
                        </div>

                        <Select onValueChange={(roleId) => handleUserAssignment(user.id, roleId)}>
                          <SelectTrigger className="w-full sm:w-44 h-9 sm:h-10 text-sm sm:text-base">
                            <SelectValue placeholder="Assign role" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[50vh]">
                            {availableRoles.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4 pt-5 sm:pt-6 border-t border-slate-200">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose} 
              disabled={loading}
              className="h-10 sm:h-11 px-6 sm:px-8 text-sm sm:text-base"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className={cn(
                "h-10 sm:h-11 px-6 sm:px-8 text-sm sm:text-base font-medium",
                "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800",
                "shadow-md hover:shadow-lg transition-all"
              )}
            >
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              {loading 
                ? "Saving..." 
                : isEditing 
                  ? "Update Unit" 
                  : "Create Unit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}