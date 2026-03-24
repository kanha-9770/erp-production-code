"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useLazyGetMasterDataQuery, useCreateMasterDataMutation, useUpdateMasterDataMutation, useDeleteMasterDataMutation } from "@/lib/api/settings"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Trash2, Save, Edit2, Loader2, X, Search, Filter, ChevronDown, ChevronUp, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface DropdownRow {
  id: string
  module_id: string
  module_name: string
  level2_id: string
  level2_name: string
  level3_id: string
  level3_name: string
  level4_id: string
  level4_name: string
  form_id: string
  form_name: string
  master_data_type_name: string
  values: { id: string; value: string; code: string }[]
  isNew?: boolean
  isEditing?: boolean
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

export function DynamicMasters() {
  const [rows, setRows] = useState<DropdownRow[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [forms, setForms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [triggerGetMasterData] = useLazyGetMasterDataQuery()
  const [createMasterData] = useCreateMasterDataMutation()
  const [updateMasterData] = useUpdateMasterDataMutation()
  const [deleteMasterData] = useDeleteMasterDataMutation()
  const [processingRows, setProcessingRows] = useState<Set<string>>(new Set())
  const [recordSearchQuery, setRecordSearchQuery] = useState("")
  const [selectedModuleFilter, setSelectedModuleFilter] = useState("all")
  const [recordsPerPage, setRecordsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set())
  const [recordSortField, setRecordSortField] = useState("")
  const [recordSortOrder, setRecordSortOrder] = useState<"asc" | "desc">("asc")
  const [columnWidths, setColumnWidths] = useState<Map<string, number>>(new Map([
    ["module", 200],
    ["level2", 150],
    ["level3", 150],
    ["level4", 150],
    ["form", 200],
    ["dropdown", 200],
    ["values", 300],
  ]))
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)
  const [numDummyRows, setNumDummyRows] = useState(0)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const { toast } = useToast()
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const valueInputRefs = useRef<Map<string, HTMLInputElement[]>>(new Map())

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const data = await triggerGetMasterData().unwrap()
      setRows(data.dropdowns || [])
      setModules(data.modules || [])
      setForms(data.forms || [])
    } catch {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const findNode = useCallback((id: string, nodes: any[]): any => {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children?.length) {
        const found = findNode(id, node.children)
        if (found) return found
      }
    }
    return null
  }, [])

  const getDeepestId = useCallback((row: DropdownRow) => {
    return row.level4_id || row.level3_id || row.level2_id || row.module_id || ""
  }, [])

  const getFormOptions = useCallback((moduleId: string) => {
    if (!moduleId) return []
    const node = findNode(moduleId, modules)
    return node?.forms || []
  }, [findNode, modules])

  const addNewRow = useCallback(() => {
    const newId = `new-${Date.now()}`
    const newRow: DropdownRow = {
      id: newId,
      module_id: "",
      module_name: "",
      level2_id: "",
      level2_name: "",
      level3_id: "",
      level3_name: "",
      level4_id: "",
      level4_name: "",
      form_id: "",
      form_name: "",
      master_data_type_name: "",
      values: [],
      isNew: true,
      isEditing: true,
    }
    setRows(prev => [...prev, newRow])
    setCurrentPage(prev => Math.ceil((rows.length + 1) / recordsPerPage))
  }, [recordsPerPage, rows.length])

  const updateRow = useCallback((rowId: string, field: keyof DropdownRow, value: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId)
      if (idx < 0) return prev
      const newRows = [...prev]
      const row = { ...newRows[idx], values: [...newRows[idx].values] }
      newRows[idx] = row
      if (field === "module_id") {
        const mod = modules.find((m) => m.id === value)
        row.module_id = value
        row.module_name = mod?.name || ""
        row.level2_id = row.level3_id = row.level4_id = row.form_id = ""
        row.level2_name = row.level3_name = row.level4_name = row.form_name = ""
      } else if (field === "level2_id") {
        const node = findNode(value, modules)
        row.level2_id = value
        row.level2_name = node?.name || ""
        row.level3_id = row.level4_id = row.form_id = ""
        row.level3_name = row.level4_name = row.form_name = ""
      } else if (field === "level3_id") {
        const node = findNode(value, modules)
        row.level3_id = value
        row.level3_name = node?.name || ""
        row.level4_id = row.form_id = ""
        row.level4_name = row.form_name = ""
      } else if (field === "level4_id") {
        const node = findNode(value, modules)
        row.level4_id = value
        row.level4_name = node?.name || ""
        row.form_id = ""
        row.form_name = ""
      } else if (field === "form_id") {
        const form = forms.find((f) => f.id === value)
        row.form_id = value
        row.form_name = form?.name || ""
      } else {
        ; (row as any)[field] = value
      }
      return newRows
    })
  }, [modules, forms, findNode])

  const handleValueChange = useCallback((rowId: string, vi: number, newValue: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId)
      if (idx < 0) return prev
      const newRows = [...prev]
      const newValues = [...newRows[idx].values]
      newValues[vi] = { ...newValues[vi], value: newValue }
      newRows[idx] = { ...newRows[idx], values: newValues }
      return newRows
    })
  }, [])

  const addValue = useCallback((rowId: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId)
      if (idx < 0) return prev
      const newRows = [...prev]
      const newValueId = `temp-${Date.now()}-${Math.random()}`
      newRows[idx] = {
        ...newRows[idx],
        values: [...newRows[idx].values, { id: newValueId, value: "", code: "" }],
      }
      setTimeout(() => {
        const refsForRow = valueInputRefs.current.get(rowId)
        if (refsForRow && refsForRow.length > 0) {
          const lastInput = refsForRow[refsForRow.length - 1]
          lastInput?.focus()
        }
      }, 0)
      return newRows
    })
  }, [])

  const deleteValue = useCallback((rowId: string, vi: number) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId)
      if (idx < 0) return prev
      const newRows = [...prev]
      const newValues = [...newRows[idx].values]
      newValues.splice(vi, 1)
      newRows[idx] = { ...newRows[idx], values: newValues }
      return newRows
    })
  }, [])

  // Use a ref to always access the latest rows, avoiding stale closure in saveRow
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const saveRow = useCallback(async (rowId: string) => {
    const row = rowsRef.current.find(r => r.id === rowId)
    if (!row) return
    if (!row.form_id || !row.master_data_type_name.trim() || row.values.length === 0 || row.values.every(v => !v.value.trim())) {
      toast({
        title: "Validation Error",
        description: "Form, dropdown name, and at least one value are required",
        variant: "destructive",
      })
      return
    }
    setProcessingRows(prev => new Set([...prev, rowId]))
    const trimmedValues = row.values.map((v) => v.value.trim()).filter(Boolean)
    try {
      if (row.isNew) {
        await createMasterData({
          form_id: row.form_id,
          master_data_type_name: row.master_data_type_name.trim(),
          values: trimmedValues,
        }).unwrap()
      } else {
        await updateMasterData({
          id: row.id,
          master_data_type_name: row.master_data_type_name.trim(),
          values: trimmedValues,
        }).unwrap()
      }
      toast({ title: "Success", description: `Dropdown ${row.isNew ? "created" : "updated"}!` })
      await fetchData()
      setCurrentPage(1)
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error || "Save failed", variant: "destructive" })
    } finally {
      setProcessingRows(prev => {
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })
    }
  }, [toast, createMasterData, updateMasterData])

  const handleConfirmDelete = useCallback(async (id: string) => {
    setProcessingRows(prev => new Set([...prev, id]))
    try {
      await deleteMasterData(id).unwrap()
      toast({ title: "Deleted", description: "Dropdown removed" })
      await fetchData()
      setCurrentPage(1)
    } catch {
      toast({ title: "Error", description: "Delete failed", variant: "destructive" })
    } finally {
      setProcessingRows(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setDeleteDialogOpen(false)
      setRowToDelete(null)
    }
  }, [toast])

  const deleteRow = useCallback((id: string) => {
    setRowToDelete(id)
    setDeleteDialogOpen(true)
  }, [])

  const startEdit = useCallback((rowId: string) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, isEditing: true } : r))
  }, [])

  const cancelRow = useCallback((rowId: string) => {
    const row = rowsRef.current.find(r => r.id === rowId)
    if (row?.isNew) {
      setRows(prev => prev.filter(r => r.id !== rowId))
    } else {
      fetchData()
      setCurrentPage(1)
    }
    setDeleteDialogOpen(false)
  }, [])

  const sortRecords = useCallback((records: DropdownRow[]): DropdownRow[] => {
    const sorted = [...records].sort((a, b) => {
      let valA: any, valB: any
      switch (recordSortField) {
        case "module":
          valA = a.module_name
          valB = b.module_name
          break
        case "level2":
          valA = a.level2_name
          valB = b.level2_name
          break
        case "level3":
          valA = a.level3_name
          valB = b.level3_name
          break
        case "level4":
          valA = a.level4_name
          valB = b.level4_name
          break
        case "form":
          valA = a.form_name
          valB = b.form_name
          break
        case "dropdown":
          valA = a.master_data_type_name
          valB = b.master_data_type_name
          break
        case "values":
          valA = a.values.map(v => v.value).filter(Boolean).join(", ")
          valB = b.values.map(v => v.value).filter(Boolean).join(", ")
          break
        default:
          return 0
      }
      if (valA < valB) return recordSortOrder === "asc" ? -1 : 1
      if (valA > valB) return recordSortOrder === "asc" ? 1 : -1
      return 0
    })
    return sorted
  }, [recordSortField, recordSortOrder])

  let filteredRecords = rows.filter(r => r.master_data_type_name.toLowerCase().includes(recordSearchQuery.toLowerCase()))
  if (selectedModuleFilter !== "all") {
    filteredRecords = filteredRecords.filter(r => r.module_id === selectedModuleFilter)
  }
  const sortedRecords = sortRecords(filteredRecords)
  const totalRecords = sortedRecords.length
  const startIdx = (currentPage - 1) * recordsPerPage
  const endIdx = currentPage * recordsPerPage
  const paginatedRecords = sortedRecords.slice(startIdx, endIdx)

  const getModuleName = useCallback((id: string) => modules.find(m => m.id === id)?.name || "", [modules])

  const handleResizeStart = useCallback((e: React.MouseEvent, fieldId: string, currentWidth: number) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(fieldId)
    setResizeStartX(e.clientX)
    setResizeStartWidth(currentWidth)
  }, [])

  useEffect(() => {
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

  const toggleCellExpansion = useCallback((cellKey: string) => {
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

  useEffect(() => {
    const calculateFillers = () => {
      if (!tableContainerRef.current) return
      const containerHeight = tableContainerRef.current.clientHeight
      const headerHeight = 40
      const rowHeight = 36
      const maxRows = Math.floor((containerHeight - headerHeight) / rowHeight)
      const numDummy = Math.max(0, maxRows - paginatedRecords.length)
      setNumDummyRows(numDummy)
    }
    const timer = setTimeout(calculateFillers, 100)
    const resizeHandler = () => calculateFillers()
    window.addEventListener("resize", resizeHandler)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", resizeHandler)
    }
  }, [paginatedRecords.length])

  if (loading) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 className="w-10 h-10 animate-spin text-gray-500" />
      </div>
    )
  }

  const hasActiveFilters = recordSearchQuery || selectedModuleFilter !== "all"

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-5 sm:p-6 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r text-white">
            <h1 className="text-xl sm:text-2xl font-bold text-black">Master Dropdown Management</h1>
            <Button
              onClick={addNewRow}
              className="bg-white text-blue-700 hover:bg-gray-100 whitespace-nowrap"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" /> Add New Dropdown
            </Button>
          </div>

          <div className="p-4 sm:p-6 space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-3">
              {/* Search takes most space */}
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    placeholder="Search dropdowns..."
                    value={recordSearchQuery}
                    onChange={(e) => setRecordSearchQuery(e.target.value)}
                    className="pl-10 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-9 text-sm rounded-lg transition-all duration-200 hover:border-gray-400 w-full"
                  />
                </div>
              </div>

              {/* Filters & per-page selector — stay together on one line from lg breakpoint */}
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-3 lg:flex-row lg:gap-3 lg:items-end">
                <div className="min-w-[180px] sm:min-w-[200px] lg:min-w-[220px]">
                  <Select value={selectedModuleFilter} onValueChange={setSelectedModuleFilter}>
                    <SelectTrigger className="h-9 rounded-lg border-gray-300 hover:border-gray-400 transition-all duration-200">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter by module" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modules</SelectItem>
                      {modules.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-[140px] sm:min-w-[160px] lg:min-w-[170px]">
                  <Select value={recordsPerPage.toString()} onValueChange={(value) => setRecordsPerPage(Number(value))}>
                    <SelectTrigger className="h-9 rounded-lg border-gray-300 hover:border-gray-400 transition-all duration-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 per page</SelectItem>
                      <SelectItem value="20">20 per page</SelectItem>
                      <SelectItem value="50">50 per page</SelectItem>
                      <SelectItem value="100">100 per page</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-300 rounded-xl shadow-sm">
                <span className="text-xs font-semibold text-blue-900">Active Filters:</span>
                {recordSearchQuery && (
                  <div className="flex items-center gap-1 bg-white border border-blue-300 rounded-full px-3 py-1 shadow-sm">
                    <span className="text-xs text-blue-600">Search: {recordSearchQuery}</span>
                    <button onClick={() => setRecordSearchQuery("")} className="ml-1 hover:bg-red-100 rounded-full p-0.5">
                      <X className="h-3 w-3 text-red-600" />
                    </button>
                  </div>
                )}
                {selectedModuleFilter !== "all" && (
                  <div className="flex items-center gap-1 bg-white border border-blue-300 rounded-full px-3 py-1 shadow-sm">
                    <span className="text-xs text-blue-600">Module: {getModuleName(selectedModuleFilter)}</span>
                    <button onClick={() => setSelectedModuleFilter("all")} className="ml-1 hover:bg-red-100 rounded-full p-0.5">
                      <X className="h-3 w-3 text-red-600" />
                    </button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRecordSearchQuery("")
                    setSelectedModuleFilter("all")
                  }}
                  className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Clear All
                </Button>
              </div>
            )}

            {totalRecords > recordsPerPage && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-300 p-4 rounded-xl shadow-sm">
                <div className="text-sm font-medium text-gray-700 text-center sm:text-left">
                  Showing <span className="font-bold text-blue-600">{startIdx + 1}</span> to{" "}
                  <span className="font-bold text-blue-600">{Math.min(endIdx, totalRecords)}</span> of{" "}
                  <span className="font-bold text-blue-600">{totalRecords}</span> records
                </div>
                <div className="flex items-center justify-center sm:justify-end gap-2">
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
              <div className="overflow-x-auto h-[70vh] sm:h-[75vh] max-h-[75vh]" ref={tableContainerRef}>
                <div className="inline-block min-w-full align-top">
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
                      <div
                        className="relative h-10 border-r border-gray-300 bg-slate-100 flex items-center text-xs font-bold text-gray-900 px-2 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-100 transition-all duration-200 flex-shrink-0 group"
                        style={{ width: `${columnWidths.get("module") || 200}px` }}
                        onClick={() => {
                          if (recordSortField === "module") {
                            setRecordSortOrder(recordSortOrder === "asc" ? "desc" : "asc")
                          } else {
                            setRecordSortField("module")
                            setRecordSortOrder("asc")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <span className="truncate text-[11px] sm:text-xs font-bold text-gray-900">Module</span>
                          {recordSortField === "module" &&
                            (recordSortOrder === "asc" ? (
                              <ChevronUp className="h-3 w-3 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-3 w-3 flex-shrink-0" />
                            ))}
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-gradient-to-b hover:from-blue-500 hover:to-blue-600 bg-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                          onMouseDown={(e) => handleResizeStart(e, "module", columnWidths.get("module") || 200)}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize column"
                        />
                      </div>
                      <div
                        className="relative h-10 border-r border-gray-300 bg-slate-100 flex items-center text-xs font-bold text-gray-900 px-2 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-100 transition-all duration-200 flex-shrink-0 group"
                        style={{ width: `${columnWidths.get("level2") || 150}px` }}
                        onClick={() => {
                          if (recordSortField === "level2") {
                            setRecordSortOrder(recordSortOrder === "asc" ? "desc" : "asc")
                          } else {
                            setRecordSortField("level2")
                            setRecordSortOrder("asc")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <span className="truncate text-[11px] sm:text-xs font-bold text-gray-900">Level 2</span>
                          {recordSortField === "level2" &&
                            (recordSortOrder === "asc" ? (
                              <ChevronUp className="h-3 w-3 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-3 w-3 flex-shrink-0" />
                            ))}
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-gradient-to-b hover:from-blue-500 hover:to-blue-600 bg-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                          onMouseDown={(e) => handleResizeStart(e, "level2", columnWidths.get("level2") || 150)}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize column"
                        />
                      </div>
                      <div
                        className="relative h-10 border-r border-gray-300 bg-slate-100 flex items-center text-xs font-bold text-gray-900 px-2 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-100 transition-all duration-200 flex-shrink-0 group"
                        style={{ width: `${columnWidths.get("level3") || 150}px` }}
                        onClick={() => {
                          if (recordSortField === "level3") {
                            setRecordSortOrder(recordSortOrder === "asc" ? "desc" : "asc")
                          } else {
                            setRecordSortField("level3")
                            setRecordSortOrder("asc")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <span className="truncate text-[11px] sm:text-xs font-bold text-gray-900">Level 3</span>
                          {recordSortField === "level3" &&
                            (recordSortOrder === "asc" ? (
                              <ChevronUp className="h-3 w-3 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-3 w-3 flex-shrink-0" />
                            ))}
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-gradient-to-b hover:from-blue-500 hover:to-blue-600 bg-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                          onMouseDown={(e) => handleResizeStart(e, "level3", columnWidths.get("level3") || 150)}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize column"
                        />
                      </div>
                      <div
                        className="relative h-10 border-r border-gray-300 bg-slate-100 flex items-center text-xs font-bold text-gray-900 px-2 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-100 transition-all duration-200 flex-shrink-0 group"
                        style={{ width: `${columnWidths.get("level4") || 150}px` }}
                        onClick={() => {
                          if (recordSortField === "level4") {
                            setRecordSortOrder(recordSortOrder === "asc" ? "desc" : "asc")
                          } else {
                            setRecordSortField("level4")
                            setRecordSortOrder("asc")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <span className="truncate text-[11px] sm:text-xs font-bold text-gray-900">Level 4</span>
                          {recordSortField === "level4" &&
                            (recordSortOrder === "asc" ? (
                              <ChevronUp className="h-3 w-3 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-3 w-3 flex-shrink-0" />
                            ))}
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-gradient-to-b hover:from-blue-500 hover:to-blue-600 bg-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                          onMouseDown={(e) => handleResizeStart(e, "level4", columnWidths.get("level4") || 150)}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize column"
                        />
                      </div>
                      <div
                        className="relative h-10 border-r border-gray-300 bg-slate-100 flex items-center text-xs font-bold text-gray-900 px-2 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-100 transition-all duration-200 flex-shrink-0 group"
                        style={{ width: `${columnWidths.get("form") || 200}px` }}
                        onClick={() => {
                          if (recordSortField === "form") {
                            setRecordSortOrder(recordSortOrder === "asc" ? "desc" : "asc")
                          } else {
                            setRecordSortField("form")
                            setRecordSortOrder("asc")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <span className="truncate text-[11px] sm:text-xs font-bold text-gray-900">Form</span>
                          {recordSortField === "form" &&
                            (recordSortOrder === "asc" ? (
                              <ChevronUp className="h-3 w-3 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-3 w-3 flex-shrink-0" />
                            ))}
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-gradient-to-b hover:from-blue-500 hover:to-blue-600 bg-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                          onMouseDown={(e) => handleResizeStart(e, "form", columnWidths.get("form") || 200)}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize column"
                        />
                      </div>
                      <div
                        className="relative h-10 border-r border-gray-300 bg-slate-100 flex items-center text-xs font-bold text-gray-900 px-2 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-100 transition-all duration-200 flex-shrink-0 group"
                        style={{ width: `${columnWidths.get("dropdown") || 200}px` }}
                        onClick={() => {
                          if (recordSortField === "dropdown") {
                            setRecordSortOrder(recordSortOrder === "asc" ? "desc" : "asc")
                          } else {
                            setRecordSortField("dropdown")
                            setRecordSortOrder("asc")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <span className="truncate text-[11px] sm:text-xs font-bold text-gray-900">Dropdown Name</span>
                          {recordSortField === "dropdown" &&
                            (recordSortOrder === "asc" ? (
                              <ChevronUp className="h-3 w-3 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-3 w-3 flex-shrink-0" />
                            ))}
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-gradient-to-b hover:from-blue-500 hover:to-blue-600 bg-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                          onMouseDown={(e) => handleResizeStart(e, "dropdown", columnWidths.get("dropdown") || 200)}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize column"
                        />
                      </div>
                      <div
                        className="relative h-10 border-r border-gray-300 bg-slate-100 flex items-center text-xs font-bold text-gray-900 px-2 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-100 transition-all duration-200 flex-shrink-0 group"
                        style={{ width: `${columnWidths.get("values") || 300}px` }}
                        onClick={() => {
                          if (recordSortField === "values") {
                            setRecordSortOrder(recordSortOrder === "asc" ? "desc" : "asc")
                          } else {
                            setRecordSortField("values")
                            setRecordSortOrder("asc")
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <span className="truncate text-[11px] sm:text-xs font-bold text-gray-900">Values</span>
                          {recordSortField === "values" &&
                            (recordSortOrder === "asc" ? (
                              <ChevronUp className="h-3 w-3 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-3 w-3 flex-shrink-0" />
                            ))}
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-gradient-to-b hover:from-blue-500 hover:to-blue-600 bg-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                          onMouseDown={(e) => handleResizeStart(e, "values", columnWidths.get("values") || 300)}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize column"
                        />
                      </div>
                      <div className="w-32 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
                        Actions
                      </div>
                    </div>

                    {paginatedRecords.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-gray-500 min-h-[200px]">
                        <p className="text-sm font-medium px-4 text-center">
                          {hasActiveFilters ? "No records found" : "No dropdowns defined yet. Click \"Add New Dropdown\" to create one."}
                        </p>
                      </div>
                    ) : (
                      <>
                        {paginatedRecords.map((row, rowIndex) => {
                          const rowId = row.id
                          const isEditing = row.isEditing
                          const isProcessing = processingRows.has(rowId)
                          const cellKeyPrefix = `${rowId}-`
                          const num = startIdx + rowIndex + 1
                          const valuesContent = row.values.map(v => v.value).filter(Boolean).join(", ") || "—"
                          const isSelected = selectedRecords.has(rowId)
                          return (
                            <div
                              key={rowId}
                              className={cn(
                                "flex hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all duration-200 min-w-max border-b border-gray-200 last:border-b-0",
                                isSelected && "bg-blue-50"
                              )}
                            >
                              <div className="w-10 h-9 border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    const newSelected = new Set(selectedRecords)
                                    if (checked) newSelected.add(rowId)
                                    else newSelected.delete(rowId)
                                    setSelectedRecords(newSelected)
                                  }}
                                  className="h-4 w-4"
                                />
                              </div>
                              <div className="w-12 h-9 border-r border-gray-200 bg-gray-50 flex items-center justify-center text-xs font-semibold text-gray-700 flex-shrink-0">
                                {num}
                              </div>

                              <div
                                className={cn(
                                  "border-r border-gray-200 bg-white px-2 sm:px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 h-9 items-center",
                                  isEditing && "bg-blue-50"
                                )}
                                style={{ width: `${columnWidths.get("module") || 200}px` }}
                              >
                                <div className="w-full h-full flex items-center">
                                  {isEditing ? (
                                    <Select value={row.module_id} onValueChange={(v) => updateRow(rowId, "module_id", v)}>
                                      <SelectTrigger className="h-7 text-xs p-1 w-full">
                                        <SelectValue placeholder="Select Module" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {modules.map((m) => (
                                          <SelectItem key={m.id} value={m.id}>
                                            {m.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <ExcelCell
                                      content={row.module_name}
                                      isExpanded={expandedCells.has(cellKeyPrefix + "module")}
                                      onToggleExpand={() => toggleCellExpansion(cellKeyPrefix + "module")}
                                      className="w-full"
                                    />
                                  )}
                                </div>
                              </div>

                              <div
                                className={cn(
                                  "border-r border-gray-200 bg-white px-2 sm:px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 h-9 items-center",
                                  isEditing && "bg-blue-50"
                                )}
                                style={{ width: `${columnWidths.get("level2") || 150}px` }}
                              >
                                <div className="w-full h-full flex items-center">
                                  {isEditing ? (
                                    <Select
                                      value={row.level2_id}
                                      onValueChange={(v) => updateRow(rowId, "level2_id", v)}
                                      disabled={!row.module_id}
                                    >
                                      <SelectTrigger className="h-7 text-xs p-1 w-full">
                                        <SelectValue placeholder="Level 2" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {row.module_id &&
                                          findNode(row.module_id, modules)?.children?.map((c: any) => (
                                            <SelectItem key={c.id} value={c.id}>
                                              {c.name}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <ExcelCell
                                      content={row.level2_name}
                                      isExpanded={expandedCells.has(cellKeyPrefix + "level2")}
                                      onToggleExpand={() => toggleCellExpansion(cellKeyPrefix + "level2")}
                                      className="w-full"
                                    />
                                  )}
                                </div>
                              </div>

                              <div
                                className={cn(
                                  "border-r border-gray-200 bg-white px-2 sm:px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 h-9 items-center",
                                  isEditing && "bg-blue-50"
                                )}
                                style={{ width: `${columnWidths.get("level3") || 150}px` }}
                              >
                                <div className="w-full h-full flex items-center">
                                  {isEditing ? (
                                    <Select
                                      value={row.level3_id}
                                      onValueChange={(v) => updateRow(rowId, "level3_id", v)}
                                      disabled={!row.level2_id}
                                    >
                                      <SelectTrigger className="h-7 text-xs p-1 w-full">
                                        <SelectValue placeholder="Level 3" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {row.level2_id &&
                                          findNode(row.level2_id, modules)?.children?.map((c: any) => (
                                            <SelectItem key={c.id} value={c.id}>
                                              {c.name}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <ExcelCell
                                      content={row.level3_name}
                                      isExpanded={expandedCells.has(cellKeyPrefix + "level3")}
                                      onToggleExpand={() => toggleCellExpansion(cellKeyPrefix + "level3")}
                                      className="w-full"
                                    />
                                  )}
                                </div>
                              </div>

                              <div
                                className={cn(
                                  "border-r border-gray-200 bg-white px-2 sm:px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 h-9 items-center",
                                  isEditing && "bg-blue-50"
                                )}
                                style={{ width: `${columnWidths.get("level4") || 150}px` }}
                              >
                                <div className="w-full h-full flex items-center">
                                  {isEditing ? (
                                    <Select
                                      value={row.level4_id}
                                      onValueChange={(v) => updateRow(rowId, "level4_id", v)}
                                      disabled={!row.level3_id}
                                    >
                                      <SelectTrigger className="h-7 text-xs p-1 w-full">
                                        <SelectValue placeholder="Level 4" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {row.level3_id &&
                                          findNode(row.level3_id, modules)?.children?.map((c: any) => (
                                            <SelectItem key={c.id} value={c.id}>
                                              {c.name}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <ExcelCell
                                      content={row.level4_name}
                                      isExpanded={expandedCells.has(cellKeyPrefix + "level4")}
                                      onToggleExpand={() => toggleCellExpansion(cellKeyPrefix + "level4")}
                                      className="w-full"
                                    />
                                  )}
                                </div>
                              </div>

                              <div
                                className={cn(
                                  "border-r border-gray-200 bg-white px-2 sm:px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 h-9 items-center",
                                  isEditing && "bg-blue-50"
                                )}
                                style={{ width: `${columnWidths.get("form") || 200}px` }}
                              >
                                <div className="w-full h-full flex items-center">
                                  {isEditing ? (
                                    <Select
                                      value={row.form_id}
                                      onValueChange={(v) => updateRow(rowId, "form_id", v)}
                                      disabled={!getDeepestId(row)}
                                    >
                                      <SelectTrigger className="h-7 text-xs p-1 w-full">
                                        <SelectValue placeholder="Select Form" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {getFormOptions(getDeepestId(row)).map((f: any) => (
                                          <SelectItem key={f.id} value={f.id}>
                                            {f.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <ExcelCell
                                      content={row.form_name}
                                      isExpanded={expandedCells.has(cellKeyPrefix + "form")}
                                      onToggleExpand={() => toggleCellExpansion(cellKeyPrefix + "form")}
                                      className="w-full"
                                    />
                                  )}
                                </div>
                              </div>

                              <div
                                className={cn(
                                  "border-r border-gray-200 bg-white px-2 sm:px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 h-9 items-center",
                                  isEditing && "bg-blue-50"
                                )}
                                style={{ width: `${columnWidths.get("dropdown") || 200}px` }}
                              >
                                <div className="w-full h-full flex items-center">
                                  {isEditing ? (
                                    <Input
                                      value={row.master_data_type_name}
                                      onChange={(e) => updateRow(rowId, "master_data_type_name", e.target.value)}
                                      placeholder="e.g. Leave Type, Gender, Department"
                                      className="h-7 text-xs p-1 w-full"
                                    />
                                  ) : (
                                    <ExcelCell
                                      content={row.master_data_type_name}
                                      isExpanded={expandedCells.has(cellKeyPrefix + "dropdown")}
                                      onToggleExpand={() => toggleCellExpansion(cellKeyPrefix + "dropdown")}
                                      className="w-full"
                                    />
                                  )}
                                </div>
                              </div>

                              <div
                                className={cn(
                                  "border-r border-gray-200 bg-white px-2 sm:px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200",
                                  isEditing ? "h-auto min-h-[36px] py-2 items-start" : "h-9 items-center"
                                )}
                                style={{ width: `${columnWidths.get("values") || 300}px` }}
                              >
                                <div className={cn("w-full", isEditing ? "min-h-[20px]" : "h-full flex items-center")}>
                                  {isEditing ? (
                                    <div className="w-full space-y-3 sm:space-y-4">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full text-xs sm:text-sm"
                                        onClick={() => {
                                          const input = document.createElement("input")
                                          input.type = "file"
                                          input.accept = ".xlsx,.xls,.csv,.txt"
                                          input.onchange = (e) => {
                                            const file = (e.target as HTMLInputElement).files?.[0]
                                            if (!file) return
                                            const reader = new FileReader()
                                            reader.onload = (ev) => {
                                              try {
                                                const text = ev.target?.result as string
                                                let values: string[] = []
                                                if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
                                                  values = text
                                                    .split(/\r?\n/)
                                                    .map(line => line.trim())
                                                    .filter(line => line.length > 0)
                                                } else {
                                                  values = text
                                                    .split(/\r?\n/)
                                                    .map(line => line.split(/[,;\t]/)[0]?.trim() || "")
                                                    .filter(Boolean)
                                                }
                                                if (values.length === 0) {
                                                  toast({
                                                    title: "No values imported",
                                                    description: "File was empty or could not be parsed",
                                                    variant: "default"
                                                  })
                                                  return
                                                }
                                                setRows(prev => {
                                                  const next = [...prev]
                                                  const idx = next.findIndex(r => r.id === rowId)
                                                  if (idx === -1) return prev
                                                  next[idx].values = values.map((v, i) => ({
                                                    id: `file-import-${Date.now()}-${i}-${Math.random()}`,
                                                    value: v,
                                                    code: ""
                                                  }))
                                                  return next
                                                })
                                                toast({
                                                  title: `Imported ${values.length} values`,
                                                  description: `from ${file.name}`
                                                })
                                              } catch (err) {
                                                toast({
                                                  title: "Import failed",
                                                  description: "Could not read the file",
                                                  variant: "destructive"
                                                })
                                              }
                                            }
                                            reader.readAsText(file)
                                          }
                                          input.click()
                                        }}
                                      >
                                        <Upload className="h-4 w-4 mr-2" />
                                        Import values (.xlsx / .csv / .txt)
                                      </Button>

                                      <div className="relative my-2">
                                        <div className="absolute inset-0 flex items-center">
                                          <span className="w-full border-t border-gray-300" />
                                        </div>
                                        <div className="relative flex justify-center text-xs">
                                          <span className="bg-white px-2 text-gray-500">or enter manually</span>
                                        </div>
                                      </div>

                                      {row.values.map((val, vi) => (
                                        <div key={val.id} className="flex gap-2 items-center">
                                          <Input
                                            ref={(el) => {
                                              if (!el) return
                                              const refs = valueInputRefs.current.get(rowId) || []
                                              refs[vi] = el
                                              valueInputRefs.current.set(rowId, refs)
                                            }}
                                            value={val.value}
                                            onChange={(e) => handleValueChange(rowId, vi, e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault()
                                                if (vi === row.values.length - 1) {
                                                  addValue(rowId)
                                                } else {
                                                  const nextInput = valueInputRefs.current.get(rowId)?.[vi + 1]
                                                  nextInput?.focus()
                                                }
                                              }
                                            }}
                                            placeholder="Enter label"
                                            className="flex-1 h-7 text-xs p-1"
                                          />
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => deleteValue(rowId, vi)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      ))}

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => addValue(rowId)}
                                        className="h-7 text-xs w-full sm:w-auto"
                                      >
                                        <Plus className="w-3 h-3 mr-1" /> Add Value
                                      </Button>
                                    </div>
                                  ) : (
                                    <ExcelCell
                                      content={valuesContent}
                                      isExpanded={expandedCells.has(cellKeyPrefix + "values")}
                                      onToggleExpand={() => toggleCellExpansion(cellKeyPrefix + "values")}
                                      className="w-full"
                                    />
                                  )}
                                </div>
                              </div>

                              <div className="w-32 min-w-[128px] h-9 border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0 px-1">
                                <div className="flex gap-2 sm:gap-3 w-full justify-center">
                                  {isEditing ? (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => saveRow(rowId)}
                                        disabled={isProcessing}
                                        className={cn(
                                          "h-6 px-2 text-xs flex items-center gap-1 min-w-[76px] sm:min-w-[80px]",
                                          isProcessing && "opacity-70 cursor-not-allowed"
                                        )}
                                      >
                                        {isProcessing ? (
                                          <>
                                            <Loader2 className="h-3 w-3 animate-spin mr-1 sm:mr-2" />
                                            Saving...
                                          </>
                                        ) : (
                                          <>
                                            <Save className="w-3 h-3 mr-1" />
                                            Save
                                          </>
                                        )}
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => cancelRow(rowId)}
                                        disabled={isProcessing}
                                        className={cn(
                                          "h-6 w-8 p-0 sm:px-2 text-xs",
                                          isProcessing && "opacity-70 cursor-not-allowed"
                                        )}
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => startEdit(rowId)}
                                        disabled={isProcessing}
                                        className={cn(
                                          "h-6 px-1.5 sm:px-2 text-xs flex-1 bg-blue-600 text-white hover:bg-blue-700 min-w-[38px] sm:min-w-[80px]",
                                          isProcessing && "opacity-70 cursor-not-allowed"
                                        )}
                                      >
                                        <Edit2 className="w-3 h-3" />
                                        <span className="hidden sm:inline ml-1">Edit</span>
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => deleteRow(rowId)}
                                        disabled={isProcessing}
                                        className={cn(
                                          "h-6 w-8 p-0 flex items-center justify-center",
                                          isProcessing && "opacity-70 cursor-not-allowed"
                                        )}
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
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
                            <div className="border-r border-gray-200 bg-white px-3 flex items-center flex-shrink-0" style={{ width: `${columnWidths.get("module") || 200}px` }} />
                            <div className="border-r border-gray-200 bg-white px-3 flex items-center flex-shrink-0" style={{ width: `${columnWidths.get("level2") || 150}px` }} />
                            <div className="border-r border-gray-200 bg-white px-3 flex items-center flex-shrink-0" style={{ width: `${columnWidths.get("level3") || 150}px` }} />
                            <div className="border-r border-gray-200 bg-white px-3 flex items-center flex-shrink-0" style={{ width: `${columnWidths.get("level4") || 150}px` }} />
                            <div className="border-r border-gray-200 bg-white px-3 flex items-center flex-shrink-0" style={{ width: `${columnWidths.get("form") || 200}px` }} />
                            <div className="border-r border-gray-200 bg-white px-3 flex items-center flex-shrink-0" style={{ width: `${columnWidths.get("dropdown") || 200}px` }} />
                            <div className="border-r border-gray-200 bg-white px-3 flex items-center flex-shrink-0" style={{ width: `${columnWidths.get("values") || 300}px` }} />
                            <div className="w-32 border-r border-gray-200 flex items-center justify-center flex-shrink-0" />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Confirm Delete</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this dropdown? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={processingRows.has(rowToDelete || "")}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => rowToDelete && handleConfirmDelete(rowToDelete)}
                disabled={processingRows.has(rowToDelete || "")}
                className="w-full sm:w-auto"
              >
                {processingRows.has(rowToDelete || "") ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}