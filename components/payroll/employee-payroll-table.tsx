"use client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, Download, Send } from "lucide-react"
import { formatCurrency } from "@/lib/payroll-utils"

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

interface EmployeePayrollTableProps {
  data: EmployeePayroll[]
  onViewDetails: (id: string) => void
  onDownload: (id: string) => void
  onSendPayslip: (id: string) => void
}

export function EmployeePayrollTable({ data, onViewDetails, onDownload, onSendPayslip }: EmployeePayrollTableProps) {
  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      pending: "outline",
      processed: "secondary",
      paid: "default",
    }

    return <Badge variant={variants[status] || "default"}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Designation</TableHead>
            <TableHead className="text-right">Present Days</TableHead>
            <TableHead className="text-right">Leave Days</TableHead>
            <TableHead className="text-right">Gross Salary</TableHead>
            <TableHead className="text-right">Deductions</TableHead>
            <TableHead className="text-right">Net Salary</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                No payroll data available
              </TableCell>
            </TableRow>
          ) : (
            data.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium">{employee.employeeName}</TableCell>
                <TableCell>{employee.department}</TableCell>
                <TableCell>{employee.designation}</TableCell>
                <TableCell className="text-right">{employee.presentDays}</TableCell>
                <TableCell className="text-right">{employee.leaveDays}</TableCell>
                <TableCell className="text-right">{formatCurrency(employee.grossSalary)}</TableCell>
                <TableCell className="text-right">{formatCurrency(employee.deductions)}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(employee.netSalary)}</TableCell>
                <TableCell>{getStatusBadge(employee.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onViewDetails(employee.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDownload(employee.id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onSendPayslip(employee.id)}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
