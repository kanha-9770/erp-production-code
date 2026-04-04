// components/public-form/FormBody.tsx
// Shared form body component used by both PublicFormDialog and the public form page.
"use client";
import React from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Calculator,
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";
import type { Form, FormField, Subform } from "@/types/form-builder";
import { FormRenderer } from "./FormRenderer";

// ── Nesting colour palette (single source of truth) ───────────────────────────
export const NESTING_COLORS = [
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

// ── Types ─────────────────────────────────────────────────────────────────────

type RootItem =
  | { type: "section"; data: Form["sections"][number] }
  | { type: "subform"; data: Subform; parentSectionId?: string };

interface FormBodyProps {
  form: Form;
  formData: Record<string, any>;
  errors: Record<string, string>;
  submitting: boolean;
  submitted: boolean;
  formulaValues: Record<string, any>;
  allFields: FormField[];
  locationStatus: Record<string, "idle" | "fetching" | "success" | "failed">;
  collapsedSubforms: Record<string, boolean>;
  rootItems: RootItem[];
  idToLabel: Record<string, string>;

  // Handlers
  handleFieldChange: (id: string, value: any, fullOption?: any) => void;
  toggleSubform: (id: string) => void;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  // Visibility helpers
  isFieldVisible: (field: FormField, sectionId: string) => boolean;
  isSectionVisible: (id: string) => boolean;

  // Optional (dialog-only features)
  isViewOnly?: boolean;
  isSectionReadOnly?: (sectionId: string) => boolean | null;
  isFieldReadOnly?: (fieldId: string) => boolean | null;
  dynamicSubformInstances?: Record<string, string[]>;
  addSubformRow?: (id: string) => void;
  removeSubformRow?: (id: string, instanceId: string) => void;
  handleDynamicFieldChange?: (
    fieldKey: string,
    value: any,
    field: FormField,
  ) => void;
  validateField?: (field: FormField, value: any) => string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFieldTypeLabel(type: string) {
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
}

// ── SubformBlock (recursive) ──────────────────────────────────────────────────

function SubformBlock({
  subform,
  level = 0,
  parentPath = "",
  props,
}: {
  subform: Subform;
  level?: number;
  parentPath?: string;
  props: FormBodyProps;
}) {
  const {
    formData,
    errors,
    submitting,
    submitted,
    formulaValues,
    allFields,
    locationStatus,
    collapsedSubforms,
    idToLabel,
    handleFieldChange,
    toggleSubform,
    setErrors,
    isFieldVisible,
    isSectionVisible,
    isViewOnly = false,
    isSectionReadOnly,
    isFieldReadOnly,
    dynamicSubformInstances = {},
    addSubformRow,
    removeSubformRow,
    handleDynamicFieldChange,
  } = props;

  if (!isSectionVisible(subform.id)) return null;

  // Compute effective view-only for this subform
  let effectiveViewOnly = !!isViewOnly;
  if (isSectionReadOnly) {
    const sr = isSectionReadOnly(subform.id);
    if (sr === true) effectiveViewOnly = true;   // section is VIEW-only
    if (sr === false) effectiveViewOnly = false;  // section is explicitly editable
  }

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

  const renderFieldItem = (
    field: FormField,
    fieldKey: string,
    forceReadOnly: boolean,
  ) => {
    // Field-level permission can override section/form-level
    let fieldReadOnly = forceReadOnly;
    if (isFieldReadOnly) {
      const fr = isFieldReadOnly(field.id);
      if (fr === true) fieldReadOnly = true;
      if (fr === false) fieldReadOnly = false;
    }
    return (
      <FormRenderer
        field={{ ...field, id: fieldKey }}
        value={formData[fieldKey]}
        error={errors[fieldKey]}
        submitting={submitting}
        submitted={submitted}
        handleFieldChange={
          fieldKey === field.id
            ? handleFieldChange
            : (_, v, full) => {
                if (handleDynamicFieldChange) {
                  handleDynamicFieldChange(fieldKey, v, field);
                } else {
                  handleFieldChange(fieldKey, v, full);
                }
              }
        }
        formulaValues={formulaValues}
        isInSubform
        formData={formData}
        allFields={allFields}
        setErrors={setErrors}
        locationStatus={locationStatus}
        forceReadOnly={fieldReadOnly}
        idToLabel={idToLabel}
      />
    );
  };

  return (
    <div
      className={`rounded-lg border border-gray-200 shadow-sm ${colorScheme.leftBorder} ${colorScheme.bg} ${level > 0 ? "ml-8 mt-6" : ""}`}
    >
      {/* Header */}
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
                {instances.length > 0 && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                  >
                    +{instances.length} row{instances.length !== 1 ? "s" : ""}
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
          {addSubformRow && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addSubformRow(subform.id)}
              disabled={submitting || submitted || effectiveViewOnly}
              className="ml-2 whitespace-nowrap"
            >
              <span className="mr-1">+</span> Add Row
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-5 space-y-6">
          {/* Child subforms + fields interleaved */}
          {hasChildSubforms ? (
            allItems.length > 0 ? (
              allItems.map((item) =>
                item.type === "field" ? (
                  <FieldWrapper
                    key={item.id}
                    field={item.item as FormField}
                    error={errors[(item.item as FormField).id]}
                  >
                    {renderFieldItem(
                      item.item as FormField,
                      (item.item as FormField).id,
                      effectiveViewOnly,
                    )}
                  </FieldWrapper>
                ) : (
                  <div key={item.id} className="ml-4 mt-4">
                    <SubformBlock
                      subform={item.item as Subform}
                      level={level + 1}
                      parentPath={currentPath}
                      props={props}
                    />
                  </div>
                ),
              )
            ) : (
              <EmptySubform colorScheme={colorScheme} />
            )
          ) : null}

          {/* Dynamic rows table */}
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
                          className={`p-4 border-r border-slate-200 flex flex-col justify-between ${
                            field.type === "hidden"
                              ? "hidden p-0 min-w joseph-0"
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
                    {removeSubformRow && (
                      <div className="min-w-[140px] border-l border-slate-200 bg-[#f8f9fb] p-4">
                        <span className="font-medium text-[#374151] text-[15px]">
                          Actions
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Rows */}
                  {allInstances.length > 0 ? (
                    allInstances.map((instanceId, rowIndex) => {
                      const isOriginal = instanceId === "original";
                      return (
                        <div
                          key={isOriginal ? "original" : instanceId}
                          className={`flex min-w-max ${
                            isOriginal && !hasChildSubforms
                              ? "bg-white"
                              : "bg-blue-50/40"
                          } border-b border-slate-200`}
                        >
                          {visibleFields.map((field) => {
                            const fieldKey = isOriginal
                              ? field.id
                              : `${field.id}__${instanceId}`;
                            return (
                              <div
                                key={field.id}
                                className={`p-4 border-r border-slate-200 ${
                                  field.type === "hidden"
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
                                {renderFieldItem(field, fieldKey, effectiveViewOnly)}
                                {errors[fieldKey] && (
                                  <p className="text-sm text-red-500 mt-2 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {errors[fieldKey]}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                          {removeSubformRow && (
                            <div className="min-w-[140px] p-4 border-r border-slate-200 flex items-center">
                              {(hasChildSubforms || rowIndex > 0) && (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() =>
                                    removeSubformRow(subform.id, instanceId)
                                  }
                                  disabled={
                                    submitting || submitted || effectiveViewOnly
                                  }
                                  className="h-6 text-xs"
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          )}
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
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function FieldWrapper({
  field,
  error,
  children,
}: {
  field: FormField;
  error?: string;
  children: React.ReactNode;
}) {
  const showLabel =
    field.type !== "checkbox" &&
    field.type !== "switch" &&
    field.type !== "hidden";
  const showDescription = !!field.description && field.type !== "hidden";
  const showError =
    !!error &&
    field.type !== "phone" &&
    field.type !== "phone-input" &&
    field.type !== "address";

  return (
    <div
      className={`flex flex-col ${
        field.isDependent ? "mt-6 p-4 border rounded-lg bg-muted/30" : ""
      }`}
    >
      {/* Label area — fixed structure so inputs align across grid columns */}
      {showLabel && (
        <Label
          htmlFor={field.id}
          className="text-sm font-medium flex items-center gap-2 mb-1 min-h-[20px]"
        >
          {field.label}
          {field.type === "formula" && (
            <Badge variant="outline" className="text-xs font-normal">
              <Calculator className="h-3 w-3 mr-1" />
              Auto
            </Badge>
          )}
          {field.validation?.required && field.type !== "formula" && (
            <span className="text-red-500">*</span>
          )}
        </Label>
      )}
      {showDescription && (
        <p className="text-xs text-muted-foreground mb-1.5 leading-normal">{field.description}</p>
      )}

      {/* Input area */}
      {children}

      {/* Error area */}
      {showError && (
        <p className="text-sm text-red-500 flex items-center gap-1 mt-1.5">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function EmptySubform({
  colorScheme,
}: {
  colorScheme: (typeof NESTING_COLORS)[number];
}) {
  return (
    <div className="border-2 border-dashed rounded-lg p-8 text-center border-gray-300 bg-gray-50/50">
      <Layers
        className={`w-8 h-8 mx-auto mb-3 ${colorScheme.accent} opacity-70`}
      />
      <p className="text-sm text-gray-600">
        No fields or nested subforms yet
      </p>
    </div>
  );
}

// ── FormBody (main export) ────────────────────────────────────────────────────

export function FormBody(props: FormBodyProps) {
  const {
    formData,
    errors,
    submitting,
    submitted,
    formulaValues,
    allFields,
    locationStatus,
    idToLabel,
    rootItems,
    handleFieldChange,
    setErrors,
    isFieldVisible,
    isViewOnly = false,
    isSectionReadOnly,
    isFieldReadOnly,
  } = props;

  if (rootItems.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No visible sections or subforms
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {rootItems.map((item, index) => {
        if (item.type === "section") {
          const section = item.data;
          const visibleSectionFields = section.fields.filter((f: FormField) =>
            isFieldVisible(f, section.id),
          );

          return (
            <div
              key={section.id}
              className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden"
            >
              {/* Section header */}
              <div className="bg-muted/50 px-6 py-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{section.title}</h3>
                    {section.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {section.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Section fields */}
              <div className="p-6">
                <div
                  className="grid gap-x-6 gap-y-5 items-start"
                  style={{
                    gridTemplateColumns: `repeat(${section.columns || 1}, minmax(0, 1fr))`,
                  }}
                >
                  {visibleSectionFields.map((field: FormField) => {
                    // Compute read-only for this field:
                    // 1. Start with form-level view-only state
                    let readOnly = !!isViewOnly;
                    // 2. Section-level can override (editable section in view-only form)
                    if (isSectionReadOnly) {
                      const sr = isSectionReadOnly(section.id);
                      if (sr === true) readOnly = true;   // section is VIEW-only
                      if (sr === false) readOnly = false;  // section is explicitly editable
                    }
                    // 3. Field-level is most specific — overrides everything
                    if (isFieldReadOnly) {
                      const fr = isFieldReadOnly(field.id);
                      if (fr === true) readOnly = true;   // field is VIEW-only
                      if (fr === false) readOnly = false;  // field is explicitly editable
                    }
                    return (
                      <FieldWrapper
                        key={field.id}
                        field={field}
                        error={errors[field.id]}
                      >
                        <FormRenderer
                          field={field}
                          value={formData[field.id]}
                          error={errors[field.id]}
                          submitting={submitting}
                          submitted={submitted}
                          handleFieldChange={handleFieldChange}
                          formulaValues={formulaValues}
                          formData={formData}
                          allFields={allFields}
                          setErrors={setErrors}
                          locationStatus={locationStatus}
                          forceReadOnly={readOnly}
                          idToLabel={idToLabel}
                        />
                      </FieldWrapper>
                    );
                  })}
                </div>

                {/* Subforms belonging to this section */}
                {rootItems
                  .filter(
                    (it) =>
                      it.type === "subform" &&
                      (it as any).parentSectionId === section.id,
                  )
                  .map((it) => (
                    <div key={it.data.id} className="mt-10">
                      <SubformBlock
                        subform={it.data as Subform}
                        level={1}
                        parentPath={section.title}
                        props={props}
                      />
                    </div>
                  ))}
              </div>
            </div>
          );
        }

        // Top-level subform (no parent section)
        if (item.type === "subform" && !(item as any).parentSectionId) {
          return (
            <div key={item.data.id} className="mt-8">
              <SubformBlock
                subform={item.data as Subform}
                level={0}
                parentPath=""
                props={props}
              />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
