"use client"

import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, Download, Send, X, Check, Trash2 } from "lucide-react"
import { formatCurrency } from "@/lib/payroll-utils"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface EmployeePayroll {
  id: string
  employeeName: string
  department: string
  designation: string
  presentDays: number
  leaveDays: number
  grossSalary: number
  deductions: number
  netSalary: number
  status: "pending" | "processed" | "paid"
}

interface EditablePayrollTableProps {
  data: EmployeePayroll[]
  onViewDetails: (id: string) => void
  onDownload: (id: string) => void
  onSendPayslip: (id: string) => void
  onSave: (id: string, data: Partial<EmployeePayroll>) => Promise<void>
  isAdmin?: boolean
  onDelete?: (id: string) => Promise<void>
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
}

export function EditablePayrollTable({
  data,
  onViewDetails,
  onDownload,
  onSendPayslip,
  onSave,
  isAdmin = false,
  onDelete,
  selectedIds = [],
  onSelectionChange,
}: EditablePayrollTableProps) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: keyof EmployeePayroll } | null>(null)
  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, Partial<EmployeePayroll>>>({})
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; field: keyof EmployeePayroll } | null>(null)
  const [lastClickTime, setLastClickTime] = useState<number>(0)
  const [lastClickCell, setLastClickCell] = useState<{ rowId: string; field: keyof EmployeePayroll } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  const editableFields: (keyof EmployeePayroll)[] = [
    "employeeName",
    "department",
    "designation",
    "presentDays",
    "leaveDays",
    "grossSalary",
    "deductions",
  ]

  const handleCellClick = (rowId: string, field: keyof EmployeePayroll) => {
    if (!isAdmin || !editableFields.includes(field)) {
      return
    }

    const now = Date.now()
    const timeSinceLastClick = now - lastClickTime
    const isSameCell = lastClickCell?.rowId === rowId && lastClickCell?.field === field

    if (isSameCell && timeSinceLastClick < 300) {
      setEditingCell({ rowId, field })
      setSelectedCell({ rowId, field })
      const row = data.find((r) => r.id === rowId)
      if (row && !editValues[rowId]) {
        setEditValues((prev) => ({ ...prev, [rowId]: { ...row } }))
      }
      setLastClickTime(0)
      setLastClickCell(null)
    } else {
      setSelectedCell({ rowId, field })
      setLastClickTime(now)
      setLastClickCell({ rowId, field })
    }
  }

  const handleCellChange = (rowId: string, field: keyof EmployeePayroll, value: string) => {
    setEditValues((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [field]: ["presentDays", "leaveDays", "grossSalary", "deductions"].includes(field)
          ? Number.parseFloat(value) || 0
          : value,
      },
    }))
  }

  const handleCellBlur = () => {
    setEditingCell(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, rowId: string, field: keyof EmployeePayroll) => {
    if (e.key === "Enter") {
      e.preventDefault()
      setEditingCell(null)
      const currentIndex = data.findIndex((r) => r.id === rowId)
      if (currentIndex < data.length - 1) {
        const nextRow = data[currentIndex + 1]
        setEditingCell({ rowId: nextRow.id, field })
        setSelectedCell({ rowId: nextRow.id, field })
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setEditingCell(null)
      setEditValues((prev) => {
        const newValues = { ...prev }
        delete newValues[rowId]
        return newValues
      })
    } else if (e.key === "Tab") {
      e.preventDefault()
      setEditingCell(null)
      const currentFieldIndex = editableFields.indexOf(field)
      if (currentFieldIndex < editableFields.length - 1) {
        const nextField = editableFields[currentFieldIndex + 1]
        setEditingCell({ rowId, field: nextField })
        setSelectedCell({ rowId, field: nextField })
      } else {
        const currentIndex = data.findIndex((r) => r.id === rowId)
        if (currentIndex < data.length - 1) {
          const nextRow = data[currentIndex + 1]
          setEditingCell({ rowId: nextRow.id, field: editableFields[0] })
          setSelectedCell({ rowId: nextRow.id, field: editableFields[0] })
        }
      }
    }
  }

  const handleRowEdit = (rowId: string) => {
    setEditingRow(rowId)
    const row = data.find((r) => r.id === rowId)
    if (row) {
      setEditValues((prev) => ({ ...prev, [rowId]: { ...row } }))
    }
  }

  const handleRowSave = async (rowId: string) => {
    const changes = editValues[rowId]
    if (changes) {
      try {
        await onSave(rowId, changes)
        setEditingRow(null)
        setEditValues((prev) => {
          const newValues = { ...prev }
          delete newValues[rowId]
          return newValues
        })
      } catch (error) {}
    }
  }

  const handleRowCancel = (rowId: string) => {
    setEditingRow(null)
    setEditValues((prev) => {
      const newValues = { ...prev }
      delete newValues[rowId]
      return newValues
    })
  }

  const handleRowDelete = async (rowId: string) => {
    if (!isAdmin || !onDelete) return

    if (confirm("Are you sure you want to delete this payroll record?")) {
      try {
        await onDelete(rowId)
      } catch (error) {}
    }
  }

  const handleViewDetails = async (id: string) => {
    try {
      onViewDetails(id)
    } catch (error) {
      toast.error("Failed to view details")
    }
  }

  const handleDownloadClick = async (id: string) => {
    try {
      onDownload(id)
    } catch (error) {
      toast.error("Failed to download payslip")
    }
  }

  const handleSendClick = async (id: string) => {
    try {
      onSendPayslip(id)
    } catch (error) {
      toast.error("Failed to send payslip")
    }
  }

  const getCellValue = (row: EmployeePayroll, field: keyof EmployeePayroll) => {
    const editedValue = editValues[row.id]?.[field]
    return editedValue !== undefined ? editedValue : row[field]
  }

  const renderCell = (row: EmployeePayroll, field: keyof EmployeePayroll) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field
    const isSelected = selectedCell?.rowId === row.id && selectedCell?.field === field
    const value = getCellValue(row, field)
    const isEditable = editableFields.includes(field) && isAdmin

    if (isEditing) {
      return (
        <Input
          ref={inputRef}
          type={["presentDays", "leaveDays", "grossSalary", "deductions"].includes(field) ? "number" : "text"}
          value={value as string | number}
          onChange={(e) => handleCellChange(row.id, field, e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={(e) => handleKeyDown(e, row.id, field)}
          className="h-7 w-full border-2 border-[#1a73e8] rounded-none text-[13px] px-2 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      )
    }

    return (
      <div
        className={cn(
          "h-7 flex items-center px-2 -mx-2 transition-colors text-[13px] text-[#202124]",
          isSelected && "ring-2 ring-[#1a73e8] ring-inset",
          isEditable && "cursor-cell hover:bg-[#f8f9fa]",
          !isEditable && "cursor-default",
        )}
        onClick={() => handleCellClick(row.id, field)}
      >
        {["grossSalary", "deductions", "netSalary"].includes(field) ? formatCurrency(value as number) : String(value)}
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      pending: "outline",
      processed: "secondary",
      paid: "default",
    }
    return <Badge variant={variants[status] || "default"}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
  }

  const handleSelectAll = () => {
    if (selectedIds.length === data.length) {
      onSelectionChange?.([])
    } else {
      onSelectionChange?.(data.map((emp) => emp.id))
    }
  }

  const handleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange?.(selectedIds.filter((selectedId) => selectedId !== id))
    } else {
      onSelectionChange?.([...selectedIds, id])
    }
  }

  const isAllSelected = data.length > 0 && selectedIds.length === data.length

  return (
    <div className="border border-[#e0e0e0] bg-white dark:bg-background overflow-hidden h-full">
      <div className="overflow-auto h-full">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-[#e8eaed] dark:bg-muted">
            <tr>
              {isAdmin && onSelectionChange && (
                <th className="w-10 min-w-[40px] border border-[#e0e0e0] bg-[#e8eaed] dark:bg-muted py-1 px-2 text-center sticky left-0 z-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                  />
                </th>
              )}
              <th className="w-10 min-w-[40px] border border-[#e0e0e0] bg-[#e8eaed] dark:bg-muted text-[11px] font-semibold text-[#5f6368] py-1 px-2 text-center sticky left-0 z-10">
                #
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-left text-[11px] font-semibold text-[#202124] min-w-[160px]">
                Employee
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-left text-[11px] font-semibold text-[#202124] min-w-[120px]">
                Department
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-left text-[11px] font-semibold text-[#202124] min-w-[120px]">
                Designation
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-right text-[11px] font-semibold text-[#202124] min-w-[100px]">
                Present Days
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-right text-[11px] font-semibold text-[#202124] min-w-[100px]">
                Leave Days
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-right text-[11px] font-semibold text-[#202124] min-w-[120px]">
                Gross Salary
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-right text-[11px] font-semibold text-[#202124] min-w-[120px]">
                Deductions
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-right text-[11px] font-semibold text-[#202124] min-w-[120px]">
                Net Salary
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-center text-[11px] font-semibold text-[#202124] min-w-[90px]">
                Status
              </th>
              <th className="border border-[#e0e0e0] px-2 py-1 text-center text-[11px] font-semibold text-[#202124] min-w-[140px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={isAdmin && onSelectionChange ? 12 : 11}
                  className="border border-[#e0e0e0] px-2 py-6 text-center text-[13px] text-[#5f6368]"
                >
                  No payroll data available
                </td>
              </tr>
            ) : (
              data.map((employee, index) => {
                const isRowEditing = editingRow === employee.id
                const hasChanges = !!editValues[employee.id]
                const isSelected = selectedIds.includes(employee.id)

                return (
                  <tr
                    key={employee.id}
                    className={cn(
                      "group hover:bg-[#f8f9fa] dark:hover:bg-muted/50 transition-colors",
                      hasChanges && "bg-amber-50 dark:bg-amber-950/20",
                      isSelected && "bg-blue-50 dark:bg-blue-950/20",
                    )}
                  >
                    {isAdmin && onSelectionChange && (
                      <td className="border border-[#e0e0e0] bg-[#e8eaed] dark:bg-muted py-1 px-2 text-center sticky left-0 z-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(employee.id)}
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="border border-[#e0e0e0] bg-[#e8eaed] dark:bg-muted text-[11px] font-medium text-[#5f6368] py-1 px-2 text-center sticky left-0 z-10">
                      {index + 1}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-[13px]">
                      {renderCell(employee, "employeeName")}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-[13px]">
                      {renderCell(employee, "department")}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-[13px]">
                      {renderCell(employee, "designation")}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-[13px] text-right">
                      {renderCell(employee, "presentDays")}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-[13px] text-right">
                      {renderCell(employee, "leaveDays")}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-[13px] text-right">
                      {renderCell(employee, "grossSalary")}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-[13px] text-right">
                      {renderCell(employee, "deductions")}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-[13px] text-right font-semibold">
                      {formatCurrency(getCellValue(employee, "netSalary") as number)}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 text-center">{getStatusBadge(employee.status)}</td>
                    <td className="border border-[#e0e0e0] px-2 py-1">
                      <div className="flex justify-center gap-1">
                        {hasChanges ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRowSave(employee.id)}
                              className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              title="Save changes"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRowCancel(employee.id)}
                              className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Cancel changes"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(employee.id)}
                              className="h-6 w-6 p-0"
                              title="View details"
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownloadClick(employee.id)}
                              className="h-6 w-6 p-0"
                              title="Download payslip"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSendClick(employee.id)}
                              className="h-6 w-6 p-0"
                              title="Send payslip"
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                            {isAdmin && onDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRowDelete(employee.id)}
                                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Delete record"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#e0e0e0] px-3 py-1.5 text-[11px] text-[#5f6368] bg-[#f8f9fa] dark:bg-muted/50">
        <div className="flex items-center justify-between">
          <span>
            {isAdmin
              ? "Double-click any cell to edit • Press Enter to move down • Tab to move right • Esc to cancel"
              : "View-only mode • Contact admin to make changes"}
          </span>
          <span className="font-medium">{data.length} employees</span>
        </div>
      </div>
    </div>
  )
}
