"use client";

import React, { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, Loader2, Send } from "lucide-react";
import { Label } from "@/components/ui/label"; // correct import

import { usePublicFormLogic } from "@/components/public-form/usePublicFormLogic";
import {FormRenderer, RenderSubform} from "@/components/public-form/FormRenderer"

import type { Form, Subform } from "@/types/form-builder";

interface PublicFormDialogProps {
  formId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PublicFormDialog({
  formId,
  isOpen,
  onClose,
}: PublicFormDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const {
    form,
    loading,
    submitting,
    submitted,
    formData,
    errors,
    completionPercentage,
    locationStatus,
    collapsedSubforms,
    dialogSize,
    isResizing,
    startResize,
    handleFieldChange,
    handleSubmit,
    toggleSubform,
  } = usePublicFormLogic(formId, isOpen, onClose);

  if (submitted) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="text-center py-6">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4 animate-bounce" />
            <h2 className="text-xl font-semibold mb-2">Thank You!</h2>
            <p className="text-muted-foreground mb-4">
              {form?.submissionMessage || "Your form has been submitted successfully."}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        ref={dialogRef}
        className="p-0 overflow-hidden rounded-xl shadow-2xl transition-all flex flex-col"
        style={{
          width: `${dialogSize.width}px`,
          height: `${dialogSize.height}px`,
          maxWidth: "98vw",
          maxHeight: "98vh",
        }}
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        {/* Resize handles */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {["n", "s", "w", "e", "nw", "ne", "sw", "se"].map((dir) => (
            <div
              key={dir}
              onMouseDown={(e) => startResize(e, dir)}
              className={`absolute pointer-events-auto hover:bg-primary/10 transition-colors ${
                dir.includes("n") || dir.includes("s") ? "h-3 left-0 right-0" : "w-3 top-0 bottom-0"
              } ${
                dir === "n" ? "top-0" :
                dir === "s" ? "bottom-0" :
                dir === "w" ? "left-0" :
                dir === "e" ? "right-0" : ""
              } ${
                dir === "nw" || dir === "ne" || dir === "sw" || dir === "se" ? "w-6 h-6" : ""
              } ${
                dir === "nw" ? "top-0 left-0 rounded-tl-xl" :
                dir === "ne" ? "top-0 right-0 rounded-tr-xl" :
                dir === "sw" ? "bottom-0 left-0 rounded-bl-xl" :
                dir === "se" ? "bottom-0 right-0 rounded-br-xl" : ""
              }`}
            />
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-md space-y-6">
              <Skeleton className="h-8 w-3/4" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </div>
        ) : !form ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Form Not Found</h2>
              <p className="text-muted-foreground">
                This form may have been removed or is not published.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <DialogHeader className="flex-shrink-0 p-6 pb-4 border-b">
              <DialogTitle className="text-2xl">{form.name}</DialogTitle>
              {form.description && (
                <p className="text-sm text-muted-foreground mt-1">{form.description}</p>
              )}
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-8">
              <div className="space-y-12 max-w-5xl mx-auto pb-8">
                {form.sections.map((section, index) => (
                  <div
                    key={section.id}
                    className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden"
                  >
                    <div className="bg-muted/50 px-6 py-4 border-b">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold">{section.title}</h3>
                          {section.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {section.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      {/* Section fields */}
                      <div
                        className="grid gap-8"
                        style={{
                          gridTemplateColumns: `repeat(${section.columns || 1}, minmax(0, 1fr))`,
                        }}
                      >
                        {section.fields.map((field) => (
                          <div key={field.id} className="space-y-2">
                            {field.type !== "checkbox" &&
                             field.type !== "switch" &&
                             field.type !== "hidden" && (
                              <Label className="text-sm font-medium flex items-center gap-2">
                                {field.label}
                                {field.validation?.required && <span className="text-red-500">*</span>}
                              </Label>
                            )}
                            {field.description && field.type !== "hidden" && (
                              <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                            <FormRenderer
                              field={field}
                              value={formData[field.id]}
                              error={errors[field.id]}
                              submitting={submitting}
                              submitted={submitted}
                              handleFieldChange={handleFieldChange}
                              formulaValues={{}}
                              isInSubform={false}
                            />
                            {errors[field.id] && field.type !== "phone" && field.type !== "phone-input" && (
                              <p className="text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors[field.id]}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Subforms */}
                      {section.subforms?.length > 0 && (
                        <div className="mt-10 space-y-6">
                          {section.subforms.map((subform: Subform) => (
                            <RenderSubform
                              key={subform.id}
                              subform={subform}
                              level={0}
                              parentPath=""
                              value={formData}
                              errors={errors}
                              submitting={submitting}
                              submitted={submitted}
                              handleFieldChange={handleFieldChange}
                              formulaValues={{}}
                              toggleSubform={toggleSubform}
                              collapsedSubforms={collapsedSubforms}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-shrink-0 border-t bg-background px-6 py-4 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || loading}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Form
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}