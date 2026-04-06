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
      className={`rounded-lg border ${colorScheme.leftBorder} ${colorScheme.bg} ${level > 0 ? "ml-6 mt-5" : ""}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b bg-background/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => toggleSubform(subform.id)}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
            <Layers className={`w-4 h-4 shrink-0 ${colorScheme.accent}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold truncate">{subform.name}</h4>
                {level > 0 && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] leading-none px-1.5 py-0.5 ${colorScheme.levelBadge}`}
                  >
                    L{level}
                  </Badge>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {visibleFields.length} field{visibleFields.length !== 1 ? "s" : ""}
                  {visibleChildSubforms.length > 0 && ` · ${visibleChildSubforms.length} nested`}
                  {instances.length > 0 && ` · +${instances.length} row${instances.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              {level > 0 && pathParts.length > 1 && (
                <div className="flex items-center gap-0.5 mt-0.5 text-[11px] text-muted-foreground">
                  {pathParts.map((p, i) => (
                    <span key={i} className="flex items-center">
                      <span className={i === pathParts.length - 1 ? "font-medium text-foreground" : ""}>
                        {p}
                      </span>
                      {i < pathParts.length - 1 && (
                        <ChevronRight className="w-3 h-3 mx-0.5" />
                      )}
                    </span>
                  ))}
                </div>
              )}
              {subform.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{subform.description}</p>
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
              className="ml-2 h-7 text-xs whitespace-nowrap shrink-0"
            >
              + Add Row
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-4 space-y-4">
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
                  <div key={item.id} className="mt-3">
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
                    ? "mt-4 pt-4 border-t border-dashed space-y-3"
                    : "space-y-3"
                }
              >
                {hasChildSubforms && (
                  <p className="text-xs font-medium text-muted-foreground">
                    Additional Rows
                  </p>
                )}
                <div className="overflow-x-auto custom-scrollbar w-full rounded-md border">
                  {/* Header */}
                  <div className="flex min-w-max border-b bg-muted/50">
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
                          className={`px-3 py-2 border-r border-border/60 flex flex-col justify-between ${
                            field.type === "hidden"
                              ? "hidden p-0 min-w-0"
                              : "min-w-[260px]"
                          }`}
                        >
                          <span className="font-medium text-foreground text-xs truncate">
                            {field.label}
                            {field.validation?.required && (
                              <span className="text-red-500 ml-0.5">*</span>
                            )}
                          </span>
                          <span className="text-[11px] text-muted-foreground mt-0.5">
                            {getFieldTypeLabel(field.type)}
                          </span>
                        </div>
                      ))}
                    {removeSubformRow && (
                      <div className="min-w-[100px] border-l border-border/60 bg-muted/50 px-3 py-2">
                        <span className="font-medium text-foreground text-xs">
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
                              ? "bg-background"
                              : "bg-muted/20"
                          } border-b border-border/40 last:border-b-0`}
                        >
                          {visibleFields.map((field) => {
                            const fieldKey = isOriginal
                              ? field.id
                              : `${field.id}__${instanceId}`;
                            return (
                              <div
                                key={field.id}
                                className={`px-3 py-2.5 border-r border-border/40 ${
                                  field.type === "hidden"
                                    ? "hidden p-0 min-w-0"
                                    : "min-w-[260px]"
                                }`}
                              >
                                {field.description &&
                                  field.type !== "hidden" && (
                                    <p className="text-[11px] text-muted-foreground mb-1.5">
                                      {field.description}
                                    </p>
                                  )}
                                {renderFieldItem(field, fieldKey, effectiveViewOnly)}
                                {errors[fieldKey] && (
                                  <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3 shrink-0" />
                                    {errors[fieldKey]}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                          {removeSubformRow && (
                            <div className="min-w-[100px] px-3 py-2.5 border-r border-border/40 flex items-center">
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
                    <div className="flex min-w-max h-10 bg-background text-center justify-center items-center">
                      <span className="text-xs text-muted-foreground">No rows yet</span>
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
    <div className="border border-dashed rounded-md py-6 text-center">
      <Layers
        className={`w-5 h-5 mx-auto mb-2 ${colorScheme.accent} opacity-60`}
      />
      <p className="text-xs text-muted-foreground">
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
    <div className="space-y-6">
      {rootItems.map((item, index) => {
        if (item.type === "section") {
          const section = item.data;
          const visibleSectionFields = section.fields.filter((f: FormField) =>
            isFieldVisible(f, section.id),
          );

          // Gather subforms belonging to this section
          const sectionSubforms = rootItems
            .filter(
              (it) =>
                it.type === "subform" &&
                (it as any).parentSectionId === section.id,
            )
            .map((it) => it.data as Subform);

          // Merge fields and subforms into a single order-sorted list
          const allSectionItems: Array<
            | { kind: "field"; field: FormField; order: number }
            | { kind: "subform"; subform: Subform; order: number }
          > = [
            ...visibleSectionFields.map((f: FormField) => ({
              kind: "field" as const,
              field: f,
              order: f.order ?? 0,
            })),
            ...sectionSubforms.map((sf: Subform) => ({
              kind: "subform" as const,
              subform: sf,
              order: sf.order ?? 0,
            })),
          ];
          allSectionItems.sort((a, b) => a.order - b.order);

          // Group consecutive fields together into grid blocks,
          // with subforms rendered as full-width blocks between them.
          const renderGroups: Array<
            | { kind: "fields"; fields: FormField[] }
            | { kind: "subform"; subform: Subform }
          > = [];
          for (const entry of allSectionItems) {
            if (entry.kind === "field") {
              const last = renderGroups[renderGroups.length - 1];
              if (last && last.kind === "fields") {
                last.fields.push(entry.field);
              } else {
                renderGroups.push({ kind: "fields", fields: [entry.field] });
              }
            } else {
              renderGroups.push({ kind: "subform", subform: entry.subform });
            }
          }

          return (
            <div
              key={section.id}
              className="rounded-lg border bg-card text-card-foreground overflow-hidden"
            >
              {/* Section header */}
              <div className="bg-muted/40 px-5 py-3 border-b">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-semibold shrink-0">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold leading-tight truncate">{section.title}</h3>
                    {section.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                        {section.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Section content: fields and subforms interleaved by order */}
              <div className="p-5 space-y-5">
                {renderGroups.map((group, gIdx) => {
                  if (group.kind === "fields") {
                    return (
                      <div
                        key={`fields-${gIdx}`}
                        className="grid gap-x-5 gap-y-4 items-start"
                        style={{
                          gridTemplateColumns: `repeat(${section.columns || 1}, minmax(0, 1fr))`,
                        }}
                      >
                        {group.fields.map((field: FormField) => {
                          let readOnly = !!isViewOnly;
                          if (isSectionReadOnly) {
                            const sr = isSectionReadOnly(section.id);
                            if (sr === true) readOnly = true;
                            if (sr === false) readOnly = false;
                          }
                          if (isFieldReadOnly) {
                            const fr = isFieldReadOnly(field.id);
                            if (fr === true) readOnly = true;
                            if (fr === false) readOnly = false;
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
                    );
                  }

                  // Subform block
                  return (
                    <SubformBlock
                      key={group.subform.id}
                      subform={group.subform}
                      level={1}
                      parentPath={section.title}
                      props={props}
                    />
                  );
                })}
              </div>
            </div>
          );
        }

        // Top-level subform (no parent section)
        if (item.type === "subform" && !(item as any).parentSectionId) {
          return (
            <div key={item.data.id} className="mt-5">
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
