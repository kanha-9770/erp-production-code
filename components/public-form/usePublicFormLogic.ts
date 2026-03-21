// components/public-form/usePublicFormLogic.ts
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Form, FormField, Subform } from "@/types/form-builder";
import { generateUniqueId, fetchUserLocation } from "@/lib/utils/form-utils";
import { getFormulaEvaluator } from "@/lib/formula/evaluator";
import { extractFieldReferences } from "@/lib/formula/parser";
import type { FormulaReturnType, BlankPreference } from "@/lib/formula/types";
import { isValidPhoneNumber } from "react-phone-number-input";

interface LocationResult {
  address: string;
  lat: number;
  lng: number;
}

interface FormulaConfig {
  fieldLabel: string;
  expression: string;
  returnType: FormulaReturnType;
  decimalPlaces: number;
  blankPreference: BlankPreference;
}

interface LookupFieldData {
  field_id: string;
  field_value: string;
  field_label: string;
  field_type: string;
  field_section_id: string | null;
  [key: string]: any;
}

export function usePublicFormLogic(
  formId: string | null,
  isOpen: boolean,
  onClose: () => void
) {
  const { toast } = useToast();

  // ── Core form states ───────────────────────────────────────────────────
  const [form, setForm] = useState<Form | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [completionPercentage, setCompletionPercentage] = useState(0);

  // ── Location & interaction states ──────────────────────────────────────
  const [locationStatus, setLocationStatus] = useState<
    Record<string, "idle" | "fetching" | "success" | "failed">
  >({});
  const hasUserInteracted = useRef(false);

  // ── Formula & advanced field states ────────────────────────────────────
  const [formulaValues, setFormulaValues] = useState<Record<string, any>>({});

  // ── Permissions & user context ─────────────────────────────────────────
  const [userRoleId] = useState<string | null>(null); // Can be set dynamically if needed
  const [sectionPermissions, setSectionPermissions] = useState<Record<string, string>>({});
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, string>>({});
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null>(null);

  // ── Dialog UI states ───────────────────────────────────────────────────
  const [dialogSize, setDialogSize] = useState({ width: 1400, height: 700 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string>("");
  const resizeStart = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({ x: 0, y: 0, width: 0, height: 0 });

  // ── Subform collapse state ─────────────────────────────────────────────
  const [collapsedSubforms, setCollapsedSubforms] = useState<Record<string, boolean>>({});

  // ── Resize logic ───────────────────────────────────────────────────────
  const startResize = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, direction: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dialogRef.current) return;
      const rect = dialogRef.current.getBoundingClientRect();
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height,
      };
      setResizeDirection(direction);
      setIsResizing(true);
    },
    []
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;

      let newWidth = resizeStart.current.width;
      let newHeight = resizeStart.current.height;

      if (resizeDirection.includes("e")) newWidth += dx;
      if (resizeDirection.includes("w")) newWidth -= dx;
      if (resizeDirection.includes("s")) newHeight += dy;
      if (resizeDirection.includes("n")) newHeight -= dy;

      newWidth = Math.max(600, newWidth);
      newHeight = Math.max(400, newHeight);

      setDialogSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDirection("");
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    const cursorMap: Record<string, string> = {
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      nw: "nw-resize",
      ne: "ne-resize",
      sw: "sw-resize",
      se: "se-resize",
    };
    document.body.style.cursor = cursorMap[resizeDirection] || "default";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, resizeDirection]);

  useEffect(() => {
    if (!isOpen) {
      setDialogSize({ width: 1400, height: 700 });
    }
  }, [isOpen]);

  // ── Reset all state when dialog closes ─────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setForm(null);
      setFormData({});
      setErrors({});
      setSubmitted(false);
      setCompletionPercentage(0);
      setLocationStatus({});
      setFormulaValues({});
      setSectionPermissions({});
      setFieldPermissions({});
      setAvailablePermissions([]);
      setCurrentUser(null);
      hasUserInteracted.current = false;
      setCollapsedSubforms({});
    }
  }, [isOpen]);

  // ── Fetch current logged-in user ───────────────────────────────────────
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch("/api/user");
        if (!response.ok) return;
        const result = await response.json();
        if (result.success && result.user) {
          const user = result.user;
          const fullName =
            [user.first_name, user.last_name].filter(Boolean).join(" ") ||
            user.name ||
            user.username ||
            "Current User";
          setCurrentUser({
            id: user.id,
            name: fullName,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
          });
        }
      } catch (err) {
        console.error("Failed to fetch current user:", err);
      }
    };

    if (isOpen) {
      fetchCurrentUser();
    }
  }, [isOpen]);

  // ── Main form loading effect ───────────────────────────────────────────
  useEffect(() => {
    if (!formId || !isOpen) return;

    const fetchForm = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/forms/${formId}`);
        const result = await response.json();

        if (!result.success) throw new Error(result.error || "Failed to load form");
        if (!result.data.isPublished) throw new Error("This form is not published");

        // Optional: Merge formula logic from /api/testing if needed
        const formulaResponse = await fetch("/api/testing");
        const formulaResult = await formulaResponse.json();

        if (formulaResult.success && Array.isArray(formulaResult.data)) {
          const formulas = formulaResult.data;
          result.data.sections.forEach((section: any) => {
            section.fields.forEach((field: FormField) => {
              const matching = formulas.find((f: any) => f.formFieldId === field.id);
              if (matching && matching.formField) {
                const type = matching.formField.type;
                if (type === "formula" || type === "expression") {
                  field.type = "formula";
                  const config: FormulaConfig = {
                    fieldLabel: matching.formField.label || field.label,
                    expression: matching.expression,
                    returnType: matching.returnType,
                    decimalPlaces: matching.formField.decimalPlaces || field.decimalPlaces || 2,
                    blankPreference: matching.blankPreference,
                  };
                  field.properties = { ...field.properties, formulaConfig: config };
                  if (matching.formField.label && matching.formField.label !== field.label) {
                    field.label = matching.formField.label;
                  }
                }
              }
            });
          });
        }

        setForm(result.data);

        // Initialize form data with defaults (including subforms)
        const initialData: Record<string, any> = {};
        const initialCollapsed: Record<string, boolean> = {};

        result.data.sections.forEach((section: any) => {
          section.fields.forEach((field: FormField) => {
            if (field.defaultValue !== undefined) {
              initialData[field.id] = field.defaultValue;
            }
          });

          const processSubforms = (subforms: Subform[]) => {
            subforms.forEach((subform) => {
              initialCollapsed[subform.id] = subform.collapsed || false;

              subform.fields.forEach((field: FormField) => {
                if (field.defaultValue !== undefined) {
                  initialData[field.id] = field.defaultValue;
                }
              });

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

    fetchForm();
  }, [formId, isOpen, toast]);

  // ── Auto-fill user fields when currentUser is available ────────────────
  useEffect(() => {
    if (!isOpen || !form || loading || !currentUser) return;

    const autoFillUserFields = () => {
      const updates: Record<string, any> = {};

      form.sections.forEach((section) => {
        section.fields.forEach((field: FormField) => {
          if (field.type === "user") {
            updates[field.id] = currentUser.name;
          }
        });
      });

      if (Object.keys(updates).length > 0) {
        setFormData((prev) => ({ ...prev, ...updates }));
      }
    };

    autoFillUserFields();
  }, [isOpen, form, loading, currentUser]);

  // ── Auto-fetch location on first interaction ───────────────────────────
  const triggerLocationFetch = useCallback(async () => {
    if (!form) return;

    const locationFields = form.sections.flatMap((s) =>
      s.fields.filter((f: FormField) => {
        const type = (f.type || "").toLowerCase();
        return (type === "location" || type === "newlocation") && f.properties?.autoFetchLocation;
      })
    );

    if (locationFields.length === 0) return;

    const updates: Record<string, any> = {};
    let anySuccess = false;

    for (const field of locationFields) {
      const fieldId = field.id;
      if (formData[fieldId]) continue;

      setLocationStatus((prev) => ({ ...prev, [fieldId]: "fetching" }));

      const loc = await fetchUserLocation(true);
      if (loc) {
        updates[fieldId] = loc.address;
        const coordId = `${fieldId}_coords`;
        const hasCoord = form.sections
          .flatMap((s) => s.fields)
          .some((f) => f.id === coordId && f.type === "hidden");
        if (hasCoord) {
          updates[coordId] = `${loc.lat},${loc.lng}`;
        }
        setLocationStatus((prev) => ({ ...prev, [fieldId]: "success" }));
        anySuccess = true;
      } else {
        setLocationStatus((prev) => ({ ...prev, [fieldId]: "failed" }));
      }
    }

    if (Object.keys(updates).length > 0) {
      setFormData((prev) => ({ ...prev, ...updates }));
    }

    if (!anySuccess && locationFields.length > 0) {
      toast({
        title: "Location",
        description: "Could not auto-fetch location. Please type it manually.",
        variant: "default",
      });
    }
  }, [form, formData, toast]);

  useEffect(() => {
    if (!hasUserInteracted.current && isOpen && form) {
      const handler = () => {
        hasUserInteracted.current = true;
        triggerLocationFetch();
        document.removeEventListener("click", handler);
        document.removeEventListener("keydown", handler);
      };
      document.addEventListener("click", handler);
      document.addEventListener("keydown", handler);
      return () => {
        document.removeEventListener("click", handler);
        document.removeEventListener("keydown", handler);
      };
    }
  }, [isOpen, form, triggerLocationFetch]);

  useEffect(() => {
    if (hasUserInteracted.current && form) {
      triggerLocationFetch();
    }
  }, [form, triggerLocationFetch]);

  // ── Auto-fill date/time fields ─────────────────────────────────────────
  useEffect(() => {
    if (!form) return;

    const dateTimeFields = form.sections.flatMap((s) =>
      s.fields.filter(
        (f: FormField) =>
          (f.type === "date" && f.properties?.autoFetchDate) ||
          (f.type === "time" && f.properties?.autoFetchTime) ||
          (f.type === "datetime" &&
            (f.properties?.autoFetchDate || f.properties?.autoFetchTime))
      )
    );

    if (dateTimeFields.length === 0) return;

    fetch("/api/system-time")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const { date, time, datetime } = json.data;
          const updates: Record<string, any> = {};
          dateTimeFields.forEach((f) => {
            if (f.type === "date" && f.properties?.autoFetchDate) updates[f.id] = date;
            else if (f.type === "time" && f.properties?.autoFetchTime) updates[f.id] = time;
            else if (f.type === "datetime") updates[f.id] = datetime;
          });
          setFormData((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch((error) => {
        console.error("System time API error:", error);
      });
  }, [form]);

  // ── Formula calculation effect ─────────────────────────────────────────
  const formulaFields = useMemo(() => {
    if (!form) return [];
    return form.sections.flatMap((s) =>
      s.fields.filter((f) => f.type === "formula" && f.properties?.formulaConfig)
    );
  }, [form]);

  const fieldLabelToValue = useMemo(() => {
    if (!form) return {};
    const mapping: Record<string, any> = {};
    form.sections.forEach((section) => {
      section.fields.forEach((field) => {
        mapping[field.label] = formData[field.id];
        mapping[field.id] = formData[field.id];
      });
    });
    return mapping;
  }, [form, formData]);

  useEffect(() => {
    if (!form || formulaFields.length === 0) return;

    const evaluator = getFormulaEvaluator();
    const newFormulaValues: Record<string, any> = {};

    formulaFields.forEach((field) => {
      const config = field.properties?.formulaConfig as FormulaConfig | undefined;
      if (!config || !config.expression) return;

      try {
        const referencedFields = extractFieldReferences(config.expression);
        const variables: Record<string, any> = {};
        referencedFields.forEach((refLabel) => {
          if (fieldLabelToValue[refLabel] !== undefined) {
            variables[refLabel] = fieldLabelToValue[refLabel];
          }
        });

        const result = evaluator.evaluate(
          config.expression,
          variables,
          config.returnType || "Number",
          config.blankPreference || "Empty"
        );

        if (result.success) {
          let finalValue = result.value;
          if (config.returnType === "Number" || config.returnType === "Currency") {
            const numValue = Number(finalValue);
            if (!isNaN(numValue)) {
              finalValue = numValue.toFixed(config.decimalPlaces || 2);
              if (config.returnType === "Currency") {
                finalValue = `$${finalValue}`;
              }
            }
          }
          newFormulaValues[field.id] = finalValue;
        } else {
          newFormulaValues[field.id] = config.blankPreference === "Zero" ? 0 : "";
        }
      } catch {
        newFormulaValues[field.id] = "";
      }
    });

    setFormulaValues(newFormulaValues);
  }, [form, formulaFields, fieldLabelToValue]);

  // ── Completion percentage calculation ──────────────────────────────────
  const calculateCompletion = useCallback(() => {
    if (!form) return;

    const getAllFields = (sections: any[]): FormField[] => {
      const allFields: FormField[] = [];
      sections.forEach((section) => {
        allFields.push(...section.fields);
        const processSubforms = (subforms: Subform[]) => {
          subforms.forEach((subform) => {
            allFields.push(...subform.fields);
            if (subform.childSubforms?.length) processSubforms(subform.childSubforms);
          });
        };
        if (section.subforms?.length) processSubforms(section.subforms);
      });
      return allFields;
    };

    const allFields = getAllFields(form.sections);
    const required = allFields.filter((f) => f.validation?.required && f.type !== "formula");
    const filled = required.filter((f) => {
      const v = formData[f.id];
      return v !== undefined && v !== null && v !== "";
    });

    const percentage = required.length > 0 ? Math.round((filled.length / required.length) * 100) : 100;
    setCompletionPercentage(percentage);
  }, [form, formData]);

  useEffect(() => {
    calculateCompletion();
  }, [formData, form, calculateCompletion]);

  // ── Field validation helper ────────────────────────────────────────────
  const validateField = (field: FormField, value: any): string | null => {
    if (field.type === "formula") return null;

    const v = field.validation || {};
    const fieldType = (field.type || "").toLowerCase();

    if (v.required && (!value || value === "" || value === null)) {
      return `${field.label} is required`;
    }

    if (fieldType === "phone" || fieldType === "phone-input") {
      if (value) {
        if (!isValidPhoneNumber(value)) {
          if (value.length < 8) return "Phone number is too short";
          if (!value.startsWith("+")) return "Please include country code (e.g. +91)";
          return "Please enter a valid phone number";
        }
      }
      return null;
    }

    if (fieldType === "email" && value) {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!re.test(value)) return "Please enter a valid email address";
    }

    if (fieldType === "url" && value) {
      try {
        new URL(value);
      } catch {
        return "Please enter a valid URL";
      }
    }

    if (fieldType === "number" && value) {
      const num = Number(value);
      if (isNaN(num)) return "Please enter a valid number";
      if (v.min !== undefined && num < v.min) return `Value must be at least ${v.min}`;
      if (v.max !== undefined && num > v.max) return `Value must be at most ${v.max}`;
    }

    if ((fieldType === "text" || fieldType === "textarea") && value) {
      if (v.minLength && value.length < v.minLength)
        return `Must be at least ${v.minLength} characters`;
      if (v.maxLength && value.length > v.maxLength)
        return `Must be at most ${v.maxLength} characters`;
    }

    if (v.pattern && value) {
      const re = new RegExp(v.pattern);
      if (!re.test(value)) return v.patternMessage || "Invalid format";
    }

    return null;
  };

  // ── Full form validation ───────────────────────────────────────────────
  const validateForm = useCallback((): boolean => {
    if (!form) return false;

    const newErrors: Record<string, string> = {};
    let valid = true;

    const validateAll = (sections: any[]) => {
      sections.forEach((section) => {
        section.fields.forEach((field: FormField) => {
          const err = validateField(field, formData[field.id]);
          if (err) {
            newErrors[field.id] = err;
            valid = false;
          }
        });

        const validateSub = (subforms: Subform[]) => {
          subforms.forEach((subform) => {
            subform.fields.forEach((field: FormField) => {
              const err = validateField(field, formData[field.id]);
              if (err) {
                newErrors[field.id] = err;
                valid = false;
              }
            });
            if (subform.childSubforms?.length) {
              validateSub(subform.childSubforms);
            }
          });
        };

        if (section.subforms?.length) {
          validateSub(section.subforms);
        }
      });
    };

    validateAll(form.sections);
    setErrors(newErrors);
    return valid;
  }, [form, formData]);

  // ── Check if there are errors or missing required fields ───────────────
  const hasErrorsOrMissingRequired = useCallback((): boolean => {
    if (Object.keys(errors).length > 0) return true;
    if (!form) return false;

    let hasMissing = false;

    const checkAll = (sections: any[]) => {
      sections.forEach((section) => {
        section.fields.forEach((field: FormField) => {
          if (field.validation?.required && field.type !== "formula") {
            const val = formData[field.id];
            if (val === undefined || val === null || val === "") {
              hasMissing = true;
            }
          }
        });

        const checkSub = (subforms: Subform[]) => {
          subforms.forEach((subform) => {
            subform.fields.forEach((field: FormField) => {
              if (field.validation?.required && field.type !== "formula") {
                const val = formData[field.id];
                if (val === undefined || val === null || val === "") {
                  hasMissing = true;
                }
              }
            });
            if (subform.childSubforms?.length) checkSub(subform.childSubforms);
          });
        };

        if (section.subforms?.length) checkSub(section.subforms);
      });
    };

    checkAll(form.sections);
    return hasMissing;
  }, [form, formData, errors]);

  // ── Field change handler ───────────────────────────────────────────────
  const handleFieldChange = useCallback(
    (fieldId: string, value: any, fullOption?: any) => {
      let storeValue = value;

      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          storeValue = value.map((i) => i.storeValue || i.label || i.value);
        } else if (value.storeValue !== undefined) {
          storeValue = value.storeValue;
        } else if (value instanceof File) {
          const reader = new FileReader();
          reader.onload = () => {
            setFormData((prev) => ({
              ...prev,
              [fieldId]: reader.result as string,
            }));
            const field = form?.sections
              .flatMap((s) => s.fields)
              .find((f) => f.id === fieldId);
            if (field) {
              const err = validateField(field, reader.result);
              setErrors((prev) => ({ ...prev, [fieldId]: err || "" }));
            }
          };
          reader.onerror = () => {
            toast({
              title: "Error",
              description: "Failed to read file",
              variant: "destructive",
            });
          };
          reader.readAsDataURL(value);
          return;
        }
      }

      setFormData((prev) => {
        const newData = { ...prev, [fieldId]: storeValue };

        if (
          form &&
          fullOption &&
          typeof fullOption === "object" &&
          fullOption.data?.record_id &&
          fullOption.data?.form_id
        ) {
          const allFields: FormField[] = [];
          form.sections.forEach((section) => {
            allFields.push(...section.fields);
            const collect = (subs: Subform[]) => {
              subs.forEach((sub) => {
                allFields.push(...sub.fields);
                if (sub.childSubforms?.length) collect(sub.childSubforms);
              });
            };
            if (section.subforms?.length) collect(section.subforms);
          });

          const currentField = allFields.find(
            (f) => f.id === fieldId && f.type === "lookup"
          );

          if (currentField?.lookup) {
            const relatedFields = allFields.filter(
              (f) =>
                f.id !== fieldId &&
                f.type === "lookup" &&
                f.lookup?.sourceId === currentField.lookup?.sourceId
            );

            relatedFields.forEach((relatedField) => {
              const matched = Object.values(fullOption.data).find(
                (d: any) =>
                  d.field_label?.toLowerCase() === relatedField.label.toLowerCase() &&
                  d.field_value
              ) as LookupFieldData | undefined;

              if (matched) {
                newData[relatedField.id] = matched.field_value;
              }
            });
          }
        }

        return newData;
      });

      setErrors((prev) => {
        const newErrors = { ...prev };
        const field = form?.sections
          .flatMap((s) => s.fields)
          .find((f) => f.id === fieldId);
        if (field) {
          const err = validateField(field, storeValue);
          if (err) newErrors[fieldId] = err;
          else delete newErrors[fieldId];
        } else {
          delete newErrors[fieldId];
        }
        return newErrors;
      });
    },
    [form, toast]
  );

  // ── Form submission handler ────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const isValid = validateForm();
      if (!isValid) {
        toast({
          title: "Validation Error",
          description: "Please fix all errors before submitting",
          variant: "destructive",
        });
        return;
      }

      setSubmitting(true);

      try {
        const userId = (window as any).__currentUserId;
        if (!userId) {
          toast({
            title: "Error",
            description: "User not authenticated",
            variant: "destructive",
          });
          return;
        }

        let attendanceHandled = false;
        const formNameLower = (form?.name || "").trim().toLowerCase();

        if (formNameLower === "check-in" || formNameLower === "checkin") {
          const res = await fetch("/api/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, action: "checkin" }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || "Check-In failed");
          attendanceHandled = true;
        } else if (formNameLower === "check-out" || formNameLower === "checkout") {
          const res = await fetch("/api/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, action: "checkout" }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || "Check-Out failed");
          attendanceHandled = true;
        }

        const hasFields =
          form?.sections.some((s) => s.fields.length > 0 || s.subforms?.length > 0) || false;

        if (hasFields || !attendanceHandled) {
          const dataToSubmit = { ...formData, ...formulaValues };

          const payload = {
            recordData: dataToSubmit,
            submittedBy: "anonymous",
            userAgent: navigator.userAgent,
          };

          const res = await fetch(`/api/forms/${formId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = await res.json();

          if (!json.success) throw new Error(json.error || "Submission failed");
        }

        setSubmitted(true);
        toast({
          title: "Success!",
          description: form?.submissionMessage || "Form submitted successfully!",
        });

        await fetch(`/api/forms/${formId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "submit",
            payload: {
              recordId: attendanceHandled ? "attendance" : "form",
              timestamp: new Date().toISOString(),
            },
          }),
        });

        if ((window as any).__handleFormSubmitted) {
          await (window as any).__handleFormSubmitted(form?.name || "");
        }

        if ((window as any).__handleRecordsRefresh) {
          await (window as any).__handleRecordsRefresh();
        }

        setTimeout(() => onClose(), 1500);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to submit form",
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [
      form,
      formData,
      formulaValues,
      formId,
      onClose,
      toast,
      validateForm,
    ]
  );

  // ── Toggle subform collapse ────────────────────────────────────────────
  const toggleSubform = useCallback((subformId: string) => {
    setCollapsedSubforms((prev) => ({
      ...prev,
      [subformId]: !prev[subformId],
    }));
  }, []);

  return {
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
  };
}