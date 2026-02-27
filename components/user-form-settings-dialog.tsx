import { Badge } from "@/components/ui/badge"
import { Users, Database, Info, AlertTriangle, UserCheck } from "lucide-react"
import type { Form } from "@/types/form-builder"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

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
  const [isUserForm, setIsUserForm] = useState(form?.isUserForm || false)
  const [isEmployeeForm, setIsEmployeeForm] = useState(form?.isEmployeeForm || false)
  const [isUpdating, setIsUpdating] = useState(false)

  const handleSave = async () => {
    if (!form) return

    setIsUpdating(true)
    try {
      await onUpdate(isUserForm, isEmployeeForm)
      onOpenChange(false)
    } catch (error) {
      console.error("Error updating form settings:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset to current form state when closing
      setIsUserForm(form?.isUserForm || false)
      setIsEmployeeForm(form?.isEmployeeForm || false)
    }
    onOpenChange(newOpen)
  }

  const handleUserFormChange = (checked: boolean) => {
    setIsUserForm(checked)
    if (checked) {
      setIsEmployeeForm(false) // Can't be both user and employee form
    }
  }

  const handleEmployeeFormChange = (checked: boolean) => {
    setIsEmployeeForm(checked)
    if (checked) {
      setIsUserForm(false) // Can't be both user and employee form
    }
  }

  if (!form) return null

  const hasRecords = form.recordCount && form.recordCount > 0
  const currentStorageInfo = form.isUserForm
    ? "This form stores data in the dedicated user forms table (form_records_15)"
    : form.isEmployeeForm
      ? "This form stores data in the dedicated employee forms table (form_records_14)"
      : "This form stores data in the general forms tables (form_records_1-13)"

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

          {/* Form Type Toggle */}
          <div className="space-y-2">
            <Label htmlFor="user-form-toggle" className="text-sm font-medium">
              Form Type
            </Label>
            <div className="space-y-2">
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

              <div className="flex items-center justify-between p-2 border rounded-lg">
                <div className="space-y-1">
                  <div className="font-medium text-sm">Employee Form</div>
                  <div className="text-xs text-muted-foreground">
                    Designate this form for employee-specific data collection
                  </div>
                </div>
                <Switch
                  id="employee-form-toggle"
                  checked={isEmployeeForm}
                  onCheckedChange={handleEmployeeFormChange}
                  disabled={isUpdating}
                />
              </div>
            </div>
          </div>


          {/* Warning for existing records */}
          {hasRecords && (form.isUserForm !== isUserForm || form.isEmployeeForm !== isEmployeeForm) && (
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
            disabled={isUpdating || (form.isUserForm === isUserForm && form.isEmployeeForm === isEmployeeForm)}
          >
            {isUpdating ? "Updating..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}