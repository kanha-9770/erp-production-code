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
} from "@/components/form-builder/formula-builder";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";

interface FormulaConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  fieldId: string;
  fieldLabel: string;
  initialConfig?: FormulaConfig | null;
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

  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (initialConfig?.visibleInForm !== undefined) {
      setIsVisible(initialConfig.visibleInForm);
    } else {
      setIsVisible(true);
    }
  }, [initialConfig]);

  const handleSave = (config: FormulaConfig) => {
    const finalConfig = {
      ...config,
      visibleInForm: isVisible, // true = show, false = hide
    };

    onSave(finalConfig, fieldId);
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
            <span className="font-medium text-gray-900">“{fieldLabel}”</span>.
            The result will update automatically.
          </DialogDescription>

          {/* VISIBILITY TOGGLE */}
          <div className="mt-5 flex items-center gap-3 bg-gray-50/70 p-3 rounded-lg border">
            <Switch
              id="field-visibility"
              checked={isVisible}
              onCheckedChange={setIsVisible}
            />
            <div className="grid gap-0.5">
              <Label htmlFor="field-visibility" className="font-medium">
                Show this field in the form
              </Label>
              <p className="text-sm text-muted-foreground">
                {isVisible
                  ? "Field will be visible to users"
                  : "Field will be hidden (calculation still runs in background)"}
              </p>
            </div>
          </div>
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
