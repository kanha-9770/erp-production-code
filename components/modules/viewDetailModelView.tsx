'use client';

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EnhancedFormRecord } from "./types";

interface ViewDetailsModalProps {
  record: EnhancedFormRecord;
  isOpen: boolean;
  onClose: () => void;
}

const ViewDetailsModal: React.FC<ViewDetailsModalProps> = ({ record, isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Details</DialogTitle>
          <DialogDescription>
            Form: {record.formName || record.formId}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {record.processedData.map((field) => (
            <div key={field.fieldId} className="border-b pb-3 last:border-b-0">
              <div className="text-sm font-semibold text-gray-700">{field.fieldLabel}</div>
              <div className="text-sm text-gray-600 mt-1">
                {field.displayValue || "—"}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewDetailsModal;
