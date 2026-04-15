"use client";
import type React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  Loader2,
  Send,
  Lock,
  Info,
  ShieldX,
  FileQuestion,
} from "lucide-react";
import { usePublicForm } from "@/hooks/use-public-form";
import { FormBody } from "@/components/public-form/FormBody";

interface PublicFormDialogProps {
  formId: string | null;
  isOpen: boolean;
  onClose: () => void;
  allowAdminPreview?: boolean;
  /** Pre-fill form with existing record data (field-id → value map) */
  initialRecordData?: Record<string, any> | null;
  /** Force view-only mode */
  forceViewOnly?: boolean;
  /** When set, submit will UPDATE this record instead of creating a new one */
  editingRecordId?: string | null;
}

export function PublicFormDialog({
  formId,
  isOpen,
  onClose,
  allowAdminPreview = false,
  initialRecordData = null,
  forceViewOnly = false,
  editingRecordId = null,
}: PublicFormDialogProps) {
  const hook = usePublicForm({
    formId,
    isOpen,
    onClose,
    allowAdminPreview,
    initialRecordData,
    forceViewOnly,
    editingRecordId,
  });

  const {
    form,
    formData,
    errors,
    loading,
    submitting,
    submitted,
    locationStatus,
    formulaValues,
    collapsedSubforms,
    dynamicSubformInstances,
    isViewOnly,
    hasNoAccess,
    isSectionReadOnly,
    canDeleteInSection,
    // dialog resize
    dialogSize,
    dialogRef,
    startResize,
    // derived
    rootItems,
    allFields,
    idToLabel,
    // handlers
    handleFieldChange,
    toggleSubform,
    addSubformRow,
    removeSubformRow,
    handleSubmit,
    handleDynamicFieldChange,
    // visibility helpers
    isSectionVisible,
    isFieldVisible,
    isFieldReadOnly,
    // misc
    hasErrorsOrMissingRequired,
    setErrors,
  } = hook;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        ref={dialogRef}
        data-public-form-dialog=""
        className="p-0 overflow-hidden rounded-none sm:rounded-lg border-0 sm:border
          shadow-none sm:shadow-lg transition-all flex flex-col
          w-full h-[100dvh] max-w-none sm:h-auto bg-background"
        style={{
          width: dialogSize.width,
          height: dialogSize.height,
          maxWidth: "96vw",
          maxHeight: "96vh",
        }}
      >
        {/* Mobile full-screen override */}
        <style>{`
          @media (max-width: 639px) {
            [data-public-form-dialog] {
              width: 100vw !important;
              height: 100dvh !important;
              max-width: 100vw !important;
              max-height: 100dvh !important;
              border-radius: 0 !important;
              border: none !important;
              box-shadow: none !important;
            }
          }
        `}</style>

        <DialogTitle className="sr-only">{form?.name || "Form"}</DialogTitle>

        {/* Resize handles — hidden on mobile */}
        <div className="absolute inset-0 pointer-events-none z-10 hidden sm:block">
          <div
            onMouseDown={(e) => startResize(e, "n")}
            className="absolute top-0 left-4 right-4 h-2 cursor-ns-resize pointer-events-auto"
          />
          <div
            onMouseDown={(e) => startResize(e, "s")}
            className="absolute bottom-0 left-4 right-4 h-2 cursor-ns-resize pointer-events-auto"
          />
          <div
            onMouseDown={(e) => startResize(e, "w")}
            className="absolute top-4 bottom-4 left-0 w-2 cursor-ew-resize pointer-events-auto"
          />
          <div
            onMouseDown={(e) => startResize(e, "e")}
            className="absolute top-4 bottom-4 right-0 w-2 cursor-ew-resize pointer-events-auto"
          />
          <div
            onMouseDown={(e) => startResize(e, "nw")}
            className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize pointer-events-auto"
          />
          <div
            onMouseDown={(e) => startResize(e, "ne")}
            className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize pointer-events-auto"
          />
          <div
            onMouseDown={(e) => startResize(e, "sw")}
            className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize pointer-events-auto"
          />
          <div
            onMouseDown={(e) => startResize(e, "se")}
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize pointer-events-auto"
          >
            <svg
              className="absolute bottom-1.5 right-1.5 text-muted-foreground/40"
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="currentColor"
            >
              <circle cx="6" cy="2" r="1" />
              <circle cx="6" cy="6" r="1" />
              <circle cx="2" cy="6" r="1" />
            </svg>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center p-5 sm:p-8">
            <div className="space-y-5 w-full max-w-sm">
              <div className="space-y-2">
                <Skeleton className="h-5 w-2/3 rounded" />
                <Skeleton className="h-3 w-2/5 rounded" />
              </div>
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-1/4 rounded" />
                    <Skeleton className="h-8 w-full rounded" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-8 w-24 rounded ml-auto" />
            </div>
          </div>

        ) : hasNoAccess ? (
          <div className="flex-1 flex items-center justify-center p-5 sm:p-8">
            <div className="text-center max-w-xs">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
                <ShieldX className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="text-base font-semibold mb-1">Access Denied</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You don&apos;t have permission to access this form.
              </p>
              <Button variant="outline" size="sm" className="mt-4 h-8 text-xs" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>

        ) : !form ? (
          <div className="flex-1 flex items-center justify-center p-5 sm:p-8">
            <div className="text-center max-w-xs">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <FileQuestion className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="text-base font-semibold mb-1">Form Not Found</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This form may have been removed or is no longer published.
              </p>
            </div>
          </div>

        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            {/* Header */}
            <DialogHeader className="flex-shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <DialogTitle className="text-sm sm:text-base font-semibold truncate">
                  {form.name}
                </DialogTitle>
                {form.description && (
                  <div className="relative group/tip shrink-0">
                    <button
                      type="button"
                      className="flex h-4.5 w-4.5 items-center justify-center rounded-full
                        bg-muted text-muted-foreground
                        hover:bg-primary/15 hover:text-primary
                        transition-colors duration-150"
                      aria-label="View form description"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-full mt-2
                        w-56 p-2.5 rounded-md border bg-popover text-popover-foreground
                        text-xs leading-relaxed shadow-md
                        opacity-0 invisible scale-95
                        group-hover/tip:opacity-100 group-hover/tip:visible group-hover/tip:scale-100
                        transition-all duration-150 origin-top
                        pointer-events-none z-50"
                    >
                      <p className="whitespace-pre-wrap">{form.description}</p>
                      <div
                        className="absolute bottom-full left-1/2 -translate-x-1/2
                          border-[5px] border-transparent border-b-popover"
                      />
                    </div>
                  </div>
                )}
              </div>
              {isViewOnly && (
                <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-700 dark:text-amber-400 text-xs w-fit">
                  <Lock className="h-3 w-3 shrink-0" />
                  <span className="hidden sm:inline">View only — you don&apos;t have permission to submit</span>
                  <span className="sm:hidden">View only</span>
                </div>
              )}
            </DialogHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
              <div className="max-w-5xl mx-auto">
                <FormBody
                  form={form}
                  formData={formData}
                  errors={errors}
                  submitting={submitting}
                  submitted={submitted}
                  formulaValues={formulaValues}
                  allFields={allFields}
                  locationStatus={locationStatus}
                  collapsedSubforms={collapsedSubforms}
                  rootItems={rootItems}
                  idToLabel={idToLabel}
                  handleFieldChange={handleFieldChange}
                  toggleSubform={toggleSubform}
                  setErrors={setErrors}
                  isFieldVisible={isFieldVisible}
                  isSectionVisible={isSectionVisible}
                  isViewOnly={isViewOnly}
                  isSectionReadOnly={isSectionReadOnly}
                  isFieldReadOnly={isFieldReadOnly}
                  canDeleteInSection={canDeleteInSection}
                  dynamicSubformInstances={dynamicSubformInstances}
                  addSubformRow={addSubformRow}
                  removeSubformRow={removeSubformRow}
                  handleDynamicFieldChange={handleDynamicFieldChange}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t bg-muted/30 px-4 py-2.5 sm:px-5 sm:py-3 flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-2">
              {isViewOnly ? (
                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <Lock className="h-3 w-3 shrink-0" />
                  <span className="hidden sm:inline">
                    View only — contact admin for submit access
                  </span>
                  <span className="sm:hidden">View only</span>
                </div>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 sm:flex-none h-8 text-xs"
                >
                  {isViewOnly ? "Close" : "Cancel"}
                </Button>
                {!isViewOnly && (
                  <Button
                    type="submit"
                    disabled={submitting || loading || hasErrorsOrMissingRequired()}
                    className={`flex-1 sm:flex-none h-8 text-xs font-medium ${
                      hasErrorsOrMissingRequired() && !submitting && !loading
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Submitting...
                      </>
                    ) : hasErrorsOrMissingRequired() ? (
                      <>
                        <AlertCircle className="h-3.5 w-3.5 mr-1" />
                        Fix Errors
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Submit
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
