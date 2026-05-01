// components/public-form/FormRenderer.tsx
import React from "react";
import { Input } from "@/components/ui/input";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { isValidPhoneNumber } from "react-phone-number-input";
import {
  AlertCircle,
  Calculator,
  Hash,
  Loader2,
  MapPin,
  Star,
} from "lucide-react";
import { LookupField } from "@/components/forms/lookup-field";
import CameraCapture from "@/components/forms/camera-capture";
import { FileUploadZone } from "@/components/forms/file-upload-zone";
import type { FormField } from "@/types/form-builder";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Slider } from "../ui/slider";

interface FormRendererProps {
  field: FormField;
  value: any;
  error?: string;
  submitting: boolean;
  submitted: boolean;
  handleFieldChange: (id: string, value: any, fullOption?: any) => void;
  formulaValues: Record<string, any>;
  isInSubform?: boolean;
  formData?: Record<string, any>;
  allFields?: FormField[];
  setErrors?: (v: Record<string, string>) => void;
  locationStatus?: Record<string, "idle" | "fetching" | "success" | "failed">;
  forceReadOnly?: boolean;
  idToLabel?: Record<string, string>;
  // New props for decimal and percent
  decimalConfigs?: Record<string, any>;
  percentConfigs?: Record<string, any>;
}

export function FormRenderer({
  field,
  value,
  error,
  submitting,
  submitted,
  handleFieldChange,
  formulaValues,
  isInSubform = false,
  formData,
  allFields,
  locationStatus,
  forceReadOnly = false,
  idToLabel = {},
  decimalConfigs = {},
  percentConfigs = {},
}: FormRendererProps) {
  // Resolve parent value for dependent fields (dropdowns and lookup fields)
  const hasLookupDependency = field.type === "lookup" && !!field.lookup?.dependency;
  const shouldResolveParent = field.isDependent || hasLookupDependency;
  const parentValueRaw = shouldResolveParent
    ? resolveParentValue(field, formData, allFields)
    : undefined;

  const parentValue =
    parentValueRaw !== undefined && parentValueRaw !== null
      ? String(parentValueRaw)
      : "";


  const fieldType = (field.type || "").toLowerCase();

  // Get config for decimal or percent
  const decimalConfig = decimalConfigs[field.id];
  const percentConfig = percentConfigs[field.id];

  const isFieldVisible = () => {
    if (field.visible === false) return false;
    if (field.properties && field.properties.hidden === true) return false;
    return true;
  };

  const isFieldReadOnly = () => {
    if (field.readonly) return true;
    if (forceReadOnly === true) return true;
    return false;
  };

  const fieldProps: any = {
    id: field.id,
    disabled: submitting || submitted || isFieldReadOnly(),
    readOnly: isFieldReadOnly(),
    className: error
      ? "border-red-500"
      : isInSubform
        ? "border-purple-200 focus:border-purple-400"
        : "",
  };

  const baseOptions = Array.isArray(field.options) ? field.options : [];
  let effectiveOptions = baseOptions;

  if (field.isDependent) {
    const groups = field.dependentGroups || [];
    const matched = parentValue
      ? groups.find(
          (g) =>
            String(g.parentValue).toLowerCase() ===
            String(parentValue).toLowerCase(),
        )
      : undefined;
    effectiveOptions = matched?.options || [];
  }

  if (field.isDependent && !parentValue) {
    return null;
  }

  // Helper function to handle number-only input (for decimal and percent)
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>, fieldId: string, isPercent: boolean = false) => {
    let inputValue = e.target.value;

    // Allow empty or valid number (including decimal point)
    if (inputValue === "" || /^-?\d*\.?\d*$/.test(inputValue)) {
      let numValue = inputValue === "" ? "" : parseFloat(inputValue);

      // For percent field - enforce range
      if (isPercent && percentConfig && percentConfig.enforceRange !== false) {
        const min = percentConfig.min ?? 0;
        const max = percentConfig.max ?? 100;
        if (typeof numValue === "number") {
          if (numValue < min) numValue = min;
          if (numValue > max) numValue = max;
        }
      }

      // For decimal field - apply min/max if configured
      if (!isPercent && decimalConfig) {
        if (typeof numValue === "number") {
          if (decimalConfig.min !== null && numValue < decimalConfig.min) {
            numValue = decimalConfig.min;
          }
          if (decimalConfig.max !== null && numValue > decimalConfig.max) {
            numValue = decimalConfig.max;
          }
        }
      }

      handleFieldChange(fieldId, inputValue === "" ? "" : numValue);
    }
  };

  switch (fieldType) {
    case "phone":
    case "phone-input": {
      const phoneValue = value || "";
      const isInvalid = phoneValue && !isValidPhoneNumber(phoneValue);

      if (!isFieldVisible()) return null;

      return (
        <div className="space-y-1">
          <PhoneInput
            international
            countryCallingCodeEditable={false}
            defaultCountry={field.defaultCountry || "IN"}
            preferredCountries={[
              "IN", "US", "GB", "AE", "CA", "AU", "DE", "FR", "SA",
            ]}
            placeholder={field.placeholder || "Enter phone number"}
            value={phoneValue}
            onChange={(newValue) =>
              !isFieldReadOnly() && handleFieldChange(field.id, newValue)
            }
            disabled={submitting || submitted || isFieldReadOnly()}
            numberInputProps={{
              className: `flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${isInvalid ? "border-red-500" : "border-input"}`,
            }}
            countrySelectProps={{
              className: "rounded-l-md border-r-0",
            }}
          />
          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          )}
        </div>
      );
    }

    case "formula": {
      if (!isFieldVisible()) return null;
      const formulaConfig = field.properties?.formulaConfig as any;
      const calculatedValue = formulaValues[field.id];
      const displayValue =
        calculatedValue !== undefined && calculatedValue !== ""
          ? String(calculatedValue)
          : "—";
      const returnType = formulaConfig?.returnType || "Number";
      const displayExpression = formulaConfig?.expression?.replace(
        /\{([^}]+)\}/g,
        (_: string, id: string) => `{${idToLabel[id] || id}}`,
      );

      return (
        <div className="space-y-1">
          <div className="relative">
            <Input
              {...fieldProps}
              type="text"
              value={displayValue}
              readOnly
              className={`bg-muted/50 cursor-not-allowed font-medium pl-10 ${
                returnType === "Currency"
                  ? "text-green-700"
                  : returnType === "Number"
                    ? "text-blue-700"
                    : ""
              } ${isInSubform ? "border-purple-200" : ""}`}
            />
            <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
          {displayExpression && (
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
      if (!isFieldVisible()) return null;
      return (
        <div className="space-y-2">
          <div className="relative">
            <Input
              type="text"
              value="Will be generated on submit"
              readOnly
              className="bg-muted/50 cursor-not-allowed font-mono text-sm italic text-muted-foreground pl-10"
            />
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
          <input type="hidden" name={field.id} value="" />
        </div>
      );
    }

    // ========== DECIMAL FIELD ==========
    case "decimal": {
      if (!isFieldVisible()) return null;

      const decimals = decimalConfig?.decimals ?? 2;
      const step = decimals === 0 ? "1" : `0.${"0".repeat(decimals - 1)}1`;

      return (
        <div className="relative">
          <Input
            {...fieldProps}
            type="number"
            step={step}
            min={decimalConfig?.min ?? undefined}
            max={decimalConfig?.max ?? undefined}
            placeholder={field.placeholder || `0.${"0".repeat(decimals)}`}
            value={value !== null && value !== undefined ? value : ""}
            onChange={(e) => handleNumberChange(e, field.id, false)}
            className={error ? "border-red-500" : ""}
          />
          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1 mt-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          )}
        </div>
      );
    }

    // ========== PERCENT FIELD ==========
    case "percent": {
      if (!isFieldVisible()) return null;

      const decimals = percentConfig?.decimals ?? 2;
      const step = decimals === 0 ? "1" : `0.${"0".repeat(decimals - 1)}1`;

      return (
        <div className="relative">
          <Input
            {...fieldProps}
            type="number"
            step={step}
            min={percentConfig?.min ?? 0}
            max={percentConfig?.max ?? 100}
            placeholder={field.placeholder || `0.${"0".repeat(decimals)}`}
            value={value !== null && value !== undefined ? value : ""}
            onChange={(e) => handleNumberChange(e, field.id, true)}
            className={`pr-8 ${error ? "border-red-500" : ""}`}
          />
          {percentConfig?.showSymbol !== false && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
              %
            </span>
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

    case "text":
    case "email":
    case "number":
    case "tel":
    case "url":
      if (!isFieldVisible()) return null;
      return (
        <Input
          {...fieldProps}
          type={fieldType}
          placeholder={field.placeholder || ""}
          value={value || ""}
          onChange={(e: { target: { value: any } }) =>
            !isFieldReadOnly() && handleFieldChange(field.id, e.target.value)
          }
        />
      );

    case "password":
      if (!isFieldVisible()) return null;
      return (
        <Input
          {...fieldProps}
          type="password"
          placeholder={field.placeholder || ""}
          value={value || ""}
          onChange={(e: { target: { value: any } }) =>
            !isFieldReadOnly() && handleFieldChange(field.id, e.target.value)
          }
        />
      );

    case "textarea":
      if (!isFieldVisible()) return null;
      return (
        <Textarea
          {...fieldProps}
          placeholder={field.placeholder || ""}
          value={value || ""}
          onChange={(e: { target: { value: any } }) =>
            !isFieldReadOnly() && handleFieldChange(field.id, e.target.value)
          }
          rows={3}
        />
      );

    case "date": {
      if (!isFieldVisible()) return null;
      // Determine if this date field should disallow past dates.
      // Applies to fields whose label contains "leave start" (case-insensitive)
      // or fields with properties.disallowPastDates explicitly set.
      const labelLower = (field.label || "").toLowerCase();
      const disallowPast =
        field.properties?.disallowPastDates === true ||
        labelLower.includes("leave start") ||
        labelLower.includes("leave end");
      const todayStr = disallowPast
        ? new Date().toISOString().split("T")[0]
        : undefined;
      return (
        <Input
          {...fieldProps}
          type="date"
          value={value || ""}
          min={todayStr}
          onChange={(e: { target: { value: any } }) =>
            !isFieldReadOnly() && handleFieldChange(field.id, e.target.value)
          }
        />
      );
    }

    case "time":
      if (!isFieldVisible()) return null;
      return (
        <Input
          {...fieldProps}
          type="time"
          value={value || ""}
          onChange={(e: { target: { value: any } }) =>
            !isFieldReadOnly() && handleFieldChange(field.id, e.target.value)
          }
        />
      );

    case "datetime":
      if (!isFieldVisible()) return null;
      return (
        <Input
          {...fieldProps}
          type="datetime-local"
          value={value || ""}
          onChange={(e: { target: { value: any } }) =>
            !isFieldReadOnly() && handleFieldChange(field.id, e.target.value)
          }
        />
      );

    case "checkbox":
      if (!isFieldVisible()) return null;
      return (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={field.id}
            checked={value || false}
            onCheckedChange={(checked: any) =>
              !isFieldReadOnly() && handleFieldChange(field.id, checked)
            }
            disabled={submitting || submitted || isFieldReadOnly()}
          />
          <Label htmlFor={field.id} className="text-sm">
            {field.label}
          </Label>
        </div>
      );

    case "switch":
      if (!isFieldVisible()) return null;
      return (
        <div className="flex items-center space-x-2">
          <Switch
            id={field.id}
            checked={value || false}
            onCheckedChange={(checked: any) =>
              !isFieldReadOnly() && handleFieldChange(field.id, checked)
            }
            disabled={submitting || submitted || isFieldReadOnly()}
          />
          <Label htmlFor={field.id} className="text-sm">
            {field.label}
          </Label>
        </div>
      );

    case "radio":
      if (!isFieldVisible()) return null;
      return (
        <RadioGroup
          value={value != null ? String(value) : undefined}
          onValueChange={(v: any) => {
            if (isFieldReadOnly()) return;
            const selected = effectiveOptions.find(
              (opt: any) => String(opt.value ?? opt.id) === v,
            );
            handleFieldChange(
              field.id,
              selected ? (selected.value ?? selected.id) : v,
              selected,
            );
          }}
          disabled={submitting || submitted || isFieldReadOnly()}
        >
          {effectiveOptions.map((opt: any) => (
            <div
              key={opt.value ?? opt.id}
              className="flex items-center space-x-2"
            >
              <RadioGroupItem
                value={String(opt.value ?? opt.id)}
                id={`${field.id}-${String(opt.value ?? opt.id)}`}
              />
              <Label
                htmlFor={`${field.id}-${String(opt.value ?? opt.id)}`}
                className="text-sm"
              >
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );

    case "select":
      if (!isFieldVisible()) return null;

      return (
        <Select
          value={value != null ? String(value) : undefined}
          onValueChange={(v: any) => {
            if (isFieldReadOnly()) return;

            const selected = effectiveOptions.find(
              (opt: any) => String(opt.value ?? opt.id) === v,
            );

            handleFieldChange(
              field.id,
              selected ? (selected.value ?? selected.id) : v,
              selected,
            );
          }}
          disabled={
            submitting ||
            submitted ||
            isFieldReadOnly() ||
            (field.isDependent && !parentValue)
          }
        >
          <SelectTrigger className={error ? "border-red-500" : ""}>
            <SelectValue
              placeholder={field.placeholder || "Select an option"}
            />
          </SelectTrigger>

          <SelectContent
            className="z-50"
            position="item-aligned"
            sideOffset={4}
          >
            {effectiveOptions.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                No options available
              </div>
            ) : (
              effectiveOptions.map((opt: any) => {
                const val = String(opt.value ?? opt.id);

                return (
                  <SelectItem key={val} value={val}>
                    {opt.label}
                  </SelectItem>
                );
              })
            )}
          </SelectContent>
        </Select>
      );

    case "slider":
      if (!isFieldVisible()) return null;
      return (
        <div className="space-y-2">
          <Slider
            value={[value || 0]}
            onValueChange={(vals: any[]) =>
              !isFieldReadOnly() && handleFieldChange(field.id, vals[0])
            }
            max={field.validation?.max || 100}
            min={field.validation?.min || 0}
            step={1}
            disabled={submitting || submitted || isFieldReadOnly()}
          />
          <div className="text-center text-sm text-muted-foreground">
            Value: {value || 0}
          </div>
        </div>
      );

    case "lookup":
      if (!isFieldVisible()) return null;
      return (
        <LookupField
          field={{
            id: field.id,
            label: field.label,
            type: field.type,
            placeholder: field.placeholder,
            description: field.description,
            validation: field.validation || { required: false },
            lookup: field.lookup,
          }}
          value={value}
          onChange={(v, full) =>
            !isFieldReadOnly() && handleFieldChange(field.id, v, full)
          }
          disabled={submitting || submitted || isFieldReadOnly()}
          error={error}
          parentValue={
            field.lookup?.dependency
              ? (parentValue || undefined)
              : undefined
          }
        />
      );

    case "file":
    case "image":
    case "video":
    case "signature":
      if (!isFieldVisible()) return null;
      return (
        <FileUploadZone
          fieldType={fieldType as any}
          currentValue={value}
          allowMultiple={fieldType === "image" || fieldType === "file"}
          onUploadComplete={(url: any) =>
            !isFieldReadOnly() && handleFieldChange(field.id, url)
          }
          onClear={(urlToRemove?: string) => {
            if (isFieldReadOnly()) return;
            if (urlToRemove && Array.isArray(value)) {
              const updated = value.filter((u: string) => u !== urlToRemove);
              handleFieldChange(field.id, updated.length > 0 ? updated : "");
            } else {
              handleFieldChange(field.id, "");
            }
          }}
          disabled={submitting || submitted || isFieldReadOnly()}
          maxSize={10}
        />
      );

    case "camera":
      if (!isFieldVisible()) return null;
      return (
        <CameraCapture
          onCapture={(img) =>
            !isFieldReadOnly() && handleFieldChange(field.id, img)
          }
          capturedImage={value || null}
          onClear={() => !isFieldReadOnly() && handleFieldChange(field.id, "")}
        />
      );

    case "location":
    case "newlocation": {
      if (!isFieldVisible()) return null;
      const autoFetch = field.properties?.autoFetchLocation;
      const locStatus = locationStatus?.[field.id] || "idle";
      const isLocReadOnly =
        isFieldReadOnly() || (autoFetch && locStatus === "success");

      let locPlaceholder = field.placeholder || "Enter location";
      let locIcon: React.ReactNode = null;
      if (autoFetch) {
        if (locStatus === "fetching") {
          locPlaceholder = "Fetching your location…";
          locIcon = (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          );
        } else if (locStatus === "failed") {
          locPlaceholder = "Location denied – type manually";
          locIcon = <MapPin className="h-4 w-4 text-amber-600" />;
        } else if (locStatus === "success") {
          locPlaceholder = "Location auto-filled";
          locIcon = <MapPin className="h-4 w-4 text-green-600" />;
        } else {
          locPlaceholder = "Click anywhere to allow location";
          locIcon = <MapPin className="h-4 w-4 text-muted-foreground" />;
        }
      }
      return (
        <div className="space-y-1">
          <div className="relative">
            <Input
              {...fieldProps}
              type="text"
              placeholder={locPlaceholder}
              value={value || ""}
              readOnly={isLocReadOnly}
              className={`${error ? "border-red-500" : ""} ${
                isLocReadOnly ? "bg-muted cursor-not-allowed" : ""
              } pl-10 ${isInSubform ? "border-purple-200" : ""}`}
              onChange={(e: { target: { value: any } }) =>
                !isLocReadOnly && handleFieldChange(field.id, e.target.value)
              }
              disabled={submitting || submitted || isLocReadOnly}
            />
            {locIcon && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {locIcon}
              </div>
            )}
          </div>
          {autoFetch && locStatus === "failed" && (
            <p className="text-xs text-amber-600">
              Enable location in browser settings or type your address.
            </p>
          )}
        </div>
      );
    }

    case "rating": {
      if (!isFieldVisible()) return null;
      return (
        <div className="flex items-center space-x-2">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() =>
                !isFieldReadOnly() && handleFieldChange(field.id, r)
              }
              disabled={submitting || submitted || isFieldReadOnly()}
              className="p-1 hover:scale-110 transition-transform"
            >
              <Star
                className={`h-4 w-4 ${
                  r <= (value || 0)
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
    }

    case "user": {
      if (!isFieldVisible()) return null;
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
    }

    case "address": {
      if (!isFieldVisible()) return null;
      const subfields = field.properties?.subfields || [
        { key: "line1", label: "Address Line 1", placeholder: "Street address, house no.", required: true },
        { key: "line2", label: "Address Line 2", placeholder: "Apartment, suite, floor", required: false },
        { key: "city", label: "City / District", placeholder: "Enter City", required: true },
        { key: "state", label: "State / Province", placeholder: "Enter State", required: true },
        { key: "postal", label: "Postal / Zip Code", placeholder: "Enter Postal Code", required: true },
        { key: "country", label: "Country", type: "select", placeholder: "Select country", required: true },
      ];
      const addressValue = (value as Record<string, string>) || {};
      const handleSubChange = (subKey: string, subVal: string) => {
        const newAddress = { ...addressValue, [subKey]: subVal };
        handleFieldChange(field.id, newAddress);
      };
      const countries = [
        "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia",
        "Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados",
        "Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina",
        "Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia",
        "Cameroon","Canada","Cape Verde","Central African Republic","Chad","Chile","China",
        "Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic",
        "Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador",
        "Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland",
        "France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala",
        "Guinea","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran",
        "Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya",
        "Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho",
        "Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi",
        "Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius",
        "Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco",
        "Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand",
        "Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman",
        "Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru",
        "Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda",
        "Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa",
        "San Marino","São Tomé and Príncipe","Saudi Arabia","Senegal","Serbia","Seychelles",
        "Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia",
        "South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname",
        "Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand",
        "Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan",
        "Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States",
        "Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen",
        "Zambia","Zimbabwe",
      ].sort();
      return (
        <div className="space-y-4 p-4 border border-gray-200 rounded-md bg-gray-50/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subfields.map((sub: any) => {
              if (!sub) return null;
              const subVal = addressValue[sub.key] || "";
              const isRequired = sub.required && field.validation?.required;
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
                      disabled={submitting || submitted || isFieldReadOnly()}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder={sub.placeholder || "Select country"} />
                      </SelectTrigger>
                      <SelectContent className="z-50" position="popper">
                        {countries.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
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
                    disabled={submitting || submitted || isFieldReadOnly()}
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

    case "hidden":
      return <input type="hidden" value={value || ""} />;

    default:
      if (!isFieldVisible()) return null;
      return (
        <Input
          {...fieldProps}
          placeholder={field.placeholder || ""}
          value={value || ""}
          onChange={(e: { target: { value: any } }) =>
            !isFieldReadOnly() && handleFieldChange(field.id, e.target.value)
          }
        />
      );
  }
}

// Helper function for resolving parent value
export function resolveParentValue(
  f: any,
  formData?: Record<string, any>,
  allFields?: any[],
) {
  if (!f || !formData) return undefined;

  // 1. Resolve by parentFieldId (primary — set on dependent fields)
  if (f.parentFieldId) {
    if (formData[f.parentFieldId] !== undefined) return formData[f.parentFieldId];
    // Check dynamic subform instance keys
    const possibleKeys = Object.keys(formData).filter(
      (k) => k.includes("__") && k.includes(f.parentFieldId),
    );
    if (possibleKeys.length > 0) return formData[possibleKeys[0]];
  }

  // 2. For lookup fields: resolve by parentFieldLabel from dependency config
  //    Find the parent field by its label in allFields, then look up its value in formData
  if (f.lookup?.dependency?.parentFieldLabel) {
    const parentLabel = f.lookup.dependency.parentFieldLabel;

    // Try to find the parent field in allFields to get its ID
    if (allFields?.length) {
      const parentField = allFields.find(
        (pf: any) => pf.label === parentLabel && pf.id !== f.id,
      );
      if (parentField) {
        if (formData[parentField.id] !== undefined) return formData[parentField.id];
        // Check subform instance keys
        const possibleKeys = Object.keys(formData).filter(
          (k) => k.includes("__") && k.includes(parentField.id),
        );
        if (possibleKeys.length > 0) return formData[possibleKeys[0]];
      }
    }
  }

  return undefined;
}