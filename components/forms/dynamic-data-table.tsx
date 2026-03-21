"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Edit, Trash2, Plus } from "lucide-react"

interface Column {
  key: string
  label: string
}

interface Permissions {
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
}

interface DynamicDataTableProps {
  title: string
  data: any[]
  permissions: Permissions
  onRefresh: () => void
  columns: Column[]
}

export function DynamicDataTable({ title, data, permissions, onRefresh, columns }: DynamicDataTableProps) {
  const [selectedItems, setSelectedItems] = useState<number[]>([])

  const handleEdit = (item: any) => {
    console.log("Edit item:", item)
    // Implement edit functionality
  }

  const handleDelete = (item: any) => {
    console.log("Delete item:", item)
    // Implement delete functionality
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Manage {title.toLowerCase()} data with your current permissions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {permissions.create && (
            <div className="flex justify-end">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add New
              </Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                {(permissions.edit || permissions.delete) && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item, index) => (
                <TableRow key={item.id || index}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>{item[column.key] || "-"}</TableCell>
                  ))}
                  {(permissions.edit || permissions.delete) && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {permissions.edit && (
                          <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {permissions.delete && (
                          <Button variant="outline" size="sm" onClick={() => handleDelete(item)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.length === 0 && <div className="text-center py-8 text-gray-500">No data available</div>}
        </div>
      </CardContent>
    </Card>
  )
}
