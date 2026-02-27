import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
  form?: any
}

interface ViewDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  record: EnhancedFormRecord | null
}

const ViewDetailsModal: React.FC<ViewDetailsModalProps> = ({ isOpen, onClose, record }) => {
  if (!record) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Record Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-600">Record ID</label>
              <p className="text-gray-900">{record.id}</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-600">Status</label>
              <p className="text-gray-900 capitalize">{record.status}</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-600">Submitted At</label>
              <p className="text-gray-900">{new Date(record.submittedAt).toLocaleString()}</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-600">Form Name</label>
              <p className="text-gray-900">{record.formName || "Unknown"}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">Field Data</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {record.processedData.map((field) => (
                <div key={field.fieldId} className="bg-gray-50 p-4 rounded-lg">
                  <label className="text-sm font-semibold text-gray-600">{field.fieldLabel}</label>
                  <p className="text-gray-900 mt-1">{field.displayValue || "—"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ViewDetailsModal
