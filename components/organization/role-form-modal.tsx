// "use client"

// import type React from "react"
// import { useState, useEffect } from "react"
// import { useRoles } from "@/context/role-context"
// import { useToast } from "@/hooks/use-toast"
// import type { Role, RoleFormData } from "@/types/role"
// import { flattenRoles } from "@/lib/organization-utils"
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
//         const response = await fetch(`/api/organizations/${state.organizationId}/roles`, {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ ...formData, parentId: state.selectedRole?.parentId }),
//         })
//         if (!response.ok) throw new Error("Failed to create role")
//       } else if (state.selectedRole) {
//         const response = await fetch(`/api/roles/${state.selectedRole.id}`, {
//           method: "PUT",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify(formData),
//         })
//         if (!response.ok) throw new Error("Failed to update role")
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
//       <DialogContent className="sm:max-w-[600px] z-[99999]">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <Shield className="h-5 w-5 text-purple-600" />
//             {creating ? "Create New Role" : "Edit Role"}
//           </DialogTitle>
//         </DialogHeader>

//         <form onSubmit={handleSubmit} className="space-y-6">
//           <div className="space-y-2">
//             <Label htmlFor="role-name">Role Name *</Label>
//             <Input
//               id="role-name"
//               value={formData.name}
//               onChange={(e) => setFormData({ ...formData, name: e.target.value })}
//               placeholder="Enter role name (e.g., Senior Software Engineer)"
//               required
//               className="focus:ring-purple-500 focus:border-purple-500"
//             />
//           </div>

//           {creating && (
//             <div className="space-y-2">
//               <Label htmlFor="role-parent">Reports To</Label>
//               <Select
//                 value={formData.parentId}
//                 onValueChange={(value) => setFormData({ ...formData, parentId: value })}
//               >
//                 <SelectTrigger className="focus:ring-purple-500 focus:border-purple-500">
//                   <SelectValue placeholder="Select parent role" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   {availableParents.map((role) => (
//                     <SelectItem key={role.id} value={role.id}>
//                       {"  ".repeat(role.level)} {role.name}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
//           )}

//           <div className="space-y-2">
//             <Label htmlFor="role-description">Description</Label>
//             <Textarea
//               id="role-description"
//               value={formData.description}
//               onChange={(e) => setFormData({ ...formData, description: e.target.value })}
//               placeholder="Enter role description and responsibilities"
//               rows={3}
//               className="focus:ring-purple-500 focus:border-purple-500"
//             />
//           </div>

//           <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
//             <Checkbox
//               id="shareData"
//               checked={formData.shareDataWithPeers}
//               onCheckedChange={(checked) => setFormData({ ...formData, shareDataWithPeers: !!checked })}
//               className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
//             />
//             <div>
//               <Label htmlFor="shareData" className="text-sm font-medium text-blue-900">
//                 Share Data with Peers
//               </Label>
//               <p className="text-xs text-blue-700">
//                 Allow this role to share data with roles at the same hierarchical level
//               </p>
//             </div>
//           </div>

//           <div className="flex justify-end space-x-3 pt-4">
//             <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
//               Cancel
//             </Button>
//             <Button type="submit" className="bg-purple-600 hover:bg-purple-700" disabled={loading}>
//               <Shield className="h-4 w-4 mr-2" />
//               {loading ? "Saving..." : creating ? "Create Role" : "Update Role"}
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
import type { Role, RoleFormData } from "@/types/role"
import { flattenRoles } from "@/lib/organization-utils"
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
import { Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCreateOrgRoleMutation, useUpdateRoleMutation } from "@/lib/api/organization"

const EMPTY_FORM: RoleFormData = { name: "", description: "", shareDataWithPeers: false }

/** True when the modal is for creating (new root or new child), false when editing. */
function isCreating(role: Role | null): boolean {
  if (!role) return false
  return role.id === "new" || Object.prototype.hasOwnProperty.call(role, "parentId")
}

export function RoleFormModal() {
  const { state, dispatch, refreshData } = useRoles()
  const { toast } = useToast()
  const [formData, setFormData] = useState<RoleFormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [createOrgRole] = useCreateOrgRoleMutation()
  const [updateRole] = useUpdateRoleMutation()

  const isOpen = state.selectedRole !== null
  const creating = isCreating(state.selectedRole)

  useEffect(() => {
    if (!state.selectedRole) return
    if (creating) {
      setFormData({ ...EMPTY_FORM, parentId: state.selectedRole.parentId })
    } else {
      setFormData({
        name: state.selectedRole.name,
        description: state.selectedRole.description,
        shareDataWithPeers: state.selectedRole.shareDataWithPeers,
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

    setLoading(true)
    try {
      if (creating) {
        await createOrgRole({
          organizationId: state.organizationId,
          body: { ...formData, parentId: state.selectedRole?.parentId },
        }).unwrap()
      } else if (state.selectedRole) {
        await updateRole({
          roleId: state.selectedRole.id,
          body: formData,
        }).unwrap()
      }

      await refreshData()
      handleClose()
      toast({ title: "Success", description: creating ? "Role created" : "Role updated" })
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to save role. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const availableParents = flattenRoles(state.roles).filter(
    (role) => role.id !== state.selectedRole?.id
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent 
        className={cn(
          "sm:max-w-[600px] max-h-[92vh] overflow-y-auto z-[99999]",
          "p-4 sm:p-6",
          "bg-gradient-to-b from-white to-slate-50/50",
          "border border-slate-200 shadow-2xl rounded-xl sm:rounded-2xl"
        )}
      >
        <DialogHeader className="mb-5 sm:mb-6">
          <DialogTitle className="flex items-center gap-2.5 text-xl sm:text-2xl font-bold">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-purple-600 shadow-md">
              <Shield className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5 text-white" />
            </div>
            {creating ? "Create New Role" : "Edit Role"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
          {/* Role Name */}
          <div className="space-y-2">
            <Label htmlFor="role-name" className="text-sm sm:text-base font-medium">
              Role Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="role-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Senior Software Engineer, Marketing Director"
              required
              className="h-10 sm:h-11 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
            />
          </div>

          {/* Parent Role - only when creating */}
          {creating && (
            <div className="space-y-2">
              <Label htmlFor="role-parent" className="text-sm sm:text-base font-medium">
                Reports To
              </Label>
              <Select
                value={formData.parentId || "none"}
                onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? "" : value })}
              >
                <SelectTrigger className="h-10 sm:h-11 focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
                  <SelectValue placeholder="Select parent role (optional)" />
                </SelectTrigger>
                <SelectContent className="max-h-[40vh]">
                  <SelectItem value="none">— No parent (Top-level role) —</SelectItem>
                  {availableParents.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {"  ".repeat(role.level)} {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="role-description" className="text-sm sm:text-base font-medium">
              Description
            </Label>
            <Textarea
              id="role-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the role's responsibilities, scope, and expectations..."
              rows={4}
              className="min-h-[90px] sm:min-h-[110px] focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-y transition-all"
            />
          </div>

          {/* Share Data Checkbox */}
          <div className={cn(
            "flex items-start sm:items-center gap-3 p-4 sm:p-5",
            "bg-gradient-to-r from-blue-50/80 to-indigo-50/60",
            "rounded-xl border border-blue-200/70 shadow-sm"
          )}>
            <Checkbox
              id="shareData"
              checked={formData.shareDataWithPeers}
              onCheckedChange={(checked) => setFormData({ ...formData, shareDataWithPeers: !!checked })}
              className="mt-1 sm:mt-0 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 h-5 w-5 sm:h-6 sm:w-6"
            />
            <div className="space-y-1">
              <Label 
                htmlFor="shareData" 
                className="text-sm sm:text-base font-semibold text-blue-900 leading-none cursor-pointer"
              >
                Share Data with Peers
              </Label>
              <p className="text-xs sm:text-sm text-blue-700/90 leading-relaxed">
                Allow this role to view and collaborate on data with other roles at the same level in the hierarchy
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4 pt-4 sm:pt-6 border-t border-slate-200">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose} 
              disabled={loading}
              className="h-10 sm:h-11 px-5 sm:px-6 text-sm sm:text-base"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className={cn(
                "h-10 sm:h-11 px-5 sm:px-7 text-sm sm:text-base font-medium",
                "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700",
                "shadow-md hover:shadow-lg transition-all"
              )}
            >
              <Shield className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              {loading 
                ? "Saving..." 
                : creating 
                  ? "Create Role" 
                  : "Update Role"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}