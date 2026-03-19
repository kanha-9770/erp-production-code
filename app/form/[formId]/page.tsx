"use client";
import type React from "react";
import { useState, useEffect } from "react";
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
import { CheckCircle, AlertCircle, Loader2, Send, Eye, Calendar, Star, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import type { Form, FormField, Subform } from "@/types/form-builder";
import { LookupField } from "@/components/lookup-field";
import CameraCapture from "@/components/camera-capture";

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
    leftBorder: "border-l-4 border-l-purple-400"
  },
  {
    bg: "bg-blue-50/30",
    border: "border-l-blue-400",
    accent: "text-blue-700",
    levelBadge: "bg-blue-100 text-blue-700 border-blue-200",
    leftBorder: "border-l-4 border-l-blue-400"
  },
  {
    bg: "bg-green-50/30",
    border: "border-l-green-400",
    accent: "text-green-700",
    levelBadge: "bg-green-100 text-green-700 border-green-200",
    leftBorder: "border-l-4 border-l-green-400"
  },
  {
    bg: "bg-orange-50/30",
    border: "border-l-orange-400",
    accent: "text-orange-700",
    levelBadge: "bg-orange-100 text-orange-700 border-orange-200",
    leftBorder: "border-l-4 border-l-orange-400"
  },
  {
    bg: "bg-pink-50/30",
    border: "border-l-pink-400",
    accent: "text-pink-700",
    levelBadge: "bg-pink-100 text-pink-700 border-pink-200",
    leftBorder: "border-l-4 border-l-pink-400"
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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [collapsedSubforms, setCollapsedSubforms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (formId) {
      fetchForm();
      trackFormView();
    }
  }, [formId]);

  useEffect(() => {
    calculateCompletion();
  }, [formData, form]);

  useEffect(() => {
    console.log("Form data changed:", formData);
  }, [formData]);

  const fetchForm = async () => {
    try {
      setLoading(true);
      // Always request the published snapshot for public page
      const response = await fetch(`/api/forms/${formId}?published=true`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      if (!result.data.isPublished) {
        throw new Error("This form is not published");
      }

      // If login is required, verify the user is authenticated
      if (result.data.requireLogin) {
        const authRes = await fetch("/api/auth/me");
        if (!authRes.ok) {
          router.replace(`/login?callbackUrl=${encodeURIComponent(`/form/${formId}`)}`);
          return;
        }
      }

      setForm(result.data);

      // Initialize form data with default values from all fields (including subform fields)
      const initialData: Record<string, any> = {};
      const initialCollapsed: Record<string, boolean> = {};

      result.data.sections.forEach((section: any) => {
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
      console.log("Initial form data:", initialData);
      console.log("Initial collapsed subforms:", initialCollapsed);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const trackFormView = async () => {
    try {
      await fetch(`/api/forms/${formId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "view",
          payload: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          },
        }),
      });
    } catch (error) {
      console.error("Error tracking form view:", error);
    }
  };

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
      (field) => field.validation?.required
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
      fullOption
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
          (field) => field.id === fieldId && field.type === "lookup"
        );

        if (currentField?.lookup) {
          const relatedFields = allFields.filter(
            (field) =>
              field.id !== fieldId &&
              field.type === "lookup" &&
              field.lookup?.sourceId === currentField.lookup?.sourceId
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
              }
            ) as LookupFieldData | undefined;

            if (matchedField) {
              newData[relatedField.id] = matchedField.field_value;
              console.log(
                `Auto-filled ${relatedField.label} with:`,
                matchedField.field_value
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
      const response = await fetch(`/api/forms/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordData: formData,
          submittedBy: "anonymous",
          userAgent: navigator.userAgent,
        }),
      });

      const result = await response.json();
      console.log("Submission response:", result);

      if (!result.success) {
        throw new Error(result.error);
      }

      setSubmitted(true);
      toast({
        title: "Success!",
        description: form?.submissionMessage || "Form submitted successfully",
      });

      await fetch(`/api/forms/${formId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "submit",
          payload: {
            recordId: result.data.id,
            timestamp: new Date().toISOString(),
            fieldLabels:
              result.data.form?.sections.flatMap((s: any) =>
                s.fields.map((f: any) => f.label)
              ) || [],
          },
        }),
      });

      console.log(
        "Form submitted successfully with field labels:",
        result.data.recordData
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
    const value = formData[field.id];
    const error = errors[field.id];
    const fieldProps = {
      id: field.id,
      disabled: submitting || submitted,
      className: error ? "border-red-500" : "",
    };

    const options = Array.isArray(field.options) ? field.options : [];
    const lookupFieldData = {
      id: field.id,
      label: field.label,
      type: field.type,
      placeholder: field.placeholder || undefined,
      description: field.description || undefined,
      validation: field.validation || { required: false },
      lookup: field.lookup || undefined,
    };

    switch (field.type) {
      case "text":
      case "email":
      case "number":
      case "tel":
      case "url":
        return (
          <Input
            {...fieldProps}
            type={field.type}
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className={`${fieldProps.className} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );

      case "password":
        return (
          <Input
            {...fieldProps}
            type="password"
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className={`${fieldProps.className} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );

      case "textarea":
        return (
          <Textarea
            {...fieldProps}
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            rows={3}
            className={`${fieldProps.className} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );

      case "date":
        return (
          <Input
            {...fieldProps}
            type="date"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className={`${fieldProps.className} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );

      case "datetime":
        return (
          <Input
            {...fieldProps}
            type="datetime-local"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className={`${fieldProps.className} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );

      case "checkbox":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.id}
              checked={value || false}
              onCheckedChange={(checked) =>
                handleFieldChange(field.id, checked)
              }
              disabled={submitting || submitted}
            />
            <Label htmlFor={field.id} className="text-sm">
              {field.label}
            </Label>
          </div>
        );

      case "switch":
        return (
          <div className="flex items-center space-x-2">
            <Switch
              id={field.id}
              checked={value || false}
              onCheckedChange={(checked) =>
                handleFieldChange(field.id, checked)
              }
              disabled={submitting || submitted}
            />
            <Label htmlFor={field.id} className="text-sm">
              {field.label}
            </Label>
          </div>
        );

      case "radio":
        return (
          <RadioGroup
            value={value || ""}
            onValueChange={(val) => handleFieldChange(field.id, val)}
            disabled={submitting || submitted}
          >
            {options.map((option: any) => (
              <div key={option.value} className="flex items-center space-x-2">
                <RadioGroupItem
                  value={option.value}
                  id={`${field.id}-${option.value}`}
                />
                <Label
                  htmlFor={`${field.id}-${option.value}`}
                  className="text-sm"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "select":
        return (
          <Select
            value={value || ""}
            onValueChange={(val) => handleFieldChange(field.id, val)}
            disabled={submitting || submitted}
          >
            <SelectTrigger className={`${error ? "border-red-500" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}>
              <SelectValue
                placeholder={field.placeholder || "Select an option"}
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((option: any) => (
                <SelectItem
                  key={option.value || option.id}
                  value={option.value || option.id}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "slider":
        return (
          <div className="space-y-2">
            <Slider
              value={[value || 0]}
              onValueChange={(vals) => handleFieldChange(field.id, vals[0])}
              max={field.validation?.max || 100}
              min={field.validation?.min || 0}
              step={1}
              disabled={submitting || submitted}
              className="w-full"
            />
            <div className="text-center text-sm text-muted-foreground">
              Value: {value || 0}
            </div>
          </div>
        );

      case "rating":
        return (
          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => handleFieldChange(field.id, rating)}
                disabled={submitting || submitted}
                className="p-1 hover:scale-110 transition-transform"
              >
                <Star
                  className={`h-6 w-6 ${rating <= (value || 0)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300"
                    }`}
                />
              </button>
            ))}
            <span className="ml-2 text-sm text-muted-foreground">
              {value ? `${value}/5` : "Not rated"}
            </span>
          </div>
        );

      case "lookup":
        return (
          <LookupField
            field={lookupFieldData}
            value={value}
            onChange={(val, fullOption) =>
              handleFieldChange(field.id, val, fullOption)
            }
            disabled={submitting || submitted}
            error={error}
          />
        );

      case "file":
        return (
          <Input
            {...fieldProps}
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFieldChange(field.id, file.name);
              }
            }}
            multiple={field.properties?.multiple || false}
            className={`${fieldProps.className} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );

      // ← NEW CASE: Camera Field
      case "camera":
        return (
          <CameraCapture
            onCapture={(imageUrl: string) => handleFieldChange(field.id, imageUrl)}
            capturedImage={value || null}
            onClear={() => handleFieldChange(field.id, null)}
          />
        );

      case "hidden":
        return (
          <Input
            {...fieldProps}
            type="hidden"
            value={value || field.defaultValue || ""}
          />
        );

      default:
        return (
          <Input
            {...fieldProps}
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className={`${fieldProps.className} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );
    }
  };

  const renderSubform = (subform: Subform, level: number = 0, parentPath: string = "") => {
    const colorScheme = NESTING_COLORS[level % NESTING_COLORS.length];
    const isCollapsed = collapsedSubforms[subform.id];

    // Build the current path
    const currentPath = parentPath ? `${parentPath} > ${subform.name}` : subform.name;
    const pathParts = currentPath.split(' > ');

    // Combine fields and child subforms for rendering
    const allItems = [
      ...subform.fields.map(field => ({ type: 'field' as const, item: field, id: field.id, order: field.order }))
    ].sort((a, b) => a.order - b.order);

    return (
      <Card
        key={subform.id}
        className={`bg-white border border-gray-200 rounded-lg shadow-sm ${colorScheme.leftBorder}`}
      >
        <CardHeader className="pb-3 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleSubform(subform.id)}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
              >
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>

              <Layers className={`w-4 h-4 ${colorScheme.accent}`} />

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold">{subform.name}</h4>
                  <Badge variant="outline" className={`text-xs ${colorScheme.levelBadge} px-2 py-0 font-medium`}>
                    Level {level}
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200 px-2 py-0">
                    {subform.fields.length} field{subform.fields.length !== 1 ? 's' : ''}
                  </Badge>
                  {(subform.childSubforms?.length || 0) > 0 && (
                    <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200 px-2 py-0">
                      {subform.childSubforms?.length} subform{(subform.childSubforms?.length || 0) !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                {/* Subform Path Display */}
                {level > 0 && (
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-xs text-gray-500">Path:</span>
                    <div className="flex items-center gap-1 text-xs">
                      {pathParts.map((part, index) => (
                        <div key={index} className="flex items-center gap-1">
                          <span className={`px-2 py-1 rounded ${index === pathParts.length - 1
                            ? `${colorScheme.levelBadge} font-medium`
                            : 'bg-gray-100 text-gray-600'
                            }`}>
                            {part}
                          </span>
                          {index < pathParts.length - 1 && (
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Database Path Display (if available) */}
                {subform.path && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-500">DB Path:</span>
                    <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700 px-2 py-0">
                      {subform.path}
                    </Badge>
                  </div>
                )}

                {subform.description && (
                  <p className={`text-sm ${colorScheme.accent} opacity-75`}>{subform.description}</p>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        {!isCollapsed && (
          <CardContent className="pt-4">
            {allItems.length > 0 ? (
              <div className="space-y-4">
                {allItems.map((item) => (
                  item.type === 'field' ? (
                    <div key={item.id} className="space-y-2">
                      {(item.item as FormField).type !== "checkbox" &&
                        (item.item as FormField).type !== "switch" &&
                        (item.item as FormField).type !== "hidden" && (
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={(item.item as FormField).id}
                              className="text-sm font-medium"
                            >
                              {(item.item as FormField).label}
                              {(item.item as FormField).validation?.required && (
                                <span className="text-red-500 ml-1">*</span>
                              )}
                            </Label>
                            {/* Field Path Indicator */}
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200 px-1 py-0">
                              {currentPath}
                            </Badge>
                          </div>
                        )}
                      {(item.item as FormField).description && (item.item as FormField).type !== "hidden" && (
                        <p className="text-xs text-muted-foreground">
                          {(item.item as FormField).description}
                        </p>
                      )}
                      {renderField(item.item as FormField, true)}
                      {errors[(item.item as FormField).id] && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {errors[(item.item as FormField).id]}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div key={item.id} className={`ml-6 ${colorScheme.bg} rounded-lg p-2`}>
                      {renderSubform(item.item as unknown as Subform, level + 1, currentPath)}
                    </div>
                  )
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-6 text-center border-gray-300 bg-gray-50">
                <Layers className={`w-6 h-6 mx-auto mb-2 ${colorScheme.accent}`} />
                <p className={`text-sm mb-3 ${colorScheme.accent}`}>No fields in this subform</p>
                <p className="text-xs text-gray-500">Path: {currentPath}</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
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
                      className={`grid gap-6 ${section.columns > 1
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
                      {section.subforms.map((subform: Subform) => renderSubform(subform, 0, ""))}
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

        {process.env.NODE_ENV === "development" && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">
                Debug: Form Data (Field IDs as Keys)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                {JSON.stringify(formData, null, 2)}
              </pre>
              <div className="mt-2">
                <strong>Field ID to Label Mapping:</strong>
                <pre className="text-xs bg-blue-50 p-2 rounded overflow-auto mt-1">
                  {form &&
                    JSON.stringify(
                      form.sections.flatMap((s) =>
                        s.fields.map((f) => ({ id: f.id, label: f.label }))
                      ),
                      null,
                      2
                    )}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        {process.env.NODE_ENV === "development" && (
          <>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">
                  Debug: Subform Hierarchy & Paths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {form?.sections.map((section) => (
                    <div key={section.id}>
                      <h4 className="font-medium text-sm mb-2">Section: {section.title}</h4>
                      {section.subforms && section.subforms.length > 0 ? (
                        <div className="ml-4 space-y-2">
                          {(() => {
                            const renderSubformHierarchy = (subforms: Subform[], parentPath: string = "", level: number = 0) => {
                              return subforms.map((subform) => {
                                const currentPath = parentPath ? `${parentPath} > ${subform.name}` : subform.name;
                                const indent = "  ".repeat(level);

                                return (
                                  <div key={subform.id} className="text-xs font-mono">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-gray-600">{indent}├─</span>
                                      <span className="font-medium">{subform.name}</span>
                                      <Badge variant="outline" className="text-xs px-1 py-0">
                                        ID: {subform.id}
                                      </Badge>
                                      <Badge variant="outline" className="text-xs px-1 py-0">
                                        Level: {subform.level || 0}
                                      </Badge>
                                      {subform.path && (
                                        <Badge variant="secondary" className="text-xs px-1 py-0">
                                          DB: {subform.path}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="ml-4 text-gray-600">
                                      <div>Path: {currentPath}</div>
                                      <div>Fields: {subform.fields.length}</div>
                                      <div>Parent: {subform.parentSubformId || 'Section'}</div>
                                    </div>
                                    {subform.childSubforms && subform.childSubforms.length > 0 && (
                                      <div className="ml-4 mt-2">
                                        {renderSubformHierarchy(subform.childSubforms, currentPath, level + 1)}
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            };

                            return renderSubformHierarchy(section.subforms);
                          })()}
                        </div>
                      ) : (
                        <div className="ml-4 text-xs text-gray-500">No subforms</div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

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