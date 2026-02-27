"use client"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { SectionWithFields } from "@/lib/types"

interface FieldSelectorProps {
  sections: SectionWithFields[]
  selectedFields: string[]
  onFieldsChange: (fieldIds: string[]) => void
}

export function FieldSelector({ sections, selectedFields, onFieldsChange }: FieldSelectorProps) {
  const allExportableFields = sections.flatMap((s) => s.fields.filter((f) => f.isExportable).map((f) => f.id))

  const handleSelectAll = () => {
    onFieldsChange(allExportableFields)
  }

  const handleDeselectAll = () => {
    onFieldsChange([])
  }

  const handleSectionToggle = (sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return

    const sectionFieldIds = section.fields.filter((f) => f.isExportable).map((f) => f.id)
    const allSelected = sectionFieldIds.every((id) => selectedFields.includes(id))

    if (allSelected) {
      // Deselect all in this section
      onFieldsChange(selectedFields.filter((id) => !sectionFieldIds.includes(id)))
    } else {
      // Select all in this section
      onFieldsChange([...new Set([...selectedFields, ...sectionFieldIds])])
    }
  }

  const handleFieldToggle = (fieldId: string) => {
    if (selectedFields.includes(fieldId)) {
      onFieldsChange(selectedFields.filter((id) => id !== fieldId))
    } else {
      onFieldsChange([...selectedFields, fieldId])
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Select Fields to Export</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll}>
              Deselect All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {sections.map((section) => {
          const exportableFields = section.fields.filter((f) => f.isExportable)
          if (exportableFields.length === 0) return null

          const sectionFieldIds = exportableFields.map((f) => f.id)
          const allSelected = sectionFieldIds.every((id) => selectedFields.includes(id))
          const someSelected = sectionFieldIds.some((id) => selectedFields.includes(id))

          return (
            <div key={section.id} className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  id={`section-${section.id}`}
                  checked={allSelected}
                  onCheckedChange={() => handleSectionToggle(section.id)}
                  className="data-[state=checked]:bg-primary"
                />
                <Label htmlFor={`section-${section.id}`} className="font-semibold text-base cursor-pointer">
                  {section.label} ({exportableFields.length} fields)
                </Label>
              </div>

              <div className="grid grid-cols-2 gap-3 ml-6">
                {exportableFields.map((field) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Checkbox
                      id={field.id}
                      checked={selectedFields.includes(field.id)}
                      onCheckedChange={() => handleFieldToggle(field.id)}
                    />
                    <Label htmlFor={field.id} className="text-sm cursor-pointer flex items-center gap-2">
                      {field.label}
                      <span className="text-xs text-muted-foreground">({field.fieldType})</span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
