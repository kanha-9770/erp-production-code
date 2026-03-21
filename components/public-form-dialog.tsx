

"use client";
import type React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Loader2,
  Send,
  MapPin,
  Calculator,
  Hash,
  ChevronDown,
  ChevronRight,
  Layers,
  Star,
  Lock,
} from "lucide-react";
import type { Form, FormField, Subform } from "@/types/form-builder";
import { LookupField } from "@/components/lookup-field";
import CameraCapture from "@/components/camera-capture";
import { FileUploadZone } from "./file-upload-zone";
import { getFormulaEvaluator } from "@/lib/formula/evaluator";
import { extractFieldReferences } from "@/lib/formula/parser";
import type { FormulaReturnType, BlankPreference } from "@/lib/formula/types";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { isValidPhoneNumber } from "react-phone-number-input";
import { useGetCurrentUserQuery } from "@/lib/api/auth";
import { useSubmitFormMutation, useTrackFormEventMutation, useCheckAttendanceMutation, useLazyGetTestingDataQuery, useLazyGetSectionPermissionsQuery, useLazyGetFormDetailQuery } from "@/lib/api/forms";
import { useLazyGetAdminPermissionsQuery } from "@/lib/api/permissions";

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

const getParentValue = (
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

interface PublicFormDialogProps {
  formId: string | null;
  isOpen: boolean;
  onClose: () => void;
  allowAdminPreview?: boolean;
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

export function PublicFormDialog({
  formId,
  isOpen,
  onClose,
  allowAdminPreview = false,
}: PublicFormDialogProps) {
  const { toast } = useToast();
  const { data: currentUserData } = useGetCurrentUserQuery(undefined, { skip: !isOpen });
  const [submitForm] = useSubmitFormMutation();
  const [trackFormEvent] = useTrackFormEventMutation();
  const [checkAttendance] = useCheckAttendanceMutation();
  const [triggerTestingData] = useLazyGetTestingDataQuery();
  const [triggerSectionPerms] = useLazyGetSectionPermissionsQuery();
  const [triggerFormDetail] = useLazyGetFormDetailQuery();
  const [triggerAdminPerms] = useLazyGetAdminPermissionsQuery();
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
  const [dialogSize, setDialogSize] = useState({ width: 1400, height: 700 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string>("");
  const resizeStart = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({ x: 0, y: 0, width: 0, height: 0 });
  const [collapsedSubforms, setCollapsedSubforms] = useState<
    Record<string, boolean>
  >({});
  const [dynamicSubformInstances, setDynamicSubformInstances] = useState<
    Record<string, string[]>
  >({});
  const dialogRef = useRef<HTMLDivElement>(null);

  const startResize = (
    e: React.MouseEvent<HTMLDivElement>,
    direction: string,
  ) => {
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
  };

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
    if (!isOpen || !currentUserData?.success || !currentUserData.user) return;
    const user = currentUserData.user;
    const fullName =
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      (user as any).name ||
      user.username ||
      "Current User";
    setCurrentUser({
      id: user.id,
      name: fullName,
      first_name: user.first_name ?? undefined,
      last_name: user.last_name ?? undefined,
      email: user.email,
    });
    // Ensure window global is always set so handleSubmit can find the userId
    (window as any).__currentUserId = user.id;
  }, [isOpen, currentUserData]);

  useEffect(() => {
    const fetchFormPermission = async () => {
      if (!formId || !isOpen) return;
      setFormPermissionLoading(true);
      try {
        const data = await triggerAdminPerms({ formId }).unwrap();
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
      } catch (err) {
        console.error("[FormPermission] Failed to fetch:", err);
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

  const evaluateSubformConditionalVisibility = (subform: Subform): boolean => {
    if (!subform.conditional) return true;
    const { type = "show", parentFieldId, value: targetValue } = subform.conditional;
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
      } catch (err) {
        console.error("Formula error for", field.label, err);
        newFormulaValues[field.id] = "";
        runningValues[field.id] = "";
      }
    });
    formulaValuesRef.current = newFormulaValues;
    setFormulaValues(newFormulaValues);
  }, [form, formulaFields, formData, evaluatorFields]);

  const triggerLocationFetch = useCallback(async () => {
    if (!form) return;
    const getAllSubformFields = (subforms: Subform[]): FormField[] => {
      let fields: FormField[] = [];
      subforms.forEach((subform) => {
        fields = [...fields, ...subform.fields];
        if (subform.childSubforms?.length) {
          fields = [...fields, ...getAllSubformFields(subform.childSubforms)];
        }
      });
      return fields;
    };
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
    const getAllSubformFields = (subforms: Subform[]): FormField[] => {
      let fields: FormField[] = [];
      subforms.forEach((subform) => {
        fields = [...fields, ...subform.fields];
        if (subform.childSubforms?.length) {
          fields = [...fields, ...getAllSubformFields(subform.childSubforms)];
        }
      });
      return fields;
    };
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
      .catch((error) => {
        console.error("System time API error:", error);
      });
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
      const result = await triggerFormDetail(formId).unwrap();
      if (!result.success) throw new Error(result.error);
      if (!result.data.isPublished && !allowAdminPreview)
        throw new Error("This form is not published");
      let formulaResult: any = { success: false };
      try {
        formulaResult = await triggerTestingData().unwrap();
      } catch { /* formula endpoint unavailable – skip enrichment */ }
      if (formulaResult.success && Array.isArray(formulaResult.data)) {
        const formulas = formulaResult.data;
        result.data.sections.forEach((section: any) => {
          section.fields.forEach((field: FormField) => {
            const matchingFormula = formulas.find(
              (f: any) => f.formFieldId === field.id,
            );
            if (matchingFormula && matchingFormula.formField) {
              const formulaFieldType = matchingFormula.formField.type;
              if (
                formulaFieldType === "formula" ||
                formulaFieldType === "expression"
              ) {
                field.type = "formula";
                const existingConfig = field.properties?.formulaConfig || {};
                const config: FormulaConfig = {
                  fieldLabel: matchingFormula.formField.label || field.label,
                  expression: matchingFormula.expression,
                  returnType: matchingFormula.returnType,
                  decimalPlaces:
                    matchingFormula.formField.decimalPlaces ||
                    field.decimalPlaces ||
                    2,
                  blankPreference: matchingFormula.blankPreference,
                  visibleInForm: existingConfig.visibleInForm ?? true,
                };
                field.properties = {
                  ...field.properties,
                  formulaConfig: config,
                };
                if (
                  matchingFormula.formField.label &&
                  matchingFormula.formField.label !== field.label
                ) {
                  field.label = matchingFormula.formField.label;
                }
              }
            }
          });
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
          const data = await triggerSectionPerms(id).unwrap();
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
      await trackFormEvent({
        formId,
        body: {
          eventType: "view",
          payload: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          },
        },
      }).unwrap();
    } catch (error) {
      console.error("Track view failed:", error);
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
        });
        const getAllSubformFields = (subforms: Subform[]): FormField[] => {
          let fields: FormField[] = [];
          subforms.forEach((subform) => {
            fields = [...fields, ...subform.fields];
            if (subform.childSubforms?.length) {
              fields = [
                ...fields,
                ...getAllSubformFields(subform.childSubforms),
              ];
            }
          });
          return fields;
        };
        allFields.push(...getAllSubformFields(form.subforms || []));
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
        const data = await checkAttendance({ userId, action: "checkin" }).unwrap();
        if (!data.success) throw new Error(data.error || "Check-In failed");
        attendanceHandled = true;
      } else if (
        formNameLower === "check-out" ||
        formNameLower === "checkout"
      ) {
        const data = await checkAttendance({ userId, action: "checkout" }).unwrap();
        if (!data.success) throw new Error(data.error || "Check-Out failed");
        attendanceHandled = true;
      }
      const hasFields =
        form?.sections.some((s) => s.fields.length > 0) ||
        form?.subforms?.length > 0 ||
        false;
      if (form && !form.isPublished && !allowAdminPreview) {
        toast({
          title: "Form Unpublished",
          description: "This form is not published and cannot be submitted.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      if (hasFields || !attendanceHandled) {
        const dataToSubmit = { ...formData, ...formulaValues };

        // Normalize address fields: convert stored JSON/object into a single formatted string
        const addressFields = (allFields || []).filter((f) => (f.type || "").toLowerCase() === "address");
        const formatAddress = (val: any, field?: FormField) => {
          if (!val) return "";
          let addr = val;
          if (typeof val === "string") {
            try {
              addr = JSON.parse(val);
            } catch {
              // not JSON, return as-is
              return String(val);
            }
          }
          if (typeof addr !== "object") return String(addr);
          const subfields = field?.properties?.subfields || [
            { key: "line1" },
            { key: "line2" },
            { key: "city" },
            { key: "state" },
            { key: "postal" },
            { key: "country" },
          ];
          const parts: string[] = [];
          for (const s of subfields) {
            const k = s.key;
            const v = addr[k] ?? addr[k.toUpperCase()] ?? addr[k.toLowerCase()];
            if (v !== undefined && v !== null && String(v).trim() !== "") parts.push(String(v).trim());
          }
          return parts.join(", ");
        };
        for (const f of addressFields) {
          const id = f.id;
          if (dataToSubmit[id] !== undefined && dataToSubmit[id] !== null) {
            dataToSubmit[id] = formatAddress(dataToSubmit[id], f);
          }
        }
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
          submittedBy: userId || currentUser?.id || "anonymous",
          userAgent: navigator.userAgent,
        };
        console.debug('[PublicForm] Submitting form', { formId, userId, currentUser });
        await submitForm({ formId: formId!, body: submitPayload }).unwrap();
      }
      setSubmitted(true);
      toast({
        title: "Success!",
        description: form?.submissionMessage || "Form submitted successfully!",
      });
      await trackFormEvent({
        formId: formId!,
        body: {
          eventType: "submit",
          payload: {
            recordId: attendanceHandled ? "attendance" : "form",
            timestamp: new Date().toISOString(),
          },
        },
      }).unwrap();
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

  const renderDynamicField = (
    field: FormField,
    fieldKey: string,
    isInSubform: boolean = false,
    forceReadOnly: boolean = false,
  ) => {
    const value = formData[fieldKey];
    const error = errors[fieldKey];
    const fieldType = (field.type || "").toLowerCase();

    const handleDynamicFieldChange = (newValue: any, fullOption?: any) => {
      if (forceReadOnly) return;
      let storeValue = newValue;
      if (newValue && typeof newValue === "object") {
        if (Array.isArray(newValue)) {
          storeValue = newValue.map((i) => i.storeValue || i.label || i.value);
        } else if (newValue.storeValue !== undefined) {
          storeValue = newValue.storeValue;
        } else if (newValue instanceof File) {
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
          reader.readAsDataURL(newValue);
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
    };

    switch (fieldType) {
      case "phone":
      case "phone-input": {
        const phoneValue = value || "";
        const isInvalid = phoneValue && !isValidPhoneNumber(phoneValue);
        return (
          <div className="space-y-1">
            <PhoneInput
              international
              countryCallingCodeEditable={false}
              defaultCountry={field.defaultCountry || "IN"}
              preferredCountries={
                field.preferredCountries || [
                  "IN",
                  "US",
                  "GB",
                  "AE",
                  "CA",
                  "AU",
                  "DE",
                  "FR",
                  "SA",
                ]
              }
              placeholder={field.placeholder || "Enter phone number"}
              value={phoneValue}
              onChange={(newValue) => handleDynamicFieldChange(newValue)}
              disabled={submitting || submitted || (field.readonly ?? false) || forceReadOnly}
              numberInputProps={{
                className: `flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm
                ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium
                placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50
                ${field.readonly ? "bg-muted cursor-not-allowed" : ""}
                ${isInvalid ? "border-red-500" : "border-input"} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
                  }`,
              }}
              countrySelectProps={{ className: "rounded-l-md border-r-0" }}
            />
          </div>
        );
      }
      case "text":
      case "email":
      case "number":
      case "tel":
      case "url":
        return (
          <Input
            id={fieldKey}
            disabled={submitting || submitted || (field.readonly ?? false) || forceReadOnly}
            type={field.type}
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => handleDynamicFieldChange(e.target.value)}
            readOnly={field.readonly ?? false}
            className={`${error ? "border-red-500" : ""} ${field.readonly ? "bg-muted cursor-not-allowed" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""}`}
          />
        );
      case "password":
        return (
          <Input
            id={fieldKey}
            disabled={submitting || submitted || forceReadOnly}
            className={error ? "border-red-500" : ""}
            type="password"
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => handleDynamicFieldChange(e.target.value)}
            className={`${error ? "border-red-500" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );
      case "textarea":
        return (
          <Textarea
            id={fieldKey}
            disabled={submitting || submitted || forceReadOnly}
            className={error ? "border-red-500" : ""}
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => handleDynamicFieldChange(e.target.value)}
            rows={3}
            className={`${error ? "border-red-500" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );
      case "date":
        return (
          <Input
            id={fieldKey}
            disabled={submitting || submitted || forceReadOnly}
            className={error ? "border-red-500" : ""}
            type="date"
            value={value || ""}
            onChange={(e) => handleDynamicFieldChange(e.target.value)}
            readOnly={field.readonly}
            className={`${error ? "border-red-500" : ""} ${field.readonly ? "bg-muted cursor-not-allowed" : ""} ${isInSubform ? "border-purple-200" : ""}`}
          />
        );
      case "time":
        return (
          <Input
            id={fieldKey}
            disabled={submitting || submitted || forceReadOnly}
            className={error ? "border-red-500" : ""}
            type="time"
            value={value || ""}
            onChange={(e) => handleDynamicFieldChange(e.target.value)}
            readOnly={field.readonly}
            className={`${error ? "border-red-500" : ""} ${field.readonly ? "bg-muted cursor-not-allowed" : ""
              } ${isInSubform ? "border-purple-200" : ""}`}
          />
        );
      case "datetime":
        return (
          <Input
            id={fieldKey}
            disabled={submitting || submitted || forceReadOnly}
            className={error ? "border-red-500" : ""}
            type="datetime-local"
            value={value || ""}
            onChange={(e) => handleDynamicFieldChange(e.target.value)}
            readOnly={field.readonly}
            className={`${error ? "border-red-500" : ""} ${field.readonly ? "bg-muted cursor-not-allowed" : ""
              } ${isInSubform ? "border-purple-200" : ""}`}
          />
        );
      case "checkbox":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={fieldKey}
              checked={value || false}
              onCheckedChange={(c) => handleDynamicFieldChange(c)}
              disabled={submitting || submitted || forceReadOnly}
            />
            <Label htmlFor={fieldKey} className="text-sm">
              {field.label}
            </Label>
          </div>
        );
      case "switch":
        return (
          <div className="flex items-center space-x-2">
            <Switch
              id={fieldKey}
              checked={value || false}
              onCheckedChange={(c) => handleDynamicFieldChange(c)}
              disabled={submitting || submitted || forceReadOnly}
            />
            <Label htmlFor={fieldKey} className="text-sm">
              {field.label}
            </Label>
          </div>
        );
      case "radio":
        const radioOptions = Array.isArray(field.options) ? field.options : [];
        return (
          <RadioGroup
            value={value || ""}
            onValueChange={(v) => handleDynamicFieldChange(v)}
            disabled={submitting || submitted || forceReadOnly}
          >
            {radioOptions.map((opt: any) => (
              <div key={opt.value} className="flex items-center space-x-2">
                <RadioGroupItem
                  value={opt.value}
                  id={`${fieldKey}-${opt.value}`}
                />
                <Label htmlFor={`${fieldKey}-${opt.value}`} className="text-sm">
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );
      case "select":
        const selectOptions = Array.isArray(field.options) ? field.options : [];
        return (
          <Select
            value={value || ""}
            onValueChange={(v) => handleDynamicFieldChange(v)}
            disabled={submitting || submitted || forceReadOnly}
          >
            <SelectTrigger
              className={`${error ? "border-red-500" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
                }`}
            >
              <SelectValue
                placeholder={field.placeholder || "Select an option"}
              />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map((opt: any) => (
                <SelectItem
                  key={opt.value || opt.id}
                  value={(opt.value || opt.id)?.toLowerCase().trim()}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "file":
      case "image":
      case "video":
      case "signature":
        return (
          <FileUploadZone
            fieldType={fieldType as "image" | "file" | "signature" | "video"}
            currentValue={value}
            onUploadComplete={(url) => handleDynamicFieldChange(url)}
            onClear={() => handleDynamicFieldChange("")}
            disabled={submitting || submitted || forceReadOnly}
            maxSize={10}
          />
        );
      case "hidden":
        return (
          <Input
            id={fieldKey}
            type="hidden"
            value={value || field.defaultValue || ""}
          />
        );
      default:
        return (
          <Input
            id={fieldKey}
            disabled={submitting || submitted || forceReadOnly}
            className={error ? "border-red-500" : ""}
            placeholder={field.placeholder || ""}
            value={value || ""}
            onChange={(e) => handleDynamicFieldChange(e.target.value)}
            className={`${error ? "border-red-500" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
              }`}
          />
        );
    }
  };

  const renderField = (field: FormField, isInSubform: boolean = false, forceReadOnly: boolean = false) => {
    if (field.visible === false || field.properties?.hidden === true)
      return null;
    const value = formData[field.id];
    const error = errors[field.id];
    const fieldType = (field.type || "").toLowerCase();
    const isLocation = fieldType === "location" || fieldType === "newlocation";
    const autoFetch = isLocation && field.properties?.autoFetchLocation;
    const status = locationStatus[field.id] || "idle";
    const isReadOnly = field.readonly || (autoFetch && status === "success") || forceReadOnly;
    const fieldProps = {
      id: field.id,
      disabled: submitting || submitted || isReadOnly,
      className: error ? "border-red-500" : "",
    };
    const options = Array.isArray(field.options) ? field.options : [];

    switch (fieldType) {
      case "phone":
      case "phone-input": {
        const phoneValue = value || "";
        const isInvalid = phoneValue && !isValidPhoneNumber(phoneValue);
        const validatePhone = (val: string | undefined): string | null => {
          if (!val) {
            if (field.validation?.required) return `${field.label} is required`;
            return null;
          }
          if (!isValidPhoneNumber(val)) {
            if (val.length < 8) return "Phone number is too short";
            if (!val.startsWith("+"))
              return "Please include country code (e.g. +91)";
            return "Please enter a valid phone number";
          }
          return null;
        };
        return (
          <div className="space-y-1">
            <PhoneInput
              international
              countryCallingCodeEditable={false}
              defaultCountry={field.defaultCountry || "IN"}
              preferredCountries={
                field.preferredCountries || [
                  "IN",
                  "US",
                  "GB",
                  "AE",
                  "CA",
                  "AU",
                  "DE",
                  "FR",
                  "SA",
                ]
              }
              placeholder={field.placeholder || "Enter phone number"}
              value={phoneValue}
              onChange={(newValue) => {
                handleFieldChange(field.id, newValue);
                const err = validatePhone(newValue);
                setErrors((prev) => ({ ...prev, [field.id]: err || "" }));
              }}
              disabled={submitting || submitted || isReadOnly}
              numberInputProps={{
                className: `flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm
                  ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium
                  placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50
                  ${isReadOnly ? "bg-muted cursor-not-allowed" : ""}
                  ${isInvalid ? "border-red-500" : "border-input"} ${isInSubform
                    ? "border-purple-200 focus:border-purple-400"
                    : ""
                  }`,
              }}
              countrySelectProps={{ className: "rounded-l-md border-r-0" }}
            />
            {errors[field.id] && (
              <p className="text-sm text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                {errors[field.id]}
              </p>
            )}
          </div>
        );
      }
      case "formula": {
        const formulaConfig = field.properties?.formulaConfig as
          | FormulaConfig
          | undefined;
        const calculatedValue = formulaValues[field.id];
        const displayValue =
          calculatedValue !== undefined && calculatedValue !== ""
            ? String(calculatedValue)
            : "—";
        const returnType = formulaConfig?.returnType || "Number";
        const displayExpression = formulaConfig?.expression.replace(
          /\{([^}]+)\}/g,
          (match, id) => `{${idToLabel[id] || id}}`,
        );
        return (
          <div className="space-y-1">
            <div className="relative">
              <Input
                {...fieldProps}
                type="text"
                value={displayValue}
                readOnly
                className={`${fieldProps.className
                  } bg-muted/50 cursor-not-allowed font-medium pl-10
                  ${returnType === "Currency"
                    ? "text-green-700"
                    : returnType === "Number"
                      ? "text-blue-700"
                      : ""
                  }
                  ${isInSubform ? "border-purple-200" : ""}`}
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Calculator className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            {formulaConfig?.expression && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="font-mono bg-muted px-1 rounded text-xs">
                  {displayExpression.length > 40
                    ? displayExpression.substring(0, 40) + "..."
                    : displayExpression}
                </span>
              </p>
            )}
          </div>
        );
      }
      case "unique-id": {
        return (
          <div className="space-y-2">
            <div className="relative">
              <Input
                type="text"
                value="Will be generated on submit"
                readOnly
                className="bg-muted/50 cursor-not-allowed font-mono text-sm italic text-muted-foreground pl-10"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Hash className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <input type="hidden" name={field.id} value="" />
          </div>
        );
      }
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
            readOnly={isReadOnly}
            className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""}`}
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
            readOnly={isReadOnly}
            className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""}`}
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
            readOnly={isReadOnly}
            className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""}`}
          />
        );
      case "date":
        return (
          <Input
            {...fieldProps}
            type="date"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            readOnly={field.readonly || field.properties?.autoFetchDate}
            className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""
              } ${isInSubform ? "border-purple-200" : ""}`}
          />
        );
      case "time":
        return (
          <Input
            {...fieldProps}
            type="time"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            readOnly={field.readonly || field.properties?.autoFetchTime}
            className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""
              } ${isInSubform ? "border-purple-200" : ""}`}
          />
        );
      case "datetime":
        return (
          <Input
            {...fieldProps}
            type="datetime-local"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            readOnly={isReadOnly}
            className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""
              } ${isInSubform ? "border-purple-200" : ""}`}
          />
        );
      case "location":
      case "newlocation":
        let placeholder = field.placeholder || "Enter location";
        let icon: React.ReactNode = null;
        if (autoFetch) {
          if (status === "fetching") {
            placeholder = "Fetching your location…";
            icon = (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            );
          } else if (status === "failed") {
            placeholder = "Location denied – type manually";
            icon = <MapPin className="h-4 w-4 text-amber-600" />;
          } else if (status === "success") {
            placeholder = "Location auto-filled";
            icon = <MapPin className="h-4 w-4 text-green-600" />;
          } else if (status === "idle") {
            placeholder = "Click anywhere to allow location";
            icon = <MapPin className="h-4 w-4 text-muted-foreground" />;
          }
        }
        return (
          <div className="space-y-1">
            <div className="relative">
              <Input
                {...fieldProps}
                type="text"
                placeholder={placeholder}
                value={value || ""}
                readOnly={isReadOnly}
                className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""
                  } pl-10 ${isInSubform ? "border-purple-200" : ""}`}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
              />
              {icon && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {icon}
                </div>
              )}
            </div>
            {autoFetch && status === "failed" && (
              <p className="text-xs text-amber-600">
                Enable location in browser settings or type your address.
              </p>
            )}
          </div>
        );
      case "checkbox":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.id}
              checked={value || false}
              onCheckedChange={(c) => handleFieldChange(field.id, c)}
              disabled={submitting || submitted || isReadOnly}
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
              onCheckedChange={(c) => handleFieldChange(field.id, c)}
              disabled={submitting || submitted || isReadOnly}
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
            onValueChange={(v) => handleFieldChange(field.id, v)}
            disabled={submitting || submitted || isReadOnly}
          >
            {options.map((opt: any) => (
              <div key={opt.value} className="flex items-center space-x-2">
                <RadioGroupItem
                  value={opt.value}
                  id={`${field.id}-${opt.value}`}
                />
                <Label htmlFor={`${field.id}-${opt.value}`} className="text-sm">
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );
      case "select": {
        let effectiveOptions: any[] = [];
        if (
          field.isDependent &&
          field.parentFieldId &&
          field.dependentGroups?.length
        ) {
          const parentValueRaw = getParentValueMemo(field);
          const parentValue =
            typeof parentValueRaw === "string" ? parentValueRaw : undefined;
          if (parentValue) {
            const matchingGroup = field.dependentGroups.find(
              (g) => g.parentValue === parentValue,
            );
            if (matchingGroup?.options?.length) {
              effectiveOptions = matchingGroup.options;
            } else {
              effectiveOptions = [];
            }
          } else {
            effectiveOptions = [];
          }
        } else {
          effectiveOptions = options;
        }
        const isDisabledDueToParent =
          field.isDependent && !getParentValueMemo(field);
        return (
          <div className="space-y-1">
            <Select
              value={value || ""}
              onValueChange={(v) => handleFieldChange(field.id, v)}
              disabled={
                submitting || submitted || isDisabledDueToParent || isReadOnly
              }
            >
              <SelectTrigger
                className={`
                ${error ? "border-red-500" : ""}
                ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""}
              `}
              >
                <SelectValue
                  placeholder={field.placeholder || "Select an option"}
                />
              </SelectTrigger>
              <SelectContent>
                {effectiveOptions.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                    {field.isDependent
                      ? getParentValueMemo(field)
                        ? "No options available for this selection"
                        : "Select parent field first"
                      : "No options defined"}
                  </div>
                ) : (
                  effectiveOptions.map((opt) => (
                    <SelectItem
                      key={opt.value || opt.id}
                      value={opt.value || opt.id || ""}
                    >
                      {opt.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {field.isDependent && (
              <p className="text-xs text-muted-foreground mt-1">
                Depends on:{" "}
                {idToLabel[field.parentFieldId!] || field.parentFieldId}
              </p>
            )}
            {field.isDependent && !getParentValueMemo(field) && (
              <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Select a value in "
                {idToLabel[field.parentFieldId!] || field.parentFieldId}" first
              </p>
            )}
            {effectiveOptions.length === 0 &&
              getParentValueMemo(field) &&
              field.isDependent && (
                <p className="text-xs text-amber-700 mt-1.5">
                  No matching options for "{getParentValueMemo(field)}"
                </p>
              )}
            {error && (
              <p className="text-sm text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
          </div>
        );
      }
      case "slider":
        return (
          <div className="space-y-2">
            <Slider
              value={[value || 0]}
              onValueChange={(vals) => handleFieldChange(field.id, vals[0])}
              max={field.validation?.max || 100}
              min={field.validation?.min || 0}
              step={1}
              disabled={submitting || submitted || isReadOnly}
            />
            <div className="text-center text-sm text-muted-foreground">
              Value: {value || 0}
            </div>
          </div>
        );
      case "rating":
        return (
          <div className="flex items-center space-x-2">
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleFieldChange(field.id, r)}
                disabled={submitting || submitted || isReadOnly}
                className="p-1 hover:scale-110 transition-transform"
              >
                <Star
                  className={`h-4 w-4 ${r <= (value || 0)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300"
                    }`}
                />
              </button>
            ))}
            <span className="pl-2 text-sm text-muted-foreground">
              {value ? `${value}/5` : "Not rated"}
            </span>
          </div>
        );
      case "lookup":
        const lookupData = {
          id: field.id,
          label: field.label,
          type: field.type,
          placeholder: field.placeholder,
          description: field.description,
          validation: field.validation || { required: false },
          lookup: field.lookup ?? undefined,
        };
        // Resolve parent value for dependency filtering
        let lookupParentVal: string | undefined;
        const depCfg = (field.lookup as any)?.dependency;
        if (depCfg?.parentFieldLabel) {
          const parentFld = allFields.find((f) => f.label === depCfg.parentFieldLabel);
          if (parentFld && formData[parentFld.id] != null) {
            lookupParentVal = String(formData[parentFld.id]);
          }
        }
        return (
          <LookupField
            field={lookupData}
            value={value}
            onChange={(v, fullOption) =>
              handleFieldChange(field.id, v, fullOption)
            }
            disabled={submitting || submitted || isReadOnly}
            error={error}
            parentValue={lookupParentVal}
          />
        );
      case "file":
      case "image":
      case "video":
      case "signature":
        return (
          <FileUploadZone
            fieldType={fieldType as "image" | "file" | "signature" | "video"}
            currentValue={value}
            onUploadComplete={(url) => handleFieldChange(field.id, url)}
            onClear={() => handleClearFile(field.id)}
            disabled={submitting || submitted || isReadOnly}
            maxSize={10}
          />
        );
      case "camera":
        return (
          <CameraCapture
            onCapture={(img) => handleFieldChange(field.id, img)}
            capturedImage={value || null}
            onClear={() => handleFieldChange(field.id, "")}
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
      case "user":
        return (
          <div className="space-y-1">
            <Input
              {...fieldProps}
              type="text"
              value={value || ""}
              readOnly
              className="bg-muted/70 cursor-not-allowed"
            />
            <p className="text-xs text-emerald-700">
              Auto-filled with current user: <strong>{value || "—"}</strong>
            </p>
          </div>
        );
      case "address": {
        const subfields = field.properties?.subfields || [
          {
            key: "line1",
            label: "Address Line 1",
            placeholder: "Street address, house no.",
            required: true,
          },
          {
            key: "line2",
            label: "Address Line 2",
            placeholder: "Apartment, suite, floor",
            required: false,
          },
          {
            key: "city",
            label: "City / District",
            placeholder: "Enter City",
            required: true,
          },
          {
            key: "state",
            label: "State / Province",
            placeholder: "Enter State",
            required: true,
          },
          {
            key: "postal",
            label: "Postal / Zip Code",
            placeholder: "Enter Postal Code",
            required: true,
          },
          {
            key: "country",
            label: "Country",
            type: "select",
            placeholder: "Select country",
            required: true,
          },
        ];
        const addressValue = (value as Record<string, string>) || {};
        const handleSubChange = (subKey: string, subVal: string) => {
          const newAddress = { ...addressValue, [subKey]: subVal };
          handleFieldChange(field.id, newAddress);
        };
        return (
          <div className="space-y-4 p-4 border border-gray-200 rounded-md bg-gray-50/60">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subfields.map((sub: any) => {
                if (!sub) return null;
                const subVal = addressValue[sub.key] || "";
                const isRequired = sub.required && field.validation?.required;
                if (sub.type === "select") {
                  const countries = [
                    "Afghanistan",
                    "Albania",
                    "Algeria",
                    "Andorra",
                    "Angola",
                    "Argentina",
                    "Armenia",
                    "Australia",
                    "Austria",
                    "Azerbaijan",
                    "Bahamas",
                    "Bahrain",
                    "Bangladesh",
                    "Barbados",
                    "Belarus",
                    "Belgium",
                    "Belize",
                    "Benin",
                    "Bhutan",
                    "Bolivia",
                    "Bosnia and Herzegovina",
                    "Botswana",
                    "Brazil",
                    "Brunei",
                    "Bulgaria",
                    "Burkina Faso",
                    "Burundi",
                    "Cambodia",
                    "Cameroon",
                    "Canada",
                    "Cape Verde",
                    "Central African Republic",
                    "Chad",
                    "Chile",
                    "China",
                    "Colombia",
                    "Comoros",
                    "Congo",
                    "Costa Rica",
                    "Croatia",
                    "Cuba",
                    "Cyprus",
                    "Czech Republic",
                    "Denmark",
                    "Djibouti",
                    "Dominica",
                    "Dominican Republic",
                    "Ecuador",
                    "Egypt",
                    "El Salvador",
                    "Equatorial Guinea",
                    "Eritrea",
                    "Estonia",
                    "Eswatini",
                    "Ethiopia",
                    "Fiji",
                    "Finland",
                    "France",
                    "Gabon",
                    "Gambia",
                    "Georgia",
                    "Germany",
                    "Ghana",
                    "Greece",
                    "Grenada",
                    "Guatemala",
                    "Guinea",
                    "Guyana",
                    "Haiti",
                    "Honduras",
                    "Hungary",
                    "Iceland",
                    "India",
                    "Indonesia",
                    "Iran",
                    "Iraq",
                    "Ireland",
                    "Israel",
                    "Italy",
                    "Jamaica",
                    "Japan",
                    "Jordan",
                    "Kazakhstan",
                    "Kenya",
                    "Kiribati",
                    "Kuwait",
                    "Kyrgyzstan",
                    "Laos",
                    "Latvia",
                    "Lebanon",
                    "Lesotho",
                    "Liberia",
                    "Libya",
                    "Liechtenstein",
                    "Lithuania",
                    "Luxembourg",
                    "Madagascar",
                    "Malawi",
                    "Malaysia",
                    "Maldives",
                    "Mali",
                    "Malta",
                    "Marshall Islands",
                    "Mauritania",
                    "Mauritius",
                    "Mexico",
                    "Micronesia",
                    "Moldova",
                    "Monaco",
                    "Mongolia",
                    "Montenegro",
                    "Morocco",
                    "Mozambique",
                    "Myanmar",
                    "Namibia",
                    "Nauru",
                    "Nepal",
                    "Netherlands",
                    "New Zealand",
                    "Nicaragua",
                    "Niger",
                    "Nigeria",
                    "North Korea",
                    "North Macedonia",
                    "Norway",
                    "Oman",
                    "Pakistan",
                    "Palau",
                    "Panama",
                    "Papua New Guinea",
                    "Paraguay",
                    "Peru",
                    "Philippines",
                    "Poland",
                    "Portugal",
                    "Qatar",
                    "Romania",
                    "Russia",
                    "Rwanda",
                    "Saint Kitts and Nevis",
                    "Saint Lucia",
                    "Saint Vincent and the Grenadines",
                    "Samoa",
                    "San Marino",
                    "Sao Tome and Principe",
                    "Saudi Arabia",
                    "Senegal",
                    "Serbia",
                    "Seychelles",
                    "Sierra Leone",
                    "Singapore",
                    "Slovakia",
                    "Slovenia",
                    "Solomon Islands",
                    "Somalia",
                    "South Africa",
                    "South Korea",
                    "South Sudan",
                    "Spain",
                    "Sri Lanka",
                    "Sudan",
                    "Suriname",
                    "Sweden",
                    "Switzerland",
                    "Syria",
                    "Taiwan",
                    "Tajikistan",
                    "Tanzania",
                    "Thailand",
                    "Timor-Leste",
                    "Togo",
                    "Tonga",
                    "Trinidad and Tobago",
                    "Tunisia",
                    "Turkey",
                    "Turkmenistan",
                    "Tuvalu",
                    "Uganda",
                    "Ukraine",
                    "United Arab Emirates",
                    "United Kingdom",
                    "United States",
                    "Uruguay",
                    "Uzbekistan",
                    "Vanuatu",
                    "Vatican City",
                    "Venezuela",
                    "Vietnam",
                    "Yemen",
                    "Zambia",
                    "Zimbabwe",
                  ].sort();
                  return (
                    <div key={sub.key} className="space-y-1.5">
                      <Label className="text-sm font-medium">
                        {sub.label}
                        {isRequired && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </Label>
                      <Select
                        value={subVal}
                        onValueChange={(v) => handleSubChange(sub.key, v)}
                        disabled={submitting || submitted || isViewOnly}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue
                            placeholder={sub.placeholder || "Select country"}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {countries.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                return (
                  <div key={sub.key} className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      {sub.label}
                      {isRequired && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </Label>
                    <Input
                      placeholder={sub.placeholder}
                      value={subVal}
                      onChange={(e) => handleSubChange(sub.key, e.target.value)}
                      disabled={submitting || submitted || isViewOnly}
                      className="bg-white"
                    />
                  </div>
                );
              })}
            </div>
            {error && (
              <p className="text-sm text-red-500 flex items-center gap-1 mt-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
          </div>
        );
      }
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

  const renderSubform = (
    subform: Subform,
    level: number = 0,
    parentPath: string = "",
  ) => {
    if (!isSectionVisible(subform.id)) return null;
    const colorScheme = NESTING_COLORS[level % NESTING_COLORS.length];
    const isCollapsed =
      collapsedSubforms[subform.id] ?? subform.collapsed ?? false;
    const currentPath = parentPath
      ? `${parentPath} > ${subform.name}`
      : subform.name;
    const pathParts = currentPath.split(" > ");
    const visibleFields = subform.fields.filter((f) =>
      isFieldVisible(f, subform.id),
    );
    const visibleChildSubforms = (subform.childSubforms || []).filter((sf) =>
      isSectionVisible(sf.id),
    );
    const allItems = [
      ...visibleFields.map((f) => ({
        type: "field" as const,
        item: f,
        id: f.id,
        order: f.order,
      })),
      ...visibleChildSubforms.map((sf, idx) => ({
        type: "subform" as const,
        item: sf,
        id: sf.id,
        order: sf.order ?? idx,
      })),
    ].sort((a, b) => a.order - b.order);
    const hasChildSubforms = visibleChildSubforms.length > 0;
    const instances = dynamicSubformInstances[subform.id] || [];
    const allInstances = hasChildSubforms
      ? instances
      : ["original", ...instances];

    const getFieldTypeLabel = (type: string) => {
      switch (type) {
        case "textarea":
          return "Multi-Line";
        case "text":
          return "Single Line";
        case "number":
          return "Number";
        default:
          return type.charAt(0).toUpperCase() + type.slice(1);
      }
    };



    return (
      <div
        key={subform.id}
        className={`rounded-lg border border-gray-200 shadow-sm ${colorScheme.leftBorder} ${colorScheme.bg} ${level > 0 ? "ml-8 mt-6" : ""}`}
      >
        <div className="p-4 border-b bg-white/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleSubform(subform.id)}
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
              <Layers className={`w-5 h-5 ${colorScheme.accent}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-semibold">{subform.name}</h4>
                  <Badge
                    variant="outline"
                    className={`text-xs ${colorScheme.levelBadge}`}
                  >
                    Level {level}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {visibleFields.length} field
                    {visibleFields.length !== 1 ? "s" : ""}
                  </Badge>
                  {visibleChildSubforms.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {visibleChildSubforms.length} nested
                    </Badge>
                  )}
                  {(dynamicSubformInstances[subform.id]?.length || 0) > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                    >
                      +{dynamicSubformInstances[subform.id].length} row
                      {dynamicSubformInstances[subform.id].length !== 1
                        ? "s"
                        : ""}
                    </Badge>
                  )}
                </div>
                {level > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    Path:{" "}
                    {pathParts.map((p, i) => (
                      <span key={i} className="flex items-center">
                        <span
                          className={
                            i === pathParts.length - 1
                              ? "font-medium text-gray-700"
                              : ""
                          }
                        >
                          {p}
                        </span>
                        {i < pathParts.length - 1 && (
                          <ChevronRight className="w-3 h-3 mx-1" />
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {subform.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {subform.description}
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addSubformRow(subform.id)}
              disabled={submitting || submitted || isViewOnly}
              className="ml-2 whitespace-nowrap"
            >
              <span className="mr-1">+</span> Add Row
            </Button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="p-5 space-y-6">
            {hasChildSubforms ? (
              allItems.length > 0 ? (
                allItems.map((item) =>
                  item.type === "field" ? (
                    <div key={item.id} className="space-y-2">
                      {(item.item as FormField).type !== "checkbox" &&
                        (item.item as FormField).type !== "switch" &&
                        (item.item as FormField).type !== "hidden" && (
                          <Label
                            htmlFor={(item.item as FormField).id}
                            className="text-sm font-medium flex items-center gap-2"
                          >
                            {(item.item as FormField).label}
                            {(item.item as FormField).validation?.required && (
                              <span className="text-red-500">*</span>
                            )}
                          </Label>
                        )}
                      {(item.item as FormField).description &&
                        (item.item as FormField).type !== "hidden" && (
                          <p className="text-xs text-muted-foreground">
                            {(item.item as FormField).description}
                          </p>
                        )}
                      {renderField(item.item as FormField, true, isViewOnly)}
                      {errors[(item.item as FormField).id] && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {errors[(item.item as FormField).id]}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div key={item.id} className="ml-4 mt-4">
                      {renderSubform(
                        item.item as Subform,
                        level + 1,
                        currentPath,
                      )}
                    </div>
                  ),
                )
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center border-gray-300 bg-gray-50/50">
                  <Layers
                    className={`w-8 h-8 mx-auto mb-3 ${colorScheme.accent} opacity-70`}
                  />
                  <p className="text-sm text-gray-600">
                    No fields or nested subforms yet
                  </p>
                </div>
              )
            ) : null}

            {((hasChildSubforms && instances.length > 0) ||
              !hasChildSubforms) &&
              visibleFields.length > 0 && (
                <div
                  className={
                    hasChildSubforms
                      ? "mt-6 pt-6 border-t-2 border-dashed border-gray-300 space-y-4"
                      : "space-y-4"
                  }
                >
                  {hasChildSubforms && (
                    <p className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <span className="text-blue-600">Additional Rows</span>
                    </p>
                  )}
                  <div className="overflow-x-auto custom-scrollbar w-full">
                    {/* Header */}
                    <div className="flex min-w-max border-b border-slate-200">
                      {visibleFields
                        .filter((field) => {
                          if (field.type === "formula") {
                            const cfg = field.properties?.formulaConfig;
                            return cfg?.visibleInForm !== false;
                          }
                          return true;
                        })
                        .map((field) => (
                          <div
                            key={field.id}
                            className={`p-4 border-r border-slate-200 flex flex-col justify-between ${field.type === "hidden" ||
                              (field.type === "formula" &&
                                field.properties?.formulaConfig
                                  ?.visibleInForm === false)
                              ? "hidden p-0 min-w-0"
                              : "min-w-[280px] bg-[#f8f9fb]"
                              }`}
                          >
                            <span className="font-medium text-[#374151] text-[15px] truncate">
                              {field.label}{" "}
                              {field.validation?.required && (
                                <span className="text-red-500">*</span>
                              )}
                            </span>
                            <div className="text-[#a1b0cb] text-[13px]">
                              {getFieldTypeLabel(field.type)}
                            </div>
                          </div>
                        ))}
                      <div className="min-w-[140px] border-l border-slate-200 bg-[#f8f9fb] p-4">
                        <span className="font-medium text-[#374151] text-[15px]">
                          Actions
                        </span>
                      </div>
                    </div>

                    {/* Body Rows */}
                    {allInstances.length > 0 ? (
                      allInstances.map((instanceId, rowIndex) => {
                        const isOriginal = instanceId === "original";
                        return (
                          <div
                            key={isOriginal ? "original" : instanceId}
                            className={`flex min-w-max ${isOriginal && !hasChildSubforms
                              ? "bg-white"
                              : "bg-blue-50/40"
                              } border-b border-slate-200`}
                          >
                            {visibleFields.map((field) => {
                              const fieldKey = isOriginal
                                ? field.id
                                : `${field.id}__${instanceId}`;
                              const error = errors[fieldKey];
                              const fieldForInstance = {
                                ...field,
                                id: fieldKey,
                              };
                              return (
                                <div
                                  key={field.id}
                                  className={`p-4 border-r border-slate-200 ${field.type === "hidden"
                                    ? "hidden p-0 min-w-0"
                                    : "min-w-[280px]"
                                    }`}
                                >
                                  {field.description &&
                                    field.type !== "hidden" && (
                                      <p className="text-xs text-muted-foreground mb-2">
                                        {field.description}
                                      </p>
                                    )}
                                  {isOriginal
                                    ? renderField(fieldForInstance, true, isViewOnly)
                                    : renderDynamicField(
                                      fieldForInstance,
                                      fieldKey,
                                      true,
                                      isViewOnly,
                                    )}
                                  {error && (
                                    <p className="text-sm text-red-500 mt-2 flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      {error}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                            <div className="min-w-[140px] p-4 border-r border-slate-200 flex items-center">
                              {(hasChildSubforms || rowIndex > 0) && (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() =>
                                    removeSubformRow(subform.id, instanceId)
                                  }
                                  disabled={submitting || submitted || isViewOnly}
                                  className="h-6 text-xs"
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex min-w-max h-12 bg-white text-center justify-center items-center">
                        <div className="w-full text-gray-600">No rows yet</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    );
  };

  const isViewOnly = formLevelPermission === "VIEW";
  const hasNoAccess = formLevelPermission === "NONE";

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
        <DialogTitle className="sr-only">{form?.name || "Form"}</DialogTitle>
        {/* RESIZE HANDLES */}
        <div className="absolute inset-0 pointer-events-none z-10">
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
          <div className="flex-1 flex items-center justify-center p-8">
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
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You don't have permission to access this form.</p>
              <Button variant="outline" className="mt-4" onClick={onClose}>Close</Button>
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-2xl">{form.name}</DialogTitle>
                  {form.description && (
                    <div className="relative group">
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
                <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-sm w-fit">
                  <Lock className="h-3.5 w-3.5" />
                  View only — you don't have permission to submit this form
                </div>
              )}
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-8">
              <div className="space-y-12 max-w-5xl mx-auto pb-8">
                {rootItems.length > 0 ? (
                  rootItems.map((item, index) => {
                    if (item.type === "section") {
                      const section = item.data;
                      return (
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
                                <h3 className="text-xl font-semibold">
                                  {section.title}
                                </h3>
                                {section.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {section.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="p-6">
                            <div
                              className="grid gap-8"
                              style={{
                                gridTemplateColumns: `repeat(${section.columns || 1
                                  }, minmax(0, 1fr))`,
                              }}
                            >
                              {section.fields
                                .filter((field) =>
                                  isFieldVisible(field, section.id)
                                )
                                .map((field) => (
                                  <div key={field.id} className="space-y-2">
                                    {field.type !== "checkbox" &&
                                      field.type !== "switch" &&
                                      field.type !== "hidden" && (
                                        <Label
                                          htmlFor={field.id}
                                          className="text-sm font-medium flex items-center gap-2"
                                        >
                                          {field.label}
                                          {field.type === "formula" && (
                                            <Badge
                                              variant="outline"
                                              className="text-xs font-normal"
                                            >
                                              <Calculator className="h-3 w-3 mr-1" />
                                              Auto
                                            </Badge>
                                          )}
                                          {field.validation?.required &&
                                            field.type !== "formula" && (
                                              <span className="text-red-500">
                                                *
                                              </span>
                                            )}
                                        </Label>
                                      )}
                                    {field.description &&
                                      field.type !== "hidden" && (
                                        <p className="text-xs text-muted-foreground">
                                          {field.description}
                                        </p>
                                      )}
                                    {renderField(field, false, isViewOnly)}
                                    {errors[field.id] &&
                                      field.type !== "phone" &&
                                      field.type !== "phone-input" && (
                                        <p className="text-sm text-red-500 flex items-center gap-1">
                                          <AlertCircle className="h-3 w-3" />
                                          {errors[field.id]}
                                        </p>
                                      )}
                                  </div>
                                ))}
                            </div>

                            {/* Render subforms that belong to this section */}
                            {rootItems
                              .filter(
                                (it) =>
                                  it.type === "subform" &&
                                  it.parentSectionId === section.id
                              )
                              .map((it) => (
                                <div key={it.data.id} className="mt-10">
                                  {renderSubform(it.data, 1, section.title)}
                                </div>
                              ))}
                          </div>
                        </div>
                      );
                    }

                    // Top-level subforms (no parent section)
                    if (item.type === "subform" && !item.parentSectionId) {
                      return (
                        <div key={item.data.id} className="mt-8">
                          {renderSubform(item.data, 0, "")}
                        </div>
                      );
                    }

                    return null;
                  })
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No visible sections or subforms
                  </div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 border-t bg-background px-6 py-4 flex justify-between items-center gap-3">
              {isViewOnly ? (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <Lock className="h-4 w-4" />
                  <span>View only mode — contact your admin to request submit access</span>
                </div>
              ) : (
                <div />
              )}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={submitting}
                >
                  {isViewOnly ? "Close" : "Cancel"}
                </Button>
                {!isViewOnly && (
                  <Button
                    type="submit"
                    disabled={submitting || loading || hasErrorsOrMissingRequired()}
                    className={`
          ${hasErrorsOrMissingRequired() && !submitting && !loading
                        ? "opacity-70 cursor-not-allowed bg-primary/80 hover:bg-primary/80"
                        : ""
                      }
        `}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : hasErrorsOrMissingRequired() ? (
                      <>
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Fix Errors to Submit
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Form
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