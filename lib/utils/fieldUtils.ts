// ─────────────────────────────────────────────────────────────────────────────
// Shared field utilities — single source of truth.
// Extracted from page.tsx (formatFieldValue, getFieldIcon) and
// recordsDisplay.tsx (isImageUrl, isImageField, formatDynamicRowValue).
// ─────────────────────────────────────────────────────────────────────────────

// ── Subform field collector ───────────────────────────────────────────────────

/**
 * Recursively collects all FormField entries from a subform tree.
 * Works with both direct `subforms` arrays and nested `childSubforms`.
 */
export function getAllSubformFields<
  S extends { fields: F[]; childSubforms?: S[] },
  F,
>(subforms: S[]): F[] {
  let fields: F[] = [];
  subforms.forEach((subform) => {
    fields = [...fields, ...subform.fields];
    if (subform.childSubforms?.length) {
      fields = [...fields, ...getAllSubformFields(subform.childSubforms)];
    }
  });
  return fields;
}

import {
  Type,
  Mail,
  Hash,
  CalendarDays,
  Link,
  Upload,
  CheckSquare,
  Radio,
  ChevronDown,
  FileText,
} from "lucide-react";

// ── Field type constant ───────────────────────────────────────────────────────

export const FIELD_TYPES = {
  TEXT: "text",
  TEXTAREA: "textarea",
  NUMBER: "number",
  EMAIL: "email",
  PHONE: "phone",
  TEL: "tel",
  URL: "url",
  DATE: "date",
  DATETIME: "datetime",
  CHECKBOX: "checkbox",
  SWITCH: "switch",
  RADIO: "radio",
  SELECT: "select",
  DROPDOWN: "dropdown",
  LOOKUP: "lookup",
  FILE: "file",
  FORMULA: "formula",
  ADDRESS: "address",
  DYNAMIC_ROWS: "dynamicRows",
} as const;

export type FieldType = (typeof FIELD_TYPES)[keyof typeof FIELD_TYPES];

// ── Image helpers ─────────────────────────────────────────────────────────────

export const isImageUrl = (val: any): boolean => {
  if (typeof val !== "string") return false;
  if (!val.startsWith("http")) return false;
  // Strip query string before checking extension
  const path = val.split("?")[0];
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(path);
};

export const isImageField = (label: string): boolean => {
  const lowerLabel = label.toLowerCase().trim();
  return (
    lowerLabel === "img" ||
    lowerLabel.includes("image") ||
    lowerLabel.includes("photo") ||
    lowerLabel.includes("camera") ||
    lowerLabel.includes("picture") ||
    lowerLabel.includes("thumbnail")
  );
};

// ── Dynamic row display ───────────────────────────────────────────────────────

export const formatDynamicRowValue = (rows: any[]): string => {
  if (!Array.isArray(rows) || rows.length === 0) return "NaN";
  return rows
    .map((row) => {
      const values = Object.entries(row)
        .filter(([key]) => !key.startsWith("_"))
        .map(([_, val]) => String(val))
        .filter((v) => v && v !== "undefined" && v !== "null");
      return values.length > 0 ? `(${values.join(", ")})` : "";
    })
    .filter((v) => v !== "")
    .join(" ");
};

// ── Field value formatter ─────────────────────────────────────────────────────

export const formatFieldValue = (fieldType: string, value: any): string => {
  if (value === null || value === undefined || value === "") return "";

  switch (fieldType) {
    case "date":
    case "datetime":
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return String(value);
      }

    case "email":
    case "tel":
    case "phone":
    case "text":
    case "textarea":
    case "url":
      return String(value);

    case "number":
      if (typeof value === "number") return value.toLocaleString();
      if (typeof value === "string" && !isNaN(Number(value)))
        return Number(value).toLocaleString();
      return String(value);

    case "checkbox":
    case "switch":
      if (typeof value === "boolean") return value ? "✓ Yes" : "✗ No";
      if (typeof value === "string")
        return value.toLowerCase() === "true" || value === "1"
          ? "✓ Yes"
          : "✗ No";
      return value ? "✓ Yes" : "✗ No";

    case "lookup":
      return String(value);

    case "image":
    case "camera":
    case "signature":
      if (Array.isArray(value)) return `${value.length} image(s)`;
      return typeof value === "string" && value.startsWith("http") ? "1 image" : String(value);

    case "file":
      if (typeof value === "object" && value !== null) {
        if (value.name) return String(value.name);
        if (Array.isArray(value)) return `${value.length} file(s)`;
        if (value.files && Array.isArray(value.files))
          return `${value.files.length} file(s)`;
      }
      return String(value);

    case "radio":
    case "select":
      return String(value);

    case "address":
      if (typeof value === "object" && value !== null) {
        // Address values may use either lowercase keys (line1, city, …) or
        // uppercase (LINE1, CITY, …) depending on the data source. Look up
        // each part case-insensitively and join with commas.
        const addr = value as Record<string, any>;
        const lookup = (k: string): string => {
          const match = Object.keys(addr).find(
            (key) => key.toLowerCase() === k.toLowerCase(),
          );
          return match ? String(addr[match] ?? "").trim() : "";
        };
        const parts = [
          lookup("line1"),
          lookup("line2"),
          lookup("city"),
          lookup("state"),
          lookup("postal"),
          lookup("country"),
        ].filter(Boolean);
        return parts.join(", ");
      }
      return String(value);

    default:
      if (typeof value === "object" && value !== null)
        return JSON.stringify(value).substring(0, 50) + "...";
      return String(value);
  }
};

// ── Field icon mapper ─────────────────────────────────────────────────────────

export const getFieldIcon = (fieldType: string) => {
  switch (fieldType) {
    case "text":
      return Type;
    case "email":
      return Mail;
    case "number":
      return Hash;
    case "date":
    case "datetime":
      return CalendarDays;
    case "checkbox":
      return CheckSquare;
    case "radio":
      return Radio;
    case "select":
      return ChevronDown;
    case "file":
      return Upload;
    case "lookup":
      return Link;
    case "textarea":
      return FileText;
    case "tel":
    case "phone":
      return Hash;
    case "url":
      return Link;
    default:
      return Type;
  }
};
