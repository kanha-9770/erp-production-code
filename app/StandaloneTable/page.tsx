"use client"
import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Filter,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Hash, Mail, CheckCircle } from "lucide-react"


interface Form {
  id: string
  name: string
}

interface ProcessedFieldData {
  recordId?: string
  recordIdFromAPI?: string
  lookup: any
  options: any
  fieldId: string
  fieldLabel: string
  fieldType: string
  value: any
  displayValue: string
  icon: string
  order: number
  sectionId?: string
  sectionTitle?: string
  formId?: string
  formName?: string
}

interface EnhancedFormRecord {
  id: string
  formId: string
  formName?: string
  recordData: Record<string, any>
  submittedAt: string
  status: "pending" | "approved" | "rejected" | "submitted"
  processedData: ProcessedFieldData[]
  originalRecordIds?: Map<string, string>
  form?: any
}

interface FormFieldWithSection {
  id: string
  originalId: string
  label: string
  type: string
  order: number
  sectionTitle: string
  sectionId: string
  formId: string
  formName: string
  placeholder?: string
  description?: string
  validation?: any
  options?: any[]
  lookup?: any
}

interface EditingCell {
  recordId: string
  fieldId: string
  value: any
  originalValue: any
  fieldType: string
  options?: any[]
}

interface PendingChange {
  recordId: string
  fieldId: string
  originalFieldId: string
  value: any
  originalValue: any
  fieldType: string
  fieldLabel: string
}

const isImageUrl = (val: any): boolean => {
  if (typeof val !== "string") return false
  return val.startsWith("http") && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(val)
}

const isImageField = (label: string): boolean => {
  const lowerLabel = label.toLowerCase()
  return lowerLabel.includes("image") || lowerLabel.includes("photo") || lowerLabel.includes("camera")
}

const ExcelCell: React.FC<{
  content: string
  isExpanded: boolean
  onToggleExpand: () => void
  className?: string
  children?: React.ReactNode
}> = ({ content, isExpanded, onToggleExpand, className, children }) => {
  const needsExpansion = content && content.length > 50

  return (
    <div className={cn("relative group h-full flex items-center", className)}>
      {children ? (
        children
      ) : (
        <>
          <div
            className={cn(
              "transition-all duration-200 w-full",
              isExpanded ? "whitespace-normal break-words" : "whitespace-nowrap overflow-hidden text-ellipsis"
            )}
            title={content}
          >
            {content || "—"}
          </div>
          {needsExpansion && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded shadow-sm hover:shadow-md p-0.5 z-10"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </>
      )}
    </div>
  )
}

const StandaloneTable: React.FC = () => {
  // Dummy data
  const allModuleForms: Form[] = React.useMemo(() => [
    { id: "1", name: "User Form" },
    { id: "2", name: "Order Form" },
  ], [])

  const formRecords: EnhancedFormRecord[] = React.useMemo(() => [
    {
      id: "rec1",
      formId: "1",
      formName: "User Form",
      recordData: {
        name: { value: "John Doe", fieldId: "name", label: "Full Name", type: "text", order: 1 },
        email: { value: "john@example.com", fieldId: "email", label: "Email", type: "email", order: 2 },
        age: { value: 30, fieldId: "age", label: "Age", type: "number", order: 3 },
        status: { value: "active", fieldId: "status", label: "Status", type: "select", order: 4 },
        photo: { value: ["https://via.placeholder.com/150.jpg", "https://via.placeholder.com/150.jpg"], fieldId: "photo", label: "Photo", type: "file", order: 5 },
      },
      submittedAt: "2023-01-01T10:00:00Z",
      status: "approved",
      processedData: [],
    },
    {
      id: "rec2",
      formId: "1",
      formName: "User Form",
      recordData: {
        name: { value: "Jane Smith", fieldId: "name", label: "Full Name", type: "text", order: 1 },
        email: { value: "jane@example.com", fieldId: "email", label: "Email", type: "email", order: 2 },
        age: { value: 25, fieldId: "age", label: "Age", type: "number", order: 3 },
        status: { value: "inactive", fieldId: "status", label: "Status", type: "select", order: 4 },
        photo: { value: [], fieldId: "photo", label: "Photo", type: "file", order: 5 },
      },
      submittedAt: "2023-01-02T11:00:00Z",
      status: "pending",
      processedData: [],
    },
    {
      id: "rec3",
      formId: "1",
      formName: "User Form",
      recordData: {
        name: { value: "Bob Johnson", fieldId: "name", label: "Full Name", type: "text", order: 1 },
        email: { value: "bob@example.com", fieldId: "email", label: "Email", type: "email", order: 2 },
        age: { value: 35, fieldId: "age", label: "Age", type: "number", order: 3 },
        status: { value: "active", fieldId: "status", label: "Status", type: "select", order: 4 },
        photo: { value: ["https://via.placeholder.com/150.jpg"], fieldId: "photo", label: "Photo", type: "file", order: 5 },
      },
      submittedAt: "2023-01-03T12:00:00Z",
      status: "rejected",
      processedData: [],
    },
    // Add more for pagination demo
    {
      id: "rec4",
      formId: "1",
      formName: "User Form",
      recordData: {
        name: { value: "Alice Brown", fieldId: "name", label: "Full Name", type: "text", order: 1 },
        email: { value: "alice@example.com", fieldId: "email", label: "Email", type: "email", order: 2 },
        age: { value: 28, fieldId: "age", label: "Age", type: "number", order: 3 },
        status: { value: "active", fieldId: "status", label: "Status", type: "select", order: 4 },
        photo: { value: [], fieldId: "photo", label: "Photo", type: "file", order: 5 },
      },
      submittedAt: "2023-01-04T13:00:00Z",
      status: "approved",
      processedData: [],
    },
  ], [])

  const formFieldsWithSections: FormFieldWithSection[] = React.useMemo(() => [
    {
      id: "name",
      originalId: "name",
      label: "Full Name",
      type: "text",
      order: 1,
      sectionTitle: "Personal Info",
      sectionId: "sec1",
      formId: "1",
      formName: "User Form",
    },
    {
      id: "email",
      originalId: "email",
      label: "Email",
      type: "email",
      order: 2,
      sectionTitle: "Personal Info",
      sectionId: "sec1",
      formId: "1",
      formName: "User Form",
    },
    {
      id: "age",
      originalId: "age",
      label: "Age",
      type: "number",
      order: 3,
      sectionTitle: "Personal Info",
      sectionId: "sec1",
      formId: "1",
      formName: "User Form",
    },
    {
      id: "status",
      originalId: "status",
      label: "Status",
      type: "select",
      order: 4,
      sectionTitle: "Personal Info",
      sectionId: "sec1",
      formId: "1",
      formName: "User Form",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
    {
      id: "photo",
      originalId: "photo",
      label: "Photo",
      type: "file",
      order: 5,
      sectionTitle: "Personal Info",
      sectionId: "sec1",
      formId: "1",
      formName: "User Form",
    },
  ], [])

  // States
  const [recordSearchQuery, setRecordSearchQuery] = React.useState("")
  const [selectedFormFilter, setSelectedFormFilter] = React.useState("1")
  const [recordsPerPage, setRecordsPerPage] = React.useState(2)
  const [currentPage, setCurrentPage] = React.useState(1)
  const [selectedRecords, setSelectedRecords] = React.useState<Set<string>>(new Set())
  const [editMode] = React.useState<"locked" | "single-click" | "double-click">("double-click")
  const [editingCell, setEditingCell] = React.useState<EditingCell | null>(null)
  const [pendingChanges, setPendingChanges] = React.useState<Map<string, PendingChange>>(new Map())
  const [savingChanges] = React.useState(false)
  const [recordSortField, setRecordSortField] = React.useState("")
  const [recordSortOrder, setRecordSortOrder] = React.useState<"asc" | "desc">("asc")
  const [columnWidths, setColumnWidths] = React.useState<Map<string, number>>(new Map())
  const [expandedCells, setExpandedCells] = React.useState<Set<string>>(new Set())
  const [resizingColumn, setResizingColumn] = React.useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = React.useState(0)
  const [resizeStartWidth, setResizeStartWidth] = React.useState(0)
  const [numDummyRows, setNumDummyRows] = React.useState(0)
  const [formRecordsInternal] = React.useState(formRecords) // Not changing for demo

  const tableContainerRef = React.useRef<HTMLDivElement>(null)

  // Mock functions
  const getFieldIcon = React.useCallback((fieldType: string) => {
    switch (fieldType) {
      case "text": return Hash
      case "email": return Mail
      case "number": return Hash
      case "select": return CheckCircle
      default: return Hash
    }
  }, [])

  const getEditModeInfo = React.useCallback(() => ({
    icon: Edit,
    label: "Double Click",
    description: "Double-click cells to edit",
    color: "blue",
  }), [])

  const toggleEditMode = React.useCallback(() => {
    console.log("Toggle edit mode")
  }, [])

  const saveAllPendingChanges = React.useCallback(async (changesToSave?: Map<string, PendingChange>) => {
    console.log("Saving changes:", changesToSave)
    setPendingChanges(new Map())
    setEditingCell(null)
  }, [])

  const discardAllPendingChanges = React.useCallback(() => {
    console.log("Discarding changes")
    setPendingChanges(new Map())
  }, [])

  const setFormRecords = React.useCallback((records: EnhancedFormRecord[]) => {
    console.log("Setting records:", records)
  }, [])

  const onEditRecord = React.useCallback((record: EnhancedFormRecord) => {
    console.log("Editing record:", record)
  }, [])

  const onDeleteRecord = React.useCallback(async (record: EnhancedFormRecord) => {
    console.log("Deleting record:", record)
    // Simulate removal
    // setFormRecords(prev => prev.filter(r => r.id !== record.id))
  }, [])

  const onViewDetails = React.useCallback((record: EnhancedFormRecord) => {
    console.log("Viewing details:", record)
  }, [])

  const isAdmin = true
  // permissions omitted as admin=true

  // Copy relevant logic from original (buildProcessedDataFromRecordData, getFieldData, etc.)
  const buildProcessedDataFromRecordData = React.useCallback((rec: EnhancedFormRecord): ProcessedFieldData[] => {
    return Object.entries(rec.recordData).map(([key, field]: [string, any]) => {
      let displayVal = field.value != null ? String(field.value) : ""
      if (Array.isArray(field.value)) {
        const imgCount = field.value.filter((v: any) => isImageUrl(v)).length
        displayVal = imgCount > 0 ? `${imgCount} image${imgCount > 1 ? "s" : ""}` : displayVal
      } else if (isImageUrl(field.value)) {
        displayVal = "Image"
      }

      return {
        recordId: rec.id,
        lookup: field.lookup,
        options: field.options,
        fieldId: field.fieldId || key,
        fieldLabel: field.label,
        fieldType: field.type,
        value: field.value,
        displayValue: displayVal,
        icon: "",
        order: field.order || 999,
        sectionId: field.sectionId,
        sectionTitle: field.sectionTitle || "Default Section",
        formId: rec.formId,
        formName: rec.form?.name || rec.formName || "Unknown Form",
      }
    })
  }, [])

  const getFieldData = React.useCallback((record: EnhancedFormRecord, fieldDef: FormFieldWithSection): ProcessedFieldData | undefined => {
    if (record.formId === "merged") {
      return record.processedData.find((pd) => pd.formId === fieldDef.formId && pd.fieldId === fieldDef.originalId)
    } else {
      let matchedField = record.processedData.find((pd) => pd.fieldId === fieldDef.id)

      if (!matchedField) {
        matchedField = record.processedData.find((pd) => pd.fieldId === fieldDef.originalId)
      }

      if (!matchedField && fieldDef.id.includes('_')) {
        const parts = fieldDef.id.split('_')
        const actualFieldId = parts[parts.length - 1]
        matchedField = record.processedData.find((pd) => {
          const pdFieldId = pd.fieldId.split('_').pop()
          return pdFieldId === actualFieldId
        })
      }

      if (!matchedField) {
        // Prefer matching by label AND sectionId to avoid duplicate-label collisions
        const sectionMatch = record.processedData.find(
          (pd) => pd.fieldLabel === fieldDef.label && pd.sectionId === fieldDef.sectionId,
        )
        if (sectionMatch) return sectionMatch

        const matchingFields = record.processedData.filter((pd) => pd.fieldLabel === fieldDef.label)

        if (matchingFields.length === 0) {
          return undefined
        }

        if (matchingFields.length === 1) {
          return matchingFields[0]
        }

        if (isImageField(fieldDef.label)) {
          const allImages: string[] = []
          matchingFields.forEach((f) => {
            if (Array.isArray(f.value)) {
              allImages.push(...f.value.filter((v: any) => isImageUrl(v)))
            } else if (isImageUrl(f.value)) {
              allImages.push(f.value)
            }
          })

          if (allImages.length > 0) {
            return {
              ...matchingFields[0],
              value: allImages,
              displayValue: `${allImages.length} image${allImages.length !== 1 ? "s" : ""}`,
            }
          }
        }

        const fieldsWithValue = matchingFields.filter((f) => f.value && f.value !== "")

        if (fieldsWithValue.length === 0) {
          return matchingFields[0]
        }

        const isDateField = matchingFields[0].fieldType === "date" || matchingFields[0].fieldType === "datetime"

        if (isDateField) {
          return fieldsWithValue.reduce((latest, current) => {
            const latestDate = new Date(latest.value)
            const currentDate = new Date(current.value)
            return currentDate > latestDate ? current : latest
          })
        } else {
          return fieldsWithValue[0]
        }
      }

      return matchedField
    }
  }, [])

  const getUniqueFieldDefinitions = React.useCallback((records: EnhancedFormRecord[], isMerged: boolean) => {
    const fieldMap = new Map<string, FormFieldWithSection>()

    records.forEach((record) => {
      record.processedData.forEach((fieldData) => {
        const formId = fieldData.formId || record.formId
        const fieldId = fieldData.fieldId
        const fieldLabel = fieldData.fieldLabel

        const uniqueKey = isMerged ? `${formId}::${fieldLabel}` : fieldId

        if (!fieldMap.has(uniqueKey)) {
          const resolvedFormName = fieldData.formName || record.formName || record.form?.name || "Unknown Form"

          fieldMap.set(uniqueKey, {
            id: uniqueKey,
            originalId: fieldId,
            label: fieldLabel,
            type: fieldData.fieldType,
            order: fieldData.order || 999,
            sectionTitle: fieldData.sectionTitle || "Default Section",
            sectionId: fieldData.sectionId || "",
            formId,
            formName: resolvedFormName,
            options: fieldData.options,
            lookup: fieldData.lookup,
          })
        }
      })
    })

    const fieldsArray = Array.from(fieldMap.values())
    return fieldsArray.sort((a, b) => a.order - b.order)
  }, [])

  const computeMergedRecords = React.useCallback((): EnhancedFormRecord[] => {
    // Simplified: return empty for non-merged
    return []
  }, [])

  const sortRecords = React.useCallback((records: EnhancedFormRecord[]): EnhancedFormRecord[] => {
    const sorted = [...records].sort((a, b) => {
      let valA: any, valB: any

      if (recordSortField === "submittedAt") {
        valA = new Date(a.submittedAt).getTime()
        valB = new Date(b.submittedAt).getTime()
      } else if (recordSortField === "status") {
        valA = a.status
        valB = b.status
      } else {
        let targetFieldId: string
        let targetFormId: string | undefined

        if (recordSortField.includes("_")) {
          const parts = recordSortField.split("_", 2)
          targetFormId = parts[0]
          targetFieldId = parts[1]
        } else {
          targetFieldId = recordSortField
        }

        const fieldDataA = targetFormId
          ? a.processedData.find((pd) => (pd.formId || a.formId) === targetFormId && pd.fieldId === targetFieldId)
          : a.processedData.find((pd) => pd.fieldId === targetFieldId)

        const fieldDataB = targetFormId
          ? b.processedData.find((pd) => (pd.formId || b.formId) === targetFormId && pd.fieldId === targetFieldId)
          : b.processedData.find((pd) => pd.fieldId === targetFieldId)

        valA = fieldDataA?.displayValue || fieldDataA?.value || ""
        valB = fieldDataB?.displayValue || fieldDataB?.value || ""
      }

      if (valA < valB) return recordSortOrder === "asc" ? -1 : 1
      if (valA > valB) return recordSortOrder === "asc" ? 1 : -1
      return 0
    })

    return sorted
  }, [recordSortField, recordSortOrder])

  const populatedOriginalRecords = React.useMemo(() =>
    formRecordsInternal.map((r) => ({
      ...r,
      processedData: r.processedData.length > 0 ? [...r.processedData] : buildProcessedDataFromRecordData(r),
    }))
    , [formRecordsInternal, buildProcessedDataFromRecordData])

  const mergedRecords = React.useMemo(() => computeMergedRecords(), [computeMergedRecords])
  let baseRecords: EnhancedFormRecord[] = mergedRecords
  const isMergedMode = selectedFormFilter === "all"

  if (!isMergedMode) {
    baseRecords = populatedOriginalRecords.filter((r) => r.formId === selectedFormFilter)
  }

  const sortedRecords = React.useMemo(() => sortRecords(baseRecords), [baseRecords, sortRecords])

  let filteredRecords = React.useMemo(() => {
    let records = sortedRecords
    if (recordSearchQuery) {
      const lowerQuery = recordSearchQuery.toLowerCase()
      records = records.filter((record) =>
        record.processedData.some((pd) => (pd.displayValue ?? "").toString().toLowerCase().includes(lowerQuery)),
      )
    }
    return records
  }, [sortedRecords, recordSearchQuery])

  const totalRecords = filteredRecords.length
  const startIdx = (currentPage - 1) * recordsPerPage
  const endIdx = currentPage * recordsPerPage
  const paginatedRecords = filteredRecords.slice(startIdx, endIdx)

  const uniqueFieldDefs = React.useMemo(() => getUniqueFieldDefinitions(baseRecords, isMergedMode), [baseRecords, isMergedMode, getUniqueFieldDefinitions])

  // Render functions (renderFieldEditor, handleDoubleClick, etc.)
  const renderFieldEditor = React.useCallback((
    record: EnhancedFormRecord,
    fieldDef: FormFieldWithSection,
    actualValue: any,
    displayText: string,
  ) => {
    const fieldData = getFieldData(record, fieldDef)
    const actualRecordId = fieldData?.recordId || record.id

    const pendingChange = pendingChanges.get(`${record.id}-${fieldDef.id}`)
    const currentValue = pendingChange ? pendingChange.value : actualValue
    const originalValue = fieldData?.value ?? ""
    const originalFieldId = fieldData?.fieldId || fieldDef.originalId

    const hasImages = Array.isArray(currentValue) ? currentValue.some(isImageUrl) : isImageUrl(currentValue)

    if (isImageField(fieldDef.label) || hasImages) {
      return <Input value={displayText} disabled className="h-7 text-[10px] sm:text-xs p-1 bg-gray-100" />
    }

    const handleAutoSave = () => {
      const pendingChange = pendingChanges.get(`${record.id}-${fieldDef.id}`)
      if (pendingChange) {
        const singleChangeMap = new Map([[`${record.id}-${fieldDef.id}`, pendingChange]])
        saveAllPendingChanges(singleChangeMap)
      }
      setEditingCell(null)
    }

    if (!["lookup", "dropdown", "select"].includes(fieldDef.type)) {
      return (
        <Input
          value={currentValue}
          onChange={(e) => {
            const newValue = e.target.value
            const newPendingChanges = new Map(pendingChanges)
            newPendingChanges.set(`${record.id}-${fieldDef.id}`, {
              recordId: actualRecordId,
              fieldId: fieldDef.id,
              originalFieldId: originalFieldId,
              value: newValue,
              originalValue,
              fieldType: fieldDef.type,
              fieldLabel: fieldDef.label,
            })
            setPendingChanges(newPendingChanges)
          }}
          onBlur={() => {
            handleAutoSave()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleAutoSave()
            } else if (e.key === "Escape") {
              setPendingChanges(
                new Map(Array.from(pendingChanges).filter(([key]) => key !== `${record.id}-${fieldDef.id}`)),
              )
              setEditingCell(null)
            }
          }}
          autoFocus
          className="h-7 text-[10px] sm:text-xs p-1"
          aria-label={`Edit ${fieldDef.label}`}
        />
      )
    }

    const options = fieldDef.type === "lookup" ? (fieldDef.lookup?.options ?? []) : (fieldDef.options ?? [])
    const normalised = options.map((opt: any) => ({
      value: opt.value ?? opt.id ?? opt,
      label: opt.label ?? opt.name ?? opt,
    }))

    return (
      <Select
        value={currentValue?.toString() ?? "default"}
        onValueChange={(newValue) => {
          const newPendingChanges = new Map(pendingChanges)
          newPendingChanges.set(`${record.id}-${fieldDef.id}`, {
            recordId: actualRecordId,
            fieldId: fieldDef.id,
            originalFieldId: originalFieldId,
            value: newValue,
            originalValue,
            fieldType: fieldDef.type,
            fieldLabel: fieldDef.label,
          })
          setPendingChanges(newPendingChanges)
          setTimeout(() => {
            const singleChangeMap = new Map([
              [`${record.id}-${fieldDef.id}`, newPendingChanges.get(`${record.id}-${fieldDef.id}`)!],
            ])
            saveAllPendingChanges(singleChangeMap)
          }, 0)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCell(null)
          }
        }}
      >
        <SelectTrigger className="h-7 text-[10px] sm:text-xs p-1">
          <SelectValue placeholder="— Select —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">— None —</SelectItem>
          {normalised.map((opt: any) => (
            <SelectItem key={opt.value} value={opt.value.toString()}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }, [pendingChanges, setPendingChanges, getFieldData, saveAllPendingChanges])

  const handleDoubleClick = React.useCallback((record: EnhancedFormRecord, fieldDef: FormFieldWithSection) => {
    if (editMode !== "double-click" || savingChanges || isImageField(fieldDef.label)) return

    const fieldData = getFieldData(record, fieldDef)
    if (!fieldData) return

    const actualValue = fieldData.value || ""
    const hasImages = Array.isArray(actualValue) ? actualValue.some(isImageUrl) : isImageUrl(actualValue)
    if (hasImages) return

    setEditingCell({
      recordId: record.id,
      fieldId: fieldDef.id,
      value: fieldData.value || "",
      originalValue: fieldData.value || "",
      fieldType: fieldDef.type,
      options: fieldDef.options,
    })
  }, [editMode, savingChanges, getFieldData])

  const handleKeyDown = React.useCallback((
    e: React.KeyboardEvent<HTMLDivElement>,
    record: EnhancedFormRecord,
    fieldDef: FormFieldWithSection,
  ) => {
    if (e.key === "Enter" && !savingChanges && editMode !== "locked" && !isImageField(fieldDef.label)) {
      const fieldData = getFieldData(record, fieldDef)
      if (!fieldData) return

      const actualValue = fieldData.value || ""
      const hasImages = Array.isArray(actualValue) ? actualValue.some(isImageUrl) : isImageUrl(actualValue)
      if (hasImages) return

      setEditingCell({
        recordId: record.id,
        fieldId: fieldDef.id,
        value: fieldData.value || "",
        originalValue: fieldData.value || "",
        fieldType: fieldDef.type,
        options: fieldDef.options,
      })
    }
  }, [savingChanges, editMode, getFieldData])

  const handleResizeStart = React.useCallback((e: React.MouseEvent, fieldId: string, currentWidth: number) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(fieldId)
    setResizeStartX(e.clientX)
    setResizeStartWidth(currentWidth)
  }, [])

  React.useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartX
      const newWidth = Math.max(100, resizeStartWidth + deltaX)
      setColumnWidths((prev) => {
        const updated = new Map(prev)
        updated.set(resizingColumn, newWidth)
        return updated
      })
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [resizingColumn, resizeStartX, resizeStartWidth])

  const toggleCellExpansion = React.useCallback((cellKey: string) => {
    setExpandedCells((prev) => {
      const updated = new Set(prev)
      if (updated.has(cellKey)) {
        updated.delete(cellKey)
      } else {
        updated.add(cellKey)
      }
      return updated
    })
  }, [])

  React.useEffect(() => {
    const calculateFillers = () => {
      if (!tableContainerRef.current) return
      const containerHeight = tableContainerRef.current.clientHeight
      const headerHeight = 40 // Approximate header height (h-10)
      const rowHeight = 36 // Approximate row height (h-9)
      const maxRows = Math.floor((containerHeight - headerHeight) / rowHeight)
      const numDummy = Math.max(0, maxRows - paginatedRecords.length)
      setNumDummyRows(numDummy)
    }

    const timer = setTimeout(calculateFillers, 100) // Delay to ensure render

    const resizeHandler = () => calculateFillers()
    window.addEventListener("resize", resizeHandler)

    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", resizeHandler)
    }
  }, [paginatedRecords.length])

  const handleViewDetails = React.useCallback((record: EnhancedFormRecord) => {
    onViewDetails(record)
  }, [onViewDetails])

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-screen bg-gray-50">
      <Card className="border-none rounded-none shadow-none bg-transparent overflow-hidden flex-1 flex flex-col">
        <CardContent className="p-4 space-y-4 flex-1 flex flex-col">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search all records..."
                  value={recordSearchQuery}
                  onChange={(e) => setRecordSearchQuery(e.target.value)}
                  className="pl-10 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-9 text-sm rounded-lg transition-all duration-200 hover:border-gray-400"
                />
              </div>
            </div>
            <div>
              <Select value={selectedFormFilter} onValueChange={setSelectedFormFilter}>
                <SelectTrigger className="h-9 rounded-lg border-gray-300 hover:border-gray-400 transition-all duration-200">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by form" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Forms</SelectItem>
                  {allModuleForms.map((form) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={recordsPerPage.toString()} onValueChange={(value) => setRecordsPerPage(Number(value))}>
                <SelectTrigger className="h-9 rounded-lg border-gray-300 hover:border-gray-400 transition-all duration-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 per page</SelectItem>
                  <SelectItem value="5">5 per page</SelectItem>
                  <SelectItem value="10">10 per page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {totalRecords > recordsPerPage && (
            <div className="flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-300 p-4 rounded-xl shadow-sm">
              <div className="text-sm font-medium text-gray-700">
                Showing <span className="font-bold text-blue-600">{startIdx + 1}</span> to{" "}
                <span className="font-bold text-blue-600">{Math.min(endIdx, totalRecords)}</span> of{" "}
                <span className="font-bold text-blue-600">{totalRecords}</span> records
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="text-sm font-medium text-gray-700 min-w-[120px] text-center">
                  Page <span className="font-bold text-blue-600">{currentPage}</span> of{" "}
                  <span className="font-bold text-blue-600">{Math.ceil(totalRecords / recordsPerPage)}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(Math.ceil(totalRecords / recordsPerPage), currentPage + 1))}
                  disabled={currentPage >= Math.ceil(totalRecords / recordsPerPage)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          <div className="border border-gray-200 bg-white rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="overflow-auto h-[75vh] max-h-[75vh]" ref={tableContainerRef}>
              <div className="inline-block min-w-full">
                <div style={{ fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif" }}>
                  <div className="flex bg-gradient-to-r from-slate-100 via-gray-100 to-slate-100 border-b-2 border-gray-400 sticky top-0 z-20 min-w-max shadow-sm">
                    <div className="w-10 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Checkbox
                        checked={selectedRecords.size === paginatedRecords.length && paginatedRecords.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRecords(new Set(paginatedRecords.map((r) => r.id)))
                          } else {
                            setSelectedRecords(new Set())
                          }
                        }}
                        className="h-4 w-4"
                      />
                    </div>
                    <div className="w-12 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
                      #
                    </div>
                    <div className="w-20 sm:w-24 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
                      Actions
                    </div>
                    {uniqueFieldDefs.map((field) => {
                      const defaultWidth = 192
                      const columnWidth = columnWidths.get(field.id) || defaultWidth
                      return (
                        <div
                          key={field.id}
                          className="relative h-10 border-r border-gray-300 bg-slate-100 flex items-center text-xs font-bold text-gray-900 px-2 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-100 transition-all duration-200 flex-shrink-0 group"
                          style={{ width: `${columnWidth}px` }}
                          title={`${field.formName} - ${field.sectionTitle}\n${field.label}`}
                          onClick={() => {
                            if (recordSortField === field.id) {
                              setRecordSortOrder(recordSortOrder === "asc" ? "desc" : "asc")
                            } else {
                              setRecordSortField(field.id)
                              setRecordSortOrder("asc")
                            }
                          }}
                        >
                          <div className="flex items-center justify-between w-full gap-1">
                            <div className="flex items-center gap-1 min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                                {isMergedMode && (
                                  <div className="text-[10px] sm:text-[11px] text-blue-600 font-semibold uppercase tracking-wide truncate w-full">
                                    {field.formName}
                                  </div>
                                )}
                                <div className="flex items-center gap-1 w-full">
                                  {React.createElement(getFieldIcon(field.type), {
                                    className: "h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0 text-gray-600",
                                  })}
                                  <span className="truncate text-[11px] sm:text-xs font-bold text-gray-900">
                                    {field.label}
                                  </span>
                                  {recordSortField === field.id &&
                                    (recordSortOrder === "asc" ? (
                                      <ArrowUp className="h-3 w-3 flex-shrink-0" />
                                    ) : (
                                      <ArrowDown className="h-3 w-3 flex-shrink-0" />
                                    ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-gradient-to-b hover:from-blue-500 hover:to-blue-600 bg-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                            onMouseDown={(e) => handleResizeStart(e, field.id, columnWidth)}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to resize column"
                          />
                        </div>
                      )
                    })}
                  </div>

                  {paginatedRecords.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-gray-500">
                      <p className="text-sm font-medium">No records found</p>
                    </div>
                  ) : (
                    <>
                      {paginatedRecords.map((record, rowIndex) => {
                        const canEditThisRecord = true // admin
                        const canDeleteThisRecord = true // admin
                        return (
                          <div
                            key={record.id}
                            className="flex hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all duration-200 min-w-max border-b border-gray-200 last:border-b-0"
                          >
                            <div className="w-10 h-9 border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
                              <Checkbox
                                checked={selectedRecords.has(record.id)}
                                onCheckedChange={(checked) => {
                                  const newSelected = new Set(selectedRecords)
                                  if (checked) newSelected.add(record.id)
                                  else newSelected.delete(record.id)
                                  setSelectedRecords(newSelected)
                                }}
                                className="h-4 w-4"
                              />
                            </div>
                            <div className="w-12 h-9 border-r border-gray-200 bg-gray-50 flex items-center justify-center text-xs font-semibold text-gray-700 flex-shrink-0">
                              {startIdx + rowIndex + 1}
                            </div>
                            <div className="w-20 sm:w-24 h-9 border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-gray-200 rounded">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuLabel className="text-xs font-bold">Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-xs cursor-pointer"
                                    onClick={() => handleViewDetails(record)}
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={cn("text-xs cursor-pointer", !canEditThisRecord && "text-gray-400 opacity-50")}
                                    onClick={() => canEditThisRecord && onEditRecord(record)}
                                    disabled={!canEditThisRecord}
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Record
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className={cn("text-xs text-red-600 cursor-pointer", !canDeleteThisRecord && "text-gray-400 opacity-50")}
                                    onClick={async () => {
                                      if (canDeleteThisRecord && window.confirm("Are you sure you want to delete this record?")) {
                                        await onDeleteRecord(record)
                                      }
                                    }}
                                    disabled={!canDeleteThisRecord}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Record
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {uniqueFieldDefs.map((fieldDef) => {
                              const fieldData = getFieldData(record, fieldDef)
                              const pendingChange = pendingChanges.get(`${record.id}-${fieldDef.id}`)
                              const actualValue = pendingChange ? pendingChange.value : fieldData?.value || null
                              const displayText = pendingChange
                                ? pendingChange.value?.toString() || fieldData?.displayValue || ""
                                : fieldData?.displayValue || ""

                              const isEditing =
                                editingCell && editingCell.recordId === record.id && editingCell.fieldId === fieldDef.id

                              const cellKey = `${record.id}-${fieldDef.id}`
                              const isExpanded = expandedCells.has(cellKey)
                              const defaultWidth = 192
                              const columnWidth = columnWidths.get(fieldDef.id) || defaultWidth

                              const canEditThisField = true // admin
                              const hasImages = Array.isArray(actualValue) ? actualValue.some(isImageUrl) : isImageUrl(actualValue)
                              const isImageColumn = isImageField(fieldDef.label) || hasImages

                              return (
                                <div
                                  key={cellKey}
                                  className={cn(
                                    "border-r border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200",
                                    isExpanded ? "h-auto min-h-[36px] py-2 items-start" : "h-9 items-center",
                                    isEditing && "ring-2 ring-inset ring-blue-500 bg-blue-50 shadow-inner",
                                    pendingChange && !isEditing && "bg-gradient-to-r from-yellow-50 to-amber-50 font-semibold border-l-2 border-l-yellow-400",
                                    editMode === "double-click" &&
                                    !isEditing &&
                                    !isImageColumn &&
                                    canEditThisField &&
                                    "cursor-pointer hover:bg-gray-50",
                                  )}
                                  style={{ width: `${columnWidth}px` }}
                                  title={!isImageColumn ? `${fieldDef.label}: ${displayText}` : fieldDef.label}
                                  onDoubleClick={canEditThisField ? () => handleDoubleClick(record, fieldDef) : undefined}
                                  onKeyDown={canEditThisField ? (e) => handleKeyDown(e, record, fieldDef) : undefined}
                                  tabIndex={canEditThisField && !isImageColumn ? 0 : undefined}
                                  role={canEditThisField && !isImageColumn ? "button" : undefined}
                                  aria-label={
                                    canEditThisField && !isImageColumn ? `${fieldDef.label}: ${displayText}` : undefined
                                  }
                                >
                                  <div className={cn("w-full", isExpanded ? "min-h-[20px]" : "h-full flex items-center")}>
                                    {isEditing ? (
                                      renderFieldEditor(record, fieldDef, actualValue, displayText)
                                    ) : isImageColumn ? (
                                      <div className="flex items-center gap-2 flex-wrap py-1">
                                        {Array.isArray(actualValue) ? (
                                          actualValue.filter(isImageUrl).slice(0, 3).map((url: string, idx: number) => (
                                            <img
                                              key={idx}
                                              src={url}
                                              alt={`${fieldDef.label} ${idx + 1}`}
                                              className="h-7 w-7 object-cover rounded border border-gray-300"
                                              onError={(e) => {
                                                e.currentTarget.style.display = 'none'
                                              }}
                                            />
                                          ))
                                        ) : isImageUrl(actualValue) ? (
                                          <img
                                            src={actualValue}
                                            alt={fieldDef.label}
                                            className="h-7 w-7 object-cover rounded border border-gray-300"
                                            onError={(e) => {
                                              e.currentTarget.style.display = 'none'
                                            }}
                                          />
                                        ) : (
                                          <span className="text-xs text-gray-400">No image</span>
                                        )}
                                        {Array.isArray(actualValue) && actualValue.filter(isImageUrl).length > 3 && (
                                          <span className="text-xs text-gray-500 font-medium">
                                            +{actualValue.filter(isImageUrl).length - 3}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <ExcelCell
                                        content={displayText}
                                        isExpanded={isExpanded}
                                        onToggleExpand={() => toggleCellExpansion(cellKey)}
                                        className="w-full"
                                      />
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}

                      {Array.from({ length: numDummyRows }).map((_, dummyIndex) => (
                        <div
                          key={`dummy-${dummyIndex}`}
                          className="flex h-9 border-b border-gray-200 bg-white min-w-max last:border-b-0"
                        >
                          <div className="w-10 border-r border-gray-200 flex items-center justify-center flex-shrink-0" />
                          <div className="w-12 border-r border-gray-200 flex items-center justify-center flex-shrink-0" />
                          <div className="w-20 sm:w-24 border-r border-gray-200 flex items-center justify-center flex-shrink-0" />
                          {uniqueFieldDefs.map((field) => {
                            const defaultWidth = 192
                            const columnWidth = columnWidths.get(field.id) || defaultWidth
                            return (
                              <div
                                key={field.id}
                                className="border-r border-gray-200 bg-white px-3 flex items-center flex-shrink-0"
                                style={{ width: `${columnWidth}px` }}
                              />
                            )
                          })}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default StandaloneTable