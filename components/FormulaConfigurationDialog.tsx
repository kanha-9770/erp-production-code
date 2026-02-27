"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FormulaBuilder,
  type FormulaConfig,
} from "@/components/formula-builder";

interface FormulaConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  fieldId: string;
  fieldLabel: string;                    // Now required (we always pass it)
  initialConfig?: FormulaConfig | null;  // Existing formula config
  onSave: (config: FormulaConfig, fieldId: string) => void;
}

export default function FormulaConfigurationDialog({
  open,
  onOpenChange,
  formId,
  fieldId,
  fieldLabel,
  initialConfig = null,
  onSave,
}: FormulaConfigurationDialogProps) {
  if (!fieldId) return null;

  const handleSave = (config: FormulaConfig) => {
    onSave(config, fieldId);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-white shrink-0">
          <DialogTitle className="text-2xl font-semibold">
            {initialConfig ? "Edit Formula" : "Configure Formula Field"}
          </DialogTitle>
          <DialogDescription className="text-base mt-2 text-gray-600">
            Build a dynamic calculation for{" "}
            <span className="font-medium text-gray-900">“{fieldLabel}”</span>
            . The result will update automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-gray-50">
          <FormulaBuilder
            formId={formId}
            fieldLabel={fieldLabel}
            initialConfig={initialConfig ?? undefined}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}