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
} from "lucide-react";
import { usePublicForm } from "@/hooks/use-public-form";
import { FormBody } from "@/components/public-form/FormBody";

interface PublicFormDialogProps {
  formId: string | null;
  isOpen: boolean;
  onClose: () => void;
  allowAdminPreview?: boolean;
}

export function PublicFormDialog({
  formId,
  isOpen,
  onClose,
  allowAdminPreview = false,
}: PublicFormDialogProps) {
  const hook = usePublicForm({
    formId,
    isOpen,
    onClose,
    allowAdminPreview,
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
        className="p-0 overflow-visible rounded-xl shadow-2xl transition-all flex flex-col
          w-full h-[100dvh] sm:h-auto sm:rounded-xl rounded-none"
        style={{
          width: undefined,
          height: undefined,
          maxWidth: "98vw",
          maxHeight: "98vh",
          // On sm+ use the resizable pixel sizes; on mobile go full-screen
        }}
        // Apply desktop resize dimensions via inline style only on sm+
        // We use a CSS custom property approach
        data-desktop-width={dialogSize.width}
        data-desktop-height={dialogSize.height}
      >
        {/* Inline style to handle responsive dialog sizing */}
        <style jsx>{`
          @media (min-width: 640px) {
            [data-desktop-width][data-desktop-height] {
              width: ${dialogSize.width}px !important;
              height: ${dialogSize.height}px !important;
              max-width: 98vw !important;
              max-height: 98vh !important;
            }
          }
          @media (max-width: 639px) {
            [data-desktop-width][data-desktop-height] {
              width: 100vw !important;
              height: 100dvh !important;
              max-width: 100vw !important;
              max-height: 100dvh !important;
              border-radius: 0 !important;
            }
          }
        `}</style>

        <DialogTitle className="sr-only">{form?.name || "Form"}</DialogTitle>

        {/* RESIZE HANDLES — hidden on mobile */}
        <div className="absolute inset-0 pointer-events-none z-10 hidden sm:block">
          <div
            onMouseDown={(e) => startResize(e, "n")}
            className="absolute top-0 left-0 right-0 h-3 cursor-ns-resize pointer-events-auto hover:bg-primary/10 transition-colors"
          />
          <div
            onMouseDown={(e) => startResize(e, "s")}
            className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize pointer-events-auto hover:bg-primary/10 transition-colors"
          />
          <div
            onMouseDown={(e) => startResize(e, "w")}
            className="absolute top-0 bottom-0 left-0 w-3 cursor-ew-resize pointer-events-auto hover:bg-primary/10 transition-colors"
          />
          <div
            onMouseDown={(e) => startResize(e, "e")}
            className="absolute top-0 bottom-0 right-0 w-3 cursor-ew-resize pointer-events-auto hover:bg-primary/10 transition-colors"
          />
          <div
            onMouseDown={(e) => startResize(e, "nw")}
            className="absolute top-0 left-0 w-6 h-6 cursor-nw-resize pointer-events-auto hover:bg-primary/10 rounded-tl-xl transition-colors"
          />
          <div
            onMouseDown={(e) => startResize(e, "ne")}
            className="absolute top-0 right-0 w-6 h-6 cursor-ne-resize pointer-events-auto hover:bg-primary/10 rounded-tr-xl transition-colors"
          />
          <div
            onMouseDown={(e) => startResize(e, "sw")}
            className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize pointer-events-auto hover:bg-primary/10 rounded-bl-xl transition-colors"
          />
          <div
            onMouseDown={(e) => startResize(e, "se")}
            className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize pointer-events-auto hover:bg-primary/10 rounded-br-xl transition-colors"
          >
            <div className="absolute bottom-2 right-2 flex flex-col gap-1 opacity-60">
              <div className="w-1 h-1 bg-border rounded-full" />
              <div className="w-1 h-1 bg-border rounded-full" />
              <div className="w-1 h-1 bg-border rounded-full" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <div className="space-y-6 w-full max-w-md">
              <div className="space-y-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="space-y-6">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : hasNoAccess ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <div className="text-center">
              <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg sm:text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-sm text-muted-foreground">
                You don&apos;t have permission to access this form.
              </p>
              <Button variant="outline" className="mt-4" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : !form ? (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <div className="text-center">
              <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg sm:text-xl font-semibold mb-2">Form Not Found</h2>
              <p className="text-sm text-muted-foreground">
                This form may have been removed or is not published.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            {/* Header */}
            <DialogHeader className="flex-shrink-0 p-4 sm:p-6 pb-3 sm:pb-4 border-b">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <DialogTitle className="text-lg sm:text-2xl truncate">{form.name}</DialogTitle>
                  {form.description && (
                    <div className="relative group shrink-0">
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                        aria-label="View form description"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4" />
                          <path d="M12 8h.01" />
                        </svg>
                      </button>
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-60 p-3 bg-white text-blue-800 text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50">
                        <p className="whitespace-pre-wrap">
                          {form.description}
                        </p>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-black" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {isViewOnly && (
                <div className="flex items-center gap-2 mt-2 px-2 sm:px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-xs sm:text-sm w-fit">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">View only — you don&apos;t have permission to submit this form</span>
                  <span className="sm:hidden">View only mode</span>
                </div>
              )}
            </DialogHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-8">
              <div className="max-w-5xl mx-auto pb-4 sm:pb-8">
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
                  dynamicSubformInstances={dynamicSubformInstances}
                  addSubformRow={addSubformRow}
                  removeSubformRow={removeSubformRow}
                  handleDynamicFieldChange={handleDynamicFieldChange}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t bg-background px-3 py-3 sm:px-6 sm:py-4 flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-3">
              {isViewOnly ? (
                <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm text-amber-600">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">
                    View only mode — contact your admin to request submit access
                  </span>
                  <span className="sm:hidden">View only — contact admin</span>
                </div>
              ) : (
                <div />
              )}
              <div className="flex gap-2 sm:gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 sm:flex-none"
                >
                  {isViewOnly ? "Close" : "Cancel"}
                </Button>
                {!isViewOnly && (
                  <Button
                    type="submit"
                    disabled={
                      submitting || loading || hasErrorsOrMissingRequired()
                    }
                    className={`flex-1 sm:flex-none ${hasErrorsOrMissingRequired() && !submitting && !loading
                      ? "opacity-70 cursor-not-allowed bg-primary/80 hover:bg-primary/80"
                      : ""
                      }`}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        <span className="hidden sm:inline">Submitting...</span>
                        <span className="sm:hidden">Saving...</span>
                      </>
                    ) : hasErrorsOrMissingRequired() ? (
                      <>
                        <AlertCircle className="h-4 w-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">Fix Errors to Submit</span>
                        <span className="sm:hidden">Fix Errors</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">Submit Form</span>
                        <span className="sm:hidden">Submit</span>
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
