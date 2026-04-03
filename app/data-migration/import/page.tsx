"use client"

import { useState, useMemo, useEffect } from "react"
import { Upload, ArrowLeft, Loader2, Check, AlertCircle, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useGetPermittedModulesQuery } from "@/lib/api/modules"
import { useGetFormDetailQuery } from "@/lib/api/forms"
import {
  useCreateImportJobMutation,
  useAddImportMappingMutation,
  useProcessImportMutation,
} from "@/lib/api/forms"
import {
  FileUpload,
  type ParsedFilePreview,
} from "@/components/data-migration/file-upload"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import Link from "next/link"

type ImportStep = "select" | "upload" | "map" | "result"

export default function ImportPage() {
  const { toast } = useToast()
  const [step, setStep] = useState<ImportStep>("select")
  const [selectedModuleId, setSelectedModuleId] = useState("")
  const [selectedFormId, setSelectedFormId] = useState("")
  const [uploadedFile, setUploadedFile] = useState<{ file: File; preview: ParsedFilePreview } | null>(null)
  const [mappings, setMappings] = useState<{ sourceColumn: string; targetFieldId: string }[]>([])
  const [importResult, setImportResult] = useState<{ success: number; failed: number; skipped: number } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; percent: number } | null>(null)

  // RTK Query
  const { data: modulesData, isLoading: loadingModules } = useGetPermittedModulesQuery()
  const { data: formDetail, isLoading: loadingForm } = useGetFormDetailQuery(selectedFormId, { skip: !selectedFormId })
  const [createImportJob] = useCreateImportJobMutation()
  const [addImportMapping] = useAddImportMappingMutation()
  const [processImport] = useProcessImportMutation()

  const modules = modulesData?.modules || []

  const moduleForms = useMemo(() => {
    if (!selectedModuleId) return []
    const mod = modules.find((m) => m.module_id === selectedModuleId)
    return mod?.forms?.filter((f) => f.isPublished) || []
  }, [modules, selectedModuleId])

  // Get form fields for mapping
  const formFields = useMemo(() => {
    if (!formDetail?.data?.sections) return []
    return formDetail.data.sections.flatMap((s: any) =>
      (s.fields || []).map((f: any) => ({ id: f.id, label: f.label, type: f.type }))
    )
  }, [formDetail])

  // Auto-map columns to fields by label match
  const autoMap = () => {
    const hdrs = uploadedFile?.preview.headers
    if (!hdrs || !Array.isArray(hdrs) || hdrs.length === 0 || formFields.length === 0) return
    const newMappings: { sourceColumn: string; targetFieldId: string }[] = []
    for (const header of hdrs) {
      const match = formFields.find(
        (f: any) => f.label.toLowerCase().trim() === header.toLowerCase().trim()
      )
      if (match) {
        newMappings.push({ sourceColumn: header, targetFieldId: match.id })
      }
    }
    setMappings(newMappings)
  }

  // Auto-map when file is uploaded and formFields are ready
  useEffect(() => {
    if (uploadedFile && formFields.length > 0 && step === "map" && mappings.length === 0) {
      autoMap()
    }
  }, [uploadedFile, formFields, step])

  const handleFileUpload = (file: File, preview: ParsedFilePreview) => {
    setUploadedFile({ file, preview })
    setMappings([])
    setStep("map")
  }

  const CHUNK_SIZE = 200 // Rows per chunk — balances payload size vs HTTP overhead

  const handleImport = async () => {
    if (!uploadedFile || mappings.length === 0 || !selectedFormId) return
    setIsProcessing(true)
    setImportProgress(null)

    try {
      // Step 1: Create import job
      const jobResult = await createImportJob({
        moduleId: selectedModuleId,
        formId: selectedFormId,
        fileName: uploadedFile.file.name,
        fileSize: uploadedFile.file.size,
        duplicateHandling: "insert",
      }).unwrap()

      if (!jobResult.success) throw new Error(jobResult.error || "Failed to create import job")

      const importJobId = jobResult.importJobId || jobResult.data?.id || jobResult.data
      if (!importJobId) throw new Error("No import job ID returned")

      // Step 2: Save mappings
      await addImportMapping({
        importJobId,
        mappings: mappings.map((m) => ({ sourceColumn: m.sourceColumn, targetFieldId: m.targetFieldId })),
      }).unwrap()

      // Step 3: Convert all rows to objects
      const { headers, allRows } = uploadedFile.preview
      const allDataRows = allRows || uploadedFile.preview.rows
      const rowObjects = allDataRows.map((row) => {
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = row[i] || "" })
        return obj
      })

      // Step 4: Send rows in chunks
      const totalRows = rowObjects.length
      const totalChunks = Math.ceil(totalRows / CHUNK_SIZE)
      let totalSuccess = 0
      let totalFailed = 0
      let totalSkipped = 0

      setImportProgress({ current: 0, total: totalRows, percent: 0 })

      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        const start = chunkIdx * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, totalRows)
        const chunkRows = rowObjects.slice(start, end)

        const chunkResult = await processImport({
          importJobId,
          rows: chunkRows,
          chunkIndex: chunkIdx,
          totalChunks,
        }).unwrap()

        totalSuccess += chunkResult.successCount || 0
        totalFailed += chunkResult.failedCount || 0
        totalSkipped += chunkResult.skippedCount || 0

        setImportProgress({
          current: end,
          total: totalRows,
          percent: Math.round((end / totalRows) * 100),
        })
      }

      setImportResult({
        success: totalSuccess,
        failed: totalFailed,
        skipped: totalSkipped,
      })
      setStep("result")
      toast({ title: "Import Complete", description: `${totalSuccess} records imported successfully` })
    } catch (error: any) {
      const errorMsg = error?.data?.error || error?.data?.details || error?.message || "Something went wrong"
      toast({ title: "Import Failed", description: errorMsg, variant: "destructive" })
    } finally {
      setIsProcessing(false)
      setImportProgress(null)
    }
  }

  const resetWizard = () => {
    setStep("select")
    setSelectedModuleId("")
    setSelectedFormId("")
    setUploadedFile(null)
    setMappings([])
    setImportResult(null)
    setImportProgress(null)
  }

  const getMappingForColumn = (col: string) => mappings.find((m) => m.sourceColumn === col)?.targetFieldId || ""

  const updateMapping = (sourceColumn: string, targetFieldId: string) => {
    setMappings((prev) => {
      const filtered = prev.filter((m) => m.sourceColumn !== sourceColumn)
      if (targetFieldId && targetFieldId !== "__none__") {
        return [...filtered, { sourceColumn, targetFieldId }]
      }
      return filtered
    })
  }

  const steps: { key: ImportStep; label: string }[] = [
    { key: "select", label: "Select" },
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map" },
    { key: "result", label: "Done" },
  ]

  const currentStepIndex = steps.findIndex((s) => s.key === step)

  return (
    <div className="min-h-screen bg-background">
      {/* ─── MOBILE-RESPONSIVE HEADER ─── */}
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 relative">
          {/* Row 1: Back button + icon + title + desktop step indicator */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </Link>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold leading-tight">Import Data</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight hidden sm:block">
                Import records from CSV or Excel files
              </p>
            </div>

            {/* Desktop step indicator (hidden on mobile) */}
            <div className="ml-auto hidden sm:flex items-center gap-1 text-xs">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <Badge variant={step === s.key ? "default" : "secondary"} className="text-[10px] px-2 py-0 whitespace-nowrap">
                    {s.label}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile step progress bar (hidden on desktop) */}
          <div className="flex items-start justify-between mt-4 px-2 sm:hidden">
            {steps.map((s, i) => {
              const isCompleted = i < currentStepIndex
              const isActive = s.key === step
              return (
                <div key={s.key} className="flex flex-1 items-start">
                  {/* Step circle + label */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`
                        w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold
                        transition-all duration-300 shrink-0
                        ${isCompleted
                          ? "bg-blue-600 text-white"
                          : isActive
                            ? "bg-blue-600 text-white ring-4 ring-blue-100"
                            : "bg-gray-100 text-gray-400 border border-gray-200"
                        }
                      `}
                    >
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span
                      className={`
                        text-[10px] mt-1 font-medium whitespace-nowrap
                        ${isActive ? "text-blue-600" : isCompleted ? "text-gray-700" : "text-gray-400"}
                      `}
                    >
                      {s.label}
                    </span>
                  </div>

                  {/* Connecting line (not after the last step) */}
                  {i < steps.length - 1 && (
                    <div className="flex-1 mt-3.5 mx-1">
                      <div className="h-[2px] w-full rounded-full bg-gray-200 relative">
                        <div
                          className={`
                            absolute inset-y-0 left-0 rounded-full transition-all duration-500
                            ${i < currentStepIndex ? "w-full bg-blue-600" : "w-0 bg-blue-600"}
                          `}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 max-w-4xl space-y-5">
        {/* Step 1: Select Module & Form */}
        {step === "select" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select Module & Form</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Module</Label>
                  <Select value={selectedModuleId} onValueChange={(v) => { setSelectedModuleId(v); setSelectedFormId("") }}>
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
                  <Select value={selectedFormId} onValueChange={setSelectedFormId} disabled={!selectedModuleId}>
                    <SelectTrigger><SelectValue placeholder={!selectedModuleId ? "Select module first" : "Select form"} /></SelectTrigger>
                    <SelectContent>
                      {moduleForms.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button disabled={!selectedFormId || loadingForm} onClick={() => setStep("upload")} size="sm">
                  {loadingForm ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Upload File */}
        {step === "upload" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload CSV or Excel File</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUpload
                onFileUpload={handleFileUpload}
                uploadedFile={uploadedFile}
                onFileRemove={() => setUploadedFile(null)}
              />
              <div className="flex justify-between mt-4">
                <Button variant="outline" size="sm" onClick={() => setStep("select")}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Map Fields */}
        {step === "map" && uploadedFile && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base">Map Columns to Fields</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {mappings.length}/{uploadedFile.preview.headers.length} mapped
                  </Badge>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={autoMap}>
                    Auto-Map
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Desktop table view */}
              <div className="border rounded-lg overflow-hidden hidden sm:block">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-xs w-[40%]">File Column</TableHead>
                      <TableHead className="text-xs w-[15%]">Sample</TableHead>
                      <TableHead className="text-xs">Map To Form Field</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadedFile.preview.headers.map((header, idx) => {
                      const sampleValues = uploadedFile.preview.rows.slice(0, 3).map((r) => r[idx]).filter(Boolean)
                      const currentTarget = getMappingForColumn(header)
                      return (
                        <TableRow key={header}>
                          <TableCell className="text-xs font-medium">{header}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                            {sampleValues[0] || "—"}
                          </TableCell>
                          <TableCell>
                            <Select value={currentTarget || "__none__"} onValueChange={(v) => updateMapping(header, v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Skip" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Skip —</SelectItem>
                                {formFields.map((f: any) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.label} <span className="text-muted-foreground">({f.type})</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card view for mapping */}
              <div className="space-y-3 sm:hidden">
                {uploadedFile.preview.headers.map((header, idx) => {
                  const sampleValues = uploadedFile.preview.rows.slice(0, 3).map((r) => r[idx]).filter(Boolean)
                  const currentTarget = getMappingForColumn(header)
                  return (
                    <div key={header} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{header}</span>
                        {currentTarget && currentTarget !== "__none__" && (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        )}
                      </div>
                      {sampleValues[0] && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          Sample: {sampleValues[0]}
                        </p>
                      )}
                      <Select value={currentTarget || "__none__"} onValueChange={(v) => updateMapping(header, v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Skip" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Skip —</SelectItem>
                          {formFields.map((f: any) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.label} <span className="text-muted-foreground">({f.type})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>

              {/* Progress bar for chunked import */}
              {isProcessing && importProgress && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Importing {importProgress.current} of {importProgress.total} rows...</span>
                    <span className="font-medium">{importProgress.percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => setStep("upload")} disabled={isProcessing}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                  <span className="text-xs text-muted-foreground text-center sm:text-left">
                    {uploadedFile.preview.totalRows} rows to import
                  </span>
                  <Button
                    onClick={handleImport}
                    disabled={mappings.length === 0 || isProcessing}
                    size="sm"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {isProcessing ? "Importing..." : `Import ${uploadedFile.preview.totalRows} Records`}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Result */}
        {step === "result" && importResult && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold">Import Complete</h2>
                <div className="flex justify-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{importResult.success}</div>
                    <div className="text-muted-foreground">Imported</div>
                  </div>
                  {importResult.failed > 0 && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
                      <div className="text-muted-foreground">Failed</div>
                    </div>
                  )}
                  {importResult.skipped > 0 && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">{importResult.skipped}</div>
                      <div className="text-muted-foreground">Skipped</div>
                    </div>
                  )}
                </div>
                <Button onClick={resetWizard} variant="outline" className="mt-4">
                  Import More Data
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
