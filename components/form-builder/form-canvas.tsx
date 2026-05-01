"use client"
import { useState, useMemo, useRef, useEffect } from "react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import { Plus, Layers, Loader2, UserCheck, AlertTriangle, Table2 } from "lucide-react"
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
import {
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
  useCreateFieldMutation,
  useUpdateFieldMutation,
  useDeleteFieldMutation,
  useUpdateSubformMutation,
  useDeleteSubformMutation,
  useCreateSubformMutation,
  useSaveFormMutation,
} from "@/lib/api/forms"
import type { HistoryEntry } from "@/hooks/use-form-history"

interface FormCanvasProps {
  form: Form & {
    sections: (FormSection & { fields: FormField[] })[]
    subforms: (Subform & {
      fields: FormField[];
      childSubforms: (Subform & { fields: FormField[]; childSubforms: any[] })[]
    })[]
  }
  onFormUpdate: (form: FormCanvasProps["form"]) => void
  hasOtherEmployeeForm: boolean   // true = some OTHER form is already Employee Form
  onPushHistory?: (entry: HistoryEntry) => void
}

export default function FormCanvas({
  form,
  onFormUpdate,
  hasOtherEmployeeForm,
  onPushHistory,
}: FormCanvasProps) {

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

  // RTK Query mutations
  const [createSectionMut] = useCreateSectionMutation()
  const [updateSectionMut] = useUpdateSectionMutation()
  const [deleteSectionMut] = useDeleteSectionMutation()
  const [createFieldMut] = useCreateFieldMutation()
  const [updateFieldMut] = useUpdateFieldMutation()
  const [deleteFieldMut] = useDeleteFieldMutation()
  const [updateSubformMut] = useUpdateSubformMutation()
  const [deleteSubformMut] = useDeleteSubformMutation()
  const [createSubformMut] = useCreateSubformMutation()
  const [saveFormMut] = useSaveFormMutation()

  // Mirror latest form into a ref so history callbacks always operate on
  // the up-to-date state, not a stale closure.
  const formRef = useRef(form)
  useEffect(() => {
    formRef.current = form
  }, [form])

  // Helpers for patch-based undo of field create/delete operations
  const removeFieldFromForm = (
    f: FormCanvasProps["form"],
    fieldId: string,
  ): FormCanvasProps["form"] => {
    const removeFromSubs = (subs: any[]): any[] =>
      subs.map((sf) => ({
        ...sf,
        fields: (sf.fields || []).filter((x: any) => x.id !== fieldId),
        childSubforms: sf.childSubforms ? removeFromSubs(sf.childSubforms) : sf.childSubforms,
      }))
    return {
      ...f,
      sections: (f.sections || []).map((s: any) => ({
        ...s,
        fields: (s.fields || []).filter((x: any) => x.id !== fieldId),
        subforms: s.subforms ? removeFromSubs(s.subforms) : s.subforms,
      })),
      subforms: f.subforms ? (removeFromSubs(f.subforms) as any) : f.subforms,
    } as FormCanvasProps["form"]
  }

  const insertFieldIntoForm = (
    f: FormCanvasProps["form"],
    field: any,
  ): FormCanvasProps["form"] => {
    const sectionId = field.sectionId
    const subformId = field.subformId

    if (subformId) {
      const insertInSubs = (subs: any[]): any[] =>
        subs.map((sf) => {
          if (sf.id === subformId) {
            const fields = [...(sf.fields || []), field].sort(
              (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
            )
            return { ...sf, fields }
          }
          return {
            ...sf,
            childSubforms: sf.childSubforms ? insertInSubs(sf.childSubforms) : sf.childSubforms,
          }
        })
      return {
        ...f,
        sections: (f.sections || []).map((s: any) => ({
          ...s,
          subforms: s.subforms ? insertInSubs(s.subforms) : s.subforms,
        })),
        subforms: f.subforms ? (insertInSubs(f.subforms) as any) : f.subforms,
      } as FormCanvasProps["form"]
    }

    if (sectionId) {
      return {
        ...f,
        sections: (f.sections || []).map((s: any) => {
          if (s.id !== sectionId) return s
          const fields = [...(s.fields || []), field].sort(
            (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
          )
          return { ...s, fields }
        }),
      } as FormCanvasProps["form"]
    }

    return f
  }

  const findFieldInForm = (
    f: FormCanvasProps["form"],
    fieldId: string,
  ): FormField | null => {
    for (const s of f.sections || []) {
      const found = (s.fields || []).find((x: any) => x.id === fieldId)
      if (found) return found as FormField
      const inSubs = (subs: any[]): FormField | null => {
        for (const sf of subs) {
          const hit = (sf.fields || []).find((x: any) => x.id === fieldId)
          if (hit) return hit
          if (sf.childSubforms) {
            const r = inSubs(sf.childSubforms)
            if (r) return r
          }
        }
        return null
      }
      if ((s as any).subforms) {
        const r = inSubs((s as any).subforms)
        if (r) return r
      }
    }
    const inSubs = (subs: any[]): FormField | null => {
      for (const sf of subs) {
        const hit = (sf.fields || []).find((x: any) => x.id === fieldId)
        if (hit) return hit
        if (sf.childSubforms) {
          const r = inSubs(sf.childSubforms)
          if (r) return r
        }
      }
      return null
    }
    if (f.subforms) return inSubs(f.subforms)
    return null
  }

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

  const unifiedItems = useMemo(() => {
    const sections = (form.sections || []).map((s: any) => ({ ...s, _itemType: "section" }))
    const subforms = topLevelSubforms.map((s: any) => ({ ...s, _itemType: "subform" }))
    return [...sections, ...subforms].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
  }, [form.sections, topLevelSubforms])

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
      await saveFormMut({
        formId: form.id,
        body: {
          isEmployeeForm: makeEmployee,
          isUserForm: false,
        },
      }).unwrap()

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
    data: { type: "Canvas" },
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
      const result = await createSectionMut(newSectionData).unwrap()
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
      await updateSectionMut({ sectionId, body: updates }).unwrap()
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
      await deleteSectionMut(sectionId).unwrap()
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
    const sections = form.sections || []
    const subforms = form.subforms || []
    const patchFields = (fields: any[]) =>
      fields.map((field: any) =>
        field.id === fieldId ? { ...field, ...updates, updatedAt: new Date() } : field,
      )
    const patchSubforms = (subs: any[]): any[] =>
      subs.map((sub: any) => ({
        ...sub,
        fields: patchFields(sub.fields || []),
        childSubforms: sub.childSubforms ? patchSubforms(sub.childSubforms) : [],
      }))
    const updatedSections = sections.map((section) => ({
      ...section,
      fields: patchFields(section.fields),
      subforms: section.subforms ? patchSubforms(section.subforms) : [],
    }))
    const updatedSubforms = patchSubforms(subforms)
    const previousForm = { ...form }
    onFormUpdate({ ...form, sections: updatedSections, subforms: updatedSubforms })
    try {
      await updateFieldMut({ fieldId, body: updates }).unwrap()
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
    const previousForm = form
    const deletedField = findFieldInForm(form, fieldId)
    try {
      const updated = removeFieldFromForm(form, fieldId)
      onFormUpdate(updated)
      await deleteFieldMut(fieldId).unwrap()
      toast({ title: "Success", description: "Field deleted successfully" })

      if (deletedField && onPushHistory) {
        const fieldSnapshot: any = JSON.parse(JSON.stringify(deletedField))
        const idRef = { current: fieldId }
        const recreatePayload: any = {
          sectionId: fieldSnapshot.sectionId ?? null,
          subformId: fieldSnapshot.subformId ?? null,
          type: fieldSnapshot.type,
          label: fieldSnapshot.label,
          placeholder: fieldSnapshot.placeholder,
          description: fieldSnapshot.description,
          defaultValue: fieldSnapshot.defaultValue,
          options: fieldSnapshot.options,
          validation: fieldSnapshot.validation,
          visible: fieldSnapshot.visible,
          readonly: fieldSnapshot.readonly,
          width: fieldSnapshot.width,
          order: fieldSnapshot.order,
          ...(fieldSnapshot.lookup ? { lookup: fieldSnapshot.lookup } : {}),
          ...(fieldSnapshot.formula ? { formula: fieldSnapshot.formula } : {}),
          ...(fieldSnapshot.parentFieldId
            ? { parentFieldId: fieldSnapshot.parentFieldId, isDependent: true }
            : {}),
        }

        onPushHistory({
          description: "Delete field",
          redo: async () => {
            const cur = formRef.current
            const next = removeFieldFromForm(cur, idRef.current)
            onFormUpdate(next)
            await deleteFieldMut(idRef.current).unwrap()
          },
          undo: async () => {
            const result: any = await createFieldMut(recreatePayload).unwrap()
            if (!result?.success) {
              toast({
                title: "Error",
                description: "Failed to restore field",
                variant: "destructive",
              })
              return
            }
            const newId = result.data.id
            idRef.current = newId
            const cur = formRef.current
            const restored = { ...fieldSnapshot, id: newId }
            const next = insertFieldIntoForm(cur, restored)
            onFormUpdate(next)
          },
        })
      }
    } catch (error) {
      onFormUpdate(previousForm)
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
      await updateSubformMut({ subformId, body: updates }).unwrap()
    } catch (error) {
      toast({ title: "Error", description: "Failed to update subform", variant: "destructive" })
    }
  }

  const deleteSubform = async (subformId: string) => {
    setDeletingSubforms((prev) => new Set(prev).add(subformId))
    try {
      await deleteSubformMut(subformId).unwrap()
      const removeRecursively = (list: any[]): any[] =>
        list
          .filter((sf) => sf.id !== subformId)
          .map((sf) => ({
            ...sf,
            childSubforms: sf.childSubforms ? removeRecursively(sf.childSubforms) : [],
          }))
      onFormUpdate({ ...form, subforms: removeRecursively(form.subforms || []) })
      toast({ title: "Success", description: "Subform deleted successfully" })
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete subform", variant: "destructive" })
    } finally {
      setDeletingSubforms((prev) => {
        const newSet = new Set(prev)
        newSet.delete(subformId)
        return newSet
      })
    }
  }

  const addSubform = async () => {
    setIsAddingSubform(true)
    try {
      const allItems = [
        ...(form.sections || []),
        ...topLevelSubforms,
      ]
      const maxOrder = Math.max(...allItems.map((s: any) => s.order ?? 0), -1)
      const subforms = form.subforms || []
      const newSubformData = {
        formId: form.id,
        name: `Subform ${subforms.length + 1}`,
        order: maxOrder + 1,
        columns: 1,
        visible: true,
        collapsible: true,
        collapsed: false,
        parentSectionId: null,
        parentSubformId: null,
      }
      const result = await createSubformMut(newSubformData).unwrap()
      if (result.success) {
        const newSubform = { ...result.data, fields: [], childSubforms: [] }
        onFormUpdate({ ...form, subforms: [...subforms, newSubform] })
        toast({ title: "Success", description: "Subform created" })
      } else {
        throw new Error(result.error || "Failed to create subform")
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setIsAddingSubform(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`p-2 sm:p-4 min-h-full transition-all duration-200 ${isOver ? "bg-blue-50/60 border-2 border-dashed border-blue-300 rounded-xl" : ""}`}
    >
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-3 pb-4 border-b sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-6">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
              {form.name}
            </h1>
            {form.description && (
              <p className="text-sm text-gray-500 mt-1 line-clamp-2 sm:line-clamp-none">
                {form.description}
              </p>
            )}
          </div>

          {/* Toggle Button Logic */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Show toggle ONLY if:
                - This form is the Employee Form, OR
                - No other form is currently the Employee Form */}
            {(!hasOtherEmployeeForm || isEmployeeForm) ? (
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
            ) : (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Employee Form is activated in another form
              </div>
            )}

            {isEmployeeForm && (
              <Badge className="bg-green-100 text-green-800 border-green-200 px-3 py-1 text-xs font-medium flex items-center gap-1">
                <UserCheck className="h-3.5 w-3.5" />
                Active Employee Form
              </Badge>
            )}

            {isTogglingEmployee && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Rest of your Form Content - unchanged */}
        {(form.sections?.length || topLevelSubforms.length) ? (
          <SortableContext
            items={unifiedItems.map((item: any) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {unifiedItems.map((item: any) => {
                if (item._itemType === "section") {
                  const section = item;
                  return (
                    <div key={section.id} className="relative">
                      <SectionComponent
                        formId={form.id}
                        section={section}
                        onUpdateSection={(updates) => updateSection(section.id, updates)}
                        onDeleteSection={() => deleteSection(section.id)}
                        onUpdateField={(fieldId, updates) => updateField(fieldId, updates)}
                        onDeleteField={(fieldId) => deleteField(fieldId)}
                        onCopyField={duplicateField}
                      />

                      {getSubformsUnderSection(section.id).map((subform: any) => (
                        <div
                          key={subform.id}
                          className="mt-3 ml-0 sm:ml-6 pl-3 sm:pl-5 border-l-2 border-blue-200 bg-slate-50/30 rounded-r-lg"
                        >
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
                  );
                } else {
                  const subform = item;
                  return (
                    <SubformComponent
                      key={subform.id}
                      subform={subform}
                      onUpdateSubform={(updates) => updateSubform(subform.id, updates)}
                      onDeleteSubform={() => deleteSubform(subform.id)}
                      onUpdateField={(fieldId, updates) => updateField(fieldId, updates)}
                      onDeleteField={(fieldId) => deleteField(fieldId)}
                      onCopyField={duplicateField}
                      formId={form.id}
                    />
                  );
                }
              })}
            </div>
          </SortableContext>
        ) : (
          <div className={`border-2 border-dashed rounded-xl p-10 sm:p-16 text-center transition-all duration-200 ${
            isOver ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-slate-50/30"
          }`}>
            <Layers className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-600">Start building your form</h3>
            <p className="text-sm text-slate-400 mt-1 mb-6">
              Drag fields from the palette, or use the buttons below
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={addSection}
                disabled={isAddingSection}
                variant="outline"
              >
                {isAddingSection ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" /> Add Section</>}
              </Button>
              <Button
                onClick={addSubform}
                disabled={isAddingSubform}
                variant="outline"
              >
                {isAddingSubform ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Table2 className="mr-2 h-4 w-4" /> Add Subform</>}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-6 sm:flex-row sm:gap-3 sm:mt-8">
          <Button
            onClick={addSection}
            disabled={isAddingSection}
            className="flex-1 py-5 border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-slate-600 hover:text-blue-700 transition-colors"
            variant="outline"
          >
            {isAddingSection ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" /> Add Section</>}
          </Button>
          <Button
            onClick={addSubform}
            disabled={isAddingSubform}
            className="flex-1 py-5 border-slate-200 hover:border-violet-400 hover:bg-violet-50/50 text-slate-600 hover:text-violet-700 transition-colors"
            variant="outline"
          >
            {isAddingSubform ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Table2 className="mr-2 h-4 w-4" /> Add Subform</>}
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