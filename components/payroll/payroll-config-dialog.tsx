"use client"
import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Settings, Loader2, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
interface Form {
  id: string
  name: string
  description: string | null
  module: {
    name: string
  }
}
interface FormField {
  id: string
  label: string
  type: string
}
interface PayrollFieldMapping {
  employeeIdField?: string
  dateField?: string
  overtimeField?: string
  checkInField?: string
  checkOutField?: string
  typeField?: string // Generic "type" instead of "leaveType"
  durationField?: string
  startDateField?: string
  endDateField?: string
}
interface PayrollConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfigSaved: () => void
}
export function PayrollConfigDialog({ open, onOpenChange, onConfigSaved }: PayrollConfigDialogProps) {
  const [step, setStep] = useState(1)
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedFormIds, setSelectedFormIds] = useState<string[]>([])
  const [fieldMappings, setFieldMappings] = useState<PayrollFieldMapping>({})
  const [formFields, setFormFields] = useState<Record<string, FormField[]>>({})
  const [loadingFields, setLoadingFields] = useState(false)
  useEffect(() => {
    if (open) {
      fetchForms()
      setStep(1)
      setSelectedFormIds([])
      setFieldMappings({})
      setFormFields({})
    }
  }, [open])
  const fetchForms = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/payroll/forms")
      const data = await response.json()
      if (data.success) {
        setForms(data.forms)
      } else {
        toast.error("Failed to load forms")
      }
    } catch (error) {
      toast.error("Failed to load forms")
    } finally {
      setLoading(false)
    }
  }
  const fetchFormFields = async (formId: string) => {
    if (formFields[formId]) return
    try {
      const response = await fetch(`/api/payroll/form-fields?formId=${formId}`)
      const data = await response.json()
      if (data.success) {
        setFormFields((prev) => ({ ...prev, [formId]: data.fields }))
      } else {
        toast.error(`Failed to load fields for form`)
      }
    } catch (error) {
      toast.error("Failed to load form fields")
    }
  }
  const handleFormToggle = (formId: string) => {
    setSelectedFormIds((prev) => {
      const newIds = prev.includes(formId) ? prev.filter((id) => id !== formId) : [...prev, formId]
      return newIds
    })
  }
  const updateFieldMapping = (field: keyof PayrollFieldMapping, value: string) => {
    setFieldMappings((prev) => ({
      ...prev,
      [field]: value === "none" ? undefined : value,
    }))
  }
  const getCombinedFields = (filterFn: (field: FormField) => boolean = () => true) => {
    const combined: { value: string; label: string }[] = []
    selectedFormIds.forEach((formId) => {
      const formFieldsList = formFields[formId] || []
      const form = forms.find((f) => f.id === formId)
      formFieldsList
        .filter(filterFn)
        .forEach((field) => {
          combined.push({
            value: `${formId}-${field.id}`,
            label: `${form?.name || 'Unknown'} - ${field.label} (${field.type})`,
          })
        })
    })
    return combined
  }
  const handleNextStep = async () => {
    if (step === 1) {
      if (selectedFormIds.length === 0) {
        toast.error("Please select at least one form")
        return
      }
      // Load fields for all selected forms
      setLoadingFields(true)
      try {
        await Promise.all(selectedFormIds.map((formId) => fetchFormFields(formId)))
        setFieldMappings({})
        setStep(2)
      } catch (error) {
        toast.error("Failed to load form fields")
      } finally {
        setLoadingFields(false)
      }
    }
  }
  const handlePreviousStep = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }
  const validateFieldMappings = () => {
    if (!fieldMappings.employeeIdField || !fieldMappings.dateField) {
      toast.error(`Please map required fields (Employee ID and Date)`)
      return false
    }
    return true
  }
  const handleSave = async () => {
    if (!validateFieldMappings()) {
      return
    }
    setSaving(true)
    try {
      const response = await fetch("/api/payroll/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formIds: selectedFormIds,
          fieldMappings,
        }),
      })
      const data = await response.json()
      if (data.success) {
        toast.success("Payroll configuration saved successfully!")
        onConfigSaved()
        onOpenChange(false)
      } else {
        toast.error(data.error || "Failed to save configuration")
      }
    } catch (error) {
      toast.error("Failed to save configuration")
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Payroll Configuration - Step {step} of 2
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Select forms that contain employee payroll data"
              : "Map form fields to payroll calculation requirements"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-2 px-6 py-3 border-b shrink-0">
          <div className={`flex items-center gap-2 ${step >= 1 ? "text-primary" : "text-muted-foreground"}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-medium ${step >= 1 ? "border-primary bg-primary text-primary-foreground" : "border-muted"
                }`}
            >
              {step > 1 ? <CheckCircle2 className="h-4 w-4" /> : "1"}
            </div>
            <span className="text-sm font-medium">Select Forms</span>
          </div>
          <div className="w-12 h-0.5 bg-border" />
          <div className={`flex items-center gap-2 ${step >= 2 ? "text-primary" : "text-muted-foreground"}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-medium ${step >= 2 ? "border-primary bg-primary text-primary-foreground" : "border-muted"
                }`}
            >
              2
            </div>
            <span className="text-sm font-medium">Map Fields</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Select Forms</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose all forms that contain employee data needed for payroll processing
                  </p>
                  <div className="rounded-md border p-4 space-y-3">
                    {forms.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No forms available</p>
                    ) : (
                      forms.map((form) => (
                        <div key={form.id} className="flex items-start space-x-3">
                          <Checkbox
                            id={`form-${form.id}`}
                            checked={selectedFormIds.includes(form.id)}
                            onCheckedChange={() => handleFormToggle(form.id)}
                            className="mt-0.5"
                          />
                          <div className="grid gap-1 leading-none flex-1">
                            <label
                              htmlFor={`form-${form.id}`}
                              className="text-sm font-medium leading-none cursor-pointer"
                            >
                              {form.name}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {form.module.name}
                              {form.description && ` • ${form.description}`}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {selectedFormIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <Badge variant="secondary" className="mr-2">
                        {selectedFormIds.length}
                      </Badge>
                      form(s) selected
                    </p>
                  )}
                </div>
              )}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="p-4 border rounded-lg space-y-4 bg-card">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">Combined Forms Configuration</h4>
                        <p className="text-sm text-muted-foreground">
                          Selected forms: {selectedFormIds
                            .map((id) => forms.find((f) => f.id === id)?.name)
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {selectedFormIds.reduce((acc, formId) => acc + (formFields[formId]?.length || 0), 0)} total fields
                      </Badge>
                    </div>
                    <div className="grid gap-4">
                      {/* Required Fields */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          Employee ID <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={fieldMappings.employeeIdField || ""}
                          onValueChange={(value) => updateFieldMapping("employeeIdField", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select employee ID field from any form" />
                          </SelectTrigger>
                          <SelectContent>
                            {getCombinedFields().map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          Date <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={fieldMappings.dateField || ""}
                          onValueChange={(value) => updateFieldMapping("dateField", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select date field from any form" />
                          </SelectTrigger>
                          <SelectContent>
                            {getCombinedFields((f) => f.type === "date" || f.type === "datetime").map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Optional Fields */}
                      <div className="pt-2 border-t">
                        <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                          Optional Fields
                        </Label>
                        <div className="grid gap-4">
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              Overtime Hours
                            </Label>
                            <Select
                              value={fieldMappings.overtimeField || "none"}
                              onValueChange={(value) => updateFieldMapping("overtimeField", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select overtime field" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {getCombinedFields((f) => f.type === "number" || f.type === "text").map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              Type/Category
                            </Label>
                            <Select
                              value={fieldMappings.typeField || "none"}
                              onValueChange={(value) => updateFieldMapping("typeField", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select type field" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {getCombinedFields().map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              Duration/Quantity
                            </Label>
                            <Select
                              value={fieldMappings.durationField || "none"}
                              onValueChange={(value) => updateFieldMapping("durationField", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select duration field" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {getCombinedFields((f) => f.type === "number" || f.type === "text" || f.type === "select").map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                Check-In/Start Time
                              </Label>
                              <Select
                                value={fieldMappings.checkInField || "none"}
                                onValueChange={(value) => updateFieldMapping("checkInField", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select check-in" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  {getCombinedFields((f) => f.type === "time" || f.type === "datetime").map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                      {item.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                Check-Out/End Time
                              </Label>
                              <Select
                                value={fieldMappings.checkOutField || "none"}
                                onValueChange={(value) => updateFieldMapping("checkOutField", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select check-out" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  {getCombinedFields((f) => f.type === "time" || f.type === "datetime").map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                      {item.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                Start Date
                              </Label>
                              <Select
                                value={fieldMappings.startDateField || "none"}
                                onValueChange={(value) => updateFieldMapping("startDateField", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select start date" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  {getCombinedFields((f) => f.type === "date" || f.type === "datetime").map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                      {item.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                End Date
                              </Label>
                              <Select
                                value={fieldMappings.endDateField || "none"}
                                onValueChange={(value) => updateFieldMapping("endDateField", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select end date" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  {getCombinedFields((f) => f.type === "date" || f.type === "datetime").map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                      {item.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="px-6 py-4 border-t shrink-0 sm:justify-between">
          {step > 1 && (
            <Button type="button" variant="outline" onClick={handlePreviousStep} disabled={saving}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            {step === 1 ? (
              <Button
                type="button"
                onClick={handleNextStep}
                disabled={loading || loadingFields || selectedFormIds.length === 0}
              >
                {loadingFields && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSave} disabled={loading || saving || loadingFields}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Configuration
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}