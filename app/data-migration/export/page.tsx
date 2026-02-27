"use client"

import { useState } from "react"
import { Download, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FieldSelector } from "@/components/data-migration/field-selector"
import { useRouter } from "next/navigation"

export default function ExportPage() {
  const router = useRouter()
  const [selectedModuleId, setSelectedModuleId] = useState<string>("")
  const [selectedFormId, setSelectedFormId] = useState<string>("")
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [exportFormat, setExportFormat] = useState<"CSV" | "XLSX">("CSV")
  const [isExporting, setIsExporting] = useState(false)

  // Mock data - in production, fetch from API
  const modules = [
    { id: "1", name: "china_vendors", label: "China Vendors" },
    { id: "2", name: "accounts", label: "Accounts" },
    { id: "3", name: "agents", label: "Agents" },
  ]

  const mockSections = [
    {
      id: "s1",
      label: "Basic Information",
      order: 1,
      fields: [
        {
          id: "f1",
          name: "name",
          label: "Vendor Name",
          fieldType: "TEXT" as const,
          isRequired: true,
          isImportable: true,
          isExportable: true,
          isUnique: false,
          lookupDisplayFields: [],
        },
        {
          id: "f2",
          name: "email",
          label: "Email",
          fieldType: "EMAIL" as const,
          isRequired: true,
          isImportable: true,
          isExportable: true,
          isUnique: true,
          lookupDisplayFields: [],
        },
        {
          id: "f3",
          name: "phone",
          label: "Phone",
          fieldType: "PHONE" as const,
          isRequired: false,
          isImportable: true,
          isExportable: true,
          isUnique: false,
          lookupDisplayFields: [],
        },
      ],
    },
    {
      id: "s2",
      label: "Additional Details",
      order: 2,
      fields: [
        {
          id: "f4",
          name: "location",
          label: "Location",
          fieldType: "TEXT" as const,
          isRequired: false,
          isImportable: true,
          isExportable: true,
          isUnique: false,
          lookupDisplayFields: [],
        },
        {
          id: "f5",
          name: "job",
          label: "Job Title",
          fieldType: "TEXT" as const,
          isRequired: false,
          isImportable: true,
          isExportable: true,
          isUnique: false,
          lookupDisplayFields: [],
        },
        {
          id: "f6",
          name: "company",
          label: "Company",
          fieldType: "TEXT" as const,
          isRequired: false,
          isImportable: true,
          isExportable: true,
          isUnique: false,
          lookupDisplayFields: [],
        },
      ],
    },
  ]

  const handleExport = async () => {
    setIsExporting(true)

    try {
      const response = await fetch("/api/export/create-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: selectedModuleId,
          formId: selectedFormId,
          selectedFields,
          format: exportFormat,
        }),
      })

      const data = await response.json()

      if (data.success) {
        // In production, trigger download or redirect to download page
        alert(`Export job created! Job ID: ${data.exportJobId}`)
      }
    } catch (error) {
      console.error("Export failed:", error)
      alert("Export failed. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-white">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
              <Download className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Export Data</h1>
              <p className="text-sm text-muted-foreground">Export your module data to CSV or Excel format</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 max-w-5xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Select Module & Form</CardTitle>
            <CardDescription>Choose which module and form you want to export data from</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="module">Module</Label>
                <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
                  <SelectTrigger id="module">
                    <SelectValue placeholder="Select a module" />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map((module) => (
                      <SelectItem key={module.id} value={module.id}>
                        {module.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="form">Form</Label>
                <Select value={selectedFormId} onValueChange={setSelectedFormId} disabled={!selectedModuleId}>
                  <SelectTrigger id="form">
                    <SelectValue placeholder="Select a form" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="form1">Main Form</SelectItem>
                    <SelectItem value="form2">Secondary Form</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedModuleId && selectedFormId && (
          <>
            <FieldSelector sections={mockSections} selectedFields={selectedFields} onFieldsChange={setSelectedFields} />

            <Card>
              <CardHeader>
                <CardTitle>Export Format</CardTitle>
                <CardDescription>Choose the file format for your export</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={exportFormat} onValueChange={(v: any) => setExportFormat(v)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="CSV" id="csv" />
                    <Label htmlFor="csv" className="cursor-pointer flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      CSV (Comma Separated Values)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="XLSX" id="xlsx" />
                    <Label htmlFor="xlsx" className="cursor-pointer flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      XLSX (Microsoft Excel)
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Export Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Selected Module:</span>
                  <span className="font-medium">{modules.find((m) => m.id === selectedModuleId)?.label || "-"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Selected Fields:</span>
                  <span className="font-medium">{selectedFields.length} fields</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Export Format:</span>
                  <span className="font-medium">{exportFormat}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => router.push("/")}>
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={selectedFields.length === 0 || isExporting} size="lg">
                <Download className="w-4 h-4 mr-2" />
                {isExporting ? "Exporting..." : "Export Data"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
