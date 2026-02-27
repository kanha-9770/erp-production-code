"use client"

import { Button } from "@/components/ui/button"
import { Trash2, X, Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface BulkOperationsBarProps {
  selectedCount: number
  onClearSelection: () => void
  onBulkDelete: () => void
  onBulkExport: () => void
  isAdmin: boolean
}

export function BulkOperationsBar({
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkExport,
  isAdmin,
}: BulkOperationsBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-background border border-border shadow-lg rounded-lg px-4 py-3 flex items-center gap-4">
        <Badge variant="secondary" className="text-sm">
          {selectedCount} selected
        </Badge>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBulkExport} className="gap-2 bg-transparent">
            <Download className="h-4 w-4" />
            Export Selected
          </Button>
          {isAdmin && (
            <Button variant="destructive" size="sm" onClick={onBulkDelete} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete Selected
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClearSelection} className="gap-2">
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  )
}
