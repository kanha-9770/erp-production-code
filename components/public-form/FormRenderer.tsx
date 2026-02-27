// components/public-form/FormRenderer.tsx
import React from "react";
import {
  Input,

} from "@/components/ui/input";
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
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";
import { LookupField } from "@/components/lookup-field";
import CameraCapture from "@/components/camera-capture";
import { FileUploadZone } from "@/components/file-upload-zone";
import type { FormField, Subform } from "@/types/form-builder";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Slider } from "../ui/slider";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

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

interface FormRendererProps {
  field: FormField;
  value: any;
  error?: string;
  submitting: boolean;
  submitted: boolean;
  handleFieldChange: (id: string, value: any, fullOption?: any) => void;
  formulaValues: Record<string, any>;
  isInSubform?: boolean;
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
}: FormRendererProps) {
  const fieldType = (field.type || "").toLowerCase();

  const fieldProps = {
    id: field.id,
    disabled: submitting || submitted,
    className: error ? "border-red-500" : isInSubform ? "border-purple-200 focus:border-purple-400" : "",
  };

  const options = Array.isArray(field.options) ? field.options : [];

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
            preferredCountries={["IN", "US", "GB", "AE", "CA", "AU", "DE", "FR", "SA"]}
            placeholder={field.placeholder || "Enter phone number"}
            value={phoneValue}
            onChange={(newValue) => handleFieldChange(field.id, newValue)}
            disabled={submitting || submitted}
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
      const calculatedValue = formulaValues[field.id];
      const displayValue = calculatedValue !== undefined && calculatedValue !== "" ? String(calculatedValue) : "—";

      return (
        <div className="relative">
          <Input
            {...fieldProps}
            type="text"
            value={displayValue}
            readOnly
            className="bg-muted/50 cursor-not-allowed font-medium pl-10"
          />
          <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      );
    }

    case "unique-id": {
      return (
        <Input
          type="text"
          value="Will be generated on submit"
          readOnly
          className="bg-muted/50 cursor-not-allowed font-mono text-sm italic text-muted-foreground pl-10"
        />
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
          type={fieldType}
          placeholder={field.placeholder || ""}
          value={value || ""}
          onChange={(e: { target: { value: any; }; }) => handleFieldChange(field.id, e.target.value)}
        />
      );

    case "password":
      return (
        <Input
          {...fieldProps}
          type="password"
          placeholder={field.placeholder || ""}
          value={value || ""}
          onChange={(e: { target: { value: any; }; }) => handleFieldChange(field.id, e.target.value)}
        />
      );

    case "textarea":
      return (
        <Textarea
          {...fieldProps}
          placeholder={field.placeholder || ""}
          value={value || ""}
          onChange={(e: { target: { value: any; }; }) => handleFieldChange(field.id, e.target.value)}
          rows={3}
        />
      );

    case "date":
      return (
        <Input
          {...fieldProps}
          type="date"
          value={value || ""}
          onChange={(e: { target: { value: any; }; }) => handleFieldChange(field.id, e.target.value)}
        />
      );

    case "time":
      return (
        <Input
          {...fieldProps}
          type="time"
          value={value || ""}
          onChange={(e: { target: { value: any; }; }) => handleFieldChange(field.id, e.target.value)}
        />
      );

    case "datetime":
      return (
        <Input
          {...fieldProps}
          type="datetime-local"
          value={value || ""}
          onChange={(e: { target: { value: any; }; }) => handleFieldChange(field.id, e.target.value)}
        />
      );

    case "checkbox":
      return (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={field.id}
            checked={value || false}
            onCheckedChange={(checked: any) => handleFieldChange(field.id, checked)}
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
            onCheckedChange={(checked: any) => handleFieldChange(field.id, checked)}
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
          onValueChange={(v: any) => handleFieldChange(field.id, v)}
          disabled={submitting || submitted}
        >
          {options.map((opt: any) => (
            <div key={opt.value} className="flex items-center space-x-2">
              <RadioGroupItem value={opt.value} id={`${field.id}-${opt.value}`} />
              <Label htmlFor={`${field.id}-${opt.value}`} className="text-sm">
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );

    case "select":
      return (
        <Select
          value={value || ""}
          onValueChange={(v: any) => handleFieldChange(field.id, v)}
          disabled={submitting || submitted}
        >
          <SelectTrigger className={error ? "border-red-500" : ""}>
            <SelectValue placeholder={field.placeholder || "Select an option"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt: any) => (
              <SelectItem key={opt.value || opt.id} value={opt.value || opt.id}>
                {opt.label}
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
            onValueChange={(vals: any[]) => handleFieldChange(field.id, vals[0])}
            max={field.validation?.max || 100}
            min={field.validation?.min || 0}
            step={1}
            disabled={submitting || submitted}
          />
          <div className="text-center text-sm text-muted-foreground">
            Value: {value || 0}
          </div>
        </div>
      );

    case "lookup":
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
          onChange={(v, full) => handleFieldChange(field.id, v, full)}
          disabled={submitting || submitted}
          error={error}
        />
      );

    case "file":
    case "image":
    case "video":
    case "signature":
      return (
        <FileUploadZone
          fieldType={fieldType as any}
          currentValue={value}
          onUploadComplete={(url: any) => handleFieldChange(field.id, url)}
          onClear={() => handleFieldChange(field.id, "")}
          disabled={submitting || submitted}
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
      return <input type="hidden" value={value || ""} />;

    default:
      return (
        <Input
          {...fieldProps}
          placeholder={field.placeholder || ""}
          value={value || ""}
          onChange={(e: { target: { value: any; }; }) => handleFieldChange(field.id, e.target.value)}
        />
      );
  }
}

interface RenderSubformProps {
  subform: Subform;
  level?: number;
  parentPath?: string;
  value: any;
  errors: Record<string, string>;
  submitting: boolean;
  handleFieldChange: (id: string, value: any, fullOption?: any) => void;
  formulaValues: Record<string, any>;
  toggleSubform: (id: string) => void;
  collapsedSubforms: Record<string, boolean>;
}

export function RenderSubform({
  subform,
  level = 0,
  parentPath = "",
  value,
  errors,
  submitting,
  handleFieldChange,
  formulaValues,
  toggleSubform,
  collapsedSubforms,
}: RenderSubformProps) {
  const colorScheme = NESTING_COLORS[level % NESTING_COLORS.length];
  const isCollapsed = collapsedSubforms[subform.id] ?? subform.collapsed ?? false;

  const currentPath = parentPath ? `${parentPath} > ${subform.name}` : subform.name;
  const pathParts = currentPath.split(" > ");

  const allItems = [
    ...subform.fields.map((f) => ({ type: "field" as const, item: f, id: f.id, order: f.order })),
    ...(subform.childSubforms || []).map((sf, idx) => ({
      type: "subform" as const,
      item: sf,
      id: sf.id,
      order: sf.order ?? idx,
    })),
  ].sort((a, b) => a.order - b.order);

  return (
    <div
      className={`rounded-lg border border-gray-200 shadow-sm ${colorScheme.leftBorder} ${colorScheme.bg}`}
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
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>

            <Layers className={`w-5 h-5 ${colorScheme.accent}`} />

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-semibold">{subform.name}</h4>
                <Badge variant="outline" className={`text-xs ${colorScheme.levelBadge}`}>
                  Level {level}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {subform.fields.length} field{subform.fields.length !== 1 ? "s" : ""}
                </Badge>
                {subform.childSubforms?.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {subform.childSubforms.length} nested
                  </Badge>
                )}
              </div>

              {level > 0 && (
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                  Path:{" "}
                  {pathParts.map((part, i) => (
                    <span key={i} className="flex items-center">
                      <span className={i === pathParts.length - 1 ? "font-medium text-gray-700" : ""}>
                        {part}
                      </span>
                      {i < pathParts.length - 1 && <ChevronRight className="w-3 h-3 mx-1" />}
                    </span>
                  ))}
                </div>
              )}

              {subform.description && (
                <p className="text-sm text-muted-foreground mt-1">{subform.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-5 space-y-6">
          {allItems.length > 0 ? (
            allItems.map((item) =>
              item.type === "field" ? (
                <div key={item.id} className="space-y-2">
                  {(item.item as FormField).type !== "checkbox" &&
                   (item.item as FormField).type !== "switch" &&
                   (item.item as FormField).type !== "hidden" && (
                    <Label className="text-sm font-medium flex items-center gap-2">
                      {(item.item as FormField).label}
                      {(item.item as FormField).validation?.required && <span className="text-red-500">*</span>}
                    </Label>
                  )}
                  {(item.item as FormField).description && (item.item as FormField).type !== "hidden" && (
                    <p className="text-xs text-muted-foreground">{(item.item as FormField).description}</p>
                  )}
                  <FormRenderer
                    field={item.item as FormField}
                    value={value?.[item.id]}
                    error={errors[item.id]}
                    submitting={submitting}
                    submitted={submitted}
                    handleFieldChange={handleFieldChange}
                    formulaValues={formulaValues}
                    isInSubform={true}
                  />
                  {errors[item.id] && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors[item.id]}
                    </p>
                  )}
                </div>
              ) : (
                <div key={item.id} className="ml-6 mt-4">
                  <RenderSubform
                    subform={item.item as Subform}
                    level={level + 1}
                    parentPath={currentPath}
                    value={value?.[item.id] || {}}
                    errors={errors}
                    submitting={submitting}
                    handleFieldChange={handleFieldChange}
                    formulaValues={formulaValues}
                    toggleSubform={toggleSubform}
                    collapsedSubforms={collapsedSubforms}
                  />
                </div>
              )
            )
          ) : (
            <div className="border-2 border-dashed rounded-lg p-6 text-center border-gray-300 bg-gray-50">
              <Layers className={`w-6 h-6 mx-auto mb-2 ${colorScheme.accent}`} />
              <p className={`text-sm mb-2 ${colorScheme.accent}`}>No fields or nested subforms in this section</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}