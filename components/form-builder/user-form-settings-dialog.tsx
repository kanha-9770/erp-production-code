import { Badge } from "@/components/ui/badge"
import { Users, Database, AlertTriangle, UserCheck, Share2 } from "lucide-react"
import type { Form } from "@/types/form-builder"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useCheckEmployeeFormQuery, usePatchFormSettingsMutation } from "@/lib/api/forms"
import { useToast } from "@/hooks/use-toast"
import { HYBRID_FORMS_ENABLED } from "@/lib/feature-flags"

interface UserFormSettingsDialogProps {
  form: Form | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (isUserForm: boolean, isEmployeeForm: boolean) => Promise<void>
}

export default function UserFormSettingsDialog({
  form,
  open,
  onOpenChange,
  onUpdate,
}: UserFormSettingsDialogProps) {
  const { toast } = useToast()
  const [isUserForm, setIsUserForm] = useState(false)
  const [isEmployeeForm, setIsEmployeeForm] = useState(false)
  // Hierarchical record inheritance toggle. Default true (sharing on)
  // matches the server-side default, so a missing settings key shows
  // the switch as enabled out-of-the-box.
  const [inheritsToAncestors, setInheritsToAncestors] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  // Sync local state when form changes or dialog opens
  useEffect(() => {
    if (form && open) {
      setIsUserForm(form.isUserForm || false)
      setIsEmployeeForm(form.isEmployeeForm || false)
      const settingsInherits = (form.settings as any)?.inheritsToAncestors
      setInheritsToAncestors(settingsInherits !== false)
    }
  }, [form, open])

  // Check if another employee form already exists in the org (exclude current form)
  const { data: employeeCheck, isLoading: isCheckingEmployee } = useCheckEmployeeFormQuery(
    form?.id,
    { skip: !open || !form?.id, refetchOnMountOrArgChange: true }
  )

  const [patchFormSettings] = usePatchFormSettingsMutation()

  // Another employee form exists in the org => this form's toggle is locked
  const employeeFormTaken = employeeCheck?.exists === true

  const handleSave = async () => {
    if (!form) return
    setIsUpdating(true)

    try {
      const result = await patchFormSettings({
        formId: form.id,
        isUserForm,
        isEmployeeForm,
        inheritsToAncestors,
      }).unwrap()

      if (result.success) {
        // Also notify the parent so the builder UI updates
        await onUpdate(isUserForm, isEmployeeForm)
        onOpenChange(false)
        toast({
          title: "Success",
          description: isUserForm
            ? "Form marked as user form"
            : isEmployeeForm
              ? "Form marked as employee form"
              : "Form set to regular form",
        })
      } else {
        throw new Error(result.error || "Failed to update")
      }
    } catch (error: any) {
      // Reset toggles back to server state
      setIsUserForm(form.isUserForm || false)
      setIsEmployeeForm(form.isEmployeeForm || false)
      setInheritsToAncestors(((form.settings as any)?.inheritsToAncestors) !== false)
      toast({
        title: "Error",
        description: error?.data?.error || error?.message || "Failed to update form settings",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && form) {
      setIsUserForm(form.isUserForm || false)
      setIsEmployeeForm(form.isEmployeeForm || false)
      setInheritsToAncestors(((form.settings as any)?.inheritsToAncestors) !== false)
    }
    onOpenChange(newOpen)
  }

  const handleUserFormChange = (checked: boolean) => {
    setIsUserForm(checked)
    if (checked) setIsEmployeeForm(false)
  }

  const handleEmployeeFormChange = (checked: boolean) => {
    setIsEmployeeForm(checked)
    if (checked) setIsUserForm(false)
  }

  if (!form) return null

  const hasRecords = form.recordCount && form.recordCount > 0
  const serverInherits = ((form.settings as any)?.inheritsToAncestors) !== false
  const hasChanges =
    form.isUserForm !== isUserForm ||
    form.isEmployeeForm !== isEmployeeForm ||
    serverInherits !== inheritsToAncestors

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Form Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Status */}
          <div className="flex items-center space-x-4">
            <Label className="text-sm font-medium">Current Status</Label>
            <div className="flex items-center gap-2">
              {form.isUserForm ? (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200 h-5 w-full px-4">
                  <Users className="w-3 h-3 mr-1" />
                  User Form
                </Badge>
              ) : form.isEmployeeForm ? (
                <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 h-5 w-full px-4">
                  <UserCheck className="w-3 h-3 mr-1" />
                  Employee Form
                </Badge>
              ) : (
                <Badge variant="outline" className="h-5 w-max px-4">
                  <Database className="w-3 h-3 mr-1" />
                  Regular Form
                </Badge>
              )}
            </div>
          </div>

          {/* Form Type Toggles */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Form Type</Label>
            <div className="space-y-2">
              {/* User Form Toggle */}
              <div className="flex items-center justify-between p-2 border rounded-lg">
                <div className="space-y-1">
                  <div className="font-medium text-sm">User Form</div>
                  <div className="text-xs text-muted-foreground">
                    Designate this form for user-specific data collection
                  </div>
                </div>
                <Switch
                  id="user-form-toggle"
                  checked={isUserForm}
                  onCheckedChange={handleUserFormChange}
                  disabled={isUpdating}
                />
              </div>

              {/* Employee Form Toggle — only when hybrid Employee-form mode is on. */}
              {HYBRID_FORMS_ENABLED && (
                <div className={`flex items-center justify-between p-2 border rounded-lg ${employeeFormTaken ? "bg-muted/50 border-dashed" : ""}`}>
                  <div className="space-y-1">
                    <div className={`font-medium text-sm ${employeeFormTaken ? "text-muted-foreground" : ""}`}>
                      Employee Form
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {employeeFormTaken
                        ? `"${employeeCheck?.formName}" is already designated as the employee form in your organization. Only one employee form is allowed per organization.`
                        : "Designate this form for employee-specific data collection"
                      }
                    </div>
                  </div>
                  <Switch
                    id="employee-form-toggle"
                    checked={employeeFormTaken ? false : isEmployeeForm}
                    onCheckedChange={handleEmployeeFormChange}
                    disabled={employeeFormTaken || isUpdating || isCheckingEmployee}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Hierarchical record inheritance */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Share2 className="h-3.5 w-3.5" />
              Sharing & Inheritance
            </Label>
            <div className="flex items-center justify-between p-2 border rounded-lg">
              <div className="space-y-1 pr-4">
                <div className="font-medium text-sm">Share submissions with parent roles</div>
                <div className="text-xs text-muted-foreground">
                  When enabled, every role above the submitter in the
                  organization hierarchy can view their records (limited to
                  users in the same organization unit). Disable this to keep
                  records private to each submitter.
                </div>
              </div>
              <Switch
                id="inherits-to-ancestors-toggle"
                checked={inheritsToAncestors}
                onCheckedChange={setInheritsToAncestors}
                disabled={isUpdating}
              />
            </div>
          </div>

          {/* Warning for existing records */}
          {hasRecords && hasChanges && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>Important:</strong> This form has {form.recordCount} existing record(s).
                Changing the form type will affect where new submissions are stored, but existing
                records will remain in their current location.
              </AlertDescription>
            </Alert>
          )}

          {/* Benefits of Special Forms */}
          {(isUserForm || isEmployeeForm) && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {isUserForm ? "User Form Benefits" : "Employee Form Benefits"}
              </Label>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• Dedicated storage table for better performance</li>
                <li>• Optimized for {isUserForm ? "user" : "employee"}-specific data collection</li>
                <li>• Enhanced data organization and management</li>
                <li>• Specialized handling for {isUserForm ? "user" : "employee"}-related workflows</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isUpdating || !hasChanges}
          >
            {isUpdating ? "Updating..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
