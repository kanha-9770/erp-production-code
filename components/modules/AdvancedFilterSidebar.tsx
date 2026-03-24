'use client';

import React from "react"
import { ChevronDown, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

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

interface AdvancedFilterSidebarProps {
  isOpen: boolean
  onClose: () => void
  fields: FormFieldWithSection[]
  filters: FieldFilter[]
  onFiltersChange: (filters: FieldFilter[]) => void
  isMergedMode: boolean
  preselectedFieldId?: string | null
  onColumnSearch?: (fieldId: string, searchValue: string) => void
}

interface SystemFilter {
  id: string
  label: string
  checked: boolean
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

const AdvancedFilterSidebar: React.FC<AdvancedFilterSidebarProps> = ({
  isOpen,
  onClose,
  fields,
  filters,
  onFiltersChange,
  preselectedFieldId,
  onColumnSearch,
}) => {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [columnSearchMode, setColumnSearchMode] = React.useState(false)
  const [systemFiltersExpanded, setSystemFiltersExpanded] = React.useState(true)
  const [fieldFiltersExpanded, setFieldFiltersExpanded] = React.useState(true)
  const [expandedFields, setExpandedFields] = React.useState<Map<string, ExpandedField>>(new Map())
  const preselectedFieldRef = React.useRef<HTMLDivElement>(null)
  const valueInputRef = React.useRef<HTMLInputElement>(null)

  const [sidebarWidth, setSidebarWidth] = React.useState(200)
  const [isResizing, setIsResizing] = React.useState(false)
  const resizeStartX = React.useRef(0)
  const resizeStartWidth = React.useRef(200)

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

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

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing])



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
            preselectedFieldRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })
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

  const toggleFieldExpansion = (fieldId: string, checked: boolean) => {
    if (checked) {
      const field = fields.find((f) => f.id === fieldId)
      if (!field) return

      const operators = getOperatorsForFieldType(field.type)
      const defaultOperator = operators[0].value

      setExpandedFields(
        new Map(expandedFields.set(fieldId, {
          fieldId,
          operator: defaultOperator,
          value: "",
        }))
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

  const isFieldExpanded = (fieldId: string) => {
    return expandedFields.has(fieldId)
  }

  const getFieldExpandedData = (fieldId: string) => {
    return expandedFields.get(fieldId)
  }

  React.useEffect(() => {
    if (columnSearchMode && preselectedFieldId && searchQuery && onColumnSearch) {
      const timeoutId = setTimeout(() => {
        onColumnSearch(preselectedFieldId, searchQuery)
      }, 300)
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

  if (!isOpen) return null

  const preselectedField = preselectedFieldId ? fields.find((f) => f.id === preselectedFieldId) : null

  return (
    <div
      className="bg-white border-r border-gray-200 flex flex-col h-full shadow-lg relative select-none"
      style={{ width: `${sidebarWidth}px`, transition: isResizing ? 'none' : 'width 0.2s ease' }}
    >
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

      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Filter Leads by</h2>

          {/* NEW: Close Button */}
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

      </div>

      <div className="flex-1 overflow-y-auto">

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
                        onCheckedChange={(checked) => {
                          toggleFieldExpansion(field.id, !!checked)
                        }}
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
                          onValueChange={(value) => {
                            updateFieldFilter(field.id, { operator: value })
                          }}
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
                          // For select/radio/lookup/dropdown fields, show a dropdown of available options
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
                              onChange={(e) => {
                                updateFieldFilter(field.id, { value: e.target.value })
                              }}
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
                            onChange={(e) => {
                              updateFieldFilter(field.id, { value2: e.target.value })
                            }}
                            className="h-8 text-xs border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
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
    </div>
  )
}

export default AdvancedFilterSidebar
