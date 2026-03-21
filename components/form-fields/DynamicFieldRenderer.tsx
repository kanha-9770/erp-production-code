"use client";
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
import { Label } from "@/components/ui/label";
import type { FormField } from "@/types/form-builder";
import { FileUploadZone } from "@/components/forms/file-upload-zone";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { isValidPhoneNumber } from "react-phone-number-input";

interface DynamicFieldRendererProps {
  field: FormField;
  fieldKey: string;
  isInSubform: boolean;
  forceReadOnly: boolean;
  value: any;
  error: string | undefined;
  submitting: boolean;
  submitted: boolean;
  onDynamicFieldChange: (fieldKey: string, value: any, field: FormField) => void;
  onValidate: (field: FormField, value: any) => string | null;
}

export function DynamicFieldRenderer({
  field,
  fieldKey,
  isInSubform,
  forceReadOnly,
  value,
  error,
  submitting,
  submitted,
  onDynamicFieldChange,
  onValidate,
}: DynamicFieldRendererProps) {
  const fieldType = (field.type || "").toLowerCase();

  const handleDynamicFieldChange = (newValue: any, fullOption?: any) => {
    if (forceReadOnly) return;
    onDynamicFieldChange(fieldKey, newValue, field);
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
    case "radio": {
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
    }
    case "select": {
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
            {selectOptions
              .filter((opt: any) => (opt.value || opt.id) !== undefined && (opt.value || opt.id) !== "")
              .map((opt: any) => (
                <SelectItem
                  key={opt.value || opt.id}
                  value={String(opt.value || opt.id)}
                >
                  {opt.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
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
          placeholder={field.placeholder || ""}
          value={value || ""}
          onChange={(e) => handleDynamicFieldChange(e.target.value)}
          className={`${error ? "border-red-500" : ""} ${isInSubform ? "border-purple-200 focus:border-purple-400" : ""
            }`}
        />
      );
  }
}
