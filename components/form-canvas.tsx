"use client"
import { useState, useMemo } from "react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Layers, Loader2, UserCheck, AlertTriangle } from "lucide-react"
import SectionComponent from "./section-component"
import SubformComponent from "./subform-component"
import { useToast } from "@/hooks/use-toast"
import { Form, FormField, FormSection, Subform } from "@prisma/client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"   
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import FieldSettings from "./field-settings"

interface FormCanvasProps {
  form: Form & {
    sections: (FormSection & { fields: FormField[] })[]
    subforms: (Subform & {
      fields: FormField[];
      childSubforms: (Subform & { fields: FormField[]; childSubforms: any[] })[]
    })[]
  }
  onFormUpdate: (form: FormCanvasProps["form"]) => void
}

export default function FormCanvas({ form, onFormUpdate }: FormCanvasProps) {
  const [isAddingSection, setIsAddingSection] = useState(false)
  const [isAddingSubform, setIsAddingSubform] = useState(false)
  const [deletingSections, setDeletingSections] = useState<Set<string>>(new Set())
  const [deletingSubforms, setDeletingSubforms] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedField, setSelectedField] = useState<FormField | null>(null)

  const [showEmployeeConfirm, setShowEmployeeConfirm] = useState(false)
  const [isTogglingEmployee, setIsTogglingEmployee] = useState(false)
  const isEmployeeForm = form?.isEmployeeForm || false

  // Group subforms by parentSectionId
  const subformsByParentSection = useMemo(() => {
    const map = new Map<string | null, any[]>()
    const collect = (subformsList: any[]) => {
      subformsList.forEach((sf) => {
        const parentKey = sf.parentSectionId ?? null
        if (!map.has(parentKey)) map.set(parentKey, [])
        map.get(parentKey)!.push(sf)
        if (sf.childSubforms && sf.childSubforms.length > 0) {
          collect(sf.childSubforms)
        }
      })
    }
    collect(form.subforms || [])
    return map
  }, [form.subforms])

  const getSubformsUnderSection = (sectionId: string) => {
    return (subformsByParentSection.get(sectionId) || [])
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
  }

  const topLevelSubforms = useMemo(() => {
    return (subformsByParentSection.get(null) || [])
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
  }, [subformsByParentSection])

  const handleToggleChange = (checked: boolean) => {
    if (checked === isEmployeeForm) return
    if (checked) {
      setShowEmployeeConfirm(true)
    } else {
      performToggle(false)
    }
  }

  const performToggle = async (makeEmployee: boolean) => {
    setIsTogglingEmployee(true)
    const optimisticForm = {
      ...form,
      isEmployeeForm: makeEmployee,
      isUserForm: false,
      updatedAt: new Date(),
    }
    onFormUpdate(optimisticForm)
    try {
      const res = await fetch(`/api/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          isEmployeeForm: makeEmployee,
          isUserForm: false,
        }),
      })
      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error")
        throw new Error(`Failed to update form type: ${res.status} - ${errorText}`)
      }
      toast({
        title: makeEmployee ? "Employee Form Activated" : "Employee Form Deactivated",
        description: makeEmployee
          ? "This form is now designated as an Employee Form."
          : "Form reverted to regular form.",
      })
    } catch (err: any) {
      console.error("Toggle error:", err)
      onFormUpdate(form)
      toast({
        title: "Error",
        description: err.message || "Failed to update form type",
        variant: "destructive",
      })
    } finally {
      setIsTogglingEmployee(false)
      setShowEmployeeConfirm(false)
    }
  }

  const { setNodeRef, isOver } = useDroppable({
    id: "form-canvas",
    data: {
      type: "Canvas",
    },
  })

  const duplicateField = (field: FormField) => {
    toast({
      title: "Duplicate Field",
      description: `Duplicating "${field.label}" (${field.type}) - Implementation pending`,
    })
  }

  const openFieldSettings = (field: FormField) => {
    setSelectedField(field)
    setSettingsOpen(true)
  }

  const manageFieldPermissions = (field: FormField) => {
    toast({
      title: "Field Permissions",
      description: `Managing permissions for "${field.label}" - Implementation pending`,
    })
  }

  const addSection = async () => {
    setIsAddingSection(true)
    try {
      const sections = form.sections || []
      const maxOrder = Math.max(...sections.map(s => s.order ?? 0), -1)
      const newSectionData = {
        formId: form.id,
        title: `Section ${sections.length + 1}`,
        description: "",
        order: maxOrder + 1,
        columns: 1,
      }
      const response = await fetch("/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSectionData),
      })
      if (!response.ok) throw new Error("Failed to create section")
      const result = await response.json()
      if (result.success) {
        const newSection: FormSection & { fields: FormField[] } = {
          ...result.data,
          fields: [],
          visible: true,
          collapsible: false,
          collapsed: false,
          conditional: null,
          styling: null,
        }
        onFormUpdate({
          ...form,
          sections: [...sections, newSection],
        })
        toast({ title: "Success", description: "Section added at root level" })
      } else {
        throw new Error(result.error || "Failed to create section")
      }
    } catch (error: any) {
      console.error("Error adding section:", error)
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setIsAddingSection(false)
    }
  }

  const updateSection = async (sectionId: string, updates: Partial<FormSection>) => {
    try {
      const sections = form.sections || []
      const updatedSections = sections.map((section) =>
        section.id === sectionId ? { ...section, ...updates, updatedAt: new Date() } : section,
      )
      onFormUpdate({ ...form, sections: updatedSections })
      const response = await fetch(`/api/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        onFormUpdate(form)
        throw new Error("Failed to update section")
      }
    } catch (error) {
      console.error("Error updating section:", error)
      toast({ title: "Error", description: "Failed to update section", variant: "destructive" })
    }
  }

  const deleteSection = async (sectionId: string) => {
    setDeletingSections((prev) => new Set(prev).add(sectionId))
    const sections = form.sections || []
    const previousSections = sections
    const updatedSections = sections
      .filter((section) => section.id !== sectionId)
      .map((section, index) => ({ ...section, order: index }))
    onFormUpdate({ ...form, sections: updatedSections })
    try {
      const response = await fetch(`/api/sections/${sectionId}`, { method: "DELETE" })
      if (response.status === 404) {
        toast({ title: "Success", description: "Section removed successfully" })
        return
      }
      if (!response.ok) throw new Error("Failed to delete section from database")
      toast({ title: "Success", description: "Section deleted successfully" })
    } catch (error: any) {
      onFormUpdate({ ...form, sections: previousSections })
      toast({ title: "Error", description: error.message || "Failed to delete section", variant: "destructive" })
    } finally {
      setDeletingSections((prev) => {
        const newSet = new Set(prev)
        newSet.delete(sectionId)
        return newSet
      })
    }
  }

  const updateField = async (fieldId: string, updates: Partial<FormField>) => {
    console.log("[FormCanvas] updateField called with:", { fieldId, updates })
    const sections = form.sections || []
    const subforms = form.subforms || []
    const updatedSections = sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        field.id === fieldId ? { ...field, ...updates, updatedAt: new Date() } : field,
      ),
    }))
    const updatedSubforms = subforms.map((subform) => ({
      ...subform,
      fields: subform.fields.map((field) =>
        field.id === fieldId ? { ...field, ...updates, updatedAt: new Date() } : field,
      ),
    }))
    const previousForm = { ...form }
    onFormUpdate({ ...form, sections: updatedSections, subforms: updatedSubforms })
    try {
      const response = await fetch(`/api/fields/${fieldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error")
        throw new Error(`Field update failed: ${response.status} - ${errorText}`)
      }
      toast({
        title: "Saved",
        description: "Field settings saved successfully",
      })
    } catch (error: any) {
      console.error("[FormCanvas] Field update failed:", error)
      onFormUpdate(previousForm)
      toast({
        title: "Error",
        description: error.message || "Failed to save field settings",
        variant: "destructive",
      })
    }
  }

  const deleteField = async (fieldId: string) => {
    const sections = form.sections || []
    const subforms = form.subforms || []
    const previousSections = sections
    const previousSubforms = subforms
    try {
      const updatedSections = sections.map((section) => ({
        ...section,
        fields: section.fields.filter((field) => field.id !== fieldId),
      }))
      const updatedSubforms = subforms.map((subform) => ({
        ...subform,
        fields: subform.fields.filter((field) => field.id !== fieldId),
      }))
      onFormUpdate({ ...form, sections: updatedSections, subforms: updatedSubforms })
      const response = await fetch(`/api/fields/${fieldId}`, { method: "DELETE" })
      if (response.status === 404) return
      if (!response.ok) throw new Error("Failed to delete field")
      toast({ title: "Success", description: "Field deleted successfully" })
    } catch (error) {
      onFormUpdate({ ...form, sections: previousSections, subforms: previousSubforms })
      toast({ title: "Error", description: "Failed to delete field", variant: "destructive" })
    }
  }

  const updateSubform = async (subformId: string, updates: Partial<Subform>) => {
    try {
      const subforms = form.subforms || []
      const updateRecursively = (list: any[]): any[] =>
        list.map((sf) =>
          sf.id === subformId
            ? { ...sf, ...updates, updatedAt: new Date() }
            : {
              ...sf,
              childSubforms: sf.childSubforms ? updateRecursively(sf.childSubforms) : [],
            }
        )
      const updated = updateRecursively(subforms)
      onFormUpdate({ ...form, subforms: updated })
      const response = await fetch(`/api/subforms/${subformId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        onFormUpdate(form)
        throw new Error("Failed to update subform")
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update subform", variant: "destructive" })
    }
  }

  const deleteSubform = async (subformId: string) => {
    setDeletingSubforms((prev) => new Set(prev).add(subformId))
    const subforms = form.subforms || []
    const previousSubforms = subforms
    try {
      const removeRecursively = (list: any[]): any[] =>
        list
          .filter((sf) => sf.id !== subformId)
          .map((sf) => ({
            ...sf,
            childSubforms: sf.childSubforms ? removeRecursively(sf.childSubforms) : [],
          }))
      onFormUpdate({ ...form, subforms: removeRecursively(subforms) })
      const response = await fetch(`/api/subforms/${subformId}`, { method: "DELETE" })
      if (response.status === 404) return
      if (!response.ok) throw new Error("Failed to delete subform")
      toast({ title: "Success", description: "Subform deleted successfully" })
    } catch (error) {
      onFormUpdate({ ...form, subforms: previousSubforms })
      toast({ title: "Error", description: "Failed to delete subform", variant: "destructive" })
    } finally {
      setDeletingSubforms((prev) => {
        const newSet = new Set(prev)
        newSet.delete(subformId)
        return newSet
      })
    }
  }

  const addSubformAtTopLevel = async () => {
    setIsAddingSubform(true)
    try {
      const subforms = form.subforms || []
      const topLevel = subforms.filter((s: any) => s.parentSectionId === null)
      const maxOrder = Math.max(...topLevel.map((s: any) => s.order ?? 0), -1)
      const newSubformData = {
        formId: form.id,
        name: `Subform ${subforms.length + 1}`,
        order: maxOrder + 1,
        columns: 2,
        visible: true,
        collapsible: true,
        collapsed: false,
        parentSectionId: null,
        parentSubformId: null,
      }
      const response = await fetch("/api/subforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSubformData),
      })
      if (!response.ok) throw new Error("Failed to create subform")
      const result = await response.json()
      if (result.success) {
        const newSubform = { ...result.data, fields: [], childSubforms: [] }
        onFormUpdate({ ...form, subforms: [...subforms, newSubform] })
        toast({ title: "Success", description: "Subform added at top level" })
      } else {
        throw new Error(result.error || "Failed to create subform")
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setIsAddingSubform(false)
    }
  }

  // ── NEW FUNCTION ── Add subform under specific section
  const addSubformUnderSection = async (sectionId: string) => {
    try {
      const subforms = form.subforms || []

      // Only siblings under this section for correct ordering
      const siblings = subforms.filter(s => s.parentSectionId === sectionId)
      const maxOrder = Math.max(...siblings.map(s => s.order ?? 0), -1)

      const newSubformData = {
        formId: form.id,
        name: `Subform ${subforms.length + 1}`,
        order: maxOrder + 1,
        columns: 2,
        visible: true,
        collapsible: true,
        collapsed: false,
        parentSectionId: sectionId,           // ← this is what makes it appear under the section
        parentSubformId: null,
      }

      const response = await fetch("/api/subforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSubformData),
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Failed to create subform: ${errText}`)
      }

      const result = await response.json()
      if (result.success) {
        const newSubform = { ...result.data, fields: [], childSubforms: [] }
        onFormUpdate({
          ...form,
          subforms: [...subforms, newSubform],
        })
        toast({ title: "Success", description: "Subform added under section" })
      } else {
        throw new Error(result.error || "Failed to create subform")
      }
    } catch (error: any) {
      console.error("Add subform under section error:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Could not add subform under section",
      })
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`p-4 min-h-full transition-all duration-200 ${isOver ? "bg-blue-50 border-2 border-dashed border-blue-300" : ""}`}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{form.name}</h1>
            {form.description && <p className="text-gray-500 mt-1">{form.description}</p>}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-3">
              <Switch
                id="employee-form-toggle"
                checked={isEmployeeForm}
                onCheckedChange={handleToggleChange}
                disabled={isTogglingEmployee}
                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-400"
              />
              <Label
                htmlFor="employee-form-toggle"
                className="text-sm font-medium cursor-pointer select-none"
              >
                Employee Form
              </Label>
            </div>
            {isEmployeeForm && (
              <Badge className="bg-green-100 text-green-800 border-green-200 px-3 py-1 text-xs font-medium flex items-center gap-1">
                <UserCheck className="h-3.5 w-3.5" />
                Active
              </Badge>
            )}
            {isTogglingEmployee && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {(form.sections?.length || topLevelSubforms.length) ? (
          <div className="space-y-10">
            {(form.sections || []).map((section) => (
              <div key={section.id} className="relative">
                <SectionComponent
                  formId={form.id}
                  section={section}
                  onUpdateSection={(updates) => updateSection(section.id, updates)}
                  onDeleteSection={() => deleteSection(section.id)}
                  onUpdateField={(fieldId, updates) => updateField(fieldId, updates)}
                  onDeleteField={(fieldId) => deleteField(fieldId)}
                  onCopyField={duplicateField}
                  onAddSubform={addSubformUnderSection}           // ← pass the function here
                />

                {getSubformsUnderSection(section.id).map((subform: any) => (
                  <div key={subform.id} className="mt-6 ml-8 border-l-4 border-blue-200 pl-6 bg-slate-50/40 rounded-r-lg">
                    <SubformComponent
                      subform={subform}
                      onUpdateSubform={(updates) => updateSubform(subform.id, updates)}
                      onDeleteSubform={() => deleteSubform(subform.id)}
                      onUpdateField={(fieldId, updates) => updateField(fieldId, updates)}
                      onDeleteField={(fieldId) => deleteField(fieldId)}
                      onCopyField={duplicateField}
                      formId={form.id}
                    />
                  </div>
                ))}
              </div>
            ))}

            {topLevelSubforms.map((subform: any) => (
              <div key={subform.id} className="mt-8">
                <SubformComponent
                  subform={subform}
                  onUpdateSubform={(updates) => updateSubform(subform.id, updates)}
                  onDeleteSubform={() => deleteSubform(subform.id)}
                  onUpdateField={(fieldId, updates) => updateField(fieldId, updates)}
                  onDeleteField={(fieldId) => deleteField(fieldId)}
                  onCopyField={duplicateField}
                  formId={form.id}
                />
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-2 border-dashed p-12 text-center bg-gray-50/50">
            <CardContent>
              <Layers className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700">Start building</h3>
              <p className="text-sm text-gray-500 mb-6">Create a section or a table-style subform</p>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-4 mt-12">
          <Button
            onClick={addSection}
            disabled={isAddingSection}
            className="flex-1 py-8 border-gray-300 hover:border-blue-400 hover:bg-blue-50"
            variant="outline"
          >
            {isAddingSection ? <Loader2 className="animate-spin" /> : <><Plus className="mr-2 h-5 w-5" /> Add Section</>}
          </Button>
          <Button
            onClick={addSubformAtTopLevel}
            disabled={isAddingSubform}
            className="flex-1 py-8 border-gray-300 hover:border-blue-400 hover:bg-blue-50"
            variant="outline"
          >
            {isAddingSubform ? <Loader2 className="animate-spin" /> : <><Plus className="mr-2 h-5 w-5" /> Add Subform</>}
          </Button>
        </div>

        <AlertDialog open={showEmployeeConfirm} onOpenChange={setShowEmployeeConfirm}>
          <AlertDialogContent className="sm:max-w-[520px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
                Important – Employee Form Activation
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription className="mt-4 text-base leading-relaxed space-y-4 text-gray-800">
              <p className="font-medium">
                NOTE: THIS WILL BE EMPLOYEE FORM AND YOU CAN MANAGE THE EMPLOYEE INFORMATION HERE.
              </p>
              <p className="font-medium">
                IT IS NOT ORDINARY PAGE.
              </p>
              <p className="font-semibold text-red-700">
                ENSURE THIS WILL ONLY ONE WITHIN ERP
              </p>
              <p className="text-sm text-gray-600 mt-3">
                Once activated, this form will be used specifically for employee data collection
                and management. This change affects how new submissions are stored and processed.
              </p>
            </AlertDialogDescription>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => performToggle(true)}
                className="bg-green-600 hover:bg-green-700 text-white min-w-[180px]"
              >
                Confirm & Enable Employee Form
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {selectedField && (
          <FieldSettings
            field={selectedField}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            formId={form.id}
            onUpdate={async (updates) => {
              if (!selectedField) return
              await updateField(selectedField.id, updates)
            }}
          />
        )}
      </div>
    </div>
  )
}