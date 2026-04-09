'use client';

import React from "react"
import { ChevronDown, Search, X, Trash2, Check, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  useGetSavedFiltersQuery,
  useDeleteSavedFilterMutation,
} from "@/lib/api/saved-filters"
import type { SavedFilterData } from "@/lib/api/saved-filters"

export interface FieldFilter {
  fieldId: string
  fieldLabel: string
  fieldType: string
  operator: string
  value: string
  value2?: string
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

interface RecordData {
  processedData: Array<{
    fieldId: string
    fieldLabel?: string
    value: any
    displayValue?: string
    sectionId?: string
  }>
}

interface AdvancedFilterSidebarProps {
  isOpen: boolean
  onClose: () => void
  fields: FormFieldWithSection[]
  filters: FieldFilter[]
  onFiltersChange: (filters: FieldFilter[]) => void
  isMergedMode: boolean
  preselectedFieldId?: string | null
  onColumnSearch?: (fieldId: string, searchValue: string) => void
  records?: RecordData[]
  moduleId?: string
}

interface ExpandedField {
  fieldId: string
  operator: string
  value: string
  value2?: string
}

const getOperatorsForFieldType = (fieldType: string) => {
  switch (fieldType) {
    case "text":
    case "textarea":
    case "email":
    case "url":
      return [
        { value: "is", label: "is" },
        { value: "isn't", label: "isn't" },
        { value: "contains", label: "contains" },
        { value: "doesn't contain", label: "doesn't contain" },
        { value: "starts with", label: "starts with" },
        { value: "ends with", label: "ends with" },
        { value: "is one of", label: "is one of" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ]
    case "number":
      return [
        { value: "is", label: "is" },
        { value: "isn't", label: "isn't" },
        { value: "greater than", label: "greater than" },
        { value: "less than", label: "less than" },
        { value: "between", label: "between" },
        { value: "is one of", label: "is one of" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ]
    case "date":
    case "datetime":
      return [
        { value: "is", label: "is" },
        { value: "isn't", label: "isn't" },
        { value: "after", label: "after" },
        { value: "before", label: "before" },
        { value: "between", label: "between" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ]
    case "checkbox":
    case "switch":
      return [
        { value: "is true", label: "is true" },
        { value: "is false", label: "is false" },
      ]
    case "select":
    case "radio":
    case "lookup":
    case "dropdown":
      return [
        { value: "is", label: "is" },
        { value: "isn't", label: "isn't" },
        { value: "contains", label: "contains" },
        { value: "is one of", label: "is one of" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ]
    default:
      return [
        { value: "is", label: "is" },
        { value: "contains", label: "contains" },
        { value: "is one of", label: "is one of" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ]
  }
}

const needsValueInput = (operator: string) => {
  return !["is empty", "is not empty", "is true", "is false"].includes(operator)
}

const needsSecondValue = (operator: string) => {
  return operator === "between"
}

// ── Value Picker Dialog ────────────────────────────────────────────────────

interface ValuePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fieldLabel: string
  allValues: string[]
  selectedValues: string[]
  onApply: (values: string[]) => void
}

const ValuePickerDialog: React.FC<ValuePickerDialogProps> = ({
  open,
  onOpenChange,
  fieldLabel,
  allValues,
  selectedValues,
  onApply,
}) => {
  const [localSelected, setLocalSelected] = React.useState<Set<string>>(new Set(selectedValues))
  const [dialogSearch, setDialogSearch] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setLocalSelected(new Set(selectedValues))
      setDialogSearch("")
    }
  }, [open, selectedValues])

  const filtered = React.useMemo(() => {
    if (!dialogSearch) return allValues
    const q = dialogSearch.toLowerCase()
    return allValues.filter((v) => v.toLowerCase().includes(q))
  }, [allValues, dialogSearch])

  const toggleValue = (val: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      if (next.has(val)) next.delete(val)
      else next.add(val)
      return next
    })
  }

  const selectAll = () => setLocalSelected(new Set(filtered))

  const clearAll = () => {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      for (const v of filtered) next.delete(v)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Select values for &quot;{fieldLabel}&quot;</DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Choose one or more values to filter by. {localSelected.size > 0 && `${localSelected.size} selected`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Search values..."
            value={dialogSearch}
            onChange={(e) => setDialogSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button type="button" onClick={selectAll} className="text-blue-600 hover:text-blue-800 hover:underline">
            Select all{dialogSearch ? " visible" : ""}
          </button>
          <span className="text-gray-300">|</span>
          <button type="button" onClick={clearAll} className="text-gray-500 hover:text-gray-700 hover:underline">
            Clear{dialogSearch ? " visible" : " all"}
          </button>
        </div>

        {localSelected.size > 0 && (
          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
            {Array.from(localSelected).map((val) => (
              <Badge
                key={val}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 cursor-pointer hover:bg-red-100 hover:text-red-700"
                onClick={() => toggleValue(val)}
              >
                {val.length > 20 ? val.slice(0, 20) + "..." : val}
                <X className="h-2.5 w-2.5 ml-1" />
              </Badge>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 max-h-60 overflow-y-auto border border-gray-200 rounded-md">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">No values found</div>
          ) : (
            filtered.map((val) => {
              const isChecked = localSelected.has(val)
              return (
                <label
                  key={val}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-b-0",
                    isChecked && "bg-blue-50"
                  )}
                >
                  <Checkbox checked={isChecked} onCheckedChange={() => toggleValue(val)} className="h-3.5 w-3.5" />
                  <span className="text-xs text-gray-700 truncate">{val}</span>
                </label>
              )
            })
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(Array.from(localSelected))
              onOpenChange(false)
            }}
            className="text-xs"
          >
            Apply ({localSelected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

const AdvancedFilterSidebar: React.FC<AdvancedFilterSidebarProps> = ({
  isOpen,
  onClose,
  fields,
  filters,
  onFiltersChange,
  preselectedFieldId,
  onColumnSearch,
  records = [],
  moduleId,
}) => {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [columnSearchMode, setColumnSearchMode] = React.useState(false)
  const [fieldFiltersExpanded, setFieldFiltersExpanded] = React.useState(true)
  const [expandedFields, setExpandedFields] = React.useState<Map<string, ExpandedField>>(new Map())
  const preselectedFieldRef = React.useRef<HTMLDivElement>(null)
  const valueInputRef = React.useRef<HTMLInputElement>(null)

  const [sidebarWidth, setSidebarWidth] = React.useState(200)
  const [isResizing, setIsResizing] = React.useState(false)
  const resizeStartX = React.useRef(0)
  const resizeStartWidth = React.useRef(200)

  // ── Value Picker dialog state ──
  const [valuePickerOpen, setValuePickerOpen] = React.useState(false)
  const [valuePickerFieldId, setValuePickerFieldId] = React.useState<string | null>(null)

  // ── Saved Filters (from database) ──
  const [savedFiltersExpanded, setSavedFiltersExpanded] = React.useState(true)

  const { data: savedFiltersResponse, isLoading: isLoadingSavedFilters } = useGetSavedFiltersQuery(
    moduleId || "",
    { skip: !moduleId }
  )
  const [deleteSavedFilter] = useDeleteSavedFilterMutation()

  const savedFilters: SavedFilterData[] = savedFiltersResponse?.data || []

  // ── Keyboard ──
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // ── Resize ──
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartX.current = e.clientX
    resizeStartWidth.current = sidebarWidth
  }

  React.useEffect(() => {
    if (!isResizing) return
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartX.current
      const newWidth = Math.max(200, Math.min(300, resizeStartWidth.current + deltaX))
      setSidebarWidth(newWidth)
    }
    const handleMouseUp = () => setIsResizing(false)
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing])

  // ── Preselected field ──
  React.useEffect(() => {
    if (preselectedFieldId && isOpen) {
      const field = fields.find((f) => f.id === preselectedFieldId)
      if (field) {
        const operators = getOperatorsForFieldType(field.type)
        const defaultOperator = operators[0].value
        const existingFilter = filters.find((f) => f.fieldId === preselectedFieldId)

        const newExpandedFields = new Map(expandedFields)
        newExpandedFields.set(preselectedFieldId, {
          fieldId: preselectedFieldId,
          operator: existingFilter?.operator || defaultOperator,
          value: existingFilter?.value || "",
          value2: existingFilter?.value2,
        })
        setExpandedFields(newExpandedFields)
        setFieldFiltersExpanded(true)
        setSearchQuery("")
        setColumnSearchMode(true)

        setTimeout(() => {
          if (preselectedFieldRef.current) {
            preselectedFieldRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
          setTimeout(() => {
            if (valueInputRef.current && needsValueInput(existingFilter?.operator || defaultOperator)) {
              valueInputRef.current.focus()
              valueInputRef.current.select()
            }
          }, 300)
        }, 100)
      }
    } else if (!isOpen) {
      setColumnSearchMode(false)
      setSearchQuery("")
    }
  }, [preselectedFieldId, isOpen])

  // ── Field expansion / filter updates ──

  const toggleFieldExpansion = (fieldId: string, checked: boolean) => {
    if (checked) {
      const field = fields.find((f) => f.id === fieldId)
      if (!field) return
      const operators = getOperatorsForFieldType(field.type)
      setExpandedFields(
        new Map(expandedFields.set(fieldId, { fieldId, operator: operators[0].value, value: "" }))
      )
    } else {
      const newExpanded = new Map(expandedFields)
      newExpanded.delete(fieldId)
      setExpandedFields(newExpanded)
      onFiltersChange(filters.filter((f) => f.fieldId !== fieldId))
    }
  }

  const updateFieldFilter = (fieldId: string, updates: Partial<ExpandedField>) => {
    const current = expandedFields.get(fieldId)
    if (!current) return

    const updated = { ...current, ...updates }
    setExpandedFields(new Map(expandedFields.set(fieldId, updated)))

    const field = fields.find((f) => f.id === fieldId)
    if (!field) return

    const existingFilterIndex = filters.findIndex((f) => f.fieldId === fieldId)
    const newFilter: FieldFilter = {
      fieldId: field.id || field.originalId,
      fieldLabel: field.label,
      fieldType: field.type,
      operator: updated.operator,
      value: updated.value,
      value2: updated.value2,
    }

    if (existingFilterIndex >= 0) {
      const newFilters = [...filters]
      newFilters[existingFilterIndex] = newFilter
      onFiltersChange(newFilters)
    } else {
      onFiltersChange([...filters, newFilter])
    }
  }

  const isFieldExpanded = (fieldId: string) => expandedFields.has(fieldId)
  const getFieldExpandedData = (fieldId: string) => expandedFields.get(fieldId)

  // ── Column search ──
  React.useEffect(() => {
    if (columnSearchMode && preselectedFieldId && searchQuery && onColumnSearch) {
      const timeoutId = setTimeout(() => { onColumnSearch(preselectedFieldId, searchQuery) }, 300)
      return () => clearTimeout(timeoutId)
    } else if (columnSearchMode && preselectedFieldId && !searchQuery && onColumnSearch) {
      onColumnSearch(preselectedFieldId, "")
    }
  }, [searchQuery, columnSearchMode, preselectedFieldId, onColumnSearch])

  const isImageField = (label: string): boolean => {
    const lowerLabel = label.toLowerCase()
    return lowerLabel.includes("image") || lowerLabel.includes("photo") || lowerLabel.includes("camera")
  }

  const filteredFields = React.useMemo(() => {
    const nonImageFields = fields.filter(field => !isImageField(field.label))
    if (!searchQuery || columnSearchMode) return nonImageFields
    return nonImageFields.filter((field) =>
      field.label.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [fields, searchQuery, columnSearchMode])

  // ── Unique values from records ──
  const getUniqueValuesForField = React.useCallback(
    (field: FormFieldWithSection): string[] => {
      if (!records || records.length === 0) return []
      const valueSet = new Set<string>()
      for (const record of records) {
        const pd = record.processedData?.find(
          (p) =>
            p.fieldId === field.id ||
            p.fieldId === field.originalId ||
            (p.fieldLabel === field.label && p.sectionId === field.sectionId)
        )
        if (!pd) continue
        const display = pd.displayValue ?? pd.value
        if (display === null || display === undefined || display === "") continue
        const str = String(display).trim()
        if (str) valueSet.add(str)
      }
      return Array.from(valueSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    },
    [records]
  )

  // ── Saved filter handlers (database) ──

  const handleDeleteSavedFilter = async (id: string) => {
    try {
      await deleteSavedFilter(id).unwrap()
    } catch (err) {
      console.error("Failed to delete saved filter:", err)
    }
  }

  const handleApplySavedFilter = (saved: SavedFilterData) => {
    const newExpanded = new Map<string, ExpandedField>()
    for (const f of saved.filters) {
      newExpanded.set(f.fieldId, {
        fieldId: f.fieldId,
        operator: f.operator,
        value: f.value,
        value2: f.value2,
      })
    }
    setExpandedFields(newExpanded)
    onFiltersChange([...saved.filters])
  }

  // ── Value picker helpers ──

  const valuePickerField = valuePickerFieldId ? fields.find((f) => f.id === valuePickerFieldId) : null

  const valuePickerAllValues = React.useMemo(() => {
    if (!valuePickerField) return []
    return getUniqueValuesForField(valuePickerField)
  }, [valuePickerField, getUniqueValuesForField])

  const valuePickerSelected = React.useMemo(() => {
    if (!valuePickerFieldId) return []
    const expanded = expandedFields.get(valuePickerFieldId)
    if (!expanded || !expanded.value) return []
    return expanded.value.split(",").map((v) => v.trim()).filter(Boolean)
  }, [valuePickerFieldId, expandedFields])

  const handleValuePickerApply = (values: string[]) => {
    if (!valuePickerFieldId) return
    const joinedValue = values.join(", ")
    if (values.length > 1) {
      updateFieldFilter(valuePickerFieldId, { operator: "is one of", value: joinedValue })
    } else {
      updateFieldFilter(valuePickerFieldId, { value: joinedValue })
    }
  }

  if (!isOpen) return null

  const preselectedField = preselectedFieldId ? fields.find((f) => f.id === preselectedFieldId) : null

  return (
    <div
      className="bg-white border-r border-gray-200 flex flex-col h-full shadow-lg relative select-none"
      style={{ width: `${sidebarWidth}px`, transition: isResizing ? 'none' : 'width 0.2s ease' }}
    >
      {/* Resize handle */}
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors duration-200 z-50 group",
          isResizing && "bg-blue-600 w-1.5"
        )}
        onMouseDown={handleResizeStart}
        title="Drag to resize"
      >
        <div className={cn(
          "absolute right-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200",
          isResizing && "opacity-100"
        )}>
          <div className="w-0.5 h-8 bg-blue-500 rounded-full mr-0.5 shadow-sm" />
          <div className="w-0.5 h-8 bg-blue-500 rounded-full shadow-sm" />
        </div>
      </div>

      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-gray-50">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-gray-900">Filter Leads by</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-lg hover:bg-gray-200 text-gray-600 hover:text-gray-900"
              aria-label="Close filter sidebar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder={
              columnSearchMode && preselectedField
                ? `Filter values in ${preselectedField.label}...`
                : "Search fields..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "pl-9 h-9 bg-gray-50 border-gray-300 focus:border-blue-500 focus:ring-blue-500",
              columnSearchMode && "pr-8"
            )}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("")
                if (columnSearchMode && preselectedFieldId && onColumnSearch) {
                  onColumnSearch(preselectedFieldId, "")
                }
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-gray-200 rounded-full p-0.5 z-10"
            >
              <X className="h-3.5 w-3.5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Active filter count + clear all */}
        {filters.length > 0 && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500">{filters.length} active filter{filters.length > 1 ? "s" : ""}</span>
            <button
              onClick={() => {
                setExpandedFields(new Map())
                onFiltersChange([])
              }}
              className="text-xs text-red-500 hover:text-red-700 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Saved Filters Section (from database) ── */}
        {moduleId && (
          <div className="border-b border-gray-200">
            <button
              onClick={() => setSavedFiltersExpanded(!savedFiltersExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-gray-600 transition-transform",
                    !savedFiltersExpanded && "-rotate-90"
                  )}
                />
                <span className="text-sm font-semibold text-gray-900">Saved Filters</span>
                {savedFilters.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{savedFilters.length}</Badge>
                )}
              </div>
            </button>
            {savedFiltersExpanded && (
              <div className="px-4 pb-3 space-y-1">
                {isLoadingSavedFilters ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span className="ml-2 text-xs text-gray-400">Loading saved filters...</span>
                  </div>
                ) : savedFilters.length === 0 ? (
                  <div className="text-xs text-gray-400 py-2 text-center">
                    No saved filters yet. Apply filters and use the Save button in the toolbar.
                  </div>
                ) : (
                  savedFilters.map((sf) => {
                    const isActive =
                      sf.filters.length === filters.length &&
                      sf.filters.every((sfFilter) =>
                        filters.some(
                          (af) =>
                            af.fieldId === sfFilter.fieldId &&
                            af.operator === sfFilter.operator &&
                            af.value === sfFilter.value
                        )
                      )
                    return (
                      <div
                        key={sf.id}
                        className={cn(
                          "flex items-center justify-between group rounded-md px-2 py-1.5 cursor-pointer hover:bg-blue-50 transition-colors",
                          isActive && "bg-blue-50 border border-blue-200"
                        )}
                        onClick={() => handleApplySavedFilter(sf)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isActive && <Check className="h-3 w-3 text-blue-600 shrink-0" />}
                          <span className="text-xs text-gray-700 truncate">{sf.name}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">({sf.filters.length})</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteSavedFilter(sf.id)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-opacity"
                          title="Delete saved filter"
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Field Filters Section ── */}
        <div className="border-b border-gray-200">
          <button
            onClick={() => setFieldFiltersExpanded(!fieldFiltersExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-gray-600 transition-transform",
                  !fieldFiltersExpanded && "-rotate-90"
                )}
              />
              <span className="text-sm font-semibold text-gray-900">Filter By Fields</span>
            </div>
          </button>
          {fieldFiltersExpanded && (
            <div className="px-4 pb-3 space-y-3">
              {filteredFields.map((field) => {
                const isExpanded = isFieldExpanded(field.id)
                const expandedData = getFieldExpandedData(field.id)
                const operators = getOperatorsForFieldType(field.type)
                const isPreselected = preselectedFieldId === field.id

                return (
                  <div
                    key={field.id}
                    ref={isPreselected ? preselectedFieldRef : null}
                    className={cn(
                      "space-y-2 rounded-lg transition-all duration-300",
                      isPreselected && "bg-blue-50 border-2 border-blue-400 p-2 shadow-md"
                    )}
                  >
                    <label className={cn(
                      "flex items-center gap-2 cursor-pointer hover:bg-gray-50 py-1.5 px-2 rounded transition-colors",
                      isPreselected && "bg-blue-100"
                    )}>
                      <Checkbox
                        checked={isExpanded}
                        onCheckedChange={(checked) => toggleFieldExpansion(field.id, !!checked)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm text-gray-700 font-medium">
                        {field.label}
                        {isPreselected && (
                          <span className="ml-2 text-xs text-blue-600 font-bold">(Selected)</span>
                        )}
                      </span>
                    </label>

                    {isExpanded && expandedData && (
                      <div className="ml-6 space-y-2 animate-in slide-in-from-top-2 duration-200">
                        <Select
                          value={expandedData.operator}
                          onValueChange={(value) => updateFieldFilter(field.id, { operator: value })}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white border-gray-300 hover:border-gray-400">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {operators.map((op) => (
                              <SelectItem key={op.value} value={op.value} className="text-xs">
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {needsValueInput(expandedData.operator) && (() => {
                          const fieldOptions = ["select", "radio", "dropdown"].includes(field.type)
                            ? (field.options || [])
                            : field.type === "lookup"
                              ? (field.lookup?.options || [])
                              : [];
                          const hasOptions = fieldOptions.length > 0 && expandedData.operator !== "is one of";

                          if (hasOptions) {
                            return (
                              <Select
                                value={expandedData.value || ""}
                                onValueChange={(val) => {
                                  updateFieldFilter(field.id, { value: val === "__clear__" ? "" : val })
                                }}
                              >
                                <SelectTrigger className={cn(
                                  "h-8 text-xs bg-white border-gray-300 hover:border-gray-400",
                                  isPreselected && "ring-2 ring-blue-400 border-blue-400"
                                )}>
                                  <SelectValue placeholder="Select a value" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__clear__" className="text-xs text-gray-400 italic">— Clear —</SelectItem>
                                  {fieldOptions.map((opt: any) => {
                                    const optValue = String(opt.value ?? opt.id ?? opt);
                                    const optLabel = String(opt.label ?? opt.name ?? opt);
                                    return (
                                      <SelectItem key={optValue} value={optValue} className="text-xs">
                                        {optLabel}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            )
                          }

                          return (
                            <Input
                              ref={isPreselected ? valueInputRef : null}
                              type={
                                field.type === "number"
                                  ? "number"
                                  : field.type === "date" || field.type === "datetime"
                                    ? "date"
                                    : "text"
                              }
                              placeholder={expandedData.operator === "is one of" ? "value1, value2, ..." : "Type here"}
                              value={expandedData.value}
                              onChange={(e) => updateFieldFilter(field.id, { value: e.target.value })}
                              className={cn(
                                "h-8 text-xs border-gray-300 focus:border-blue-500 focus:ring-blue-500",
                                isPreselected && "ring-2 ring-blue-400 border-blue-400"
                              )}
                            />
                          )
                        })()}

                        {needsSecondValue(expandedData.operator) && (
                          <Input
                            type={
                              field.type === "number"
                                ? "number"
                                : field.type === "date"
                                  ? "date"
                                  : "text"
                            }
                            placeholder="And"
                            value={expandedData.value2 || ""}
                            onChange={(e) => updateFieldFilter(field.id, { value2: e.target.value })}
                            className="h-8 text-xs border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        )}

                        {/* Selected values badges for "is one of" */}
                        {expandedData.operator === "is one of" && expandedData.value && (
                          <div className="flex flex-wrap gap-1">
                            {expandedData.value.split(",").map((v) => v.trim()).filter(Boolean).map((val) => (
                              <Badge
                                key={val}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 h-5 cursor-pointer hover:bg-red-100 hover:text-red-700"
                                onClick={() => {
                                  const current = expandedData.value.split(",").map((v) => v.trim()).filter(Boolean)
                                  const updated = current.filter((v) => v !== val)
                                  updateFieldFilter(field.id, {
                                    value: updated.join(", "),
                                    operator: updated.length > 1 ? "is one of" : updated.length === 1 ? "is" : "is one of",
                                  })
                                }}
                              >
                                {val.length > 15 ? val.slice(0, 15) + "..." : val}
                                <X className="h-2.5 w-2.5 ml-0.5" />
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* "Select values" button to open picker dialog */}
                        {needsValueInput(expandedData.operator) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-400"
                            onClick={() => {
                              setValuePickerFieldId(field.id)
                              setValuePickerOpen(true)
                            }}
                          >
                            Select values from records
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      <ValuePickerDialog
        open={valuePickerOpen}
        onOpenChange={setValuePickerOpen}
        fieldLabel={valuePickerField?.label || ""}
        allValues={valuePickerAllValues}
        selectedValues={valuePickerSelected}
        onApply={handleValuePickerApply}
      />

    </div>
  )
}

export default AdvancedFilterSidebar
