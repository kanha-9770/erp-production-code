"use client"

import React from "react"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Search,
  Download,
  Eye,
  Calendar,
  Users,
  FileText,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  TableIcon,
  TimerIcon as Timeline,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Home,
  Folder,
  CheckCircle,
  AlertCircle,
  XCircle,
  Mail,
  Hash,
  Type,
  CalendarDays,
  Link,
  Upload,
  CheckSquare,
  Radio,
  ChevronDown,
  Grid3X3,
  Database,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  Save,
  X,
  Loader2,
  Lock,
  Edit3,
  MousePointer2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Form, FormRecord, FormModule, FormField } from "@/types/form-builder"

interface StatsData {
  totalRecords: number
  todayRecords: number
  weekRecords: number
  monthRecords: number
}

interface EnhancedLookupSource {
  id: string
  name: string
  type: "form" | "module"
  recordCount: number
  description?: string
  moduleName?: string
  moduleId?: string
  breadcrumb: string
  createdAt: Date
  updatedAt: Date
  isPublished?: boolean
  fieldCount?: number
}

interface EnhancedLinkedForm {
  id: string
  name: string
  recordCount: number
  description?: string
  moduleName?: string
  moduleId?: string
  breadcrumb: string
  createdAt: Date
  updatedAt: Date
  isPublished?: boolean
  fieldCount?: number
  lookupFieldsCount?: number
}

interface ProcessedFieldData {
  fieldId: string
  fieldLabel: string
  fieldType: string
  value: any
  displayValue: string
  icon: string
  order: number
  sectionId?: string
  sectionTitle?: string
}

interface EnhancedFormRecord extends FormRecord {
  processedData: ProcessedFieldData[]
}

interface FormFieldWithSection {
  id: string
  label: string
  type: string
  order: number
  sectionTitle: string
  sectionId: string
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
  value: any
  originalValue: any
  fieldType: string
  fieldLabel: string
}

export default function RecordsPage() {
  const params = useParams()
  const formId = params.formId as string
  const { toast } = useToast()

  // State management
  const [module, setModule] = useState<FormModule | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [records, setRecords] = useState<EnhancedFormRecord[]>([])
  const [lookupSources, setLookupSources] = useState<EnhancedLookupSource[]>([])
  const [linkedForms, setLinkedForms] = useState<EnhancedLinkedForm[]>([])
  const [allFormFields, setAllFormFields] = useState<FormField[]>([])
  const [formFieldsWithSections, setFormFieldsWithSections] = useState<FormFieldWithSection[]>([])
  const [stats, setStats] = useState<StatsData>({
    totalRecords: 0,
    todayRecords: 0,
    weekRecords: 0,
    monthRecords: 0,
  })

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<EnhancedFormRecord | null>(null)
  const [editingRecord, setEditingRecord] = useState<EnhancedFormRecord | null>(null)
  const [deleteRecord, setDeleteRecord] = useState<EnhancedFormRecord | null>(null)
  const [viewMode, setViewMode] = useState<"table" | "timeline" | "excel">("excel")
  const [activeTab, setActiveTab] = useState("records")

  // ENHANCED INLINE EDITING STATE - DOUBLE CLICK + GLOBAL EDIT MODE
  const [editMode, setEditMode] = useState<"locked" | "single-click" | "double-click">("double-click")
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map())
  const [savingChanges, setSavingChanges] = useState(false)
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null)
  const [clickCount, setClickCount] = useState<Map<string, number>>(new Map())

  // Dialog states
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Form data for editing/creating
  const [editFormData, setEditFormData] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Filters and pagination
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState("submittedAt")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const recordsPerPage = 20

  // Refs for input focus
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Helper function to get field icon
  const getFieldIcon = (fieldType: string) => {
    switch (fieldType) {
      case "text":
        return Type
      case "email":
        return Mail
      case "number":
        return Hash
      case "date":
      case "datetime":
        return CalendarDays
      case "checkbox":
        return CheckSquare
      case "radio":
        return Radio
      case "select":
        return ChevronDown
      case "file":
        return Upload
      case "lookup":
        return Link
      case "textarea":
        return FileText
      case "tel":
      case "phone":
        return Hash
      case "url":
        return Link
      default:
        return Type
    }
  }

  // Enhanced helper function to format field values based on type
  const formatFieldValue = (fieldType: string, value: any): string => {
    if (value === null || value === undefined) return ""
    if (value === "") return ""

    switch (fieldType) {
      case "date":
      case "datetime":
        if (value) {
          try {
            const date = new Date(value)
            return date.toLocaleDateString()
          } catch {
            return String(value)
          }
        }
        return ""
      case "email":
      case "tel":
      case "phone":
      case "text":
      case "textarea":
      case "url":
        return String(value)
      case "number":
        if (typeof value === "number") {
          return value.toLocaleString()
        }
        if (typeof value === "string" && !isNaN(Number(value))) {
          return Number(value).toLocaleString()
        }
        return String(value)
      case "checkbox":
      case "switch":
        if (typeof value === "boolean") {
          return value ? "✓ Yes" : "✗ No"
        }
        if (typeof value === "string") {
          return value.toLowerCase() === "true" || value === "1" ? "✓ Yes" : "✗ No"
        }
        return value ? "✓ Yes" : "✗ No"
      case "lookup":
        return String(value)
      case "file":
        if (typeof value === "object" && value !== null) {
          if (value.name) return String(value.name)
          if (Array.isArray(value)) {
            return `${value.length} file(s)`
          }
          if (value.files && Array.isArray(value.files)) {
            return `${value.files.length} file(s)`
          }
        }
        return String(value)
      case "radio":
      case "select":
        return String(value)
      default:
        if (typeof value === "object" && value !== null) {
          return JSON.stringify(value).substring(0, 50) + "..."
        }
        return String(value)
    }
  }

  // Process record data to extract field values properly
  const processRecordData = (record: FormRecord, formFields: FormFieldWithSection[]): EnhancedFormRecord => {
    const processedData: ProcessedFieldData[] = []

    // Create field lookup map by ID
    const fieldById = new Map<string, FormFieldWithSection>()
    formFields.forEach((field) => {
      fieldById.set(field.id, field)
    })

    if (record.recordData && typeof record.recordData === "object") {
      // Process each field in the record data
      Object.entries(record.recordData).forEach(([fieldKey, fieldData]) => {
        if (typeof fieldData === "object" && fieldData !== null) {
          const fieldInfo = fieldData as any

          // Get the form field definition
          const formField = fieldById.get(fieldKey)

          const displayValue = formatFieldValue(fieldInfo.type || "text", fieldInfo.value)

          processedData.push({
            fieldId: fieldKey,
            fieldLabel: fieldInfo.label || fieldKey,
            fieldType: fieldInfo.type || "text",
            value: fieldInfo.value,
            displayValue: displayValue,
            icon: fieldInfo.type || "text",
            order: formField?.order || fieldInfo.order || 999,
            sectionId: fieldInfo.sectionId,
            sectionTitle: fieldInfo.sectionTitle,
          })
        }
      })
    }

    // Sort by field order
    processedData.sort((a, b) => a.order - b.order)

    return {
      ...record,
      processedData,
    }
  }

  // ENHANCED CLICK HANDLING - DOUBLE CLICK + SINGLE CLICK MODES
  const handleCellClick = (
    recordId: string,
    fieldId: string,
    currentValue: any,
    fieldType: string,
    event: React.MouseEvent,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const cellKey = `${recordId}-${fieldId}`

    console.log("Cell clicked:", {
      cellKey,
      editMode,
      fieldType,
      currentClickCount: clickCount.get(cellKey) || 0,
    })

    // Don't allow editing of file fields
    if (fieldType === "file") {
      toast({
        title: "Cannot Edit",
        description: "File fields cannot be edited inline",
        variant: "destructive",
      })
      return
    }

    // If table is locked, do nothing
    if (editMode === "locked") {
      return
    }

    // If single-click mode, edit immediately
    if (editMode === "single-click") {
      startCellEdit(recordId, fieldId, currentValue, fieldType)
      return
    }

    // Double-click mode logic
    if (editMode === "double-click") {
      const currentCount = clickCount.get(cellKey) || 0
      const newCount = currentCount + 1

      // Clear any existing timeout for this cell
      if (clickTimeout) {
        clearTimeout(clickTimeout)
      }

      // Update click count
      setClickCount((prev) => new Map(prev.set(cellKey, newCount)))

      if (newCount === 1) {
        // First click - set timeout to reset count
        const timeout = setTimeout(() => {
          setClickCount((prev) => {
            const newMap = new Map(prev)
            newMap.delete(cellKey)
            return newMap
          })
        }, 300) // 300ms window for double click

        setClickTimeout(timeout)
      } else if (newCount >= 2) {
        // Double click detected - start editing
        console.log("Double click detected, starting edit")

        // Clear timeout and reset count
        if (clickTimeout) {
          clearTimeout(clickTimeout)
        }
        setClickCount((prev) => {
          const newMap = new Map(prev)
          newMap.delete(cellKey)
          return newMap
        })

        startCellEdit(recordId, fieldId, currentValue, fieldType)
      }
    }
  }

  // ENHANCED CELL EDIT FUNCTIONS
  const startCellEdit = (recordId: string, fieldId: string, currentValue: any, fieldType: string) => {
    console.log("Starting cell edit:", { recordId, fieldId, currentValue, fieldType, editMode })

    const field = formFieldsWithSections.find((f) => f.id === fieldId)
    if (!field) {
      console.log("Field not found:", fieldId)
      return
    }

    console.log("Setting editing cell:", { recordId, fieldId, value: currentValue, fieldType })

    setEditingCell({
      recordId,
      fieldId,
      value: currentValue,
      originalValue: currentValue,
      fieldType,
      options: field.options,
    })

    // Focus the input after state update
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        if (fieldType === "text" || fieldType === "email" || fieldType === "url") {
          inputRef.current.select()
        }
      } else if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.select()
      }
    }, 100)
  }

  const updateCellValue = (newValue: any) => {
    if (!editingCell) return
    console.log("Updating cell value:", newValue)
    setEditingCell({
      ...editingCell,
      value: newValue,
    })
  }

  const saveCellEdit = async () => {
    if (!editingCell) return

    console.log("Saving cell edit:", editingCell)

    const changeKey = `${editingCell.recordId}-${editingCell.fieldId}`
    const field = formFieldsWithSections.find((f) => f.id === editingCell.fieldId)

    // Add to pending changes
    setPendingChanges((prev) => {
      const newChanges = new Map(prev)
      newChanges.set(changeKey, {
        recordId: editingCell.recordId,
        fieldId: editingCell.fieldId,
        value: editingCell.value,
        originalValue: editingCell.originalValue,
        fieldType: editingCell.fieldType,
        fieldLabel: field?.label || editingCell.fieldId,
      })
      console.log("Added pending change:", changeKey, newChanges.get(changeKey))
      return newChanges
    })

    // Update the record in the UI immediately for visual feedback
    setRecords((prevRecords) => {
      return prevRecords.map((record) => {
        if (record.id === editingCell.recordId) {
          const updatedProcessedData = record.processedData.map((field) => {
            if (field.fieldId === editingCell.fieldId) {
              return {
                ...field,
                value: editingCell.value,
                displayValue: formatFieldValue(editingCell.fieldType, editingCell.value),
              }
            }
            return field
          })
          return {
            ...record,
            processedData: updatedProcessedData,
          }
        }
        return record
      })
    })

    setEditingCell(null)

    toast({
      title: "Change Staged",
      description: `Field "${field?.label}" has been modified. Click "Save All Changes" to persist.`,
    })
  }

  const cancelCellEdit = () => {
    console.log("Canceling cell edit")
    setEditingCell(null)
  }

  const saveAllPendingChanges = async () => {
    if (pendingChanges.size === 0) return

    console.log("Saving all pending changes:", pendingChanges)
    setSavingChanges(true)

    try {
      // Group changes by record ID
      const changesByRecord = new Map<string, PendingChange[]>()
      pendingChanges.forEach((change) => {
        if (!changesByRecord.has(change.recordId)) {
          changesByRecord.set(change.recordId, [])
        }
        changesByRecord.get(change.recordId)!.push(change)
      })

      let savedCount = 0

      // Save each record's changes
      for (const [recordId, changes] of changesByRecord) {
        // Find the record
        const record = records.find((r) => r.id === recordId)
        if (!record) continue

        // Create updated record data
        const updatedRecordData = { ...record.recordData }

        changes.forEach((change) => {
          if (updatedRecordData[change.fieldId]) {
            updatedRecordData[change.fieldId] = {
              ...updatedRecordData[change.fieldId],
              value: change.value,
            }
          }
        })

        // Save to API
        const response = await fetch(`/api/forms/${formId}/records/${recordId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordData: updatedRecordData,
            submittedBy: "admin",
            status: record.status || "submitted",
          }),
        })

        const result = await response.json()
        if (!result.success) {
          throw new Error(`Failed to save record ${recordId}: ${result.error}`)
        }

        savedCount += changes.length
      }

      // Clear pending changes and refresh data
      setPendingChanges(new Map())
      await fetchRecords()

      toast({
        title: "Success",
        description: `Successfully saved ${savedCount} changes across ${changesByRecord.size} records`,
      })
    } catch (error: any) {
      console.error("Error saving changes:", error)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setSavingChanges(false)
    }
  }

  const discardAllPendingChanges = () => {
    console.log("Discarding all pending changes")
    setPendingChanges(new Map())
    setEditingCell(null)
    // Refresh records to revert UI changes
    fetchRecords()
    toast({
      title: "Changes Discarded",
      description: "All unsaved changes have been discarded",
    })
  }

  // ENHANCED EDIT MODE TOGGLE
  const toggleEditMode = () => {
    console.log("Toggling edit mode. Current mode:", editMode)

    if (editMode !== "locked" && (pendingChanges.size > 0 || editingCell)) {
      // If there are unsaved changes, ask user what to do
      const shouldSave = window.confirm("You have unsaved changes. Do you want to save them before changing edit mode?")
      if (shouldSave) {
        saveAllPendingChanges().then(() => {
          cycleEditMode()
        })
      } else {
        discardAllPendingChanges()
        cycleEditMode()
      }
    } else {
      cycleEditMode()
    }
  }

  const cycleEditMode = () => {
    setEditingCell(null)
    setPendingChanges(new Map())
    setClickCount(new Map())

    if (editMode === "locked") {
      setEditMode("double-click")
      console.log("Edit mode: Double-click to edit")
    } else if (editMode === "double-click") {
      setEditMode("single-click")
      console.log("Edit mode: Single-click to edit")
    } else {
      setEditMode("locked")
      console.log("Edit mode: Locked (read-only)")
    }
  }

  // Get current value for a field (either from pending changes or original data)
  const getCurrentFieldValue = (recordId: string, fieldId: string, originalValue: any) => {
    const changeKey = `${recordId}-${fieldId}`
    const pendingChange = pendingChanges.get(changeKey)
    return pendingChange ? pendingChange.value : originalValue
  }

  // Check if a field has pending changes
  const hasFieldChanged = (recordId: string, fieldId: string) => {
    const changeKey = `${recordId}-${fieldId}`
    return pendingChanges.has(changeKey)
  }

  // ENHANCED RENDER EDITABLE CELL WITH CLICK HANDLING
  const renderEditableCell = (record: EnhancedFormRecord, field: FormFieldWithSection, originalValue: string) => {
    const isCurrentlyEditing = editingCell?.recordId === record.id && editingCell?.fieldId === field.id
    const processedField = record.processedData.find((f) => f.fieldId === field.id)
    const currentValue = getCurrentFieldValue(record.id, field.id, processedField?.value)
    const hasChanged = hasFieldChanged(record.id, field.id)
    const cellKey = `${record.id}-${field.id}`
    const isBeingClicked = (clickCount.get(cellKey) || 0) > 0

    // If currently editing this cell
    if (isCurrentlyEditing) {
      switch (field.type) {
        case "text":
        case "email":
        case "url":
        case "tel":
        case "phone":
          return (
            <Input
              ref={inputRef}
              value={editingCell.value || ""}
              onChange={(e) => updateCellValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  saveCellEdit()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  cancelCellEdit()
                }
              }}
              onBlur={saveCellEdit}
              className="h-7 text-xs border-2 border-blue-500 focus:border-blue-600 bg-white shadow-lg rounded-none"
              type={field.type === "phone" ? "tel" : field.type}
              placeholder={field.placeholder}
              autoFocus
            />
          )

        case "number":
          return (
            <Input
              ref={inputRef}
              value={editingCell.value || ""}
              onChange={(e) => updateCellValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  saveCellEdit()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  cancelCellEdit()
                }
              }}
              onBlur={saveCellEdit}
              className="h-7 text-xs border-2 border-blue-500 focus:border-blue-600 bg-white shadow-lg rounded-none"
              type="number"
              placeholder={field.placeholder}
              autoFocus
            />
          )

        case "textarea":
          return (
            <Textarea
              ref={textareaRef}
              value={editingCell.value || ""}
              onChange={(e) => updateCellValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  e.preventDefault()
                  saveCellEdit()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  cancelCellEdit()
                }
              }}
              onBlur={saveCellEdit}
              className="min-h-[60px] text-xs border-2 border-blue-500 focus:border-blue-600 resize-none bg-white shadow-lg rounded-none"
              rows={2}
              placeholder={field.placeholder}
              autoFocus
            />
          )

        case "date":
          return (
            <Input
              ref={inputRef}
              value={editingCell.value || ""}
              onChange={(e) => updateCellValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  saveCellEdit()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  cancelCellEdit()
                }
              }}
              onBlur={saveCellEdit}
              className="h-7 text-xs border-2 border-blue-500 focus:border-blue-600 bg-white shadow-lg rounded-none"
              type="date"
              autoFocus
            />
          )

        case "checkbox":
        case "switch":
          return (
            <div className="flex items-center justify-center h-7">
              <Checkbox
                checked={Boolean(editingCell.value)}
                onCheckedChange={(checked) => {
                  updateCellValue(checked)
                  setTimeout(saveCellEdit, 100)
                }}
              />
            </div>
          )

        case "select":
          const options = Array.isArray(editingCell.options) ? editingCell.options : []
          return (
            <Select
              value={editingCell.value || ""}
              onValueChange={(value) => {
                updateCellValue(value)
                setTimeout(saveCellEdit, 100)
              }}
            >
              <SelectTrigger className="h-7 text-xs border-2 border-blue-500 focus:border-blue-600 bg-white shadow-lg rounded-none">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {options.map((option: any) => (
                  <SelectItem key={option.value || option.id} value={option.value || option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )

        default:
          return (
            <Input
              ref={inputRef}
              value={editingCell.value || ""}
              onChange={(e) => updateCellValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  saveCellEdit()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  cancelCellEdit()
                }
              }}
              onBlur={saveCellEdit}
              className="h-7 text-xs border-2 border-blue-500 focus:border-blue-600 bg-white shadow-lg rounded-none"
              placeholder={field.placeholder}
              autoFocus
            />
          )
      }
    }

    // Normal display mode with Excel-like styling
    return (
      <div
        className={cn(
          "h-7 px-2 flex items-center text-xs font-normal border-r border-b border-gray-300 bg-white",
          "cursor-cell select-none overflow-hidden whitespace-nowrap",
          // Edit mode styling
          editMode === "locked" && "cursor-default",
          editMode === "single-click" && "hover:bg-blue-50",
          editMode === "double-click" && "hover:bg-green-50",
          // Change highlighting
          hasChanged && "bg-yellow-100 text-yellow-800 font-medium",
          // Click feedback
          isBeingClicked && editMode === "double-click" && "bg-green-100",
        )}
        onClick={(e) => handleCellClick(record.id, field.id, currentValue, field.type, e)}
        title={formatFieldValue(field.type, currentValue)}
      >
        {formatFieldValue(field.type, currentValue) || ""}
        {hasChanged && <span className="ml-1 text-yellow-600 font-bold">*</span>}
      </div>
    )
  }

  // Get edit mode display info
  const getEditModeInfo = () => {
    switch (editMode) {
      case "locked":
        return {
          icon: Lock,
          label: "🔒 LOCKED",
          description: "Read Only Mode",
          color: "text-red-600 bg-red-50 border-red-300 hover:bg-red-100",
        }
      case "single-click":
        return {
          icon: MousePointer2,
          label: "👆 SINGLE CLICK",
          description: "Click any cell to edit",
          color: "text-blue-600 bg-blue-50 border-blue-300 hover:bg-blue-100",
        }
      case "double-click":
        return {
          icon: Edit3,
          label: "👆👆 DOUBLE CLICK",
          description: "Double-click any cell to edit",
          color: "text-green-600 bg-green-50 border-green-300 hover:bg-green-100",
        }
    }
  }

  // Fetch form data with module information
  const fetchForm = async () => {
    try {
      const response = await fetch(`/api/forms/${formId}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch form: ${response.status}`)
      }
      const data = await response.json()
      if (!data.success || !data.data) {
        throw new Error("Invalid form data received")
      }
      setForm(data.data)

      // Extract all form fields with section information
      const allFields: FormField[] = []
      const fieldsWithSections: FormFieldWithSection[] = []

      if (data.data.sections) {
        let fieldOrder = 0
        data.data.sections.forEach((section: any) => {
          if (section.fields) {
            section.fields.forEach((field: any) => {
              allFields.push(field)
              fieldsWithSections.push({
                ...field,
                order: field.order || fieldOrder++,
                sectionTitle: section.title,
                sectionId: section.id,
              })
            })
          }
        })
      }

      setAllFormFields(allFields)
      setFormFieldsWithSections(fieldsWithSections)

      // Fetch module information if moduleId exists
      if (data.data.moduleId) {
        try {
          const moduleResponse = await fetch(`/api/modules/${data.data.moduleId}`)
          if (moduleResponse.ok) {
            const moduleData = await moduleResponse.json()
            if (moduleData.success && moduleData.data) {
              setModule(moduleData.data)
            }
          }
        } catch (moduleError) {
          console.error("Error fetching module:", moduleError)
        }
      }
    } catch (err) {
      console.error("Error fetching form:", err)
      setError("Failed to load form data")
    }
  }

  // Fetch records with enhanced formatting
  const fetchRecords = async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: recordsPerPage.toString(),
        sortBy,
        sortOrder,
      })

      if (searchTerm) params.append("search", searchTerm)
      if (statusFilter !== "all") params.append("status", statusFilter)

      const response = await fetch(`/api/forms/${formId}/records?${params}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch records: ${response.status}`)
      }
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch records")
      }

      // Process records with field data
      const processedRecords = (data.records || []).map((record: FormRecord) =>
        processRecordData(record, formFieldsWithSections),
      )

      setRecords(processedRecords)
      setTotalPages(Math.ceil((data.total || 0) / recordsPerPage))

      // Calculate stats
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

      const allRecords = data.records || []
      setStats({
        totalRecords: data.total || 0,
        todayRecords: allRecords.filter((r: FormRecord) => new Date(r.submittedAt) >= today).length,
        weekRecords: allRecords.filter((r: FormRecord) => new Date(r.submittedAt) >= weekAgo).length,
        monthRecords: allRecords.filter((r: FormRecord) => new Date(r.submittedAt) >= monthAgo).length,
      })
    } catch (err) {
      console.error("Error fetching records:", err)
      setError("Failed to load records")
    }
  }

  // Fetch enhanced lookup sources
  const fetchLookupSources = async () => {
    try {
      const response = await fetch(`/api/forms/${formId}/lookup-sources`)
      if (response.ok) {
        const data = await response.json()
        setLookupSources(data.sources || [])
      }
    } catch (err) {
      console.error("Error fetching lookup sources:", err)
      setLookupSources([])
    }
  }

  // Fetch enhanced linked records
  const fetchLinkedRecords = async () => {
    try {
      const response = await fetch(`/api/forms/${formId}/linked-records`)
      if (response.ok) {
        const data = await response.json()
        setLinkedForms(data.linkedForms || [])
      }
    } catch (err) {
      console.error("Error fetching linked records:", err)
      setLinkedForms([])
    }
  }

  // CRUD Operations
  const handleViewRecord = (record: EnhancedFormRecord) => {
    setSelectedRecord(record)
    setShowViewDialog(true)
  }

  const handleEditRecord = (record: EnhancedFormRecord) => {
    setEditingRecord(record)

    // Initialize edit form data with current record data
    const initialData: Record<string, any> = {}
    record.processedData.forEach((field) => {
      initialData[field.fieldId] = field.value
    })

    setEditFormData(initialData)
    setShowEditDialog(true)
  }

  const handleCreateRecord = () => {
    setEditingRecord(null)
    setEditFormData({})
    setShowCreateDialog(true)
  }

  const handleDeleteRecord = (record: EnhancedFormRecord) => {
    setDeleteRecord(record)
    setShowDeleteDialog(true)
  }

  const handleSaveRecord = async () => {
    if (!form) return

    setSaving(true)
    try {
      const url = editingRecord ? `/api/forms/${formId}/records/${editingRecord.id}` : `/api/forms/${formId}/records`
      const method = editingRecord ? "PUT" : "POST"

      // Transform form data to match the expected structure
      const structuredData: Record<string, any> = {}

      form.sections.forEach((section) => {
        section.fields.forEach((field) => {
          const value = editFormData[field.id]
          if (value !== undefined) {
            structuredData[field.id] = {
              fieldId: field.id,
              label: field.label,
              type: field.type,
              value: value,
              sectionId: section.id,
              sectionTitle: section.title,
            }
          }
        })
      })

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordData: structuredData,
          submittedBy: "admin",
          status: "submitted",
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error)
      }

      toast({
        title: "Success",
        description: editingRecord ? "Record updated successfully" : "Record created successfully",
      })

      setShowEditDialog(false)
      setShowCreateDialog(false)
      fetchRecords()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteRecord) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/forms/${formId}/records/${deleteRecord.id}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error)
      }

      toast({
        title: "Success",
        description: "Record deleted successfully",
      })

      setShowDeleteDialog(false)
      fetchRecords()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  // Render field for editing
  const renderEditField = (field: FormField) => {
    const value = editFormData[field.id] || ""
    const fieldProps = {
      id: field.id,
      value: value,
      onChange: (newValue: any) => {
        setEditFormData((prev) => ({ ...prev, [field.id]: newValue }))
      },
    }

    switch (field.type) {
      case "text":
      case "email":
      case "url":
      case "tel":
      case "phone":
        return (
          <Input
            {...fieldProps}
            type={field.type === "phone" ? "tel" : field.type}
            placeholder={field.placeholder || ""}
            onChange={(e) => fieldProps.onChange(e.target.value)}
          />
        )
      case "number":
        return (
          <Input
            {...fieldProps}
            type="number"
            placeholder={field.placeholder || ""}
            onChange={(e) => fieldProps.onChange(e.target.value)}
          />
        )
      case "textarea":
        return (
          <Textarea
            {...fieldProps}
            placeholder={field.placeholder || ""}
            onChange={(e) => fieldProps.onChange(e.target.value)}
            rows={3}
          />
        )
      case "date":
        return <Input {...fieldProps} type="date" onChange={(e) => fieldProps.onChange(e.target.value)} />
      case "datetime":
        return <Input {...fieldProps} type="datetime-local" onChange={(e) => fieldProps.onChange(e.target.value)} />
      case "checkbox":
        return <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => fieldProps.onChange(checked)} />
      case "switch":
        return <Switch checked={Boolean(value)} onCheckedChange={(checked) => fieldProps.onChange(checked)} />
      case "select":
        const options = Array.isArray(field.options) ? field.options : []
        return (
          <Select value={value} onValueChange={fieldProps.onChange}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || "Select an option"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option: any) => (
                <SelectItem key={option.value || option.id} value={option.value || option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case "radio":
        const radioOptions = Array.isArray(field.options) ? field.options : []
        return (
          <RadioGroup value={value} onValueChange={fieldProps.onChange}>
            {radioOptions.map((option: any) => (
              <div key={option.value} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={`${field.id}-${option.value}`} />
                <Label htmlFor={`${field.id}-${option.value}`}>{option.label}</Label>
              </div>
            ))}
          </RadioGroup>
        )
      default:
        return (
          <Input
            {...fieldProps}
            placeholder={field.placeholder || ""}
            onChange={(e) => fieldProps.onChange(e.target.value)}
          />
        )
    }
  }

  // Load all data
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      await fetchForm()
    } catch (err) {
      console.error("Error loading form data:", err)
      setError("Failed to load form data")
      setLoading(false)
    }
  }

  // Load records and relationships after form is loaded
  const loadRecordsAndRelationships = async () => {
    if (!form || formFieldsWithSections.length === 0) return
    try {
      await Promise.all([fetchRecords(), fetchLookupSources(), fetchLinkedRecords()])
    } catch (err) {
      console.error("Error loading records and relationships:", err)
    } finally {
      setLoading(false)
    }
  }

  // Effects
  useEffect(() => {
    if (formId) {
      loadData()
    }
  }, [formId])

  useEffect(() => {
    if (form && formFieldsWithSections.length > 0) {
      loadRecordsAndRelationships()
    }
  }, [form, formFieldsWithSections])

  // Separate effect for pagination and filtering
  useEffect(() => {
    if (form && formFieldsWithSections.length > 0 && !loading) {
      fetchRecords()
    }
  }, [currentPage, searchTerm, statusFilter, sortBy, sortOrder])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeout) {
        clearTimeout(clickTimeout)
      }
    }
  }, [clickTimeout])

  // Handlers
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortOrder("desc")
    }
    setCurrentPage(1)
  }

  const handleExport = async (format: "csv" | "json") => {
    try {
      const response = await fetch(`/api/forms/${formId}/export?format=${format}`)
      if (!response.ok) throw new Error("Export failed")
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${form?.name || "form"}-records.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error("Export error:", err)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "submitted":
        return "bg-green-100 text-green-800 border-green-200"
      case "draft":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "processing":
        return "bg-blue-100 text-blue-800 border-blue-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "submitted":
        return CheckCircle
      case "draft":
        return AlertCircle
      case "processing":
        return Clock
      default:
        return XCircle
    }
  }

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return <ArrowUpDown className="h-4 w-4" />
    return sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
  }

  // Get field labels from current form structure (not from submitted data)
  const getFormFieldLabels = () => {
    return formFieldsWithSections.map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      order: field.order,
      sectionTitle: field.sectionTitle,
    }))
  }

  // Generate Excel-like column letters (A, B, C, ..., Z, AA, AB, ...)
  const getColumnLetter = (index: number): string => {
    let result = ""
    while (index >= 0) {
      result = String.fromCharCode(65 + (index % 26)) + result
      index = Math.floor(index / 26) - 1
    }
    return result
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-96 mb-2" />
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Form not found</AlertDescription>
        </Alert>
      </div>
    )
  }

  const editModeInfo = getEditModeInfo()

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              Dashboard
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {module && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/modules/${module.id}`} className="flex items-center gap-2">
                  <Folder className="h-4 w-4" />
                  {module.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {form.name} Records
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{form.name} Records</h1>
          <p className="text-muted-foreground">{form.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleExport("csv")}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={handleCreateRecord}>
            <Plus className="h-4 w-4 mr-2" />
            Add Record
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRecords.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayRecords.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.weekRecords.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Timeline className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.monthRecords.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="records" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Records ({stats.totalRecords})
          </TabsTrigger>
          <TabsTrigger value="lookup" className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Lookup Sources ({lookupSources.length})
          </TabsTrigger>
          <TabsTrigger value="linked" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            Linked Forms ({linkedForms.length})
          </TabsTrigger>
        </TabsList>

        {/* Records Tab */}
        <TabsContent value="records" className="space-y-4">
          {/* Enhanced Controls with Edit Mode Toggle */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ENHANCED EDIT MODE CONTROLS */}
            <div className="flex items-center gap-2">
              {/* Edit Mode Toggle Button */}
              <Button
                variant="outline"
                onClick={toggleEditMode}
                className={cn("flex items-center gap-2 font-medium border-2 transition-all", editModeInfo.color)}
              >
                <editModeInfo.icon className="h-4 w-4" />
                {editModeInfo.label}
              </Button>

              {/* Pending Changes Indicator */}
              {pendingChanges.size > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                    {pendingChanges.size} changes
                  </Badge>
                  <Button
                    onClick={saveAllPendingChanges}
                    disabled={savingChanges}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    size="sm"
                  >
                    {savingChanges ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save All Changes
                      </>
                    )}
                  </Button>
                  <Button onClick={discardAllPendingChanges} variant="outline" size="sm">
                    <X className="h-4 w-4 mr-2" />
                    Discard
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Edit Mode Help Text */}
          <div className="text-sm text-muted-foreground bg-gray-50 p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <editModeInfo.icon className="h-4 w-4" />
              <span className="font-medium">{editModeInfo.description}</span>
            </div>
            {editMode === "double-click" && (
              <div className="mt-1 text-xs">
                Double-click any cell to start editing. Press Enter to save, Escape to cancel.
              </div>
            )}
            {editMode === "single-click" && (
              <div className="mt-1 text-xs">
                Click any cell to start editing. Press Enter to save, Escape to cancel.
              </div>
            )}
            {editMode === "locked" && (
              <div className="mt-1 text-xs">
                Table is in read-only mode. Click the edit mode button to enable editing.
              </div>
            )}
          </div>

          {/* View Mode Tabs */}
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as any)} className="w-full">
            <TabsList>
              <TabsTrigger value="excel" className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                Excel View
              </TabsTrigger>
              <TabsTrigger value="table" className="flex items-center gap-2">
                <TableIcon className="h-4 w-4" />
                Table View
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex items-center gap-2">
                <Timeline className="h-4 w-4" />
                Timeline View
              </TabsTrigger>
            </TabsList>

            {/* EXCEL VIEW - EXACTLY LIKE MICROSOFT EXCEL */}
            <TabsContent value="excel" className="space-y-4">
              <Card className="p-0 border-0 shadow-none">
                <CardContent className="p-0">
                  {/* Excel-like spreadsheet container */}
                  <div
                    className="border border-gray-400 bg-white overflow-auto"
                    style={{ fontFamily: "Calibri, sans-serif" }}
                  >
                    {/* Excel-like grid */}
                    <div className="inline-block min-w-full">
                      {/* Column Headers Row */}
                      <div className="flex bg-gray-100 border-b border-gray-400 sticky top-0 z-20">
                        {/* Row number column header */}
                        <div className="w-12 h-7 border-r border-gray-400 bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-700"></div>
                        {/* Actions column */}
                        <div className="w-24 h-7 border-r border-gray-400 bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-700">
                          Actions
                        </div>
                        {/* Submitted column */}
                        <div
                          className="w-32 h-7 border-r border-gray-400 bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-300"
                          onClick={() => handleSort("submittedAt")}
                        >
                          <div className="flex items-center gap-1">Submitted {renderSortIcon("submittedAt")}</div>
                        </div>
                        {/* Status column */}
                        <div
                          className="w-24 h-7 border-r border-gray-400 bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-300"
                          onClick={() => handleSort("status")}
                        >
                          <div className="flex items-center gap-1">Status {renderSortIcon("status")}</div>
                        </div>
                        {/* Dynamic field columns */}
                        {getFormFieldLabels().map((field, index) => (
                          <div
                            key={field.id}
                            className="w-40 h-7 border-r border-gray-400 bg-gray-200 flex flex-col items-center justify-center text-xs font-bold text-gray-700 px-1"
                            title={`${field.sectionTitle} - ${field.label} (${field.type})`}
                          >
                            <div className="flex flex-col items-center gap-0.5 truncate w-full">
                              <div className="text-[10px] text-gray-500 font-normal truncate w-full text-center">
                                {field.sectionTitle}
                              </div>
                              <div className="flex items-center gap-1 truncate w-full justify-center">
                                {React.createElement(getFieldIcon(field.type), { className: "h-3 w-3 flex-shrink-0" })}
                                <span className="truncate text-xs font-bold">{field.label}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Data Rows */}
                      {records.map((record, rowIndex) => (
                        <div key={record.id} className="flex hover:bg-blue-50">
                          {/* Row number */}
                          <div className="w-12 h-7 border-r border-b border-gray-300 bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                            {rowIndex + 1}
                          </div>

                          {/* Actions cell */}
                          <div className="w-24 h-7 border-r border-b border-gray-300 bg-white flex items-center justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-5 w-5 p-0 hover:bg-gray-100">
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleViewRecord(record)} className="text-xs">
                                  <Eye className="h-3 w-3 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditRecord(record)} className="text-xs">
                                  <Edit className="h-3 w-3 mr-2" />
                                  Edit Record
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDeleteRecord(record)}
                                  className="text-xs text-red-600"
                                >
                                  <Trash2 className="h-3 w-3 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Submitted date cell */}
                          <div className="w-32 h-7 border-r border-b border-gray-300 bg-white flex items-center px-2 text-xs">
                            {new Date(record.submittedAt).toLocaleDateString()}
                          </div>

                          {/* Status cell */}
                          <div className="w-24 h-7 border-r border-b border-gray-300 bg-white flex items-center justify-center px-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs px-1 py-0 h-4 border",
                                getStatusColor(record.status || "submitted"),
                              )}
                            >
                              {record.status || "submitted"}
                            </Badge>
                          </div>

                          {/* Dynamic field cells */}
                          {getFormFieldLabels().map((fieldDef) => {
                            const formField = formFieldsWithSections.find((f) => f.id === fieldDef.id)

                            if (!formField) {
                              return (
                                <div
                                  key={fieldDef.id}
                                  className="w-40 h-7 border-r border-b border-gray-300 bg-white flex items-center px-2 text-xs text-gray-400"
                                >
                                  —
                                </div>
                              )
                            }

                            return (
                              <div key={fieldDef.id} className="w-40">
                                {renderEditableCell(record, formField, "")}
                              </div>
                            )
                          })}
                        </div>
                      ))}

                      {/* Empty state */}
                      {records.length === 0 && (
                        <div className="flex">
                          <div className="w-12 h-7 border-r border-b border-gray-300 bg-gray-100"></div>
                          <div className="flex-1 h-20 border-b border-gray-300 bg-white flex items-center justify-center">
                            <div className="text-center text-gray-500">
                              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm font-medium">No records found</p>
                              <p className="text-xs">
                                {searchTerm || statusFilter !== "all"
                                  ? "Try adjusting your search or filter criteria."
                                  : "No records have been submitted yet."}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Table View */}
            <TabsContent value="table" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TableIcon className="h-5 w-5" />
                    Table View
                  </CardTitle>
                  <CardDescription>Compact table view of all records</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Actions</TableHead>
                          <TableHead
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => handleSort("submittedAt")}
                          >
                            <div className="flex items-center gap-2">Submitted {renderSortIcon("submittedAt")}</div>
                          </TableHead>
                          <TableHead className="cursor-pointer hover:bg-gray-50" onClick={() => handleSort("status")}>
                            <div className="flex items-center gap-2">Status {renderSortIcon("status")}</div>
                          </TableHead>
                          <TableHead>Summary</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => handleViewRecord(record)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleEditRecord(record)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Record
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleDeleteRecord(record)} className="text-red-600">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                {new Date(record.submittedAt).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn("border", getStatusColor(record.status || "submitted"))}
                              >
                                {React.createElement(getStatusIcon(record.status || "submitted"), {
                                  className: "h-3 w-3 mr-1",
                                })}
                                {record.status || "submitted"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {record.processedData.slice(0, 3).map((field) => (
                                  <div key={field.fieldId} className="text-sm">
                                    <span className="font-medium text-gray-600">{field.fieldLabel}:</span>{" "}
                                    <span className="text-gray-900">{field.displayValue || "—"}</span>
                                  </div>
                                ))}
                                {record.processedData.length > 3 && (
                                  <div className="text-xs text-gray-500">
                                    +{record.processedData.length - 3} more fields
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Timeline View */}
            <TabsContent value="timeline" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Timeline className="h-5 w-5" />
                    Timeline View
                  </CardTitle>
                  <CardDescription>Chronological view of record submissions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {records.map((record, index) => (
                      <div key={record.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={cn(
                              "w-3 h-3 rounded-full border-2",
                              getStatusColor(record.status || "submitted"),
                            )}
                          />
                          {index < records.length - 1 && <div className="w-px h-16 bg-gray-200 mt-2" />}
                        </div>
                        <div className="flex-1 pb-8">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Record #{record.id.slice(-8)}</span>
                              <Badge
                                variant="outline"
                                className={cn("border", getStatusColor(record.status || "submitted"))}
                              >
                                {record.status || "submitted"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Calendar className="h-4 w-4" />
                              {new Date(record.submittedAt).toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {record.processedData.slice(0, 6).map((field) => (
                                <div key={field.fieldId} className="flex items-start gap-2">
                                  {React.createElement(getFieldIcon(field.fieldType), {
                                    className: "h-4 w-4 mt-0.5 text-gray-400",
                                  })}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-600">{field.fieldLabel}</div>
                                    <div className="text-sm text-gray-900 truncate">{field.displayValue || "—"}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {record.processedData.length > 6 && (
                              <div className="mt-4 pt-4 border-t border-gray-200">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewRecord(record)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View all {record.processedData.length} fields
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * recordsPerPage + 1} to{" "}
                {Math.min(currentPage * recordsPerPage, stats.totalRecords)} of {stats.totalRecords} records
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Lookup Sources Tab */}
        <TabsContent value="lookup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                Lookup Data Sources
              </CardTitle>
              <CardDescription>Forms and modules that provide lookup data for this form</CardDescription>
            </CardHeader>
            <CardContent>
              {lookupSources.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {lookupSources.map((source) => (
                    <Card key={source.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-base flex items-center gap-2">
                              {source.type === "form" ? (
                                <FileText className="h-4 w-4" />
                              ) : (
                                <Folder className="h-4 w-4" />
                              )}
                              {source.name}
                            </CardTitle>
                            <CardDescription className="text-sm mt-1">{source.breadcrumb}</CardDescription>
                          </div>
                          <Badge variant={source.type === "form" ? "default" : "secondary"}>{source.type}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Records:</span>
                            <span className="font-medium">{source.recordCount.toLocaleString()}</span>
                          </div>
                          {source.fieldCount && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Fields:</span>
                              <span className="font-medium">{source.fieldCount}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Updated:</span>
                            <span className="font-medium">{new Date(source.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button variant="outline" size="sm" asChild className="flex-1 bg-transparent">
                            <a href={`/forms/${source.id}/records`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </a>
                          </Button>
                          {source.type === "form" && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={`/form/${source.id}`} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Link className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No lookup sources</h3>
                  <p className="text-muted-foreground">This form doesn't use any lookup fields yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Linked Forms Tab */}
        <TabsContent value="linked" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Grid3X3 className="h-5 w-5" />
                Linked Forms
              </CardTitle>
              <CardDescription>Forms that reference records from this form</CardDescription>
            </CardHeader>
            <CardContent>
              {linkedForms.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {linkedForms.map((linkedForm) => (
                    <Card key={linkedForm.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-base flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              {linkedForm.name}
                            </CardTitle>
                            <CardDescription className="text-sm mt-1">{linkedForm.breadcrumb}</CardDescription>
                          </div>
                          <Badge variant={linkedForm.isPublished ? "default" : "secondary"}>
                            {linkedForm.isPublished ? "Published" : "Draft"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Records:</span>
                            <span className="font-medium">{linkedForm.recordCount.toLocaleString()}</span>
                          </div>
                          {linkedForm.fieldCount && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Fields:</span>
                              <span className="font-medium">{linkedForm.fieldCount}</span>
                            </div>
                          )}
                          {linkedForm.lookupFieldsCount && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Lookup Fields:</span>
                              <span className="font-medium">{linkedForm.lookupFieldsCount}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Updated:</span>
                            <span className="font-medium">{new Date(linkedForm.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button variant="outline" size="sm" asChild className="flex-1 bg-transparent">
                            <a href={`/forms/${linkedForm.id}/records`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </a>
                          </Button>
                          {linkedForm.isPublished && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={`/form/${linkedForm.id}`} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Grid3X3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No linked forms</h3>
                  <p className="text-muted-foreground">No other forms are currently linking to this form's data.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Record Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Record Details
            </DialogTitle>
            <DialogDescription>
              Submitted on {selectedRecord && new Date(selectedRecord.submittedAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("border", getStatusColor(selectedRecord.status || "submitted"))}>
                  {React.createElement(getStatusIcon(selectedRecord.status || "submitted"), {
                    className: "h-3 w-3 mr-1",
                  })}
                  {selectedRecord.status || "submitted"}
                </Badge>
                <span className="text-sm text-muted-foreground">Record ID: {selectedRecord.id}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedRecord.processedData.map((field) => (
                  <div key={field.fieldId} className="space-y-2">
                    <Label className="flex items-center gap-2 font-medium">
                      {React.createElement(getFieldIcon(field.fieldType), { className: "h-4 w-4" })}
                      {field.fieldLabel}
                    </Label>
                    <div className="p-3 bg-gray-50 rounded-md border">
                      {field.displayValue || <span className="text-gray-400 italic">No value</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Record
            </DialogTitle>
            <DialogDescription>Make changes to the record data</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-6">
              {form.sections.map((section) => (
                <div key={section.id} className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">{section.title}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.fields.map((field) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={field.id} className="flex items-center gap-2">
                          {React.createElement(getFieldIcon(field.type), { className: "h-4 w-4" })}
                          {field.label}
                          {field.validation?.required && <span className="text-red-500">*</span>}
                        </Label>
                        {renderEditField(field)}
                        {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRecord} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Record Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Record
            </DialogTitle>
            <DialogDescription>Add a new record to this form</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-6">
              {form.sections.map((section) => (
                <div key={section.id} className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">{section.title}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.fields.map((field) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={field.id} className="flex items-center gap-2">
                          {React.createElement(getFieldIcon(field.type), { className: "h-4 w-4" })}
                          {field.label}
                          {field.validation?.required && <span className="text-red-500">*</span>}
                        </Label>
                        {renderEditField(field)}
                        {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRecord} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Record
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Delete Record
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this record? This action cannot be undone.
              {deleteRecord && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                  <strong>Record ID:</strong> {deleteRecord.id}
                  <br />
                  <strong>Submitted:</strong> {new Date(deleteRecord.submittedAt).toLocaleString()}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Record
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
