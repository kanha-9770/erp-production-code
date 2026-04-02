"use client"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { useLazyGetMasterDataQuery, useCreateMasterDataMutation, useUpdateMasterDataMutation, useDeleteMasterDataMutation } from "@/lib/api/settings"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Plus, Trash2, Save, Edit2, Loader2, X, Search, Filter, ChevronDown, ChevronUp, Upload, GripVertical, ChevronLeft, ChevronRight, LayoutGrid, AlertCircle, Eye, EyeOff, Columns3 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers"
import { CSS } from "@dnd-kit/utilities"

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

interface ColumnDef {
  id: string
  label: string
  defaultWidth: number
  minWidth: number
  dataKey: string // key on DropdownRow to check for data presence
  flex?: boolean  // if true, column takes remaining space
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: "module", label: "Module", defaultWidth: 180, minWidth: 120, dataKey: "module_name" },
  { id: "level2", label: "Level 2", defaultWidth: 140, minWidth: 100, dataKey: "level2_name" },
  { id: "level3", label: "Level 3", defaultWidth: 140, minWidth: 100, dataKey: "level3_name" },
  { id: "level4", label: "Level 4", defaultWidth: 140, minWidth: 100, dataKey: "level4_name" },
  { id: "form", label: "Form", defaultWidth: 180, minWidth: 120, dataKey: "form_name" },
  { id: "dropdown", label: "Dropdown Name", defaultWidth: 180, minWidth: 130, dataKey: "master_data_type_name" },
  { id: "values", label: "Values", defaultWidth: 280, minWidth: 200, dataKey: "values", flex: true },
]

// ==================== SORTABLE VALUE ITEM ====================
function SortableValueItem({
  val,
  vi,
  rowId,
  onValueChange,
  onDelete,
  onKeyDown,
  inputRef,
}: {
  val: { id: string; value: string; code: string }
  vi: number
  rowId: string
  onValueChange: (rowId: string, vi: number, value: string) => void
  onDelete: (rowId: string, vi: number) => void
  onKeyDown: (e: React.KeyboardEvent, vi: number) => void
  inputRef: (el: HTMLInputElement | null) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: val.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1.5 group/item rounded-lg border bg-white px-1.5 py-1 transition-all duration-150",
        isDragging ? "shadow-lg border-blue-300 bg-blue-50 z-50 opacity-90" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors p-0.5 rounded hover:bg-gray-100"
        title="Drag to reorder"
        type="button"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="flex-shrink-0 text-[10px] font-semibold text-gray-400 w-4 text-center select-none">
        {vi + 1}
      </span>
      <Input
        ref={inputRef}
        value={val.value}
        onChange={(e) => onValueChange(rowId, vi, e.target.value)}
        onKeyDown={(e) => onKeyDown(e, vi)}
        placeholder="Enter value"
        className="flex-1 h-7 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-blue-400 bg-transparent px-1.5 min-w-0"
      />
      <button
        onClick={() => onDelete(rowId, vi)}
        className="flex-shrink-0 opacity-0 group-hover/item:opacity-100 text-gray-400 hover:text-red-500 transition-all p-0.5 rounded hover:bg-red-50"
        title="Remove value"
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ==================== COLUMN HEADER ====================
function ColumnHeader({
  label,
  fieldId,
  width,
  minWidth,
  flex,
  sortField,
  sortOrder,
  onSort,
  onResizeStart,
}: {
  label: string
  fieldId: string
  width: number
  minWidth: number
  flex?: boolean
  sortField: string
  sortOrder: "asc" | "desc"
  onSort: (field: string) => void
  onResizeStart: (e: React.MouseEvent, fieldId: string, width: number) => void
}) {
  const isActive = sortField === fieldId
  return (
    <div
      className={cn(
        "relative h-10 border-r border-gray-200/80 flex items-center text-xs font-semibold px-3 cursor-pointer select-none group transition-colors duration-150",
        flex ? "flex-1 min-w-0" : "flex-shrink-0",
        isActive ? "text-blue-700 bg-blue-50/50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50/80"
      )}
      style={flex ? { minWidth: `${minWidth}px` } : { width: `${width}px`, minWidth: `${minWidth}px` }}
      onClick={() => onSort(fieldId)}
    >
      <div className="flex items-center justify-between w-full gap-1 overflow-hidden">
        <span className="truncate text-[11px] uppercase tracking-wider font-semibold">{label}</span>
        {isActive && (
          <span className="flex-shrink-0 text-blue-500">
            {sortOrder === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        )}
      </div>
      {!flex && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-transparent hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
          onMouseDown={(e) => onResizeStart(e, fieldId, width)}
          onClick={(e) => e.stopPropagation()}
          title="Drag to resize"
        />
      )}
    </div>
  )
}

// ==================== VALUE BADGES (read mode) ====================
function ValueBadges({ values, maxShow = 3 }: { values: { id: string; value: string; code: string }[]; maxShow?: number }) {
  const filled = values.filter(v => v.value.trim())
  if (filled.length === 0) return <span className="text-gray-300 italic text-[13px]">--</span>

  const shown = filled.slice(0, maxShow)
  const remaining = filled.length - maxShow

  return (
    <div className="flex items-center gap-1 flex-wrap overflow-hidden max-h-[28px]">
      {shown.map((v, i) => (
        <Badge
          key={v.id}
          variant="secondary"
          className="text-[11px] px-1.5 py-0 h-[22px] font-normal bg-gray-100 text-gray-700 border-gray-200 truncate max-w-[120px]"
          title={v.value}
        >
          {v.value}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-[22px] font-medium bg-blue-50 text-blue-600 border-blue-200 flex-shrink-0">
          +{remaining} more
        </Badge>
      )}
    </div>
  )
}

// ==================== MAIN COMPONENT ====================
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

  const [columnWidths, setColumnWidths] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>()
    ALL_COLUMNS.forEach(c => map.set(c.id, c.defaultWidth))
    return map
  })

  // Manual column visibility overrides (user can toggle columns)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [showColumnMenu, setShowColumnMenu] = useState(false)

  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)
  const [numDummyRows, setNumDummyRows] = useState(0)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // Expanded values row (for viewing all values inline)
  const [expandedValueRows, setExpandedValueRows] = useState<Set<string>>(new Set())

  const { toast } = useToast()
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const valueInputRefs = useRef<Map<string, HTMLInputElement[]>>(new Map())
  const columnMenuRef = useRef<HTMLDivElement>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Auto-detect which columns have data
  const columnsWithData = useMemo(() => {
    const hasData = new Set<string>()
    const hasEditing = rows.some(r => r.isEditing)
    for (const row of rows) {
      if (row.module_name) hasData.add("module")
      if (row.level2_name || row.level2_id) hasData.add("level2")
      if (row.level3_name || row.level3_id) hasData.add("level3")
      if (row.level4_name || row.level4_id) hasData.add("level4")
      if (row.form_name || row.form_id) hasData.add("form")
      if (row.master_data_type_name) hasData.add("dropdown")
      if (row.values.length > 0) hasData.add("values")
    }
    // Always show module, form, dropdown, values
    hasData.add("module")
    hasData.add("form")
    hasData.add("dropdown")
    hasData.add("values")
    // If any row is editing, show all columns (user might need to fill them)
    if (hasEditing) {
      ALL_COLUMNS.forEach(c => hasData.add(c.id))
    }
    return hasData
  }, [rows])

  // Visible columns = columns that have data AND are not manually hidden
  const visibleColumns = useMemo(() => {
    return ALL_COLUMNS.filter(col => columnsWithData.has(col.id) && !hiddenColumns.has(col.id))
  }, [columnsWithData, hiddenColumns])

  // Close column menu on outside click
  useEffect(() => {
    if (!showColumnMenu) return
    const handler = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showColumnMenu])

  useEffect(() => {
    fetchData()
  }, [])

  const handleBulkDelete = useCallback(async () => {
    if (selectedRecords.size === 0) return
    setIsBulkDeleting(true)
    try {
      const deletePromises = Array.from(selectedRecords).map(async (id) => {
        await deleteMasterData(id).unwrap()
      })
      await Promise.all(deletePromises)
      toast({ title: "Success", description: `${selectedRecords.size} dropdown(s) deleted successfully` })
      setSelectedRecords(new Set())
      await fetchData()
      setCurrentPage(1)
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete some records", variant: "destructive" })
    } finally {
      setIsBulkDeleting(false)
      setBulkDeleteDialogOpen(false)
    }
  }, [selectedRecords, deleteMasterData, toast])

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
    setCurrentPage(Math.ceil((rows.length + 1) / recordsPerPage))
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
        ;(row as any)[field] = value
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

  const handleDragEnd = useCallback((rowId: string, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId)
      if (idx < 0) return prev
      const newRows = [...prev]
      const values = [...newRows[idx].values]
      const oldIndex = values.findIndex(v => v.id === active.id)
      const newIndex = values.findIndex(v => v.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      newRows[idx] = { ...newRows[idx], values: arrayMove(values, oldIndex, newIndex) }
      return newRows
    })
  }, [])

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

  const hasSelection = selectedRecords.size > 0

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

  const handleSort = useCallback((field: string) => {
    if (recordSortField === field) {
      setRecordSortOrder(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setRecordSortField(field)
      setRecordSortOrder("asc")
    }
  }, [recordSortField])

  const sortRecords = useCallback((records: DropdownRow[]): DropdownRow[] => {
    const sorted = [...records].sort((a, b) => {
      let valA: any, valB: any
      switch (recordSortField) {
        case "module": valA = a.module_name; valB = b.module_name; break
        case "level2": valA = a.level2_name; valB = b.level2_name; break
        case "level3": valA = a.level3_name; valB = b.level3_name; break
        case "level4": valA = a.level4_name; valB = b.level4_name; break
        case "form": valA = a.form_name; valB = b.form_name; break
        case "dropdown": valA = a.master_data_type_name; valB = b.master_data_type_name; break
        case "values":
          valA = a.values.map(v => v.value).filter(Boolean).join(", ")
          valB = b.values.map(v => v.value).filter(Boolean).join(", ")
          break
        default: return 0
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
  const totalPages = Math.max(1, Math.ceil(totalRecords / recordsPerPage))
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
      const col = ALL_COLUMNS.find(c => c.id === resizingColumn)
      const deltaX = e.clientX - resizeStartX
      const newWidth = Math.max(col?.minWidth || 80, resizeStartWidth + deltaX)
      setColumnWidths((prev) => {
        const updated = new Map(prev)
        updated.set(resizingColumn, newWidth)
        return updated
      })
    }
    const handleMouseUp = () => setResizingColumn(null)
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
      if (updated.has(cellKey)) updated.delete(cellKey)
      else updated.add(cellKey)
      return updated
    })
  }, [])

  useEffect(() => {
    const calculateFillers = () => {
      if (!tableContainerRef.current) return
      const containerHeight = tableContainerRef.current.clientHeight
      const headerHeight = 40
      const rowHeight = 44
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

  const handleValueKeyDown = useCallback((rowId: string, e: React.KeyboardEvent, vi: number) => {
    const row = rowsRef.current.find(r => r.id === rowId)
    if (!row) return
    if (e.key === "Enter") {
      e.preventDefault()
      if (vi === row.values.length - 1) {
        addValue(rowId)
      } else {
        const nextInput = valueInputRefs.current.get(rowId)?.[vi + 1]
        nextInput?.focus()
      }
    }
  }, [addValue])

  // Get cell style for a column
  const getCellStyle = useCallback((col: ColumnDef) => {
    if (col.flex) return { minWidth: `${col.minWidth}px` }
    return { width: `${columnWidths.get(col.id) || col.defaultWidth}px`, minWidth: `${col.minWidth}px` }
  }, [columnWidths])

  const getCellClass = useCallback((col: ColumnDef) => {
    return col.flex ? "flex-1 min-w-0" : "flex-shrink-0"
  }, [])

  // Render a cell's content based on column id
  const renderCellContent = useCallback((col: ColumnDef, row: DropdownRow, isEditing: boolean, rowId: string, cellKeyPrefix: string) => {
    switch (col.id) {
      case "module":
        return isEditing ? (
          <Select value={row.module_id} onValueChange={(v) => updateRow(rowId, "module_id", v)}>
            <SelectTrigger className="h-7 text-xs w-full border-gray-200"><SelectValue placeholder="Select Module" /></SelectTrigger>
            <SelectContent>
              {modules.map((m) => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}
            </SelectContent>
          </Select>
        ) : (
          <span className="truncate text-[13px]" title={row.module_name}>{row.module_name || <span className="text-gray-300 italic">--</span>}</span>
        )
      case "level2":
        return isEditing ? (
          <Select value={row.level2_id} onValueChange={(v) => updateRow(rowId, "level2_id", v)} disabled={!row.module_id}>
            <SelectTrigger className="h-7 text-xs w-full border-gray-200"><SelectValue placeholder="Level 2" /></SelectTrigger>
            <SelectContent>
              {row.module_id && findNode(row.module_id, modules)?.children?.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
        ) : (
          <span className="truncate text-[13px]" title={row.level2_name}>{row.level2_name || <span className="text-gray-300 italic">--</span>}</span>
        )
      case "level3":
        return isEditing ? (
          <Select value={row.level3_id} onValueChange={(v) => updateRow(rowId, "level3_id", v)} disabled={!row.level2_id}>
            <SelectTrigger className="h-7 text-xs w-full border-gray-200"><SelectValue placeholder="Level 3" /></SelectTrigger>
            <SelectContent>
              {row.level2_id && findNode(row.level2_id, modules)?.children?.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
        ) : (
          <span className="truncate text-[13px]" title={row.level3_name}>{row.level3_name || <span className="text-gray-300 italic">--</span>}</span>
        )
      case "level4":
        return isEditing ? (
          <Select value={row.level4_id} onValueChange={(v) => updateRow(rowId, "level4_id", v)} disabled={!row.level3_id}>
            <SelectTrigger className="h-7 text-xs w-full border-gray-200"><SelectValue placeholder="Level 4" /></SelectTrigger>
            <SelectContent>
              {row.level3_id && findNode(row.level3_id, modules)?.children?.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
        ) : (
          <span className="truncate text-[13px]" title={row.level4_name}>{row.level4_name || <span className="text-gray-300 italic">--</span>}</span>
        )
      case "form":
        return isEditing ? (
          <Select value={row.form_id} onValueChange={(v) => updateRow(rowId, "form_id", v)} disabled={!getDeepestId(row)}>
            <SelectTrigger className="h-7 text-xs w-full border-gray-200"><SelectValue placeholder="Select Form" /></SelectTrigger>
            <SelectContent>
              {getFormOptions(getDeepestId(row)).map((f: any) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}
            </SelectContent>
          </Select>
        ) : (
          <span className="truncate text-[13px]" title={row.form_name}>{row.form_name || <span className="text-gray-300 italic">--</span>}</span>
        )
      case "dropdown":
        return isEditing ? (
          <Input
            value={row.master_data_type_name}
            onChange={(e) => updateRow(rowId, "master_data_type_name", e.target.value)}
            placeholder="e.g. Leave Type, Gender"
            className="h-7 text-xs w-full border-gray-200"
          />
        ) : (
          <span className="truncate text-[13px] font-medium" title={row.master_data_type_name}>
            {row.master_data_type_name || <span className="text-gray-300 italic">--</span>}
          </span>
        )
      case "values":
        return null // handled separately for special layout
      default:
        return null
    }
  }, [modules, forms, findNode, updateRow, getDeepestId, getFormOptions])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-sm text-gray-500 font-medium">Loading master data...</span>
      </div>
    )
  }

  const hasActiveFilters = recordSearchQuery || selectedModuleFilter !== "all"
  const hiddenCount = ALL_COLUMNS.filter(c => !columnsWithData.has(c.id) || hiddenColumns.has(c.id)).length

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-gray-50/50 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-screen-2xl">
          {/* ==================== HEADER ==================== */}
          <div className="mb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
                <LayoutGrid className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Master Dropdowns</h1>
                <p className="text-xs text-gray-500 mt-0.5">Manage dropdown values for forms across modules</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasSelection && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteDialogOpen(true)}
                  className="h-8 text-xs shadow-sm"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete {selectedRecords.size} selected
                </Button>
              )}
              <Button
                onClick={addNewRow}
                className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs shadow-sm"
                size="sm"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Dropdown
              </Button>
            </div>
          </div>

          {/* ==================== FILTERS ==================== */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
            <div className="p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input
                    placeholder="Search by dropdown name..."
                    value={recordSearchQuery}
                    onChange={(e) => { setRecordSearchQuery(e.target.value); setCurrentPage(1) }}
                    className="pl-8 h-8 text-xs border-gray-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 rounded-lg transition-all"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <Select value={selectedModuleFilter} onValueChange={(v) => { setSelectedModuleFilter(v); setCurrentPage(1) }}>
                  <SelectTrigger className="h-8 text-xs rounded-lg border-gray-200 min-w-[170px]">
                    <Filter className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                    <SelectValue placeholder="All Modules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modules</SelectItem>
                    {modules.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={recordsPerPage.toString()} onValueChange={(value) => { setRecordsPerPage(Number(value)); setCurrentPage(1) }}>
                  <SelectTrigger className="h-8 text-xs rounded-lg border-gray-200 min-w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 per page</SelectItem>
                    <SelectItem value="20">20 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                  </SelectContent>
                </Select>

                {/* Column visibility toggle */}
                <div className="relative" ref={columnMenuRef}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowColumnMenu(!showColumnMenu)}
                        className={cn("h-8 w-8 p-0 border-gray-200", showColumnMenu && "bg-gray-100")}
                      >
                        <Columns3 className="h-3.5 w-3.5 text-gray-500" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p className="text-xs">Toggle columns</p></TooltipContent>
                  </Tooltip>
                  {showColumnMenu && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-lg z-50 py-1">
                      <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        Visible Columns
                      </div>
                      {ALL_COLUMNS.map(col => {
                        const hasData = columnsWithData.has(col.id)
                        const isHidden = hiddenColumns.has(col.id)
                        const alwaysShow = ["module", "dropdown", "values"].includes(col.id)
                        return (
                          <button
                            key={col.id}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors",
                              alwaysShow && "opacity-60 cursor-default"
                            )}
                            onClick={() => {
                              if (alwaysShow) return
                              setHiddenColumns(prev => {
                                const next = new Set(prev)
                                if (next.has(col.id)) next.delete(col.id)
                                else next.add(col.id)
                                return next
                              })
                            }}
                            disabled={alwaysShow}
                          >
                            {isHidden || !hasData ? (
                              <EyeOff className="h-3 w-3 text-gray-300" />
                            ) : (
                              <Eye className="h-3 w-3 text-blue-500" />
                            )}
                            <span className={cn("text-gray-700", (isHidden || !hasData) && "text-gray-400")}>{col.label}</span>
                            {!hasData && <span className="text-[10px] text-gray-300 ml-auto">no data</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="px-3 pb-3 flex flex-wrap items-center gap-1.5">
                {recordSearchQuery && (
                  <Badge variant="secondary" className="gap-1 text-[11px] font-normal pl-2 pr-1 py-0.5 bg-blue-50 text-blue-700 border-blue-200">
                    Search: &quot;{recordSearchQuery}&quot;
                    <button onClick={() => setRecordSearchQuery("")} className="ml-0.5 hover:bg-blue-200 rounded-full p-0.5 transition-colors">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
                {selectedModuleFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-[11px] font-normal pl-2 pr-1 py-0.5 bg-blue-50 text-blue-700 border-blue-200">
                    Module: {getModuleName(selectedModuleFilter)}
                    <button onClick={() => setSelectedModuleFilter("all")} className="ml-0.5 hover:bg-blue-200 rounded-full p-0.5 transition-colors">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
                <button
                  onClick={() => { setRecordSearchQuery(""); setSelectedModuleFilter("all") }}
                  className="text-[11px] text-gray-500 hover:text-red-600 font-medium px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* ==================== TABLE ==================== */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-auto h-[68vh] sm:h-[72vh] max-h-[72vh]" ref={tableContainerRef}>
              <div className="min-w-full" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
                {/* ===== TABLE HEADER ===== */}
                <div className="flex bg-gray-50/80 border-b border-gray-200 sticky top-0 z-20 backdrop-blur-sm">
                  {/* Checkbox col */}
                  <div className="h-10 w-10 border-r border-gray-200/80 flex items-center justify-center flex-shrink-0">
                    <Checkbox
                      checked={selectedRecords.size === paginatedRecords.length && paginatedRecords.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedRecords(new Set(paginatedRecords.map((r) => r.id)))
                        else setSelectedRecords(new Set())
                      }}
                      className="h-3.5 w-3.5"
                    />
                  </div>

                  {/* # col */}
                  <div className="w-10 h-10 border-r border-gray-200/80 flex items-center justify-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0">
                    #
                  </div>

                  {/* Dynamic columns */}
                  {visibleColumns.map(col => (
                    <ColumnHeader
                      key={col.id}
                      label={col.label}
                      fieldId={col.id}
                      width={columnWidths.get(col.id) || col.defaultWidth}
                      minWidth={col.minWidth}
                      flex={col.flex}
                      sortField={recordSortField}
                      sortOrder={recordSortOrder}
                      onSort={handleSort}
                      onResizeStart={handleResizeStart}
                    />
                  ))}

                  {/* Actions col */}
                  <div className="w-24 h-10 border-r border-gray-200/80 flex items-center justify-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0">
                    Actions
                  </div>
                </div>

                {/* ===== TABLE BODY ===== */}
                {paginatedRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400 min-h-[200px] gap-3">
                    <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <AlertCircle className="h-6 w-6 text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">
                      {hasActiveFilters ? "No records match your filters" : "No dropdowns yet"}
                    </p>
                    {!hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={addNewRow} className="text-xs h-7">
                        <Plus className="h-3 w-3 mr-1" /> Create your first dropdown
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {paginatedRecords.map((row, rowIndex) => {
                      const rowId = row.id
                      const isEditing = row.isEditing
                      const isProcessing = processingRows.has(rowId)
                      const cellKeyPrefix = `${rowId}-`
                      const num = startIdx + rowIndex + 1
                      const isSelected = selectedRecords.has(rowId)
                      const isValuesExpanded = expandedValueRows.has(rowId)

                      return (
                        <div
                          key={rowId}
                          className={cn(
                            "flex transition-colors duration-100 border-b border-gray-100 last:border-b-0",
                            isSelected && "bg-blue-50/60",
                            isEditing && "bg-amber-50/30",
                            !isSelected && !isEditing && "hover:bg-gray-50/60"
                          )}
                        >
                          {/* Checkbox */}
                          <div className="w-10 min-h-[44px] border-r border-gray-100 flex items-center justify-center flex-shrink-0">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedRecords)
                                if (checked) newSelected.add(rowId)
                                else newSelected.delete(rowId)
                                setSelectedRecords(newSelected)
                              }}
                              className="h-3.5 w-3.5"
                            />
                          </div>

                          {/* Row number */}
                          <div className="w-10 min-h-[44px] border-r border-gray-100 flex items-center justify-center text-xs font-medium text-gray-400 flex-shrink-0">
                            {num}
                          </div>

                          {/* Dynamic cells */}
                          {visibleColumns.map(col => {
                            if (col.id === "values") {
                              // Special rendering for values column
                              return (
                                <div
                                  key={col.id}
                                  className={cn(
                                    "border-r border-gray-100 px-3 text-sm text-gray-700 overflow-hidden",
                                    getCellClass(col),
                                    isEditing ? "py-2.5 min-h-[44px]" : "min-h-[44px] flex items-center"
                                  )}
                                  style={getCellStyle(col)}
                                >
                                  {isEditing ? (
                                    <div className="w-full space-y-2">
                                      {/* Import button */}
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full text-[11px] h-7 border-dashed border-gray-300 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50"
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
                                                  values = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
                                                } else {
                                                  values = text.split(/\r?\n/).map(line => line.split(/[,;\t]/)[0]?.trim() || "").filter(Boolean)
                                                }
                                                if (values.length === 0) {
                                                  toast({ title: "No values imported", description: "File was empty or could not be parsed" })
                                                  return
                                                }
                                                setRows(prev => {
                                                  const next = [...prev]
                                                  const idx = next.findIndex(r => r.id === rowId)
                                                  if (idx === -1) return prev
                                                  next[idx] = { ...next[idx], values: values.map((v, i) => ({ id: `file-import-${Date.now()}-${i}-${Math.random()}`, value: v, code: "" })) }
                                                  return next
                                                })
                                                toast({ title: `Imported ${values.length} values`, description: `from ${file.name}` })
                                              } catch (err) {
                                                toast({ title: "Import failed", description: "Could not read the file", variant: "destructive" })
                                              }
                                            }
                                            reader.readAsText(file)
                                          }
                                          input.click()
                                        }}
                                      >
                                        <Upload className="h-3 w-3 mr-1.5" />
                                        Import from file
                                      </Button>

                                      {/* Sortable values list */}
                                      {row.values.length > 0 && (
                                        <DndContext
                                          sensors={sensors}
                                          collisionDetection={closestCenter}
                                          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                                          onDragEnd={(event) => handleDragEnd(rowId, event)}
                                        >
                                          <SortableContext items={row.values.map(v => v.id)} strategy={verticalListSortingStrategy}>
                                            <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
                                              {row.values.map((val, vi) => (
                                                <SortableValueItem
                                                  key={val.id}
                                                  val={val}
                                                  vi={vi}
                                                  rowId={rowId}
                                                  onValueChange={handleValueChange}
                                                  onDelete={deleteValue}
                                                  onKeyDown={(e, idx) => handleValueKeyDown(rowId, e, idx)}
                                                  inputRef={(el) => {
                                                    if (!el) return
                                                    const refs = valueInputRefs.current.get(rowId) || []
                                                    refs[vi] = el
                                                    valueInputRefs.current.set(rowId, refs)
                                                  }}
                                                />
                                              ))}
                                            </div>
                                          </SortableContext>
                                        </DndContext>
                                      )}

                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => addValue(rowId)}
                                        className="h-7 text-[11px] w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-dashed border-blue-200"
                                      >
                                        <Plus className="w-3 h-3 mr-1" /> Add Value
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="w-full overflow-hidden">
                                      {row.values.length > 0 ? (
                                        <div className="flex items-center gap-1.5 w-full overflow-hidden">
                                          <div className="flex-1 min-w-0 overflow-hidden">
                                            <ValueBadges values={row.values} maxShow={isValuesExpanded ? 999 : 3} />
                                          </div>
                                          {row.values.filter(v => v.value.trim()).length > 3 && (
                                            <button
                                              onClick={() => {
                                                setExpandedValueRows(prev => {
                                                  const next = new Set(prev)
                                                  if (next.has(rowId)) next.delete(rowId)
                                                  else next.add(rowId)
                                                  return next
                                                })
                                              }}
                                              className="flex-shrink-0 text-[10px] text-blue-500 hover:text-blue-700 font-medium hover:underline"
                                            >
                                              {isValuesExpanded ? "less" : "all"}
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-gray-300 italic text-[13px]">--</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            }

                            // Regular columns
                            return (
                              <div
                                key={col.id}
                                className={cn(
                                  "border-r border-gray-100 px-3 text-sm text-gray-700 min-h-[44px] flex items-center overflow-hidden",
                                  getCellClass(col)
                                )}
                                style={getCellStyle(col)}
                              >
                                <div className="w-full min-w-0 overflow-hidden">
                                  {renderCellContent(col, row, !!isEditing, rowId, cellKeyPrefix)}
                                </div>
                              </div>
                            )
                          })}

                          {/* Actions */}
                          <div className="w-24 min-h-[44px] border-r border-gray-100 flex items-center justify-center flex-shrink-0 px-1">
                            <div className="flex gap-1 w-full justify-center">
                              {isEditing ? (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        onClick={() => saveRow(rowId)}
                                        disabled={isProcessing}
                                        className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <>
                                            <Save className="w-3 h-3 mr-1" />
                                            Save
                                          </>
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top"><p className="text-xs">Save changes</p></TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => cancelRow(rowId)}
                                        disabled={isProcessing}
                                        className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top"><p className="text-xs">Cancel</p></TooltipContent>
                                  </Tooltip>
                                </>
                              ) : (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => startEdit(rowId)}
                                        disabled={isProcessing}
                                        className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top"><p className="text-xs">Edit</p></TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => deleteRow(rowId)}
                                        disabled={isProcessing}
                                        className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top"><p className="text-xs">Delete</p></TooltipContent>
                                  </Tooltip>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Dummy filler rows */}
                    {Array.from({ length: numDummyRows }).map((_, dummyIndex) => (
                      <div
                        key={`dummy-${dummyIndex}`}
                        className="flex h-11 border-b border-gray-50 bg-white last:border-b-0"
                      >
                        <div className="w-10 border-r border-gray-50 flex-shrink-0" />
                        <div className="w-10 border-r border-gray-50 flex-shrink-0" />
                        {visibleColumns.map(col => (
                          <div
                            key={col.id}
                            className={cn("border-r border-gray-50", getCellClass(col))}
                            style={getCellStyle(col)}
                          />
                        ))}
                        <div className="w-24 border-r border-gray-50 flex-shrink-0" />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ===== PAGINATION FOOTER ===== */}
            {totalRecords > 0 && (
              <div className="border-t border-gray-200 px-4 py-2.5 flex items-center justify-between bg-gray-50/50">
                <div className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{startIdx + 1}</span>
                  {" - "}
                  <span className="font-medium text-gray-700">{Math.min(endIdx, totalRecords)}</span>
                  {" of "}
                  <span className="font-medium text-gray-700">{totalRecords}</span>
                  {" records"}
                  {hiddenCount > 0 && (
                    <span className="ml-2 text-gray-400">({hiddenCount} column{hiddenCount > 1 ? "s" : ""} hidden)</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="h-7 w-7 p-0 text-gray-400"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <ChevronLeft className="h-3.5 w-3.5 -ml-2" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="h-7 w-7 p-0 text-gray-400"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-gray-500 px-2 min-w-[80px] text-center">
                    Page <span className="font-medium text-gray-700">{currentPage}</span> of <span className="font-medium text-gray-700">{totalPages}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="h-7 w-7 p-0 text-gray-400"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage >= totalPages}
                    className="h-7 w-7 p-0 text-gray-400"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    <ChevronRight className="h-3.5 w-3.5 -ml-2" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==================== DELETE DIALOG ==================== */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="text-base">Delete Dropdown</DialogTitle>
              <DialogDescription className="text-sm">
                This dropdown and all its values will be permanently removed. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)} disabled={processingRows.has(rowToDelete || "")} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={() => rowToDelete && handleConfirmDelete(rowToDelete)} disabled={processingRows.has(rowToDelete || "")} className="w-full sm:w-auto">
                {processingRows.has(rowToDelete || "") ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Deleting...</>) : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ==================== BULK DELETE DIALOG ==================== */}
        <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="text-base">Delete Selected Dropdowns</DialogTitle>
              <DialogDescription className="text-sm">
                You are about to delete{" "}
                <span className="font-semibold text-red-600">{selectedRecords.size}</span>{" "}
                dropdown(s). This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setBulkDeleteDialogOpen(false)} disabled={isBulkDeleting} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={isBulkDeleting} className="w-full sm:w-auto">
                {isBulkDeleting ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Deleting...</>) : `Delete ${selectedRecords.size} Records`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
