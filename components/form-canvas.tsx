"use client"

import { useState } from "react"
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

interface FormCanvasProps {
  form: Form
  onFormUpdate: (form: Form) => void
  subformHierarchyMap?: Map<string, any>
  getSubformPath?: (subformId: string) => string
  getFullSubformPath?: (subformId: string) => string
  getParentChildDisplay?: (subformId: string) => string
  getAncestorPaths?: (subformId: string) => string[]
}

export default function FormCanvas({
  form,
  onFormUpdate,
}: FormCanvasProps) {
  const [isAddingSection, setIsAddingSection] = useState(false)
  const [isAddingSubform, setIsAddingSubform] = useState(false)
  const [deletingSections, setDeletingSections] = useState<Set<string>>(new Set())
  const [deletingSubforms, setDeletingSubforms] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  // ────────────────────────────────────────────────
  // Employee Form Toggle States
  // ────────────────────────────────────────────────
  const [showEmployeeConfirm, setShowEmployeeConfirm] = useState(false)
  const [isTogglingEmployee, setIsTogglingEmployee] = useState(false)

  const isEmployeeForm = form?.isEmployeeForm || false

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
      onFormUpdate(form) // rollback
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
    toast({
      title: "Field Settings",
      description: `Opening settings for "${field.label}" - Modal/Sidebar implementation pending`,
    })
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
      const maxOrder = Math.max(...sections.map((s: { order: any }) => s.order ?? 0), -1)
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
        const newSection: FormSection = {
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
        toast({ title: "Success", description: "Section added successfully" })
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
      const currentSection = sections.find((s: { id: string }) => s.id === sectionId)
      if (!currentSection) return

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
      .filter((section: { id: string }) => section.id !== sectionId)
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
        const newSet = new Set(prev);
        newSet.delete(sectionId);
        return newSet;
      })
    }
  }

  const updateField = async (fieldId: string, updates: Partial<FormField>) => {
    try {
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

      onFormUpdate({ ...form, sections: updatedSections, subforms: updatedSubforms })

      const response = await fetch(`/api/fields/${fieldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        onFormUpdate(form)
        throw new Error("Failed to update field")
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update field", variant: "destructive" })
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
      if (response.status === 404) return;
      if (!response.ok) throw new Error("Failed to delete field")
      toast({ title: "Success", description: "Field deleted successfully" })
    } catch (error) {
      onFormUpdate({ ...form, sections: previousSections, subforms: previousSubforms })
      toast({ title: "Error", description: "Failed to delete field", variant: "destructive" })
    }
  }

  const updateSubform = async (formId: string, subformId: string, updates: Partial<Subform>) => {
    try {
      const subforms = form.subforms || []
      const updateSubformRecursively = (subformsList: Subform[]): Subform[] => {
        return subformsList.map((subform) => {
          if (subform.id === subformId) return { ...subform, ...updates, updatedAt: new Date() }
          if (subform.childSubforms) return { ...subform, childSubforms: updateSubformRecursively(subform.childSubforms) }
          return subform
        })
      }

      onFormUpdate({ ...form, subforms: updateSubformRecursively(subforms) })

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

  const deleteSubform = async (formId: string, subformId: string) => {
    setDeletingSubforms((prev) => new Set(prev).add(subformId))
    const subforms = form.subforms || []
    const previousSubforms = subforms

    try {
      const removeSubformRecursively = (subformsList: Subform[]): Subform[] => {
        return subformsList.filter((subform) => subform.id !== subformId)
          .map((subform) => ({
            ...subform,
            childSubforms: subform.childSubforms ? removeSubformRecursively(subform.childSubforms) : [],
          }))
      }

      onFormUpdate({ ...form, subforms: removeSubformRecursively(subforms) })

      const response = await fetch(`/api/subforms/${subformId}`, { method: "DELETE" })
      if (response.status === 404) return;
      if (!response.ok) throw new Error("Failed to delete subform")
      toast({ title: "Success", description: "Subform deleted successfully" })
    } catch (error) {
      onFormUpdate({ ...form, subforms: previousSubforms })
      toast({ title: "Error", description: "Failed to delete subform", variant: "destructive" })
    } finally {
      setDeletingSubforms((prev) => {
        const newSet = new Set(prev);
        newSet.delete(subformId);
        return newSet;
      })
    }
  }

  const addSubformAtTopLevel = async () => {
    setIsAddingSubform(true)
    try {
      const subforms = form.subforms || []
      const maxOrder = Math.max(...subforms.map(s => s.order ?? 0), -1)
      const newSubformData = {
        formId: form.id,
        name: `Subform ${subforms.length + 1}`,
        order: maxOrder + 1,
        columns: 2,
        visible: true,
        collapsible: true,
        collapsed: false,
      }

      const response = await fetch("/api/subforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSubformData),
      })

      if (!response.ok) throw new Error("Failed to create subform")

      const result = await response.json()
      if (result.success) {
        const newSubform: Subform = { ...result.data, fields: [], childSubforms: [] }
        onFormUpdate({ ...form, subforms: [...subforms, newSubform] })
        toast({ title: "Success", description: "Subform added successfully" })
      } else {
        throw new Error(result.error || "Failed to create subform")
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setIsAddingSubform(false)
    }
  }

  const visibleSections = (form.sections || []).filter((section) => !deletingSections.has(section.id))
  const visibleSubforms = (form.subforms || []).filter((subform) => !deletingSubforms.has(subform.id))

  return (
    <div
      ref={setNodeRef}
      className={`p-4 min-h-full transition-all duration-200 ${isOver ? "bg-blue-50 border-2 border-dashed border-blue-300" : ""
        }`}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Employee Form Toggle Switch */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{form.name}</h1>
            {form.description && <p className="text-gray-500 mt-1">{form.description}</p>}
          </div>

          {/* Toggle Switch for Employee Form */}
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

        {visibleSections.length > 0 || visibleSubforms.length > 0 ? (
          <SortableContext
            items={[...visibleSections.map((s) => s.id), ...visibleSubforms.map((s) => s.id)]}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-10">
              {visibleSections
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((section) => (
                  <SectionComponent
                    key={section.id}
                    formId={form.id}
                    section={section}
                    onUpdateSection={(updates) => updateSection(section.id, updates)}
                    onDeleteSection={() => deleteSection(section.id)}
                    onUpdateField={(fieldId, updates) => updateField(fieldId, updates)}
                    onDeleteField={(fieldId) => deleteField(fieldId)}
                    onCopyField={duplicateField}
                    onOpenFieldSettings={openFieldSettings}
                    onManageFieldPermissions={manageFieldPermissions}
                  />
                ))}
              {visibleSubforms
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((subform) => (
                  <div key={subform.id}>
                    <SubformComponent
                      key={subform.id}
                      subform={subform}
                      onUpdateSubform={(updates) => updateSubform(form.id, subform.id, updates)}
                      onDeleteSubform={() => deleteSubform(form.id, subform.id)}
                      onUpdateField={(fieldId, updates) => updateField(fieldId, updates)}
                      onDeleteField={(fieldId) => deleteField(fieldId)}
                      onCopyField={duplicateField}
                      onOpenFieldSettings={openFieldSettings}
                      onManageFieldPermissions={manageFieldPermissions}
                      formId={form.id}
                    />
                  </div>
                ))}
            </div>
          </SortableContext>
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

        {/* Confirmation Dialog for enabling Employee Form */}
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
      </div>
    </div>
  )
}