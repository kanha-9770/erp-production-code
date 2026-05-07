"use client";
import type React from "react";
import { useState, useEffect } from "react";
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
import {
  AlertCircle,
  Loader2,
  MapPin,
  Calculator,
  Hash,
  Star,
} from "lucide-react";
import type { FormField } from "@/types/form-builder";
import { LookupField } from "@/components/forms/lookup-field";
import CameraCapture from "@/components/forms/camera-capture";
import { FileUploadZone } from "@/components/forms/file-upload-zone";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { isValidPhoneNumber } from "react-phone-number-input";
import { COUNTRIES } from "@/lib/constants/countries";
import type { FormulaReturnType, BlankPreference } from "@/lib/formula/types";

interface FormulaConfig {
  fieldLabel: string;
  expression: string;
  returnType: FormulaReturnType;
  decimalPlaces: number;
  blankPreference: BlankPreference;
  visibleInForm?: boolean;
}

// "Same as Current Address" toggle wrapper for a Permanent Address (address-type) field.
// When enabled, mirrors the Current Address sub-values into Permanent Address and
// disables the sub-inputs. Toggling off lets the user enter a different address.
const ADDRESS_KEYS = ["line1", "line2", "city", "state", "postal", "country"];

const PermanentAddressFieldWithSyncToggle: React.FC<{
  currentAddr: Record<string, string>;
  permanentAddr: Record<string, string>;
  onChange: (addr: Record<string, string>) => void;
  subfields: any[];
  validationRequired: boolean;
  disabled: boolean;
  fieldId: string;
  error?: string;
}> = ({
  currentAddr,
  permanentAddr,
  onChange,
  subfields,
  validationRequired,
  disabled,
  fieldId,
  error,
}) => {
  const [synced, setSynced] = useState<boolean>(() => {
    if (!currentAddr || ADDRESS_KEYS.every((k) => !currentAddr[k])) return false;
    return ADDRESS_KEYS.every(
      (k) => (currentAddr[k] || "") === (permanentAddr?.[k] || ""),
    );
  });

  useEffect(() => {
    if (!synced) return;
    const inSync = ADDRESS_KEYS.every(
      (k) => (currentAddr?.[k] || "") === (permanentAddr?.[k] || ""),
    );
    if (!inSync) onChange({ ...currentAddr });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, currentAddr]);

  const handleSubChange = (subKey: string, subVal: string) => {
    onChange({ ...permanentAddr, [subKey]: subVal });
  };

  const fieldsDisabled = disabled || synced;
  const toggleId = `${fieldId}-same-as-current`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm">
        <Switch
          id={toggleId}
          checked={synced}
          onCheckedChange={(checked) => {
            setSynced(checked);
            if (checked) onChange({ ...currentAddr });
          }}
          disabled={disabled}
        />
        <Label htmlFor={toggleId} className="cursor-pointer select-none text-blue-900">
          Same as Current Address
        </Label>
      </div>
      <div className="space-y-4 p-4 border border-gray-200 rounded-md bg-gray-50/60">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subfields.map((sub: any) => {
            if (!sub) return null;
            const subVal = permanentAddr?.[sub.key] || "";
            const isRequired = sub.required && validationRequired;
            if (sub.type === "select") {
              return (
                <div key={sub.key} className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    {sub.label}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <Select
                    value={subVal}
                    onValueChange={(v) => handleSubChange(sub.key, v)}
                    disabled={fieldsDisabled}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder={sub.placeholder || "Select country"} />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
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
                  {isRequired && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <Input
                  placeholder={sub.placeholder}
                  value={subVal}
                  onChange={(e) => handleSubChange(sub.key, e.target.value)}
                  disabled={fieldsDisabled}
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
    </div>
  );
};

interface FormFieldRendererProps {
  field: FormField;
  isInSubform: boolean;
  forceReadOnly: boolean;
  value: any;
  error: string | undefined;
  submitting: boolean;
  submitted: boolean;
  isViewOnly: boolean;
  locationStatus: Record<string, "idle" | "fetching" | "success" | "failed">;
  formulaValues: Record<string, any>;
  idToLabel: Record<string, string>;
  onFieldChange: (fieldId: string, value: any, fullOption?: any) => void;
  onClearFile: (fieldId: string) => void;
  getParentValue: (field: FormField) => string | string[] | undefined;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** All form data values — for resolving lookup dependency parent values */
  formData?: Record<string, any>;
  /** All fields in the form — for finding parent field by label */
  allFields?: FormField[];
}

export function FormFieldRenderer({
  field,
  isInSubform,
  forceReadOnly,
  value,
  error,
  submitting,
  submitted,
  isViewOnly,
  locationStatus,
  formulaValues,
  idToLabel,
  onFieldChange,
  onClearFile,
  getParentValue,
  errors,
  setErrors,
  formData,
  allFields,
}: FormFieldRendererProps) {
  if (field.visible === false || field.properties?.hidden === true)
    return null;

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
              onFieldChange(field.id, newValue);
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
          onChange={(e) => onFieldChange(field.id, e.target.value)}
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
          onChange={(e) => onFieldChange(field.id, e.target.value)}
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
          onChange={(e) => onFieldChange(field.id, e.target.value)}
          rows={3}
          readOnly={isReadOnly}
          className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""}`}
        />
      );
    case "date": {
      // Disallow past dates for "Leave Start Date" fields or when explicitly configured
      const dateLabelLower = (field.label || "").toLowerCase();
      const dateDisallowPast =
        field.properties?.disallowPastDates === true ||
        dateLabelLower.includes("leave start") ||
        dateLabelLower.includes("leave end");
      const dateTodayStr = dateDisallowPast
        ? new Date().toISOString().split("T")[0]
        : undefined;
      return (
        <Input
          {...fieldProps}
          type="date"
          value={value || ""}
          min={dateTodayStr}
          onChange={(e) => onFieldChange(field.id, e.target.value)}
          readOnly={field.readonly || field.properties?.autoFetchDate}
          className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""
            } ${isInSubform ? "border-purple-200" : ""}`}
        />
      );
    }
    case "time":
      return (
        <Input
          {...fieldProps}
          type="time"
          value={value || ""}
          onChange={(e) => onFieldChange(field.id, e.target.value)}
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
          onChange={(e) => onFieldChange(field.id, e.target.value)}
          readOnly={isReadOnly}
          className={`${fieldProps.className} ${isReadOnly ? "bg-muted cursor-not-allowed" : ""
            } ${isInSubform ? "border-purple-200" : ""}`}
        />
      );
    case "location":
    case "newlocation": {
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
              onChange={(e) => onFieldChange(field.id, e.target.value)}
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
    }
    case "checkbox":
      return (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={field.id}
            checked={value || false}
            onCheckedChange={(c) => onFieldChange(field.id, c)}
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
            onCheckedChange={(c) => onFieldChange(field.id, c)}
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
          onValueChange={(v) => onFieldChange(field.id, v)}
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
        const parentValueRaw = getParentValue(field);
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
        field.isDependent && !getParentValue(field);
      return (
        <div className="space-y-1">
          <Select
            value={value || ""}
            onValueChange={(v) => onFieldChange(field.id, v)}
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
                    ? getParentValue(field)
                      ? "No options available for this selection"
                      : "Select parent field first"
                    : "No options defined"}
                </div>
              ) : (
                effectiveOptions
                  .filter((opt) => (opt.value || opt.id) !== undefined && (opt.value || opt.id) !== "")
                  .map((opt) => (
                    <SelectItem
                      key={opt.value || opt.id}
                      value={String(opt.value || opt.id)}
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
          {field.isDependent && !getParentValue(field) && (
            <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Select a value in "
              {idToLabel[field.parentFieldId!] || field.parentFieldId}" first
            </p>
          )}
          {effectiveOptions.length === 0 &&
            getParentValue(field) &&
            field.isDependent && (
              <p className="text-xs text-amber-700 mt-1.5">
                No matching options for "{getParentValue(field)}"
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
            onValueChange={(vals) => onFieldChange(field.id, vals[0])}
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
              onClick={() => onFieldChange(field.id, r)}
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
    case "lookup": {
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
      let lookupParentValue: string | undefined;
      const lookupDep = field.lookup?.dependency;
      if (lookupDep?.parentFieldLabel && formData && allFields) {
        const parentField = allFields.find(
          (f) => f.label === lookupDep.parentFieldLabel
        );
        if (parentField) {
          lookupParentValue = formData[parentField.id] != null
            ? String(formData[parentField.id])
            : undefined;
        }
      }
      return (
        <LookupField
          field={lookupData}
          value={value}
          onChange={(v, fullOption) =>
            onFieldChange(field.id, v, fullOption)
          }
          disabled={submitting || submitted || isReadOnly}
          error={error}
          parentValue={lookupParentValue}
        />
      );
    }
    case "file":
    case "image":
    case "video":
    case "signature":
      return (
        <FileUploadZone
          fieldType={fieldType as "image" | "file" | "signature" | "video"}
          currentValue={value}
          onUploadComplete={(url) => onFieldChange(field.id, url)}
          onClear={() => onClearFile(field.id)}
          disabled={submitting || submitted || isReadOnly}
          maxSize={10}
        />
      );
    case "camera":
      return (
        <CameraCapture
          onCapture={(img) => onFieldChange(field.id, img)}
          capturedImage={value || null}
          onClear={() => onFieldChange(field.id, "")}
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
      // If this is a "Permanent Address" field and the form has a sibling
      // "Current Address" address-type field, render the sync toggle wrapper.
      const isPermanentAddress = /permanent\s*address/i.test(field.label || "");
      const currentAddrField = isPermanentAddress && allFields
        ? allFields.find(
            (f) =>
              (f.type || "").toLowerCase() === "address" &&
              /current\s*address/i.test(f.label || ""),
          )
        : undefined;
      if (isPermanentAddress && currentAddrField && formData) {
        const currentAddr = (formData[currentAddrField.id] as Record<string, string>) || {};
        return (
          <PermanentAddressFieldWithSyncToggle
            currentAddr={currentAddr}
            permanentAddr={addressValue}
            onChange={(addr) => onFieldChange(field.id, addr)}
            subfields={subfields}
            validationRequired={Boolean(field.validation?.required)}
            disabled={submitting || submitted || isViewOnly}
            fieldId={field.id}
            error={error}
          />
        );
      }
      const handleSubChange = (subKey: string, subVal: string) => {
        const newAddress = { ...addressValue, [subKey]: subVal };
        onFieldChange(field.id, newAddress);
      };
      return (
        <div className="space-y-4 p-4 border border-gray-200 rounded-md bg-gray-50/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subfields.map((sub: any) => {
              if (!sub) return null;
              const subVal = addressValue[sub.key] || "";
              const isRequired = sub.required && field.validation?.required;
              if (sub.type === "select") {
                const countries = COUNTRIES;
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
          onChange={(e) => onFieldChange(field.id, e.target.value)}
          className={`${fieldProps.className} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
            }`}
        />
      );
  }
}
