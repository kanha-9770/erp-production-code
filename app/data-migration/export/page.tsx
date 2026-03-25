"use client"

import { useState, useMemo, useEffect } from "react"
import { Download, FileSpreadsheet, Loader2, ArrowLeft, FileText, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useGetPermittedModulesQuery } from "@/lib/api/modules"
import { useGetFormDetailQuery, useLazyExportFormRecordsQuery } from "@/lib/api/forms"
import { exportToCSV, exportToXLSX, exportToPDF } from "@/lib/utils/export-utils"
import Link from "next/link"

export default function ExportPage() {
  const { toast } = useToast()
  const [selectedModuleId, setSelectedModuleId] = useState("")
  const [selectedFormId, setSelectedFormId] = useState("")
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([])
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx" | "pdf">("csv")
  const [isExporting, setIsExporting] = useState(false)

  // RTK Query: fetch real modules
  const { data: modulesData, isLoading: loadingModules } = useGetPermittedModulesQuery()

  // RTK Query: fetch form detail when a form is selected
  const { data: formDetail, isLoading: loadingForm } = useGetFormDetailQuery(selectedFormId, {
    skip: !selectedFormId,
  })

  const modules = modulesData?.modules || []

  // Get forms for selected module
  const moduleForms = useMemo(() => {
    if (!selectedModuleId) return []
    const mod = modules.find((m) => m.module_id === selectedModuleId)
    return mod?.forms?.filter((f) => f.isPublished) || []
  }, [modules, selectedModuleId])

  // Get all fields from the form
  const formFields = useMemo(() => {
    if (!formDetail?.data?.sections) return []
    return formDetail.data.sections.flatMap((s: any) =>
      (s.fields || []).map((f: any) => ({ ...f, sectionTitle: s.title }))
    )
  }, [formDetail])

  // Auto-select all fields when form loads
  const handleFormChange = (formId: string) => {
    setSelectedFormId(formId)
    setSelectedFieldIds([]) // Reset — will auto-populate via useEffect when formDetail loads
  }

  // Auto-select all fields when form detail loads
  useEffect(() => {
    if (formFields.length > 0 && selectedFieldIds.length === 0 && selectedFormId) {
      setSelectedFieldIds(formFields.map((f: any) => f.id))
    }
  }, [formFields, selectedFormId])

  // Select/deselect all fields
  const toggleAllFields = () => {
    if (selectedFieldIds.length === formFields.length) {
      setSelectedFieldIds([])
    } else {
      setSelectedFieldIds(formFields.map((f: any) => f.id))
    }
  }

  const [triggerExport] = useLazyExportFormRecordsQuery()

  const handleExport = async () => {
    if (!selectedFormId || selectedFieldIds.length === 0) return
    setIsExporting(true)

    try {
      // Fetch export data from API
      const fieldsParam = selectedFieldIds.join(",")
      const result = await triggerExport({ formId: selectedFormId, format: "json", fields: fieldsParam }).unwrap()

      if (!result.records || result.records.length === 0) {
        toast({ title: "No Data", description: "No records found to export", variant: "destructive" })
        return
      }

      const formName = result.form?.name || "export"
      const data = result.records

      if (exportFormat === "csv") {
        exportToCSV({ filename: `${formName}_export.csv`, data, columns: result.headers })
      } else if (exportFormat === "xlsx") {
        await exportToXLSX({ filename: `${formName}_export`, data, columns: result.headers })
      } else {
        await exportToPDF({ filename: `${formName}_export`, data, columns: result.headers, title: `${formName} Export` })
      }

      toast({ title: "Export Complete", description: `${result.totalRecords} records exported as ${exportFormat.toUpperCase()}` })
    } catch (error: any) {
      toast({ title: "Export Failed", description: error.message || "Something went wrong", variant: "destructive" })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-white">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Download className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Export Data</h1>
              <p className="text-xs text-muted-foreground">Export your form records to CSV, Excel, or PDF</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6 max-w-4xl space-y-5">
        {/* Step 1: Module & Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Select Module & Form</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Module</Label>
                <Select value={selectedModuleId} onValueChange={(v) => { setSelectedModuleId(v); setSelectedFormId(""); setSelectedFieldIds([]) }}>
                  <SelectTrigger><SelectValue placeholder={loadingModules ? "Loading..." : "Select module"} /></SelectTrigger>
                  <SelectContent>
                    {modules.map((m) => (
                      <SelectItem key={m.module_id} value={m.module_id}>{m.module_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Form</Label>
                <Select value={selectedFormId} onValueChange={handleFormChange} disabled={!selectedModuleId}>
                  <SelectTrigger><SelectValue placeholder={!selectedModuleId ? "Select module first" : "Select form"} /></SelectTrigger>
                  <SelectContent>
                    {moduleForms.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Field Selection */}
        {selectedFormId && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">2. Select Fields</CardTitle>
                {formFields.length > 0 && (
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={toggleAllFields}>
                    {selectedFieldIds.length === formFields.length ? "Deselect All" : "Select All"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingForm ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading form fields...
                </div>
              ) : formFields.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No fields found in this form.</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {formFields.map((field: any) => {
                    const checked = selectedFieldIds.includes(field.id)
                    return (
                      <label
                        key={field.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${checked ? "bg-primary/5 border-primary" : "hover:bg-muted/30"}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedFieldIds((prev) =>
                              v ? [...prev, field.id] : prev.filter((id) => id !== field.id)
                            )
                          }}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate">{field.label}</span>
                        <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0">{field.type}</Badge>
                      </label>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Format & Export */}
        {selectedFieldIds.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3. Export Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={exportFormat} onValueChange={(v: any) => setExportFormat(v)} className="flex gap-4">
                <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${exportFormat === "csv" ? "bg-primary/5 border-primary" : "hover:bg-muted/30"}`}>
                  <RadioGroupItem value="csv" id="csv" />
                  <FileText className="w-4 h-4" />
                  <span className="text-sm">CSV</span>
                </label>
                <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${exportFormat === "xlsx" ? "bg-primary/5 border-primary" : "hover:bg-muted/30"}`}>
                  <RadioGroupItem value="xlsx" id="xlsx" />
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="text-sm">Excel</span>
                </label>
                <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${exportFormat === "pdf" ? "bg-primary/5 border-primary" : "hover:bg-muted/30"}`}>
                  <RadioGroupItem value="pdf" id="pdf" />
                  <FileText className="w-4 h-4" />
                  <span className="text-sm">PDF</span>
                </label>
              </RadioGroup>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{selectedFieldIds.length}</span> fields selected
                </div>
                <Button onClick={handleExport} disabled={isExporting} size="sm">
                  {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  {isExporting ? "Exporting..." : `Export as ${exportFormat.toUpperCase()}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
