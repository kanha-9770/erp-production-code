"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useDialogResize } from "@/hooks/use-dialog-resize";
import { getFormulaEvaluator } from "@/lib/formula/evaluator";
import { extractFieldReferences } from "@/lib/formula/parser";
import type { FormulaReturnType, BlankPreference } from "@/lib/formula/types";
import { getAllSubformFields } from "@/lib/utils/fieldUtils";
import { isValidPhoneNumber } from "react-phone-number-input";
import type { Form, FormField, Subform } from "@/types/form-builder";

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
  visibleInForm?: boolean;
}

interface LookupFieldData {
  field_id: string;
  field_value: string;
  field_label: string;
  field_type: string;
  field_section_id: string | null;
  [key: string]: any;
}

export const getParentValue = (
  field: FormField,
  formData: Record<string, any>,
): string | string[] | undefined => {
  if (!field.parentFieldId) return undefined;
  // Direct match - most common case
  if (formData[field.parentFieldId] !== undefined) {
    return formData[field.parentFieldId];
  }
  // Look for dynamic instance keys that contain parentFieldId
  const possibleKeys = Object.keys(formData).filter(
    (key) => key.includes(`__`) && key.includes(field.parentFieldId!),
  );
  if (possibleKeys.length > 0) {
    // For simplicity we take the first match
    return formData[possibleKeys[0]];
  }
  return undefined;
};

const fetchUserLocation = async (
  retry = false,
): Promise<LocationResult | null> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      return resolve(null);
    }
    const handleSuccess = async (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        );
        const data = await res.json();
        const address =
          data.display_name ||
          `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        resolve({ address, lat: latitude, lng: longitude });
      } catch {
        resolve(null);
      }
    };
    const handleError = (err: GeolocationPositionError) => {
      if (!retry && err.code === 1) {
        setTimeout(() => {
          navigator.geolocation.getCurrentPosition(
            handleSuccess,
            () => resolve(null),
            {
              enableHighAccuracy: true,
              timeout: 10000,
            },
          );
        }, 500);
      } else {
        resolve(null);
      }
    };
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 300000,
    });
  });
};

interface PublicFormProps {
  formId: string | null;
  isOpen: boolean;
  onClose: () => void;
  allowAdminPreview?: boolean;
}

export function usePublicForm({
  formId,
  isOpen,
  onClose,
  allowAdminPreview = false,
}: PublicFormProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [, setCompletionPercentage] = useState(0);
  const [locationStatus, setLocationStatus] = useState<
    Record<string, "idle" | "fetching" | "success" | "failed">
  >({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const hasUserInteracted = useRef(false);
  const [formulaValues, setFormulaValues] = useState<Record<string, any>>({});
  const formulaValuesRef = useRef<Record<string, any>>({});
  const [userRoleId, setUserRoleId] = useState<string | null>(null);
  const [sectionPermissions, setSectionPermissions] = useState<
    Record<string, string>
  >({});
  const [fieldPermissions, setFieldPermissions] = useState<
    Record<string, string>
  >({});
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [formLevelPermission, setFormLevelPermission] = useState<"NONE" | "VIEW" | "CREATE" | "EDIT" | "DELETE" | null>(null);
  const [formPermissionLoading, setFormPermissionLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null>(null);
  const { dialogSize, dialogRef, startResize } = useDialogResize(isOpen);
  const [collapsedSubforms, setCollapsedSubforms] = useState<
    Record<string, boolean>
  >({});
  const [dynamicSubformInstances, setDynamicSubformInstances] = useState<
    Record<string, string[]>
  >({});

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
      setUserRoleId(null);
      setCurrentUser(null);
      hasUserInteracted.current = false;
      setCollapsedSubforms({});
      setDynamicSubformInstances({});
      setFormLevelPermission(null);
      setFormPermissionLoading(false);
    }
  }, [isOpen]);

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
      } catch {
        // ignore
      }
    };
    if (isOpen) {
      fetchCurrentUser();
    }
  }, [isOpen]);

  useEffect(() => {
    const fetchFormPermission = async () => {
      if (!formId || !isOpen) return;
      setFormPermissionLoading(true);
      try {
        const response = await fetch(`/api/admin/permissions?formId=${formId}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.success || !data.data) return;

        const { permissions: perms, isAdmin } = data.data;

        // Admins always get full access
        if (isAdmin) {
          setFormLevelPermission("CREATE");
          return;
        }

        // Find the highest permission the user has for this form
        const PERMISSION_RANK: Record<string, number> = {
          VIEW: 1,
          CREATE: 2,
          EDIT: 3,
          DELETE: 4,
          ADMIN: 5,
        };

        const formPerms: string[] = (perms as any[])
          .filter((p: any) => p.form?.id === formId || !p.form?.id)
          .map((p: any) => p.name?.toUpperCase());

        if (formPerms.length === 0) {
          // No explicit permission set — default to full access (backward compat)
          setFormLevelPermission("CREATE");
          return;
        }

        const highest = formPerms.reduce((best, curr) => {
          return (PERMISSION_RANK[curr] ?? 0) > (PERMISSION_RANK[best] ?? 0) ? curr : best;
        }, "VIEW");

        setFormLevelPermission(highest as any);
      } catch {
        // Fail open — don't block the form
        setFormLevelPermission("CREATE");
      } finally {
        setFormPermissionLoading(false);
      }
    };

    fetchFormPermission();
  }, [formId, isOpen]);

  useEffect(() => {
    if (formId && isOpen) {
      fetchForm();
      trackFormView();
    }
  }, [formId, isOpen]);

  useEffect(() => {
    calculateCompletion();
  }, [
    formData,
    form,
    sectionPermissions,
    fieldPermissions,
    availablePermissions,
  ]);

  // ── VISIBILITY HELPERS ──
  // AFTER:
  const evaluateSubformConditional = useCallback(
    (subform: Subform): boolean => {
      if (!subform.conditional) return true;
      const { type = "show", parentFieldId, value: targetValue } = subform.conditional;
      if (!parentFieldId || targetValue === undefined) return true;
      const parentVal = formData[parentFieldId];
      const parentStr = Array.isArray(parentVal)
        ? parentVal
        : [String(parentVal ?? "")];
      const matches = parentStr.some((v) => String(v) === String(targetValue));
      return type === "show" ? matches : !matches;
    },
    [formData],
  );

  const isSectionVisible = useCallback(
    (id: string): boolean => {
      const permId = sectionPermissions[id];
      if (permId !== undefined && permId === "NONE") return false;

      if (form) {
        const checkSubforms = (subforms: Subform[]): boolean | null => {
          for (const sf of subforms) {
            if (sf.id === id) {
              return evaluateSubformConditional(sf);
            }
            if (sf.childSubforms?.length) {
              const result = checkSubforms(sf.childSubforms);
              if (result !== null) return result;
            }
          }
          return null;
        };
        const result = checkSubforms(form.subforms || []);
        if (result === false) return false;
      }

      return true;
    },
    [sectionPermissions, form, evaluateSubformConditional],
  );

  const getParentValueMemo = useCallback(
    (field: FormField) => getParentValue(field, formData),
    [formData],
  );

  const isFieldVisibleDependingOnParent = (field: FormField): boolean => {
    if (!field.isDependent || !field.parentFieldId) {
      return true;
    }
    const parentValueRaw = getParentValue(field, formData);
    const parentValue = Array.isArray(parentValueRaw)
      ? parentValueRaw[0]
      : typeof parentValueRaw === "string"
        ? parentValueRaw
        : null;
    if (!parentValue) {
      return false;
    }
    return !!field.dependentGroups?.some(
      (group) => group.parentValue === parentValue,
    );
  };

  const evaluateConditionalVisibility = (
    field: FormField,
    formData: Record<string, any>,
  ): boolean => {
    if (!field.conditional) return true;
    const {
      type = "show",
      parentFieldId,
      value: targetValue,
    } = field.conditional;
    if (!parentFieldId || targetValue === undefined) return true;
    const parentVal = formData[parentFieldId];
    const parentStr = Array.isArray(parentVal)
      ? parentVal
      : [String(parentVal ?? "")];
    const matches = parentStr.some((v) => String(v) === String(targetValue));
    return type === "show" ? matches : !matches;
  };

  const isFieldVisible = (field: FormField, sectionId: string): boolean => {
    const fieldPermId = fieldPermissions[field.id];
    const effectivePermId = fieldPermId ?? sectionPermissions[sectionId];
    if (effectivePermId === "NONE") return false;
    if (field.type === "formula") {
      const config = field.properties?.formulaConfig as
        | FormulaConfig
        | undefined;
      if (config?.visibleInForm === false) {
        return false;
      }
    }
    if (field.visible === false || field.properties?.hidden === true)
      return false;
    if (field.conditional && !evaluateConditionalVisibility(field, formData)) {
      return false;
    }
    if (!isFieldVisibleDependingOnParent(field)) return false;
    return true;
  };

  // ── ORDERED ROOT ITEMS (sections + their child subforms + top-level subforms) ──
  const rootItems = useMemo(() => {
    if (!form) return [];

    const items: Array<
      | { type: "section"; data: Form["sections"][number] }
      | { type: "subform"; data: Subform; parentSectionId?: string }
    > = [];

    // Sort sections by order
    const sortedSections = [...(form.sections || [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );

    sortedSections.forEach((section) => {
      if (isSectionVisible(section.id)) {
        items.push({ type: "section", data: section });
      }

      // Direct child subforms of this section
      const childSubforms = (form.subforms || []).filter(
        (sf) => sf.parentSectionId === section.id
      ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      childSubforms.forEach((subform) => {
        if (isSectionVisible(subform.id)) {
          items.push({
            type: "subform",
            data: subform,
            parentSectionId: section.id,
          });
        }
      });
    });

    // True top-level subforms (no parent section)
    const topLevelSubforms = (form.subforms || []).filter(
      (sf) => sf.parentSectionId === null
    ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    topLevelSubforms.forEach((subform) => {
      if (isSectionVisible(subform.id)) {
        items.push({ type: "subform", data: subform });
      }
    });

    return items;
  }, [form, sectionPermissions, isSectionVisible]);

  const allFields = useMemo(() => {
    const fields: FormField[] = [];
    const collect = (sections: any[], subforms: Subform[] = []) => {
      sections.forEach((s) => fields.push(...s.fields));
      subforms.forEach((sf) => {
        fields.push(...sf.fields);
        if (sf.childSubforms?.length) collect([], sf.childSubforms);
      });
    };
    if (form) {
      collect(form.sections, form.subforms || []);
    }
    return fields;
  }, [form]);

  const formulaFields = useMemo(() => {
    if (!form) return [];
    return allFields.filter(
      (f) => f.type === "formula" && f.properties?.formulaConfig,
    );
  }, [allFields]);

  const idToLabel = useMemo(() => {
    const map: Record<string, string> = {};
    allFields.forEach((f) => {
      map[f.id] = f.label;
    });
    return map;
  }, [allFields]);

  const evaluatorFields = useMemo(() => {
    return allFields.map((f) => {
      if (f.type === "formula" && f.properties?.formulaConfig?.returnType) {
        const effectiveType = String(
          f.properties.formulaConfig.returnType,
        ).toLowerCase();
        return { ...f, type: effectiveType } as FormField;
      }
      return f;
    });
  }, [allFields]);

  // ── FORMULA CALCULATION ────────────────────────────────────────────────────
  useEffect(() => {
    if (!form || formulaFields.length === 0) return;
    const evaluator = getFormulaEvaluator();
    const newFormulaValues: Record<string, any> = {};
    const runningValues: Record<string, any> = {};
    formulaFields.forEach((field) => {
      const config = field.properties?.formulaConfig as
        | FormulaConfig
        | undefined;
      if (!config || !config.expression) return;
      try {
        const referencedFields = extractFieldReferences(config.expression);
        const variables: Record<string, any> = {};
        referencedFields.forEach((refId) => {
          if (
            formData[refId] !== undefined &&
            formData[refId] !== null &&
            formData[refId] !== ""
          ) {
            variables[refId] = formData[refId];
          } else if (runningValues[refId] !== undefined) {
            variables[refId] = runningValues[refId];
          } else if (formulaValuesRef.current[refId] !== undefined) {
            variables[refId] = formulaValuesRef.current[refId];
          } else {
            variables[refId] = formData[refId];
          }
        });
        const result = evaluator.evaluate(
          config.expression,
          variables,
          config.returnType || "Text",
          config.blankPreference || "Empty",
          evaluatorFields,
          config.decimalPlaces ?? 2,
        );
        if (result.success) {
          let finalValue = result.value;
          if (
            config.returnType === "Number" ||
            config.returnType === "Currency" ||
            config.returnType === "Percent"
          ) {
            const numValue = Number(finalValue);
            if (!isNaN(numValue)) {
              finalValue = numValue.toFixed(config.decimalPlaces || 2);
              if (config.returnType === "Currency")
                finalValue = `$${finalValue}`;
              if (config.returnType === "Percent")
                finalValue = `${finalValue}%`;
            }
          }
          newFormulaValues[field.id] = finalValue;
          runningValues[field.id] = result.value;
        } else {
          newFormulaValues[field.id] =
            config.blankPreference === "Zero" ? 0 : "";
          runningValues[field.id] = config.blankPreference === "Zero" ? 0 : "";
        }
      } catch {
        newFormulaValues[field.id] = "";
        runningValues[field.id] = "";
      }
    });
    formulaValuesRef.current = newFormulaValues;
    setFormulaValues(newFormulaValues);
  }, [form, formulaFields, formData, evaluatorFields]);

  const triggerLocationFetch = useCallback(async () => {
    if (!form) return;
    const locationFields = form.sections
      .flatMap((s) =>
        s.fields.filter((f) => {
          const type = (f.type || "").toLowerCase();
          return (
            (type === "location" || type === "newlocation") &&
            f.properties?.autoFetchLocation
          );
        }),
      )
      .concat(
        getAllSubformFields(form.subforms || []).filter((f) => {
          const type = (f.type || "").toLowerCase();
          return (
            (type === "location" || type === "newlocation") &&
            f.properties?.autoFetchLocation
          );
        }),
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
        const allFields = [
          ...form.sections.flatMap((s) => s.fields),
          ...getAllSubformFields(form.subforms || []),
        ];
        const hasCoord = allFields.some(
          (f) => f.id === coordId && f.type === "hidden",
        );
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

  useEffect(() => {
    if (!form) return;
    const dateTimeFields = form.sections
      .flatMap((s) =>
        s.fields.filter(
          (f) =>
            (f.type === "date" && f.properties?.autoFetchDate) ||
            (f.type === "time" && f.properties?.autoFetchTime) ||
            (f.type === "datetime" &&
              (f.properties?.autoFetchDate || f.properties?.autoFetchTime)),
        ),
      )
      .concat(
        getAllSubformFields(form.subforms || []).filter(
          (f) =>
            (f.type === "date" && f.properties?.autoFetchDate) ||
            (f.type === "time" && f.properties?.autoFetchTime) ||
            (f.type === "datetime" &&
              (f.properties?.autoFetchDate || f.properties?.autoFetchTime)),
        ),
      );
    if (dateTimeFields.length === 0) return;
    fetch("/api/system-time")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const { date, time, datetime } = json.data;
          const updates: Record<string, any> = {};
          dateTimeFields.forEach((f) => {
            if (f.type === "date" && f.properties?.autoFetchDate) {
              updates[f.id] = date;
            } else if (f.type === "time" && f.properties?.autoFetchTime) {
              updates[f.id] = time;
            } else if (f.type === "datetime") {
              updates[f.id] = datetime;
            }
          });
          setFormData((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => { });
  }, [form]);

  useEffect(() => {
    if (!isOpen || !form || loading || !currentUser) return;
    const autoFillUserFields = () => {
      const updates: Record<string, any> = {};
      form.sections.forEach((section) => {
        section.fields.forEach((field) => {
          if (field.type === "user") {
            updates[field.id] = currentUser.name;
          }
        });
      });
      const processSubformsForUser = (subforms: Subform[]) => {
        subforms.forEach((subform) => {
          subform.fields.forEach((field) => {
            if (field.type === "user") {
              updates[field.id] = currentUser.name;
            }
          });
          if (subform.childSubforms?.length) {
            processSubformsForUser(subform.childSubforms);
          }
        });
      };
      if (form.subforms?.length) {
        processSubformsForUser(form.subforms);
      }
      if (Object.keys(updates).length > 0) {
        setFormData((prev) => ({ ...prev, ...updates }));
      }
    };
    autoFillUserFields();
  }, [isOpen, form, loading, currentUser]);

  // ── Re-validate all fields whenever formData changes ──────────────────────
  useEffect(() => {
    if (!form) return;
    const newErrors: Record<string, string> = {};
    const validateAllFields = (sections: any[]) => {
      sections.forEach((section) => {
        if (!isSectionVisible(section.id)) return;
        section.fields.forEach((field: FormField) => {
          if (!isFieldVisible(field, section.id)) return;
          const err = validateField(field, formData[field.id]);
          if (err) newErrors[field.id] = err;
        });
      });
    };
    const validateSubforms = (subforms: Subform[]) => {
      subforms.forEach((subform) => {
        if (!isSectionVisible(subform.id)) return;
        subform.fields.forEach((field: FormField) => {
          const err = validateField(field, formData[field.id]);
          if (err) newErrors[field.id] = err;
        });
        if (subform.childSubforms?.length) {
          validateSubforms(subform.childSubforms);
        }
      });
    };
    validateAllFields(form.sections);
    if (form.subforms) {
      validateSubforms(form.subforms);
    }
    setErrors(newErrors);
  }, [formData, form]);

  const fetchForm = async () => {
    if (!formId) return;
    try {
      setLoading(true);
      const url = `/api/forms/${formId}${allowAdminPreview ? "" : "?published=true"}`;
      const response = await fetch(url);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      if (!result.data.isPublished && !allowAdminPreview)
        throw new Error("This form is not published");
      // ── Apply formula configs from FormField.formula column (primary source) ──
      // Formulas are saved to FormField.formula by handleFormulaSave.
      // We also fall back to /api/testing (FormulaField table) for legacy entries.
      const applyFormulaConfig = (field: FormField) => {
        const fieldAny = field as any;
        // Primary: read from FormField.formula column
        if (field.type === "formula" && fieldAny.formula) {
          const fd = fieldAny.formula;
          const existingConfig = field.properties?.formulaConfig || {};
          field.properties = {
            ...field.properties,
            formulaConfig: {
              fieldLabel: field.label,
              expression: fd.expression || "",
              returnType: fd.returnType || "Number",
              decimalPlaces: fd.decimalPlaces ?? fieldAny.decimalPlaces ?? 2,
              blankPreference: fd.blankPreference || "Empty",
              visibleInForm: fd.visibleInForm ?? existingConfig.visibleInForm ?? true,
            } as FormulaConfig,
          };
        }
      };

      const applyFormulaToSubforms = (subforms: any[]) => {
        if (!Array.isArray(subforms)) return;
        subforms.forEach((sf) => {
          if (Array.isArray(sf.fields)) sf.fields.forEach(applyFormulaConfig);
          if (sf.childSubforms?.length) applyFormulaToSubforms(sf.childSubforms);
        });
      };

      // Apply to section fields
      result.data.sections.forEach((section: any) => {
        if (Array.isArray(section.fields)) section.fields.forEach(applyFormulaConfig);
      });
      // Apply to subform fields (all levels)
      applyFormulaToSubforms(result.data.subforms || []);

      // ── Fallback: /api/testing (FormulaField table) for legacy formulas ──
      try {
        const formulaResponse = await fetch("/api/testing");
        const formulaResult = await formulaResponse.json();
        if (formulaResult.success && Array.isArray(formulaResult.data)) {
          const formulas = formulaResult.data;
          const applyFromFormulaField = (field: FormField) => {
            const matchingFormula = formulas.find((f: any) => f.formFieldId === field.id);
            if (!matchingFormula?.formField) return;
            const fType = matchingFormula.formField.type;
            if (fType !== "formula" && fType !== "expression") return;
            field.type = "formula";
            // Only patch if primary source (field.formula) didn't already set it
            if (!field.properties?.formulaConfig?.expression) {
              const existingConfig = field.properties?.formulaConfig || {};
              field.properties = {
                ...field.properties,
                formulaConfig: {
                  fieldLabel: matchingFormula.formField.label || field.label,
                  expression: matchingFormula.expression,
                  returnType: matchingFormula.returnType,
                  decimalPlaces:
                    matchingFormula.formField.decimalPlaces ||
                    (field as any).decimalPlaces ||
                    2,
                  blankPreference: matchingFormula.blankPreference,
                  visibleInForm: existingConfig.visibleInForm ?? true,
                } as FormulaConfig,
              };
              if (
                matchingFormula.formField.label &&
                matchingFormula.formField.label !== field.label
              ) {
                field.label = matchingFormula.formField.label;
              }
            }
          };
          result.data.sections.forEach((section: any) => {
            if (Array.isArray(section.fields)) section.fields.forEach(applyFromFormulaField);
          });
          applyFormulaToSubforms2(result.data.subforms || [], applyFromFormulaField);
        }
      } catch {
        // non-fatal: legacy formula table unavailable
      }

      function applyFormulaToSubforms2(subforms: any[], fn: (f: FormField) => void) {
        if (!Array.isArray(subforms)) return;
        subforms.forEach((sf) => {
          if (Array.isArray(sf.fields)) sf.fields.forEach(fn);
          if (sf.childSubforms?.length) applyFormulaToSubforms2(sf.childSubforms, fn);
        });
      }
      setForm(result.data);
      const initialData: Record<string, any> = {};
      const initialCollapsed: Record<string, boolean> = {};
      result.data.sections.forEach((section: any) => {
        section.fields.forEach((field: FormField) => {
          if (field.defaultValue) {
            initialData[field.id] = field.defaultValue;
          }
        });
      });
      const processSubforms = (subforms: Subform[]) => {
        subforms.forEach((subform) => {
          initialCollapsed[subform.id] = subform.collapsed || false;
          subform.fields.forEach((field: FormField) => {
            if (field.defaultValue) {
              initialData[field.id] = field.defaultValue;
            }
          });
          if (subform.childSubforms?.length) {
            processSubforms(subform.childSubforms);
          }
        });
      };
      if (result.data.subforms?.length) {
        processSubforms(result.data.subforms);
      }
      setFormData(initialData);
      setCollapsedSubforms(initialCollapsed);
      if (userRoleId) {
        await fetchSectionPermissions(result.data);
      } else {
        const defaultSectionPerms = result.data.sections.reduce(
          (acc: Record<string, string>, s: any) => ({ ...acc, [s.id]: "READ" }),
          {},
        );
        setSectionPermissions(defaultSectionPerms);
      }
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

  const getAllPermissionableIds = (formData: Form): string[] => {
    const ids: string[] = formData.sections.map((s) => s.id);
    const collectSubformIds = (subforms: Subform[]) => {
      subforms.forEach((sf) => {
        ids.push(sf.id);
        if (sf.childSubforms) collectSubformIds(sf.childSubforms);
      });
    };
    if (formData.subforms) collectSubformIds(formData.subforms);
    return ids;
  };

  const fetchSectionPermissions = async (formData: Form) => {
    let avails: any[] = availablePermissions;
    const sectionPerms: Record<string, string> = {};
    const allFieldPerms: Record<string, string> = {};
    const allIds = getAllPermissionableIds(formData);
    await Promise.all(
      allIds.map(async (id) => {
        try {
          const res = await fetch(`/api/permissions/sections/${id}`);
          if (!res.ok) {
            sectionPerms[id] = "READ";
            return;
          }
          const data = await res.json();
          if (data.error) {
            sectionPerms[id] = "VIEW";
            return;
          }
          if (data.availablePermissions && avails.length === 0) {
            avails = data.availablePermissions;
          }
          const profile = data.profiles.find((p: any) => p.id === userRoleId);
          const sectionPermId = profile?.permission || "READ";
          const sectionFieldPerms = profile?.fieldPermissions || {};
          sectionPerms[id] = sectionPermId;
          Object.assign(allFieldPerms, sectionFieldPerms);
        } catch (e) {
          sectionPerms[id] = "READ";
        }
      }),
    );
    setAvailablePermissions(avails);
    setSectionPermissions(sectionPerms);
    setFieldPermissions(allFieldPerms);
  };

  const trackFormView = async () => {
    if (!formId) return;
    try {
      const payload = {
        eventType: "view",
        payload: {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
      };
      await fetch(`/api/forms/${formId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // ignore
    }
  };

  const getVisibleRequiredFields = (): FormField[] => {
    if (!form) return [];
    const visible: FormField[] = [];
    form.sections.forEach((section) => {
      if (isSectionVisible(section.id)) {
        section.fields.forEach((f) => {
          if (
            isFieldVisible(f, section.id) &&
            f.validation?.required &&
            f.type !== "formula"
          ) {
            visible.push(f);
          }
        });
      }
    });
    const collectSubformFields = (subforms: Subform[]) => {
      subforms.forEach((sf) => {
        if (isSectionVisible(sf.id)) {
          sf.fields.forEach((f) => {
            if (
              isFieldVisible(f, sf.id) &&
              f.validation?.required &&
              f.type !== "formula"
            ) {
              visible.push(f);
            }
          });
          if (sf.childSubforms) collectSubformFields(sf.childSubforms);
        }
      });
    };
    if (form.subforms) collectSubformFields(form.subforms);
    return visible;
  };

  const calculateCompletion = () => {
    if (!form) return;
    const required = getVisibleRequiredFields();
    const filled = required.filter((f) => {
      const v = formData[f.id];
      return v !== undefined && v !== null && v !== "";
    });
    const percentage =
      required.length > 0
        ? Math.round((filled.length / required.length) * 100)
        : 100;
    setCompletionPercentage(percentage);
  };

  const validateField = (field: FormField, value: any): string | null => {
    if (field.type === "formula") return null;
    if (field.type === "address") {
      if (!field.validation?.required) return null;
      const addr = (value as Record<string, string>) || {};
      const subfields = field.properties?.subfields || [
        { key: "line1", label: "Address Line 1", required: true },
        { key: "line2", label: "Address Line 2", required: false },
        { key: "city", label: "City / District", required: true },
        { key: "state", label: "State / Province", required: true },
        { key: "postal", label: "Postal / Zip Code", required: true },
        { key: "country", label: "Country", required: true },
      ];
      for (const sub of subfields) {
        if (
          sub.required &&
          (!addr[sub.key] || String(addr[sub.key]).trim() === "")
        ) {
          return `${field.label} → ${sub.label} is required`;
        }
      }
      return null;
    }
    const v = field.validation || {};
    const fieldType = (field.type || "").toLowerCase();
    if (v.required && (!value || value === "" || value === null))
      return `${field.label} is required`;
    if (fieldType === "phone" || fieldType === "phone-input") {
      if (value) {
        if (!isValidPhoneNumber(value)) {
          if (value.length < 8) return "Phone number is too short";
          if (!value.startsWith("+"))
            return "Please include country code (e.g. +91)";
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
      if (v.min !== undefined && num < v.min)
        return `Value must be at least ${v.min}`;
      if (v.max !== undefined && num > v.max)
        return `Value must be at most ${v.max}`;
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

  const hasErrorsOrMissingRequired = (): boolean => {
    if (Object.keys(errors).length > 0) return true;
    if (!form) return false;
    let hasMissing = false;
    getVisibleRequiredFields().forEach((f) => {
      const val = formData[f.id];
      if (val === undefined || val === null || val === "") {
        hasMissing = true;
      }
    });
    return hasMissing;
  };

  const validateForm = (): boolean => {
    if (!form) return false;
    const newErrors: Record<string, string> = {};
    let valid = true;
    const validateAll = (sections: any[]) => {
      sections.forEach((section) => {
        if (!isSectionVisible(section.id)) return;
        section.fields.forEach((field: FormField) => {
          if (!isFieldVisible(field, section.id)) return;
          const err = validateField(field, formData[field.id]);
          if (err) {
            newErrors[field.id] = err;
            valid = false;
          }
        });
      });
    };
    const validateSub = (subforms: Subform[]) => {
      subforms.forEach((subform) => {
        if (!isSectionVisible(subform.id)) return;
        subform.fields.forEach((field: FormField) => {
          if (!isFieldVisible(field, subform.id)) return;
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
    validateAll(form.sections);
    if (form.subforms) {
      validateSub(form.subforms);
    }
    setErrors(newErrors);
    return valid;
  };

  const handleFieldChange = (fieldId: string, value: any, fullOption?: any) => {
    let storeValue = value;
    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        storeValue = value.map((i: any) =>
          typeof i === "string" || typeof i === "number"
            ? i
            : i.storeValue || i.label || i.value,
        );
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
        const allFields: FormField[] = [
          ...form.sections.flatMap((s) => s.fields),
          ...getAllSubformFields(form.subforms || []),
        ];
        const currentField = allFields.find(
          (f) => f.id === fieldId && f.type === "lookup",
        );
        if (currentField?.lookup) {
          const relatedFields = allFields.filter(
            (f) =>
              f.id !== fieldId &&
              f.type === "lookup" &&
              f.lookup?.sourceId === currentField.lookup?.sourceId,
          );
          relatedFields.forEach((relatedField) => {
            const matched = Object.values(fullOption.data).find(
              (d: any) =>
                d.field_label?.toLowerCase() ===
                relatedField.label.toLowerCase() && d.field_value,
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
  };

  const handleClearFile = (fieldId: string) => {
    setFormData((prev) => ({ ...prev, [fieldId]: "" }));
    if (fileInputRefs.current[fieldId]) {
      fileInputRefs.current[fieldId]!.value = "";
    }
    setErrors((prev) => {
      const e = { ...prev };
      delete e[fieldId];
      return e;
    });
  };

  const toggleSubform = (subformId: string) => {
    setCollapsedSubforms((prev) => ({
      ...prev,
      [subformId]: !prev[subformId],
    }));
  };

  const addSubformRow = (subformId: string) => {
    const newInstanceId = `${subformId}_instance_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    setDynamicSubformInstances((prev) => ({
      ...prev,
      [subformId]: [...(prev[subformId] || []), newInstanceId],
    }));
  };

  const removeSubformRow = (subformId: string, instanceId: string) => {
    setDynamicSubformInstances((prev) => ({
      ...prev,
      [subformId]: (prev[subformId] || []).filter((id) => id !== instanceId),
    }));
    setFormData((prev) => {
      const newData = { ...prev };
      Object.keys(newData).forEach((key) => {
        if (key.includes(instanceId)) {
          delete newData[key];
        }
      });
      return newData;
    });
  };

  const isViewOnly = formLevelPermission === "VIEW";
  const hasNoAccess = formLevelPermission === "NONE";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewOnly || hasNoAccess) {
      toast({
        title: "Permission Denied",
        description: "You only have view access to this form.",
        variant: "destructive",
      });
      return;
    }
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
        setSubmitting(false);
        return;
      }
      let attendanceHandled = false;
      const formNameLower = (form?.name || "").trim().toLowerCase();
      if (formNameLower === "check-in" || formNameLower === "checkin") {
        const response = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, action: "checkin" }),
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || "Check-In failed");
        attendanceHandled = true;
      } else if (
        formNameLower === "check-out" ||
        formNameLower === "checkout"
      ) {
        const response = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, action: "checkout" }),
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || "Check-Out failed");
        attendanceHandled = true;
      }
      const hasFields =
        form?.sections.some((s) => s.fields.length > 0) ||
        form?.subforms?.length > 0 ||
        false;
      if (hasFields || !attendanceHandled) {
        const dataToSubmit = { ...formData, ...formulaValues };
        const dynamicRowsData: Record<string, any> = {};
        Object.entries(dynamicSubformInstances).forEach(
          ([subformId, instances]) => {
            if (instances.length > 0) {
              dynamicRowsData[`_dynamicRows_${subformId}`] = instances.map(
                (instanceId, index) => {
                  const rowData: Record<string, any> = {
                    _rowIndex: index + 1,
                    _instanceId: instanceId,
                  };
                  Object.keys(dataToSubmit).forEach((key) => {
                    if (key.includes(`__${instanceId}`)) {
                      const cleanKey = key.replace(`__${instanceId}`, "");
                      rowData[cleanKey] = dataToSubmit[key];
                    }
                  });
                  return rowData;
                },
              );
            }
          },
        );
        const submitPayload = {
          recordData: { ...dataToSubmit, ...dynamicRowsData },
          submittedBy: "anonymous",
          userAgent: navigator.userAgent,
        };
        const res = await fetch(`/api/forms/${formId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submitPayload),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
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
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // handleDynamicFieldChange: the inner handler from renderDynamicField extracted as a reusable callback
  const handleDynamicFieldChange = useCallback(
    (fieldKey: string, value: any, field: FormField) => {
      let storeValue = value;
      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          storeValue = value.map((i: any) =>
          typeof i === "string" || typeof i === "number"
            ? i
            : i.storeValue || i.label || i.value,
        );
        } else if (value.storeValue !== undefined) {
          storeValue = value.storeValue;
        } else if (value instanceof File) {
          const reader = new FileReader();
          reader.onload = () => {
            setFormData((prev) => ({
              ...prev,
              [fieldKey]: reader.result as string,
            }));
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
      setFormData((prev) => ({
        ...prev,
        [fieldKey]: storeValue,
      }));
      setErrors((prev) => {
        const newErrors = { ...prev };
        const err = validateField(field, storeValue);
        if (err) newErrors[fieldKey] = err;
        else delete newErrors[fieldKey];
        return newErrors;
      });
    },
    [toast],
  );

  return {
    // state
    form,
    formData,
    errors,
    loading,
    submitting,
    submitted,
    locationStatus,
    formulaValues,
    sectionPermissions,
    fieldPermissions,
    collapsedSubforms,
    dynamicSubformInstances,
    isViewOnly,
    hasNoAccess,
    // dialog resize
    dialogSize,
    dialogRef,
    startResize,
    // derived
    rootItems,
    allFields,
    formulaFields,
    idToLabel,
    evaluatorFields,
    // handlers
    handleFieldChange,
    handleClearFile,
    toggleSubform,
    addSubformRow,
    removeSubformRow,
    handleSubmit,
    handleDynamicFieldChange,
    // visibility helpers
    isSectionVisible,
    isFieldVisible,
    evaluateSubformConditional,
    evaluateConditionalVisibility,
    isFieldVisibleDependingOnParent,
    getParentValueMemo,
    // misc
    hasErrorsOrMissingRequired,
    validateField,
    setFormData,
    setErrors,
  };
}
