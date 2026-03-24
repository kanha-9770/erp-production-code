"use client";
import type React from "react";
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  Eye,
  Calendar,
  Star,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Form, FormField, Subform } from "@/types/form-builder";
import { LookupField } from "@/components/forms/lookup-field";
import CameraCapture from "@/components/forms/camera-capture";
import {
  FormRenderer,
  RenderSubform,
} from "@/components/public-form/FormRenderer";
import {
  useGetPublishedFormQuery,
  useSubmitFormMutation,
  useTrackFormEventMutation,
} from "@/lib/api/forms";
import { useGetUserQuery } from "@/lib/api/auth";

// Interface for the field entries in fullOption.data
interface LookupFieldData {
  field_id: string;
  field_value: string;
  field_label: string;
  field_type: string;
  field_section_id: string | null;
  [key: string]: any;
}

// Color schemes for different nesting levels
const NESTING_COLORS = [
  {
    bg: "bg-purple-50/30",
    border: "border-l-purple-400",
    accent: "text-purple-700",
    levelBadge: "bg-purple-100 text-purple-700 border-purple-200",
    leftBorder: "border-l-4 border-l-purple-400",
  },
  {
    bg: "bg-blue-50/30",
    border: "border-l-blue-400",
    accent: "text-blue-700",
    levelBadge: "bg-blue-100 text-blue-700 border-blue-200",
    leftBorder: "border-l-4 border-l-blue-400",
  },
  {
    bg: "bg-green-50/30",
    border: "border-l-green-400",
    accent: "text-green-700",
    levelBadge: "bg-green-100 text-green-700 border-green-200",
    leftBorder: "border-l-4 border-l-green-400",
  },
  {
    bg: "bg-orange-50/30",
    border: "border-l-orange-400",
    accent: "text-orange-700",
    levelBadge: "bg-orange-100 text-orange-700 border-orange-200",
    leftBorder: "border-l-4 border-l-orange-400",
  },
  {
    bg: "bg-pink-50/30",
    border: "border-l-pink-400",
    accent: "text-pink-700",
    levelBadge: "bg-pink-100 text-pink-700 border-pink-200",
    leftBorder: "border-l-4 border-l-pink-400",
  },
];

export default function PublicFormPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const formId = params.formId as string;

  const [form, setForm] = useState<Form | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [collapsedSubforms, setCollapsedSubforms] = useState<
    Record<string, boolean>
  >({});
  const [formInitialized, setFormInitialized] = useState(false);

  // RTK Query hooks
  const {
    data: publishedFormData,
    isLoading: loading,
    error: formError,
  } = useGetPublishedFormQuery(formId, {
    skip: !formId,
  });
  const { data: userData, error: userError } = useGetUserQuery(undefined, {
    skip: !publishedFormData?.data?.requireLogin,
  });
  const [submitFormMutation] = useSubmitFormMutation();
  const [trackFormEvent] = useTrackFormEventMutation();

  // Initialize form data when published form data loads
  useEffect(() => {
    if (!publishedFormData?.data || formInitialized) return;

    const formData = publishedFormData.data;

    if (!formData.isPublished) {
      toast({
        title: "Error",
        description: "This form is not published",
        variant: "destructive",
      });
      return;
    }

    // If login is required and user is not authenticated, redirect
    if (formData.requireLogin && userError) {
      router.replace(
        `/login?callbackUrl=${encodeURIComponent(`/form/${formId}`)}`,
      );
      return;
    }

    // Wait for user data if login is required
    if (formData.requireLogin && !userData) return;

    setForm(formData);

    // Initialize form data with default values from all fields (including subform fields)
    const initialData: Record<string, any> = {};
    const initialCollapsed: Record<string, boolean> = {};

    formData.sections.forEach((section: any) => {
      // Process section fields
      section.fields.forEach((field: FormField) => {
        if (field.defaultValue) {
          initialData[field.id] = field.defaultValue;
        }
      });

      // Process subform fields recursively
      const processSubforms = (subforms: Subform[]) => {
        subforms.forEach((subform) => {
          // Set initial collapsed state
          initialCollapsed[subform.id] = subform.collapsed || false;

          // Process subform fields
          subform.fields.forEach((field: FormField) => {
            if (field.defaultValue) {
              initialData[field.id] = field.defaultValue;
            }
          });

          // Process nested subforms
          if (subform.childSubforms && subform.childSubforms.length > 0) {
            processSubforms(subform.childSubforms);
          }
        });
      };

      if (section.subforms && section.subforms.length > 0) {
        processSubforms(section.subforms);
      }
    });

    setFormData(initialData);
    setCollapsedSubforms(initialCollapsed);
    setFormInitialized(true);
    console.log("Initial form data:", initialData);
    console.log("Initial collapsed subforms:", initialCollapsed);
  }, [
    publishedFormData,
    userData,
    userError,
    formId,
    formInitialized,
    router,
    toast,
  ]);

  // Track form view on mount
  useEffect(() => {
    if (formId) {
      trackFormEvent({
        formId,
        body: {
          eventType: "view",
          payload: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          },
        },
      }).catch((error) => {
        console.error("Error tracking form view:", error);
      });
    }
  }, [formId, trackFormEvent]);

  // Show error from RTK Query
  useEffect(() => {
    if (formError) {
      toast({
        title: "Error",
        description:
          "error" in formError
            ? (formError as any).error
            : "Failed to load form",
        variant: "destructive",
      });
    }
  }, [formError, toast]);

  useEffect(() => {
    calculateCompletion();
  }, [formData, form]);

  const allFields = useMemo(() => {
    if (!form) return [] as FormField[];
    const acc: FormField[] = [];
    form.sections.forEach((section: any) => {
      acc.push(...section.fields);
      const collect = (subs: Subform[]) => {
        subs.forEach((s) => {
          acc.push(...s.fields);
          if (s.childSubforms && s.childSubforms.length)
            collect(s.childSubforms);
        });
      };
      if (section.subforms && section.subforms.length)
        collect(section.subforms);
    });
    return acc;
  }, [form]);

  useEffect(() => {
    console.log("Form data changed:", formData);
  }, [formData]);

  const calculateCompletion = () => {
    if (!form) return;

    // Get all fields from sections and subforms
    const getAllFields = (sections: any[]): FormField[] => {
      const allFields: FormField[] = [];

      sections.forEach((section) => {
        // Add section fields
        allFields.push(...section.fields);

        // Add subform fields recursively
        const processSubforms = (subforms: Subform[]) => {
          subforms.forEach((subform) => {
            allFields.push(...subform.fields);
            if (subform.childSubforms && subform.childSubforms.length > 0) {
              processSubforms(subform.childSubforms);
            }
          });
        };

        if (section.subforms && section.subforms.length > 0) {
          processSubforms(section.subforms);
        }
      });

      return allFields;
    };

    const allFields = getAllFields(form.sections);
    const requiredFields = allFields.filter(
      (field) => field.validation?.required,
    );

    const completedRequired = requiredFields.filter((field) => {
      const value = formData[field.id];
      return value !== undefined && value !== null && value !== "";
    });

    const percentage =
      requiredFields.length > 0
        ? Math.round((completedRequired.length / requiredFields.length) * 100)
        : 100;

    setCompletionPercentage(percentage);
  };

  const validateField = (field: FormField, value: any): string | null => {
    const validation = field.validation || {};

    // ← UPDATED: Added || value === null for camera fields
    if (validation.required && (!value || value === "" || value === null)) {
      return `${field.label} is required`;
    }

    if (field.type === "email" && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return "Please enter a valid email address";
      }
    }

    if (field.type === "url" && value) {
      try {
        new URL(value);
      } catch {
        return "Please enter a valid URL";
      }
    }

    if (field.type === "tel" && value) {
      const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
      if (!phoneRegex.test(value.replace(/[\s\-()]/g, ""))) {
        return "Please enter a valid phone number";
      }
    }

    if (field.type === "number" && value) {
      const num = Number(value);
      if (isNaN(num)) {
        return "Please enter a valid number";
      }
      if (validation.min !== undefined && num < validation.min) {
        return `Value must be at least ${validation.min}`;
      }
      if (validation.max !== undefined && num > validation.max) {
        return `Value must be at most ${validation.max}`;
      }
    }

    if ((field.type === "text" || field.type === "textarea") && value) {
      if (validation.minLength && value.length < validation.minLength) {
        return `Must be at least ${validation.minLength} characters`;
      }
      if (validation.maxLength && value.length > validation.maxLength) {
        return `Must be at most ${validation.maxLength} characters`;
      }
    }

    if (validation.pattern && value) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return validation.patternMessage || "Invalid format";
      }
    }

    return null;
  };

  const handleFieldChange = (fieldId: string, value: any, fullOption?: any) => {
    console.log(
      `Field ${fieldId} changed to:`,
      value,
      "Full option:",
      fullOption,
    );

    let storeValue = value;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.storeValue !== undefined
    ) {
      storeValue = value.storeValue;
    }

    setFormData((prev) => {
      const newData = { ...prev, [fieldId]: storeValue };

      // Handle lookup field auto-fill logic
      if (
        form &&
        fullOption &&
        typeof fullOption === "object" &&
        fullOption.data?.record_id &&
        fullOption.data?.form_id
      ) {
        // Get all fields from sections and subforms
        const getAllFields = (sections: any[]): FormField[] => {
          const allFields: FormField[] = [];

          sections.forEach((section) => {
            allFields.push(...section.fields);

            const processSubforms = (subforms: Subform[]) => {
              subforms.forEach((subform) => {
                allFields.push(...subform.fields);
                if (subform.childSubforms && subform.childSubforms.length > 0) {
                  processSubforms(subform.childSubforms);
                }
              });
            };

            if (section.subforms && section.subforms.length > 0) {
              processSubforms(section.subforms);
            }
          });

          return allFields;
        };

        const allFields = getAllFields(form.sections);
        const currentField = allFields.find(
          (field) => field.id === fieldId && field.type === "lookup",
        );

        if (currentField?.lookup) {
          const relatedFields = allFields.filter(
            (field) =>
              field.id !== fieldId &&
              field.type === "lookup" &&
              field.lookup?.sourceId === currentField.lookup?.sourceId,
          );

          relatedFields.forEach((relatedField) => {
            const matchedField = Object.values(fullOption.data).find(
              (field) => {
                const f = field as LookupFieldData;
                return (
                  typeof f.field_label === "string" &&
                  f.field_label.toLowerCase() ===
                    relatedField.label.toLowerCase() &&
                  f.field_value
                );
              },
            ) as LookupFieldData | undefined;

            if (matchedField) {
              newData[relatedField.id] = matchedField.field_value;
              console.log(
                `Auto-filled ${relatedField.label} with:`,
                matchedField.field_value,
              );
            }
          });
        }
      }

      console.log("Updated form data:", newData);
      return newData;
    });

    // Clear error for this field
    if (errors[fieldId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    if (!form) return false;

    const newErrors: Record<string, string> = {};
    let isValid = true;

    // Validate all fields from sections and subforms
    const validateAllFields = (sections: any[]) => {
      sections.forEach((section) => {
        // Validate section fields
        section.fields.forEach((field: FormField) => {
          const error = validateField(field, formData[field.id]);
          if (error) {
            newErrors[field.id] = error;
            isValid = false;
          }
        });

        // Validate subform fields recursively
        const validateSubforms = (subforms: Subform[]) => {
          subforms.forEach((subform) => {
            subform.fields.forEach((field: FormField) => {
              const error = validateField(field, formData[field.id]);
              if (error) {
                newErrors[field.id] = error;
                isValid = false;
              }
            });

            if (subform.childSubforms && subform.childSubforms.length > 0) {
              validateSubforms(subform.childSubforms);
            }
          });
        };

        if (section.subforms && section.subforms.length > 0) {
          validateSubforms(section.subforms);
        }
      });
    };

    validateAllFields(form.sections);
    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submission started");
    console.log("Current form data:", formData);

    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors below",
        variant: "destructive",
      });
      return;
    }

    if (Object.keys(formData).length === 0) {
      toast({
        title: "No Data",
        description: "Please fill out the form before submitting",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      console.log("Sending form submission with field IDs as keys...");
      const result = await submitFormMutation({
        formId,
        body: {
          recordData: formData,
          submittedBy: "anonymous",
          userAgent: navigator.userAgent,
        },
      }).unwrap();

      console.log("Submission response:", result);

      if (!result.success) {
        throw new Error(result.error);
      }

      setSubmitted(true);
      toast({
        title: "Success!",
        description: form?.submissionMessage || "Form submitted successfully",
      });

      await trackFormEvent({
        formId,
        body: {
          eventType: "submit",
          payload: {
            recordId: result.data.id,
            timestamp: new Date().toISOString(),
            fieldLabels:
              result.data.form?.sections.flatMap((s: any) =>
                s.fields.map((f: any) => f.label),
              ) || [],
          },
        },
      });

      console.log(
        "Form submitted successfully with field labels:",
        result.data.recordData,
      );
    } catch (error: any) {
      console.error("Submission error:", error);
      toast({
        title: "Submission Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSubform = (subformId: string) => {
    setCollapsedSubforms((prev) => ({
      ...prev,
      [subformId]: !prev[subformId],
    }));
  };

  const renderField = (field: FormField, isInSubform: boolean = false) => {
    return (
      <FormRenderer
        field={field}
        value={formData[field.id]}
        error={errors[field.id]}
        submitting={submitting}
        submitted={submitted}
        handleFieldChange={handleFieldChange}
        formulaValues={{}}
        isInSubform={isInSubform}
        formData={formData}
        allFields={allFields}
        setErrors={setErrors}
        locationStatus={{}}
      />
    );
  };

  const renderSubform = (
    subform: Subform,
    level: number = 0,
    parentPath: string = "",
  ) => {
    return (
      <RenderSubform
        subform={subform}
        level={level}
        parentPath={parentPath}
        value={formData}
        errors={errors}
        submitting={submitting}
        handleFieldChange={handleFieldChange}
        formulaValues={{}}
        toggleSubform={toggleSubform}
        collapsedSubforms={collapsedSubforms}
        formData={formData}
        allFields={allFields}
        setErrors={setErrors}
        locationStatus={{}}
      />
    );
  };

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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto max-w-2xl">
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
            <div className="mt-4">
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>Progress</span>
                <span>{completionPercentage}% complete</span>
              </div>
              <Progress value={completionPercentage} className="h-2" />
            </div>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-8">
              {form.sections.map((section) => (
                <div key={section.id} className="space-y-6">
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold">{section.title}</h3>
                    {section.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {section.description}
                      </p>
                    )}
                  </div>

                  {/* Section Fields */}
                  {section.fields.length > 0 && (
                    <div
                      className={`grid gap-6 ${
                        section.columns > 1
                          ? `md:grid-cols-${section.columns}`
                          : ""
                      }`}
                    >
                      {section.fields.map((field) => (
                        <div key={field.id} className="space-y-2">
                          {field.type !== "checkbox" &&
                            field.type !== "switch" &&
                            field.type !== "hidden" && (
                              <Label
                                htmlFor={field.id}
                                className="text-sm font-medium"
                              >
                                {field.label}
                                {field.validation?.required && (
                                  <span className="text-red-500 ml-1">*</span>
                                )}
                              </Label>
                            )}
                          {field.description && field.type !== "hidden" && (
                            <p className="text-xs text-muted-foreground">
                              {field.description}
                            </p>
                          )}
                          {renderField(field)}
                          {errors[field.id] && (
                            <p className="text-sm text-red-500 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {errors[field.id]}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Section Subforms */}
                  {section.subforms && section.subforms.length > 0 && (
                    <div className="space-y-4">
                      {section.subforms.map((subform: Subform) =>
                        renderSubform(subform, 0, ""),
                      )}
                    </div>
                  )}
                </div>
              ))}

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
