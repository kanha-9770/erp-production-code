"use client"

import { useState } from "react"
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
import { Save, X, Palette, Layout, Settings } from "lucide-react"
import type { FormSection } from "@/types/form-builder"

interface SectionSettingsProps {
  section: FormSection
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (updates: Partial<FormSection>) => void
}

export default function SectionSettings({ section, open, onOpenChange, onUpdate }: SectionSettingsProps) {
  const [formData, setFormData] = useState({
    title: section.title,
    description: section.description || "",
    columns: section.columns,
    visible: section.visible,
    collapsible: section.collapsible,
    collapsed: section.collapsed,
    styling: section.styling || {},
  })

  const handleSave = () => {
    onUpdate({
      title: formData.title,
      description: formData.description,
      columns: formData.columns,
      visible: formData.visible,
      collapsible: formData.collapsible,
      collapsed: formData.collapsed,
      styling: formData.styling,
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
    onOpenChange(false)
  }

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
          <TabsList className="grid w-full grid-cols-3">
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
