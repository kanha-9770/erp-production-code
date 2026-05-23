// // "use client"

// // import type React from "react"
// // import { useState, useEffect } from "react"
// // import { useRoles } from "@/context/role-context"
// // import { useToast } from "@/hooks/use-toast"
// // import type { Role, RoleFormData } from "@/types/role"
// // import { flattenRoles } from "@/lib/utils/organization-utils"
// // import {
// //   Dialog,
// //   DialogContent,
// //   DialogHeader,
// //   DialogTitle,
// // } from "@/components/ui/dialog"
// // import { Button } from "@/components/ui/button"
// // import { Input } from "@/components/ui/input"
// // import { Label } from "@/components/ui/label"
// // import { Textarea } from "@/components/ui/textarea"
// // import { Checkbox } from "@/components/ui/checkbox"
// // import {
// //   Select,
// //   SelectContent,
// //   SelectItem,
// //   SelectTrigger,
// //   SelectValue,
// // } from "@/components/ui/select"
// // import { Shield } from "lucide-react"

// // const EMPTY_FORM: RoleFormData = { name: "", description: "", shareDataWithPeers: false }

// // /** True when the modal is for creating (new root or new child), false when editing. */
// // function isCreating(role: Role | null): boolean {
// //   if (!role) return false
// //   return role.id === "new" || Object.prototype.hasOwnProperty.call(role, "parentId")
// // }

// // export function RoleFormModal() {
// //   const { state, dispatch, refreshData } = useRoles()
// //   const { toast } = useToast()
// //   const [formData, setFormData] = useState<RoleFormData>(EMPTY_FORM)
// //   const [loading, setLoading] = useState(false)

// //   const isOpen = state.selectedRole !== null
// //   const creating = isCreating(state.selectedRole)

// //   useEffect(() => {
// //     if (!state.selectedRole) return
// //     if (creating) {
// //       setFormData({ ...EMPTY_FORM, parentId: state.selectedRole.parentId })
// //     } else {
// //       setFormData({
// //         name: state.selectedRole.name,
// //         description: state.selectedRole.description,
// //         shareDataWithPeers: state.selectedRole.shareDataWithPeers,
// //       })
// //     }
// //   }, [state.selectedRole, creating])

// //   const handleClose = () => {
// //     dispatch({ type: "SELECT_ROLE", payload: { role: null } })
// //     setFormData(EMPTY_FORM)
// //   }

// //   const handleSubmit = async (e: React.FormEvent) => {
// //     e.preventDefault()
// //     if (!formData.name.trim()) {
// //       toast({ title: "Validation Error", description: "Role name is required", variant: "destructive" })
// //       return
// //     }

// //     setLoading(true)
// //     try {
// //       if (creating) {
// //         const response = await fetch(`/api/organizations/${state.organizationId}/roles`, {
// //           method: "POST",
// //           headers: { "Content-Type": "application/json" },
// //           body: JSON.stringify({ ...formData, parentId: state.selectedRole?.parentId }),
// //         })
// //         if (!response.ok) throw new Error("Failed to create role")
// //       } else if (state.selectedRole) {
// //         const response = await fetch(`/api/roles/${state.selectedRole.id}`, {
// //           method: "PUT",
// //           headers: { "Content-Type": "application/json" },
// //           body: JSON.stringify(formData),
// //         })
// //         if (!response.ok) throw new Error("Failed to update role")
// //       }

// //       await refreshData()
// //       handleClose()
// //       toast({ title: "Success", description: creating ? "Role created" : "Role updated" })
// //     } catch (error) {
// //       toast({
// //         title: "Error",
// //         description: (error as Error).message || "Failed to save role. Please try again.",
// //         variant: "destructive",
// //       })
// //     } finally {
// //       setLoading(false)
// //     }
// //   }

// //   const availableParents = flattenRoles(state.roles).filter(
// //     (role) => role.id !== state.selectedRole?.id
// //   )

// //   return (
// //     <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
// //       <DialogContent className="sm:max-w-[600px] z-[99999]">
// //         <DialogHeader>
// //           <DialogTitle className="flex items-center gap-2">
// //             <Shield className="h-5 w-5 text-purple-600" />
// //             {creating ? "Create New Role" : "Edit Role"}
// //           </DialogTitle>
// //         </DialogHeader>

// //         <form onSubmit={handleSubmit} className="space-y-6">
// //           <div className="space-y-2">
// //             <Label htmlFor="role-name">Role Name *</Label>
// //             <Input
// //               id="role-name"
// //               value={formData.name}
// //               onChange={(e) => setFormData({ ...formData, name: e.target.value })}
// //               placeholder="Enter role name (e.g., Senior Software Engineer)"
// //               required
// //               className="focus:ring-purple-500 focus:border-purple-500"
// //             />
// //           </div>

// //           {creating && (
// //             <div className="space-y-2">
// //               <Label htmlFor="role-parent">Reports To</Label>
// //               <Select
// //                 value={formData.parentId}
// //                 onValueChange={(value) => setFormData({ ...formData, parentId: value })}
// //               >
// //                 <SelectTrigger className="focus:ring-purple-500 focus:border-purple-500">
// //                   <SelectValue placeholder="Select parent role" />
// //                 </SelectTrigger>
// //                 <SelectContent>
// //                   {availableParents.map((role) => (
// //                     <SelectItem key={role.id} value={role.id}>
// //                       {"  ".repeat(role.level)} {role.name}
// //                     </SelectItem>
// //                   ))}
// //                 </SelectContent>
// //               </Select>
// //             </div>
// //           )}

// //           <div className="space-y-2">
// //             <Label htmlFor="role-description">Description</Label>
// //             <Textarea
// //               id="role-description"
// //               value={formData.description}
// //               onChange={(e) => setFormData({ ...formData, description: e.target.value })}
// //               placeholder="Enter role description and responsibilities"
// //               rows={3}
// //               className="focus:ring-purple-500 focus:border-purple-500"
// //             />
// //           </div>

// //           <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
// //             <Checkbox
// //               id="shareData"
// //               checked={formData.shareDataWithPeers}
// //               onCheckedChange={(checked) => setFormData({ ...formData, shareDataWithPeers: !!checked })}
// //               className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
// //             />
// //             <div>
// //               <Label htmlFor="shareData" className="text-sm font-medium text-blue-900">
// //                 Share Data with Peers
// //               </Label>
// //               <p className="text-xs text-blue-700">
// //                 Allow this role to share data with roles at the same hierarchical level
// //               </p>
// //             </div>
// //           </div>

// //           <div className="flex justify-end space-x-3 pt-4">
// //             <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
// //               Cancel
// //             </Button>
// //             <Button type="submit" className="bg-purple-600 hover:bg-purple-700" disabled={loading}>
// //               <Shield className="h-4 w-4 mr-2" />
// //               {loading ? "Saving..." : creating ? "Create Role" : "Update Role"}
// //             </Button>
// //           </div>
// //         </form>
// //       </DialogContent>
// //     </Dialog>
// //   )
// // }


// "use client"

// import type React from "react"
// import { useState, useEffect } from "react"
// import { useRoles } from "@/context/role-context"
// import { useToast } from "@/hooks/use-toast"
// import type { Role, RoleFormData } from "@/types/role"
// import { flattenRoles } from "@/lib/utils/organization-utils"
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
// import { Checkbox } from "@/components/ui/checkbox"
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select"
// import { Shield } from "lucide-react"
// import { cn } from "@/lib/utils"
// import { useCreateOrgRoleMutation, useUpdateRoleMutation } from "@/lib/api/organization"

// const EMPTY_FORM: RoleFormData = { name: "", description: "", shareDataWithPeers: false }

// /** True when the modal is for creating (new root or new child), false when editing. */
// function isCreating(role: Role | null): boolean {
//   if (!role) return false
//   return role.id === "new" || Object.prototype.hasOwnProperty.call(role, "parentId")
// }

// export function RoleFormModal() {
//   const { state, dispatch, refreshData } = useRoles()
//   const { toast } = useToast()
//   const [formData, setFormData] = useState<RoleFormData>(EMPTY_FORM)
//   const [loading, setLoading] = useState(false)
//   const [createOrgRole] = useCreateOrgRoleMutation()
//   const [updateRole] = useUpdateRoleMutation()

//   const isOpen = state.selectedRole !== null
//   const creating = isCreating(state.selectedRole)

//   useEffect(() => {
//     if (!state.selectedRole) return
//     if (creating) {
//       setFormData({ ...EMPTY_FORM, parentId: state.selectedRole.parentId })
//     } else {
//       setFormData({
//         name: state.selectedRole.name,
//         description: state.selectedRole.description,
//         shareDataWithPeers: state.selectedRole.shareDataWithPeers,
//       })
//     }
//   }, [state.selectedRole, creating])

//   const handleClose = () => {
//     dispatch({ type: "SELECT_ROLE", payload: { role: null } })
//     setFormData(EMPTY_FORM)
//   }

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     if (!formData.name.trim()) {
//       toast({ title: "Validation Error", description: "Role name is required", variant: "destructive" })
//       return
//     }

//     setLoading(true)
//     try {
//       if (creating) {
//         await createOrgRole({
//           organizationId: state.organizationId,
//           body: { ...formData, parentId: state.selectedRole?.parentId },
//         }).unwrap()
//       } else if (state.selectedRole) {
//         await updateRole({
//           roleId: state.selectedRole.id,
//           body: formData,
//         }).unwrap()
//       }

//       await refreshData()
//       handleClose()
//       toast({ title: "Success", description: creating ? "Role created" : "Role updated" })
//     } catch (error) {
//       toast({
//         title: "Error",
//         description: (error as Error).message || "Failed to save role. Please try again.",
//         variant: "destructive",
//       })
//     } finally {
//       setLoading(false)
//     }
//   }

//   const availableParents = flattenRoles(state.roles).filter(
//     (role) => role.id !== state.selectedRole?.id
//   )

//   return (
//     <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
//       <DialogContent 
//         className={cn(
//           "sm:max-w-[600px] max-h-[92vh] overflow-y-auto z-[99999]",
//           "p-4 sm:p-6",
//           "bg-gradient-to-b from-white to-slate-50/50",
//           "border border-slate-200 shadow-2xl rounded-xl sm:rounded-2xl"
//         )}
//       >
//         <DialogHeader className="mb-5 sm:mb-6">
//           <DialogTitle className="flex items-center gap-2.5 text-xl sm:text-2xl font-bold">
//             <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-purple-600 shadow-md">
//               <Shield className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5 text-white" />
//             </div>
//             {creating ? "Create New Role" : "Edit Role"}
//           </DialogTitle>
//         </DialogHeader>

//         <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
//           {/* Role Name */}
//           <div className="space-y-2">
//             <Label htmlFor="role-name" className="text-sm sm:text-base font-medium">
//               Role Name <span className="text-red-500">*</span>
//             </Label>
//             <Input
//               id="role-name"
//               value={formData.name}
//               onChange={(e) => setFormData({ ...formData, name: e.target.value })}
//               placeholder="e.g. Senior Software Engineer, Marketing Director"
//               required
//               className="h-10 sm:h-11 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
//             />
//           </div>

//           {/* Parent Role - only when creating */}
//           {creating && (
//             <div className="space-y-2">
//               <Label htmlFor="role-parent" className="text-sm sm:text-base font-medium">
//                 Reports To
//               </Label>
//               <Select
//                 value={formData.parentId || "none"}
//                 onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? "" : value })}
//               >
//                 <SelectTrigger className="h-10 sm:h-11 focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
//                   <SelectValue placeholder="Select parent role (optional)" />
//                 </SelectTrigger>
//                 <SelectContent className="max-h-[40vh]">
//                   <SelectItem value="none">— No parent (Top-level role) —</SelectItem>
//                   {availableParents.map((role) => (
//                     <SelectItem key={role.id} value={role.id}>
//                       {"  ".repeat(role.level)} {role.name}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
//           )}

//           {/* Description */}
//           <div className="space-y-2">
//             <Label htmlFor="role-description" className="text-sm sm:text-base font-medium">
//               Description
//             </Label>
//             <Textarea
//               id="role-description"
//               value={formData.description}
//               onChange={(e) => setFormData({ ...formData, description: e.target.value })}
//               placeholder="Describe the role's responsibilities, scope, and expectations..."
//               rows={4}
//               className="min-h-[90px] sm:min-h-[110px] focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-y transition-all"
//             />
//           </div>

//           {/* Share Data Checkbox */}
//           <div className={cn(
//             "flex items-start sm:items-center gap-3 p-4 sm:p-5",
//             "bg-gradient-to-r from-blue-50/80 to-indigo-50/60",
//             "rounded-xl border border-blue-200/70 shadow-sm"
//           )}>
//             <Checkbox
//               id="shareData"
//               checked={formData.shareDataWithPeers}
//               onCheckedChange={(checked) => setFormData({ ...formData, shareDataWithPeers: !!checked })}
//               className="mt-1 sm:mt-0 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 h-5 w-5 sm:h-6 sm:w-6"
//             />
//             <div className="space-y-1">
//               <Label 
//                 htmlFor="shareData" 
//                 className="text-sm sm:text-base font-semibold text-blue-900 leading-none cursor-pointer"
//               >
//                 Share Data with Peers
//               </Label>
//               <p className="text-xs sm:text-sm text-blue-700/90 leading-relaxed">
//                 Allow this role to view and collaborate on data with other roles at the same level in the hierarchy
//               </p>
//             </div>
//           </div>

//           {/* Action Buttons */}
//           <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4 pt-4 sm:pt-6 border-t border-slate-200">
//             <Button 
//               type="button" 
//               variant="outline" 
//               onClick={handleClose} 
//               disabled={loading}
//               className="h-10 sm:h-11 px-5 sm:px-6 text-sm sm:text-base"
//             >
//               Cancel
//             </Button>
//             <Button 
//               type="submit" 
//               disabled={loading}
//               className={cn(
//                 "h-10 sm:h-11 px-5 sm:px-7 text-sm sm:text-base font-medium",
//                 "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700",
//                 "shadow-md hover:shadow-lg transition-all"
//               )}
//             >
//               <Shield className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
//               {loading 
//                 ? "Saving..." 
//                 : creating 
//                   ? "Create Role" 
//                   : "Update Role"}
//             </Button>
//           </div>
//         </form>
//       </DialogContent>
//     </Dialog>
//   )
// }


"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { useRoles } from "@/context/role-context"
import { useToast } from "@/hooks/use-toast"
import { useGetUserQuery } from "@/lib/api/auth"
import type { Role, RoleFormData } from "@/types/role"
import { flattenRoles } from "@/lib/utils/organization-utils"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Shield, ShieldAlert, Building2, AlertCircle, CheckCircle2, GitBranch, ArrowUpFromLine } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCreateOrgRoleMutation, useInsertRoleBetweenMutation, useUpdateRoleMutation } from "@/lib/api/organization"

const EMPTY_FORM: RoleFormData = { name: "", description: "", shareDataWithPeers: false, isAdmin: false, parentId: "" }

/** 
 * Check if we are creating. 
 * If it has a real ID (not "new"), then we are EDITING.
 */
function isCreating(role: Role | null): boolean {
  if (!role) return false
  return role.id === "new" || !role.id
}

export function RoleFormModal() {
  const { state, dispatch, refreshData } = useRoles()
  const { toast } = useToast()
  
  const [formData, setFormData] = useState<RoleFormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  
  const [createOrgRole] = useCreateOrgRoleMutation()
  const [insertRoleBetween] = useInsertRoleBetweenMutation()
  const [updateRole] = useUpdateRoleMutation()

  const isOpen = state.selectedRole !== null
  const creating = isCreating(state.selectedRole)
  const isExistingAdmin = !creating && !!(state.selectedRole as any)?.isAdmin

  // "Insert between" mode — set by the tree node's "Insert Above" button.
  // The selected role carries:
  //   _insertBeforeId   — the existing child that will be pushed down a level
  //   _insertBeforeName — that child's name (for the banner)
  // In this mode the parent is fixed (it's whatever the child's parent was)
  // and the parent-picker is hidden.
  const insertBeforeId: string | undefined = (state.selectedRole as any)?._insertBeforeId
  const insertBeforeName: string | undefined = (state.selectedRole as any)?._insertBeforeName
  const isInsertBetween = creating && !!insertBeforeId

  // Look up the parent name once for the banner.
  const insertBetweenParentName = useMemo(() => {
    if (!isInsertBetween) return null
    const parentId = state.selectedRole?.parentId
    if (!parentId) return null
    return flattenRoles(state.roles).find((r) => r.id === parentId)?.name ?? null
  }, [isInsertBetween, state.selectedRole, state.roles])

  // Organization context — so the user always knows WHICH org the role lands in.
  // Role names are unique per organization, so showing this prevents the most
  // common confusion (especially when two orgs share a display name).
  const { data: userData } = useGetUserQuery()
  const organizationName = userData?.user?.organization?.name ?? "your organization"

  // Live, per-organization duplicate-name detection. This is the root cause of
  // most "role creation isn't working" reports: the DB enforces
  // unique(name, organizationId), so a repeated name is rejected. We surface
  // it instantly here, before the user ever clicks Save.
  const existingNames = useMemo(() => {
    const map = new Map<string, string>() // lowercased name -> original casing
    flattenRoles(state.roles)
      .filter((r) => r.id !== state.selectedRole?.id)
      .forEach((r) => map.set(r.name.trim().toLowerCase(), r.name))
    return map
  }, [state.roles, state.selectedRole])

  const trimmedName = formData.name.trim()
  const duplicateOf = trimmedName ? existingNames.get(trimmedName.toLowerCase()) : undefined
  const isDuplicate = !!duplicateOf && !isExistingAdmin

  // Human-readable summary of where this role sits in the hierarchy.
  const parentName = useMemo(() => {
    if (!formData.parentId) return null
    return flattenRoles(state.roles).find((r) => r.id === formData.parentId)?.name ?? null
  }, [formData.parentId, state.roles])

  // Synchronize form when selectedRole changes
  useEffect(() => {
    if (!state.selectedRole) return
    
    if (creating) {
      setFormData({
        ...EMPTY_FORM,
        parentId: state.selectedRole.parentId || ""
      })
    } else {
      // EDIT MODE: Populate all existing values
      setFormData({
        name: state.selectedRole.name || "",
        description: state.selectedRole.description || "",
        shareDataWithPeers: !!state.selectedRole.shareDataWithPeers,
        isAdmin: !!(state.selectedRole as any).isAdmin,
        parentId: state.selectedRole.parentId || ""
      })
    }
  }, [state.selectedRole, creating])

  const handleClose = () => {
    dispatch({ type: "SELECT_ROLE", payload: { role: null } })
    setFormData(EMPTY_FORM)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast({ title: "Validation Error", description: "Role name is required", variant: "destructive" })
      return
    }

    if (isDuplicate) {
      toast({
        title: "Name already in use",
        description: `A role named "${duplicateOf}" already exists in ${organizationName}. Please choose a different name.`,
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      // CRITICAL FIX: Convert empty parentId strings to null 
      // Databases will often reject "" for a UUID field.
      const cleanParentId = !formData.parentId || formData.parentId === "none" || formData.parentId === "" 
        ? null 
        : formData.parentId;

      const payload = {
        name: formData.name.trim(),
        description: formData.description || "",
        shareDataWithPeers: !!formData.shareDataWithPeers,
        isAdmin: !!formData.isAdmin,
        parentId: cleanParentId,
      }

      if (creating) {
        // Guard: a missing organization id would POST to /organizations/null/roles
        // and fail server-side with a confusing 404. Fail fast with a clear message.
        if (!state.organizationId) {
          throw new Error("No organization selected. Please reload the page and try again.")
        }

        if (isInsertBetween && insertBeforeId) {
          // Atomic "insert between" — server creates the new role and re-parents
          // the child + descendants inside a single transaction.
          await insertRoleBetween({
            organizationId: state.organizationId,
            body: {
              childRoleId: insertBeforeId,
              name: payload.name,
              description: payload.description,
              shareDataWithPeers: payload.shareDataWithPeers,
              isAdmin: payload.isAdmin,
            },
          }).unwrap()
          toast({
            title: "Role inserted",
            description: `"${payload.name}" was inserted above "${insertBeforeName ?? "the selected role"}".`,
          })
        } else {
          // Create new role at the chosen position in the tree.
          await createOrgRole({
            organizationId: state.organizationId,
            body: payload,
          }).unwrap()
          toast({ title: "Success", description: "New role created successfully" })
        }
      } else {
        // Update existing role
        const roleId = state.selectedRole?.id;
        if (!roleId) throw new Error("No Role ID found for update");

        await updateRole({
          roleId: roleId,
          body: payload, // Sending the cleaned payload
        }).unwrap()
        
        toast({ title: "Success", description: "Role updated successfully" })
      }

      // Refresh data to show changes in the hierarchy sheet
      await refreshData()
      handleClose()
    } catch (error: any) {
      console.error("Save Role Error:", error)
      toast({
        title: "Action Failed",
        description:
          error?.data?.error ||
          error?.data?.message ||
          error?.error ||
          error?.message ||
          "Something went wrong while saving.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Prevent circular hierarchy by hiding the current role from its own "Reports To" list
  const availableParents = flattenRoles(state.roles).filter(
    (role) => role.id !== state.selectedRole?.id
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent 
        className={cn(
          "sm:max-w-[600px] max-h-[92vh] overflow-y-auto z-[99999]",
          "p-4 sm:p-6 bg-white border border-slate-200 shadow-2xl rounded-xl sm:rounded-2xl"
        )}
      >
        <DialogHeader className="mb-6 space-y-3">
          <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg",
              isInsertBetween
                ? "bg-gradient-to-br from-indigo-600 to-blue-600 shadow-indigo-600/25"
                : "bg-gradient-to-br from-purple-600 to-indigo-600 shadow-purple-600/25"
            )}>
              {isInsertBetween ? <ArrowUpFromLine className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
            </div>
            <div className="flex flex-col">
              <span className="leading-tight">
                {isInsertBetween ? "Insert Role Between" : creating ? "Create New Role" : "Edit Role"}
              </span>
              <span className="text-xs font-normal text-slate-400">
                {isInsertBetween
                  ? "Slot a new role between an existing parent and child"
                  : creating
                    ? "Add a role to your organization hierarchy"
                    : "Update this role's details"}
              </span>
            </div>
          </DialogTitle>

          {/* Insert-between context banner: shows EXACTLY where the new role
              will land in the tree so the user can verify before submitting. */}
          {isInsertBetween && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                Tree change preview
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-md bg-white border border-indigo-200 px-2.5 py-1 font-medium text-slate-700">
                  {insertBetweenParentName ?? "Top level"}
                </span>
                <ArrowUpFromLine className="h-3.5 w-3.5 text-indigo-500 rotate-90" />
                <span className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white shadow-sm">
                  {formData.name.trim() || "New role"}
                </span>
                <ArrowUpFromLine className="h-3.5 w-3.5 text-indigo-500 rotate-90" />
                <span className="rounded-md bg-white border border-indigo-200 px-2.5 py-1 font-medium text-slate-700">
                  {insertBeforeName ?? "Selected role"}
                </span>
              </div>
              <p className="text-xs text-indigo-700/80">
                <span className="font-semibold">&ldquo;{insertBeforeName}&rdquo;</span> and everything beneath it will move down one level.
              </p>
            </div>
          )}

          {/* Organization context — role names are unique per organization */}
          <div className="flex items-center gap-2 rounded-lg border border-purple-100 bg-purple-50/60 px-3 py-2">
            <Building2 className="h-4 w-4 flex-shrink-0 text-purple-600" />
            <span className="text-xs text-slate-600">
              In <span className="font-semibold text-purple-700">{organizationName}</span>
            </span>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="role-name" className="text-base font-medium">Role Name *</Label>
            <div className="relative">
              <Input
                id="role-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Sales Manager"
                required
                disabled={loading || isExistingAdmin}
                aria-invalid={isDuplicate}
                className={cn(
                  "h-11 pr-10 transition-colors",
                  isDuplicate
                    ? "border-red-400 focus:ring-2 focus:ring-red-400"
                    : trimmedName && !isExistingAdmin
                      ? "border-emerald-400 focus:ring-2 focus:ring-emerald-400"
                      : "focus:ring-2 focus:ring-purple-500"
                )}
              />
              {trimmedName && !isExistingAdmin && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isDuplicate ? (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  )}
                </span>
              )}
            </div>
            {isDuplicate ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                A role named &ldquo;{duplicateOf}&rdquo; already exists in {organizationName}. Names must be unique per organization.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Must be unique within {organizationName}.
              </p>
            )}
          </div>

          {/* Parent picker hidden when inserting between: the parent is fixed
              to the existing child's current parent, so letting the user
              change it here would silently break the "insert between" intent. */}
          {!isInsertBetween && (
            <div className="space-y-2">
              <Label htmlFor="role-parent" className="text-base font-medium">Reports To</Label>
              <Select
                disabled={loading || isExistingAdmin}
                value={formData.parentId || "none"}
                onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? "" : value })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select parent role" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="none">— No parent (Top-level) —</SelectItem>
                  {availableParents.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {"  ".repeat(role.level)} {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <GitBranch className="h-3.5 w-3.5 flex-shrink-0" />
                {parentName ? <>Reports to <span className="font-medium text-slate-600">{parentName}</span></> : "Top-level role (reports to no one)"}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="role-description" className="text-base font-medium">Description</Label>
            <Textarea
              id="role-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Responsibilities of this role..."
              rows={4}
              disabled={loading || isExistingAdmin}
              className="resize-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <Checkbox
              id="shareData"
              checked={formData.shareDataWithPeers}
              disabled={loading || isExistingAdmin}
              onCheckedChange={(checked) => setFormData({ ...formData, shareDataWithPeers: !!checked })}
              className="h-5 w-5 data-[state=checked]:bg-purple-600"
            />
            <div className="space-y-1">
              <Label htmlFor="shareData" className="text-sm font-bold text-slate-900 leading-none">
                Share Data with Peers
              </Label>
              <p className="text-xs text-slate-500">
                Allows visibility of data between roles at the same hierarchical level.
              </p>
            </div>
          </div>

          {/* Admin promotion is disallowed when inserting between — a brand-new
              middle role gaining super-admin powers would be a footgun. */}
          {!isInsertBetween && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
              <Checkbox
                id="isAdmin"
                checked={formData.isAdmin}
                disabled={loading || isExistingAdmin}
                onCheckedChange={(checked) => setFormData({ ...formData, isAdmin: !!checked })}
                className="h-5 w-5 data-[state=checked]:bg-amber-600"
              />
              <div className="space-y-1">
                <Label htmlFor="isAdmin" className="text-sm font-bold text-amber-900 leading-none cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    Admin Role
                  </span>
                </Label>
                <p className="text-xs text-amber-700/90">
                  Grant full administrative privileges. Admin roles cannot be edited or deleted once created.
                </p>
              </div>
            </div>
          )}

          {isExistingAdmin && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 flex-shrink-0" />
              <span>This is a protected admin role. Name, admin status, and sharing settings cannot be modified.</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose} 
              disabled={loading}
              className="h-11 px-6"
            >
              Cancel
            </Button>
            {!isExistingAdmin && (
              <Button
                type="submit"
                disabled={loading || isDuplicate || !trimmedName}
                className={cn(
                  "h-11 px-8 text-white font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all",
                  isInsertBetween
                    ? "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-indigo-600/25"
                    : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-600/25"
                )}
              >
                {loading ? (
                   <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {isInsertBetween ? "Inserting..." : "Saving..."}
                   </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {isInsertBetween ? <ArrowUpFromLine className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                    {isInsertBetween ? "Insert Role" : creating ? "Create Role" : "Update Role"}
                  </div>
                )}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}