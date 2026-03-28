"use client";
import type React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  Eye,
  Calendar,
} from "lucide-react";
import { usePublicForm } from "@/hooks/use-public-form";
import { FormBody } from "@/components/public-form/FormBody";

export default function PublicFormPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.formId as string;

  // The page is always "open" and we use the same hook as the dialog.
  // For the page we don't need admin preview or dialog-specific features,
  // but we get formulas, geolocation, date/time auto-fill, etc. for free.
  const hook = usePublicForm({
    formId,
    isOpen: true,
    onClose: () => {}, // no-op for page context
    allowAdminPreview: false,
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
    isSectionReadOnly,
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
    // misc
    setErrors,
  } = hook;

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="space-y-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Form not found ────────────────────────────────────────────────────────
  if (!form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Form Not Found</h2>
              <p className="text-muted-foreground">
                This form may have been removed or is not published.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Thank You!</h2>
              <p className="text-muted-foreground mb-4">
                {form.submissionMessage ||
                  "Your form has been submitted successfully."}
              </p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Submit Another Response
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">{form.name}</CardTitle>
                {form.description && (
                  <CardDescription className="mt-2">
                    {form.description}
                  </CardDescription>
                )}
              </div>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                Public
              </Badge>
            </div>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-8">
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
                dynamicSubformInstances={dynamicSubformInstances}
                addSubformRow={addSubformRow}
                removeSubformRow={removeSubformRow}
                handleDynamicFieldChange={handleDynamicFieldChange}
              />

              <div className="pt-6 border-t">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting}
                  size="lg"
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
            </CardContent>
          </form>
        </Card>
        <div className="mt-4 text-center text-xs text-muted-foreground">
          <p className="flex items-center justify-center gap-1">
            <Calendar className="h-3 w-3" />
            Form created with Advanced Form Builder
          </p>
        </div>
      </div>
    </div>
  );
}
