import React, { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Checkbox } from '../ui/checkbox'
import { cn } from '@/lib/utils'


interface ColumnFilter {
  fieldId: string
  filterType: 'text' | 'select' | 'date' | 'number'
  filterValue: string
  selectedValues: Set<string>
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

interface ColumnFilterPopoverProps {
  fieldDef: FormFieldWithSection
  records: EnhancedFormRecord[]
  currentFilter: ColumnFilter | undefined
  onFilterChange: (fieldId: string, filter: ColumnFilter | undefined) => void
  getFieldData: (record: EnhancedFormRecord, fieldDef: FormFieldWithSection) => any
}

export const ColumnFilterPopover: React.FC<ColumnFilterPopoverProps> = ({
  fieldDef,
  records,
  currentFilter,
  onFilterChange,
  getFieldData,
}) => {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedValues, setSelectedValues] = useState<Set<string>>(
    currentFilter?.selectedValues || new Set()
  )

  const uniqueValues = useMemo(() => {
    const values = new Set<string>()
    records.forEach((record) => {
      const fieldData = getFieldData(record, fieldDef)
      if (fieldData) {
        const displayValue = fieldData.displayValue || fieldData.value
        if (displayValue !== null && displayValue !== undefined && displayValue !== '') {
          values.add(String(displayValue))
        }
      }
    })
    return Array.from(values).sort()
  }, [records, fieldDef, getFieldData])

  const filteredValues = useMemo(() => {
    if (!searchQuery) return uniqueValues
    const query = searchQuery.toLowerCase()
    return uniqueValues.filter((value) => value.toLowerCase().includes(query))
  }, [uniqueValues, searchQuery])

  const handleApplyFilter = () => {
    if (selectedValues.size === 0) {
      onFilterChange(fieldDef.id, undefined)
    } else {
      onFilterChange(fieldDef.id, {
        fieldId: fieldDef.id,
        filterType: 'select',
        filterValue: '',
        selectedValues: new Set(selectedValues),
      })
    }
    setOpen(false)
  }

  const handleClearFilter = () => {
    setSelectedValues(new Set())
    onFilterChange(fieldDef.id, undefined)
    setSearchQuery('')
    setOpen(false)
  }

  const handleSelectAll = () => {
    setSelectedValues(new Set(filteredValues))
  }

  const handleDeselectAll = () => {
    setSelectedValues(new Set())
  }

  const handleToggleValue = (value: string) => {
    const newSelected = new Set(selectedValues)
    if (newSelected.has(value)) {
      newSelected.delete(value)
    } else {
      newSelected.add(value)
    }
    setSelectedValues(newSelected)
  }

  const isFiltered = currentFilter && currentFilter.selectedValues.size > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 w-6 p-0 transition-all duration-200",
            isFiltered
              ? "bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-md"
              : "hover:bg-blue-50 hover:shadow-sm"
          )}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(!open)
          }}
        >
          <svg
            className={cn(
              "h-3.5 w-3.5 transition-colors duration-200",
              isFiltered ? "text-white" : "text-gray-500 group-hover:text-blue-600"
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 rounded-xl shadow-2xl border-2 border-gray-200"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col max-h-96">
          <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-slate-50">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-gray-900">
                Filter by {fieldDef.label}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-red-100 transition-colors duration-200"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4 text-gray-600 hover:text-red-600" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search values..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs rounded-lg border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
              />
            </div>
          </div>

          <div className="p-2 border-b border-gray-200 bg-white">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs flex-1 hover:bg-blue-50 hover:border-blue-400 transition-all duration-200"
                onClick={handleSelectAll}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs flex-1 hover:bg-red-50 hover:border-red-400 transition-all duration-200"
                onClick={handleDeselectAll}
              >
                Deselect All
              </Button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-64 p-2">
            {filteredValues.length === 0 ? (
              <div className="text-center py-4 text-sm text-gray-500">
                No values found
              </div>
            ) : (
              <div className="space-y-1">
                {filteredValues.map((value) => (
                  <div
                    key={value}
                    className="flex items-center space-x-2 p-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent rounded-lg cursor-pointer transition-all duration-200 group"
                    onClick={() => handleToggleValue(value)}
                  >
                    <Checkbox
                      checked={selectedValues.has(value)}
                      onCheckedChange={() => handleToggleValue(value)}
                      className="h-4 w-4"
                    />
                    <label className="text-xs text-gray-700 cursor-pointer flex-1 group-hover:text-blue-700 transition-colors duration-200">
                      {value}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 hover:bg-red-50 hover:border-red-400 hover:text-red-600 transition-all duration-200"
              onClick={handleClearFilter}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="flex-1 h-8 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all duration-200"
              onClick={handleApplyFilter}
            >
              Apply Filter
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
