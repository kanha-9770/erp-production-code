"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Save, X, Palette, Layout, Settings, Eye, Loader2, AlertCircle } from "lucide-react"
import type { FormSection, FormField } from "@/types/form-builder"
import { useToast } from "@/hooks/use-toast"
import { useLazyGetFormFullQuery } from "@/lib/api/forms"

interface SectionSettingsProps {
  section: FormSection
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (updates: Partial<FormSection>) => void
  formId: string
}

type ConditionalRule = {
  type: "show" | "hide"
  parentFieldId: string
  value: string
}

export default function SectionSettings({ section, open, onOpenChange, onUpdate, formId }: SectionSettingsProps) {
  const [formData, setFormData] = useState({
    title: section.title,
    description: section.description || "",
    columns: section.columns,
    visible: section.visible,
    collapsible: section.collapsible,
    collapsed: section.collapsed,
    styling: section.styling || {},
  })

  // Conditional visibility — kept in its own piece of state so the
  // existing tabs (general / layout / styling) are not impacted.
  const [localConditional, setLocalConditional] = useState<ConditionalRule | null>(
    (section.conditional as ConditionalRule | null) ?? null,
  )

  // Available form fields (from main form sections + all subforms).
  const [allFormFields, setAllFormFields] = useState<FormField[]>([])
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [fieldsError, setFieldsError] = useState<string | null>(null)

  // Lookup options when the parent field is a lookup field
  const [lookupOptions, setLookupOptions] = useState<{ label: string; value: string }[]>([])
  const [lookupLoading, setLookupLoading] = useState(false)

  const { toast } = useToast()
  const [triggerGetFormFull] = useLazyGetFormFullQuery()

  // Reset all editable state every time the dialog is opened so a Cancel
  // truly cancels and a re-open never shows stale draft values.
  useEffect(() => {
    if (!open) return
    setFormData({
      title: section.title,
      description: section.description || "",
      columns: section.columns,
      visible: section.visible,
      collapsible: section.collapsible,
      collapsed: section.collapsed,
      styling: section.styling || {},
    })
    setLocalConditional((section.conditional as ConditionalRule | null) ?? null)
  }, [open, section])

  // Fetch every field in the form (sections + nested subforms) so the user
  // can pick any of them as the "depends on" parent — same approach as
  // field-settings.tsx.
  useEffect(() => {
    if (!open || !formId) return
    let cancelled = false
    const load = async () => {
      setFieldsLoading(true)
      setFieldsError(null)
      try {
        const json = await triggerGetFormFull(formId).unwrap()
        if (!json?.success || !json?.data) throw new Error("Invalid response")
        const fullForm = json.data
        const collected: FormField[] = []
        fullForm.sections?.forEach((s: any) => {
          if (Array.isArray(s.fields)) collected.push(...s.fields)
        })
        const collectSubforms = (subs: any[] = []) => {
          subs.forEach((sf) => {
            if (Array.isArray(sf.fields)) collected.push(...sf.fields)
            if (Array.isArray(sf.childSubforms)) collectSubforms(sf.childSubforms)
          })
        }
        collectSubforms(fullForm.subforms || [])
        if (!cancelled) setAllFormFields(collected)
      } catch (err: any) {
        console.error("[Section Visibility] Failed to load form fields", err)
        if (!cancelled) {
          setFieldsError("Could not load available fields.")
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to load fields for conditional visibility.",
          })
        }
      } finally {
        if (!cancelled) setFieldsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, formId, toast, triggerGetFormFull])

  // Fetch lookup options if the selected parent is a lookup field
  useEffect(() => {
    if (!localConditional?.parentFieldId || allFormFields.length === 0) {
      setLookupOptions([])
      return
    }
    const parent: any = allFormFields.find((f) => f.id === localConditional.parentFieldId)
    const lookupSourceId = parent?.lookup?.sourceId
    if (!lookupSourceId) {
      setLookupOptions([])
      return
    }
    let cancelled = false
    const fetchLookup = async () => {
      setLookupLoading(true)
      try {
        const res = await fetch(`/api/lookup/data?sourceId=${lookupSourceId}&limit=200`)
        const json = await res.json()
        const items = json.data ?? []
        if (!cancelled) {
          setLookupOptions(
            items.map((item: any) => ({
              label: item.label || item.name || item.value || String(item.id),
              value: item.value || item.label || String(item.id),
            })),
          )
        }
      } catch {
        if (!cancelled) setLookupOptions([])
      } finally {
        if (!cancelled) setLookupLoading(false)
      }
    }
    fetchLookup()
    return () => {
      cancelled = true
    }
  }, [localConditional?.parentFieldId, allFormFields])

  const handleSave = () => {
    onUpdate({
      title: formData.title,
      description: formData.description,
      columns: formData.columns,
      visible: formData.visible,
      collapsible: formData.collapsible,
      collapsed: formData.collapsed,
      styling: formData.styling,
      // Persist conditional alongside the rest. Sending `null` clears it.
      conditional: localConditional ?? null,
    })
    onOpenChange(false)
  }

  const handleCancel = () => {
    setFormData({
      title: section.title,
      description: section.description || "",
      columns: section.columns,
      visible: section.visible,
      collapsible: section.collapsible,
      collapsed: section.collapsed,
      styling: section.styling || {},
    })
    setLocalConditional((section.conditional as ConditionalRule | null) ?? null)
    onOpenChange(false)
  }

  // Build the list of selectable values for the trigger value picker.
  const triggerValueOptions: { label: string; value: string }[] = (() => {
    if (!localConditional?.parentFieldId) return []
    const parent: any = allFormFields.find((f) => f.id === localConditional.parentFieldId)
    if (!parent) return []

    const rawOptions = parent.options
    const staticOptions: { label: string; value: string }[] = Array.isArray(rawOptions)
      ? rawOptions
      : typeof rawOptions === "string"
        ? (() => {
            try {
              const p = JSON.parse(rawOptions)
              return Array.isArray(p) ? p : []
            } catch {
              return []
            }
          })()
        : []

    const rawGroups = parent.dependentGroups
    const depGroups: any[] = Array.isArray(rawGroups)
      ? rawGroups
      : typeof rawGroups === "string"
        ? (() => {
            try {
              const p = JSON.parse(rawGroups)
              return Array.isArray(p) ? p : []
            } catch {
              return []
            }
          })()
        : []
    const dependentOptions: { label: string; value: string }[] = depGroups.flatMap((g: any) =>
      (g.options ?? []).map((opt: any) => ({ label: opt.label, value: opt.value || opt.label })),
    )

    const isLookup = !!parent.lookup?.sourceId
    const all = [...staticOptions, ...dependentOptions, ...(isLookup ? lookupOptions : [])]
    const seen = new Set<string>()
    return all.filter((opt) => {
      const key = opt.value || opt.label
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  const parentField: any = localConditional?.parentFieldId
    ? allFormFields.find((f) => f.id === localConditional.parentFieldId)
    : null
  const parentIsLookup = !!parentField?.lookup?.sourceId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Section Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="layout" className="flex items-center gap-2">
              <Layout className="w-4 h-4" />
              Layout
            </TabsTrigger>
            <TabsTrigger value="styling" className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Styling
            </TabsTrigger>
            <TabsTrigger value="visibility" className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Visibility
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Section Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Enter section title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter section description (optional)"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Visibility & Behavior</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Visible</Label>
                    <p className="text-sm text-gray-500">Show this section in the form</p>
                  </div>
                  <Switch
                    checked={formData.visible}
                    onCheckedChange={(checked) => setFormData({ ...formData, visible: checked })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Collapsible</Label>
                    <p className="text-sm text-gray-500">Allow users to collapse this section</p>
                  </div>
                  <Switch
                    checked={formData.collapsible}
                    onCheckedChange={(checked) => setFormData({ ...formData, collapsible: checked })}
                  />
                </div>
                {formData.collapsible && (
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Collapsed by Default</Label>
                      <p className="text-sm text-gray-500">Start with this section collapsed</p>
                    </div>
                    <Switch
                      checked={formData.collapsed}
                      onCheckedChange={(checked) => setFormData({ ...formData, collapsed: checked })}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="layout" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Column Layout</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Number of Columns</Label>
                  <Select
                    value={formData.columns.toString()}
                    onValueChange={(value) => setFormData({ ...formData, columns: Number.parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Column</SelectItem>
                      <SelectItem value="2">2 Columns</SelectItem>
                      <SelectItem value="3">3 Columns</SelectItem>
                      <SelectItem value="4">4 Columns</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500">
                    Fields in this section will be arranged in {formData.columns} column
                    {formData.columns > 1 ? "s" : ""}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Preview</h4>
                  <div
                    className={`grid gap-2 ${formData.columns === 1
                      ? "grid-cols-1"
                      : formData.columns === 2
                        ? "grid-cols-2"
                        : formData.columns === 3
                          ? "grid-cols-3"
                          : "grid-cols-4"
                      }`}
                  >
                    {Array.from({ length: formData.columns }, (_, i) => (
                      <div
                        key={i}
                        className="h-8 bg-white border border-gray-200 rounded flex items-center justify-center text-xs text-gray-500"
                      >
                        Field {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="styling" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Section Styling</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="backgroundColor">Background Color</Label>
                    <Input
                      id="backgroundColor"
                      type="color"
                      value={formData.styling.backgroundColor || "#ffffff"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, backgroundColor: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="borderColor">Border Color</Label>
                    <Input
                      id="borderColor"
                      type="color"
                      value={formData.styling.borderColor || "#e5e7eb"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, borderColor: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="borderRadius">Border Radius</Label>
                  <Select
                    value={formData.styling.borderRadius || "md"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        styling: { ...formData.styling, borderRadius: value },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="sm">Small</SelectItem>
                      <SelectItem value="md">Medium</SelectItem>
                      <SelectItem value="lg">Large</SelectItem>
                      <SelectItem value="xl">Extra Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="padding">Padding</Label>
                  <Select
                    value={formData.styling.padding || "md"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        styling: { ...formData.styling, padding: value },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="sm">Small</SelectItem>
                      <SelectItem value="md">Medium</SelectItem>
                      <SelectItem value="lg">Large</SelectItem>
                      <SelectItem value="xl">Extra Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="visibility" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Conditional Visibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Enable Conditional Visibility</Label>
                    <p className="text-sm text-muted-foreground">
                      Show or hide this entire section based on another field's value
                    </p>
                  </div>
                  <Switch
                    checked={!!localConditional}
                    onCheckedChange={(enabled) => {
                      if (enabled) {
                        setLocalConditional({ type: "show", parentFieldId: "", value: "" })
                      } else {
                        setLocalConditional(null)
                      }
                    }}
                  />
                </div>

                {localConditional && (
                  <div className="pl-6 border-l-2 border-muted space-y-5">
                    {/* Depends on field */}
                    <div className="space-y-2">
                      <Label>Depends on field</Label>
                      {fieldsLoading ? (
                        <div className="flex items-center gap-2 py-3">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <span className="text-sm text-muted-foreground">Loading form fields...</span>
                        </div>
                      ) : fieldsError ? (
                        <div className="text-sm text-destructive flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {fieldsError}
                        </div>
                      ) : allFormFields.length === 0 ? (
                        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded">
                          No fields found in this form yet.
                        </div>
                      ) : (
                        <Select
                          value={localConditional.parentFieldId || ""}
                          onValueChange={(val) =>
                            setLocalConditional((prev) =>
                              prev ? { ...prev, parentFieldId: val, value: "" } : prev,
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a field" />
                          </SelectTrigger>
                          <SelectContent>
                            {allFormFields.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.label || "Unnamed"}{" "}
                                <span className="text-xs text-muted-foreground">({f.type})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Action: Show / Hide */}
                    <div className="space-y-2">
                      <Label>Action</Label>
                      <Select
                        value={localConditional.type}
                        onValueChange={(val) =>
                          setLocalConditional((prev) =>
                            prev ? { ...prev, type: val as "show" | "hide" } : prev,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="show">Show this section</SelectItem>
                          <SelectItem value="hide">Hide this section</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Trigger value */}
                    {localConditional.parentFieldId && (
                      <div className="space-y-2">
                        <Label>Trigger value</Label>
                        {parentIsLookup && lookupLoading ? (
                          <div className="flex items-center gap-2 py-3">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">Loading lookup options...</span>
                          </div>
                        ) : triggerValueOptions.length > 0 ? (
                          <Select
                            value={localConditional.value || ""}
                            onValueChange={(val) =>
                              setLocalConditional((prev) => (prev ? { ...prev, value: val } : prev))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose value that triggers the action" />
                            </SelectTrigger>
                            <SelectContent>
                              {triggerValueOptions.map((opt) => (
                                <SelectItem key={opt.value || opt.label} value={opt.value || opt.label}>
                                  {opt.label}
                                  {opt.value && opt.value !== opt.label && (
                                    <span className="text-xs text-muted-foreground ml-1">({opt.value})</span>
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={localConditional.value || ""}
                            onChange={(e) =>
                              setLocalConditional((prev) =>
                                prev ? { ...prev, value: e.target.value } : prev,
                              )
                            }
                            placeholder="Enter the exact value (case-sensitive)"
                          />
                        )}
                        <p className="text-xs text-muted-foreground">
                          The section will{" "}
                          {localConditional.type === "show" ? "appear" : "be hidden"} when the field equals this
                          value.
                        </p>
                      </div>
                    )}

                    {/* Preview */}
                    {localConditional.parentFieldId && localConditional.value && (
                      <div className="mt-3 p-3 bg-muted/50 rounded border text-sm">
                        <strong>Current rule:</strong>
                        <br />
                        This section will be{" "}
                        <strong>{localConditional.type === "show" ? "shown" : "hidden"}</strong> when{" "}
                        <em>
                          {allFormFields.find((f) => f.id === localConditional.parentFieldId)?.label ||
                            "selected field"}
                        </em>{" "}
                        = <strong>"{localConditional.value}"</strong>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
