import React, { useState } from 'react'
import { Search, ChevronDown, Filter, List, MoreHorizontal, ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { cn } from '@/lib/utils'

interface CRMTableViewProps {
  data: any[]
  columns: Array<{
    id: string
    label: string
    accessor: (row: any) => any
  }>
  title?: string
  onFilterChange?: (filters: any) => void
}

export const CRMTableView: React.FC<CRMTableViewProps> = ({
  data,
  columns,
  title = 'All Leads',
  onFilterChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [recordsPerPage, setRecordsPerPage] = useState(10)
  const [expandedFilters, setExpandedFilters] = useState({
    systemDefined: true,
    filterByFields: true,
  })
  const [systemFilters, setSystemFilters] = useState<Set<string>>(new Set())

  // System defined filter options
  const systemDefinedFilters = [
    'Touched Records',
    'Untouched Records',
    'Record Action',
    'Related Records Action',
    'Locked',
    'Latest Email Status',
    'Activities',
    'Campaigns',
    'Cadences',
  ]

  // Filter by fields options
  const fieldFilters = [
    'Annual Revenue',
    'City',
    'Company',
    'Converted Account',
    'Converted Contact',
    'Converted Deal',
    'Country',
  ]

  const totalRecords = data.length
  const totalPages = Math.ceil(totalRecords / recordsPerPage)
  const startIndex = (currentPage - 1) * recordsPerPage
  const endIndex = Math.min(startIndex + recordsPerPage, totalRecords)
  const currentData = data.slice(startIndex, endIndex)

  const toggleRowSelection = (rowId: string) => {
    const newSelection = new Set(selectedRows)
    if (newSelection.has(rowId)) {
      newSelection.delete(rowId)
    } else {
      newSelection.add(rowId)
    }
    setSelectedRows(newSelection)
  }

  const toggleSelectAll = () => {
    if (selectedRows.size === currentData.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(currentData.map((row) => row.id)))
    }
  }

  const toggleSystemFilter = (filter: string) => {
    const newFilters = new Set(systemFilters)
    if (newFilters.has(filter)) {
      newFilters.delete(filter)
    } else {
      newFilters.add(filter)
    }
    setSystemFilters(newFilters)
  }


  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar - Filter Panel */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Filter Leads by</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-gray-50 border-gray-300 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* System Defined Filters */}
          <div className="border-b border-gray-200">
            <button
              onClick={() =>
                setExpandedFilters((prev) => ({
                  ...prev,
                  systemDefined: !prev.systemDefined,
                }))
              }
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-gray-600 transition-transform',
                    !expandedFilters.systemDefined && '-rotate-90'
                  )}
                />
                <span className="font-medium text-gray-900 text-sm">System Defined Filters</span>
              </div>
            </button>
            {expandedFilters.systemDefined && (
              <div className="px-4 pb-3 space-y-1.5">
                {systemDefinedFilters.map((filter) => (
                  <label
                    key={filter}
                    className="flex items-center gap-2.5 py-1 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                  >
                    <Checkbox
                      checked={systemFilters.has(filter)}
                      onCheckedChange={() => toggleSystemFilter(filter)}
                      className="h-3.5 w-3.5 border-gray-400"
                    />
                    <span className="text-sm text-gray-700">{filter}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Filter By Fields */}
          <div className="border-b border-gray-200">
            <button
              onClick={() =>
                setExpandedFilters((prev) => ({
                  ...prev,
                  filterByFields: !prev.filterByFields,
                }))
              }
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-gray-600 transition-transform',
                    !expandedFilters.filterByFields && '-rotate-90'
                  )}
                />
                <span className="font-medium text-gray-900 text-sm">Filter By Fields</span>
              </div>
            </button>
            {expandedFilters.filterByFields && (
              <div className="px-4 pb-3 space-y-1.5">
                {fieldFilters.map((filter) => (
                  <label
                    key={filter}
                    className="flex items-center gap-2.5 py-1 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                  >
                    <Checkbox className="h-3.5 w-3.5 border-gray-400" />
                    <span className="text-sm text-gray-700">{filter}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                <Filter className="h-4 w-4 text-gray-600" />
              </button>
              <Button variant="outline" className="h-8 gap-1 text-sm font-normal border-gray-300">
                {title}
                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
              </Button>
            </div>
            <span className="text-sm text-gray-600">Total Records {totalRecords}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1 border-gray-300">
              <List className="h-4 w-4 text-gray-600" />
              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            </Button>
            <Button className="h-8 bg-blue-600 hover:bg-blue-700 text-white gap-1 text-sm font-medium px-4">
              Create Lead
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1 border-gray-300 text-sm">
              Actions
              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            </Button>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                <th className="w-12 px-4 py-2.5 border-r border-gray-200">
                  <Checkbox
                    checked={selectedRows.size === currentData.length && currentData.length > 0}
                    onCheckedChange={toggleSelectAll}
                    className="h-3.5 w-3.5 border-gray-400"
                  />
                </th>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    className="px-4 py-2.5 text-left text-sm font-semibold text-gray-900 border-r border-gray-200 last:border-r-0"
                  >
                    <div className="flex items-center justify-between group">
                      <div className="flex items-center gap-1.5">
                        <span>{column.label}</span>
                        <button className="opacity-100 hover:bg-gray-200 p-0.5 rounded transition-colors">
                          <ChevronDown className="h-3 w-3 text-gray-500" />
                        </button>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 p-1 rounded transition-all">
                        <Menu className="h-3.5 w-3.5 text-gray-600" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="w-12 px-4 py-2.5 border-l border-gray-200"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {currentData.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-gray-50 transition-colors group"
                >
                  <td className="px-4 py-2.5 border-r border-gray-200">
                    <Checkbox
                      checked={selectedRows.has(row.id)}
                      onCheckedChange={() => toggleRowSelection(row.id)}
                      className="h-3.5 w-3.5 border-gray-400"
                    />
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className="px-4 py-2.5 text-sm text-gray-700 border-r border-gray-200 last:border-r-0"
                    >
                      {column.accessor(row)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 border-l border-gray-200">
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-200 rounded">
                      <MoreHorizontal className="h-4 w-4 text-gray-600" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination Bar */}
        <div className="bg-white border-t border-gray-200 px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <select
              value={recordsPerPage}
              onChange={(e) => {
                setRecordsPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={10}>10 Records Per Page</option>
              <option value={25}>25 Records Per Page</option>
              <option value={50}>50 Records Per Page</option>
              <option value={100}>100 Records Per Page</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">
              {startIndex + 1} - {endIndex}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="h-7 w-7 p-0 border-gray-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="h-7 w-7 p-0 border-gray-300"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

    </div>
  )
}
