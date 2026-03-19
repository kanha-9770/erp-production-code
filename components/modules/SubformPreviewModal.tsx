"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table2 } from "lucide-react";
import type { FormFieldWithSection } from "@/types/records";

interface SubformPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  title: string;
  fieldDefinitions?: { id: string; label: string; type: string }[];
  formFieldsWithSections: FormFieldWithSection[];
}

/**
 * Displays nested dynamic-row (subform) data in a scrollable table.
 * Extracted from the inline DynamicDataPreviewModal in recordsDisplay.tsx.
 */
export function SubformPreviewModal({
  isOpen,
  onClose,
  rows,
  title,
  fieldDefinitions,
  formFieldsWithSections,
}: SubformPreviewModalProps) {
  if (!rows || rows.length === 0) return null;

  const headers = Object.keys(rows[0]).filter((key) => !key.startsWith("_"));

  const getHeaderLabel = (id: string): string => {
    const explicit = fieldDefinitions?.find((def) => def.id === id);
    if (explicit?.label) return explicit.label;

    const global = formFieldsWithSections.find(
      (f) => f.id === id || f.originalId === id,
    );
    if (global) return global.label;

    return (
      id
        .replace(/cm[a-z0-9]{22}/g, "")
        .replace(/_/g, " ")
        .trim() || id
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-white">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Table2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-gray-900">
                {title}
              </DialogTitle>
              <DialogDescription>
                Detailed breakdown of {rows.length} entries.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-gray-500 font-medium w-12 text-center">
                    #
                  </th>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-gray-700 font-semibold capitalize whitespace-nowrap"
                    >
                      {getHeaderLabel(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-400 text-center font-mono text-xs">
                      {idx + 1}
                    </td>
                    {headers.map((header) => (
                      <td key={header} className="px-4 py-3 text-gray-600">
                        {typeof row[header] === "object"
                          ? "Nested Data"
                          : String(row[header] ?? "NaN")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="bg-gray-50 p-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            className="px-8 bg-transparent"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
