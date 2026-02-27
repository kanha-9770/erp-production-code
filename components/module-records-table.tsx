"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  Search,
  Eye,
  Edit,
  Trash2,
  Download,
  Filter,
  Database,
  Calendar,
  User,
  Hash,
  FileText,
  Settings,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { FormModule } from "@/types/form-builder"

interface DynamicRecord {
  id: string
  recordId: string
  recordType: string
  recordData: any
  submittedBy: string
  submittedAt: string
  status: string
  tags: string
  searchText: string
}

interface ModuleRecordsTableProps {
  moduleId: string
  module: FormModule
  // These props are now passed from the parent (app/builder/[id]/records/page.tsx or module-publish-content.tsx)
  records?: DynamicRecord[]
  totalRecords?: number
  totalPages?: number
  onRecordsChange?: () => void // Callback to refresh records if needed
}

export default function ModuleRecordsTable({
  moduleId,
  module,
  records: initialRecords = [], // Use initialRecords for the prop
  totalRecords: initialTotalRecords = 0,
  totalPages: initialTotalPages = 1,
  onRecordsChange,
}: ModuleRecordsTableProps) {
  const [records, setRecords] = useState<DynamicRecord[]>(initialRecords)
  const [loading, setLoading] = useState(false) // Local loading state for search/pagination
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("active")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [totalRecords, setTotalRecords] = useState(initialTotalRecords)
  const [selectedRecord, setSelectedRecord] = useState<DynamicRecord | null>(null)
  const [viewMode, setViewMode] = useState<"table" | "cards">("table") // Keep view mode local to this component
  const { toast } = useToast()

  // Effect to update local state when parent props change
  useEffect(() => {
    setRecords(initialRecords)
    setTotalRecords(initialTotalRecords)
    setTotalPages(initialTotalPages)
  }, [initialRecords, initialTotalRecords, initialTotalPages])

  // Effect to load records when filters/pagination change (if not managed by parent)
  useEffect(() => {
    // Only load records internally if records prop is not provided (i.e., this component manages its own data)
    // In this setup, the parent (app/builder/[id]/records/page.tsx or module-publish-content.tsx) will manage fetching
    // So, this useEffect will primarily be for re-fetching if search/status/page changes *within* this component
    // and the parent isn't explicitly passing updated records.
    // For now, we'll assume the parent passes updated records, so this internal fetch is commented out.
    // If this component needs to be standalone, uncomment and adjust.
    // if (!initialRecords.length && !initialTotalRecords) {
    //   loadRecordsInternal();
    // }
  }, [moduleId, page, search, status]) // Removed initialRecords, initialTotalRecords from dependency array

  const loadRecordsInternal = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        search,
        status,
      })

      const response = await fetch(`/api/modules/${moduleId}/records?${params}`)
      const result = await response.json()

      if (result.success) {
        setRecords(result.data.records)
        setTotalPages(result.data.pagination.pages)
        setTotalRecords(result.data.pagination.total)
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error loading records:", error)
      toast({
        title: "Error",
        description: "Failed to load records",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getRecordTitle = (record: DynamicRecord) => {
    const data = record.recordData
    const titleFields = [
      "name",
      "title",
      "employeeName",
      "customerName",
      "productName",
      "fullName",
      "firstName",
      "companyName",
    ]

    for (const field of titleFields) {
      if (data[field]) return data[field]
    }

    return record.recordId
  }

  const getRecordDescription = (record: DynamicRecord) => {
    const data = record.recordData
    const descFields = ["description", "department", "designation", "category", "email", "phone", "position"]
    const parts = []

    for (const field of descFields) {
      if (data[field]) parts.push(data[field])
    }

    return parts.join(" • ") || "No additional details"
  }

  const getFieldValue = (data: any, fieldName: string) => {
    const value = data[fieldName]
    if (value === null || value === undefined) return "-"
    if (typeof value === "object") {
      if (value.label) return value.label
      if (Array.isArray(value)) return value.map((v) => v.label || v).join(", ")
      return JSON.stringify(value)
    }
    return String(value)
  }

  const getTableColumns = () => {
    if (records.length === 0) return []

    // Get all unique field names from all records
    const allFields = new Set<string>()
    records.forEach((record) => {
      Object.keys(record.recordData).forEach((key) => allFields.add(key))
    })

    return Array.from(allFields).slice(0, 6) // Limit to 6 columns for better display
  }

  const formatFieldName = (fieldName: string) => {
    return fieldName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim()
  }

  const exportRecords = async () => {
    try {
      const allRecords = await fetch(`/api/modules/${moduleId}/records?limit=1000&status=all`)
      const result = await allRecords.json()

      if (result.success) {
        const csvContent = convertToCSV(result.data.records)
        downloadCSV(csvContent, `${module?.name || "form"}-records.csv`)
        toast({
          title: "Success",
          description: "Records exported successfully",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export records",
        variant: "destructive",
      })
    }
  }

  const convertToCSV = (recordsToExport: DynamicRecord[]) => {
    if (recordsToExport.length === 0) return ""

    const allFields = new Set<string>()
    recordsToExport.forEach((record) => {
      Object.keys(record.recordData).forEach((key) => allFields.add(key))
    })

    const headers = ["Record ID", "Submitted By", "Submitted At", "Status", ...Array.from(allFields)]
    const rows = recordsToExport.map((record) => [
      record.recordId,
      record.submittedBy,
      new Date(record.submittedAt).toLocaleString(),
      record.status,
      ...Array.from(allFields).map((field) => getFieldValue(record.recordData, field)),
    ])

    return [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")
  }

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", filename)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const deleteRecord = async (recordId: string) => {
    try {
      const response = await fetch(`/api/dynamic-records/${recordId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Record deleted successfully",
        })
        onRecordsChange?.() // Notify parent to refresh records
        loadRecordsInternal() // Also refresh local state if this component is standalone
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete record",
        variant: "destructive",
      })
    }
  }

  const tableColumns = getTableColumns()

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Records</p>
                <p className="text-3xl font-bold">{totalRecords}</p>
              </div>
              <Database className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Records</p>
                <p className="text-3xl font-bold text-green-600">
                  {records.filter((r) => r.status === "active").length}
                </p>
              </div>
              <FileText className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Last Updated</p>
                <p className="text-lg font-semibold">{new Date().toLocaleDateString()}</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Form Status</p>
                <Badge variant={module.isPublished ? "default" : "secondary"} className="text-sm">
                  {module.isPublished ? "Published" : "Draft"}
                </Badge>
              </div>
              <Settings className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search records..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
                <SelectItem value="all">All Status</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Advanced Filters
            </Button>
            <Button onClick={exportRecords} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Records Display */}
      {loading ? (
        <Card>
          <CardContent className="flex justify-center items-center h-64">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading records...</p>
            </div>
          </CardContent>
        </Card>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-gray-400 mb-4">
              <Database className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Records Found</h3>
            <p className="text-gray-600 mb-6">
              {search ? "No records match your search criteria." : "No form submissions yet."}
            </p>
            {!search && module.isPublished && (
              <a href={`/form/${moduleId}`} target="_blank" rel="noopener noreferrer">
                <Button>
                  <FileText className="w-4 h-4 mr-2" />
                  View Public Form
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "table" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Records Data Table
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4" />
                        Record ID
                      </div>
                    </TableHead>
                    {tableColumns.map((column) => (
                      <TableHead key={column} className="font-semibold">
                        {formatFieldName(column)}
                      </TableHead>
                    ))}
                    <TableHead className="font-semibold">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Submitted By
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Date
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        <Badge variant="outline" className="font-mono">
                          {record.recordId}
                        </Badge>
                      </TableCell>
                      {tableColumns.map((column) => (
                        <TableCell key={column} className="max-w-48">
                          <div className="truncate" title={getFieldValue(record.recordData, column)}>
                            {getFieldValue(record.recordData, column)}
                          </div>
                        </TableCell>
                      ))}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          {record.submittedBy}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(record.submittedAt).toLocaleDateString()}
                          <div className="text-xs text-gray-500">
                            {new Date(record.submittedAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.status === "active" ? "default" : "secondary"}>{record.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedRecord(record)}
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh]">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <FileText className="w-5 h-5" />
                                  Record Details - {record.recordId}
                                </DialogTitle>
                              </DialogHeader>
                              <ScrollArea className="max-h-[60vh]">
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                                    <div>
                                      <p className="text-sm font-medium text-gray-600">Record ID</p>
                                      <p className="font-mono">{record.recordId}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-gray-600">Status</p>
                                      <Badge variant={record.status === "active" ? "default" : "secondary"}>
                                        {record.status}
                                      </Badge>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-gray-600">Submitted By</p>
                                      <p>{record.submittedBy}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-gray-600">Submitted At</p>
                                      <p>{new Date(record.submittedAt).toLocaleString()}</p>
                                    </div>
                                  </div>

                                  <Separator />

                                  <div>
                                    <h4 className="font-semibold mb-3">Form Data</h4>
                                    <div className="space-y-3">
                                      {Object.entries(record.recordData).map(([key, value]) => (
                                        <div key={key} className="grid grid-cols-3 gap-4 p-3 border rounded-lg">
                                          <div className="font-medium text-gray-700">{formatFieldName(key)}</div>
                                          <div className="col-span-2 text-gray-900">
                                            {getFieldValue(record.recordData, key)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </ScrollArea>
                            </DialogContent>
                          </Dialog>

                          <Button variant="ghost" size="sm" title="Edit Record">
                            <Edit className="w-4 h-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete Record"
                            onClick={() => deleteRecord(record.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        // Card View (existing implementation)
        <div className="space-y-4">
          {records.map((record) => (
            <Card key={record.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold">{getRecordTitle(record)}</h3>
                      <Badge variant="outline" className="font-mono">
                        {record.recordId}
                      </Badge>
                      <Badge variant={record.status === "active" ? "default" : "secondary"}>{record.status}</Badge>
                    </div>

                    <p className="text-gray-600 mb-3">{getRecordDescription(record)}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 p-3 bg-gray-50 rounded-lg">
                      {Object.entries(record.recordData)
                        .slice(0, 4)
                        .map(([key, value]) => (
                          <div key={key} className="text-sm">
                            <div className="font-medium text-gray-700">{formatFieldName(key)}</div>
                            <div className="text-gray-600 truncate">{getFieldValue(record.recordData, key)}</div>
                          </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {record.submittedBy}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(record.submittedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" title="View Details">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Record Details - {record.recordId}</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="max-h-96">
                          <div className="space-y-4">
                            {Object.entries(record.recordData).map(([key, value]) => (
                              <div key={key} className="grid grid-cols-3 gap-4">
                                <div className="font-medium">{formatFieldName(key)}</div>
                                <div className="col-span-2">{getFieldValue(record.recordData, key)}</div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                    <Button variant="outline" size="sm" title="Edit Record">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" title="Delete Record" onClick={() => deleteRecord(record.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages} • {totalRecords} total records
            </span>
          </div>
          <Button variant="outline" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
