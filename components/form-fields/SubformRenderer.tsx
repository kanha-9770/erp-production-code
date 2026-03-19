"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { AlertCircle, ChevronDown, ChevronRight, Layers } from "lucide-react";
import type { FormField, Subform } from "@/types/form-builder";
import { FormFieldRenderer } from "@/components/form-fields/FormFieldRenderer";
import { DynamicFieldRenderer } from "@/components/form-fields/DynamicFieldRenderer";

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

interface SubformRendererProps {
  subform: Subform;
  level: number;
  parentPath: string;
  // state
  formData: Record<string, any>;
  errors: Record<string, string>;
  submitting: boolean;
  submitted: boolean;
  isViewOnly: boolean;
  locationStatus: Record<string, "idle" | "fetching" | "success" | "failed">;
  formulaValues: Record<string, any>;
  idToLabel: Record<string, string>;
  collapsedSubforms: Record<string, boolean>;
  dynamicSubformInstances: Record<string, string[]>;
  // handlers
  onFieldChange: (fieldId: string, value: any, fullOption?: any) => void;
  onClearFile: (fieldId: string) => void;
  onToggleSubform: (subformId: string) => void;
  onAddSubformRow: (subformId: string) => void;
  onRemoveSubformRow: (subformId: string, instanceId: string) => void;
  onDynamicFieldChange: (fieldKey: string, value: any, field: FormField) => void;
  // visibility helpers
  isSectionVisible: (id: string) => boolean;
  isFieldVisible: (field: FormField, sectionId: string) => boolean;
  getParentValue: (field: FormField) => string | string[] | undefined;
  validateField: (field: FormField, value: any) => string | null;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function SubformRenderer({
  subform,
  level,
  parentPath,
  formData,
  errors,
  submitting,
  submitted,
  isViewOnly,
  locationStatus,
  formulaValues,
  idToLabel,
  collapsedSubforms,
  dynamicSubformInstances,
  onFieldChange,
  onClearFile,
  onToggleSubform,
  onAddSubformRow,
  onRemoveSubformRow,
  onDynamicFieldChange,
  isSectionVisible,
  isFieldVisible,
  getParentValue,
  validateField,
  setErrors,
}: SubformRendererProps) {
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
              onClick={() => onToggleSubform(subform.id)}
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
            onClick={() => onAddSubformRow(subform.id)}
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
                    <FormFieldRenderer
                      field={item.item as FormField}
                      isInSubform={true}
                      forceReadOnly={isViewOnly}
                      value={formData[(item.item as FormField).id]}
                      error={errors[(item.item as FormField).id]}
                      submitting={submitting}
                      submitted={submitted}
                      isViewOnly={isViewOnly}
                      locationStatus={locationStatus}
                      formulaValues={formulaValues}
                      idToLabel={idToLabel}
                      onFieldChange={onFieldChange}
                      onClearFile={onClearFile}
                      getParentValue={getParentValue}
                      errors={errors}
                      setErrors={setErrors}
                    />
                    {errors[(item.item as FormField).id] && (
                      <p className="text-sm text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors[(item.item as FormField).id]}
                      </p>
                    )}
                  </div>
                ) : (
                  <div key={item.id} className="ml-4 mt-4">
                    <SubformRenderer
                      subform={item.item as Subform}
                      level={level + 1}
                      parentPath={currentPath}
                      formData={formData}
                      errors={errors}
                      submitting={submitting}
                      submitted={submitted}
                      isViewOnly={isViewOnly}
                      locationStatus={locationStatus}
                      formulaValues={formulaValues}
                      idToLabel={idToLabel}
                      collapsedSubforms={collapsedSubforms}
                      dynamicSubformInstances={dynamicSubformInstances}
                      onFieldChange={onFieldChange}
                      onClearFile={onClearFile}
                      onToggleSubform={onToggleSubform}
                      onAddSubformRow={onAddSubformRow}
                      onRemoveSubformRow={onRemoveSubformRow}
                      onDynamicFieldChange={onDynamicFieldChange}
                      isSectionVisible={isSectionVisible}
                      isFieldVisible={isFieldVisible}
                      getParentValue={getParentValue}
                      validateField={validateField}
                      setErrors={setErrors}
                    />
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
                                {isOriginal ? (
                                  <FormFieldRenderer
                                    field={fieldForInstance}
                                    isInSubform={true}
                                    forceReadOnly={isViewOnly}
                                    value={formData[fieldKey]}
                                    error={errors[fieldKey]}
                                    submitting={submitting}
                                    submitted={submitted}
                                    isViewOnly={isViewOnly}
                                    locationStatus={locationStatus}
                                    formulaValues={formulaValues}
                                    idToLabel={idToLabel}
                                    onFieldChange={onFieldChange}
                                    onClearFile={onClearFile}
                                    getParentValue={getParentValue}
                                    errors={errors}
                                    setErrors={setErrors}
                                  />
                                ) : (
                                  <DynamicFieldRenderer
                                    field={fieldForInstance}
                                    fieldKey={fieldKey}
                                    isInSubform={true}
                                    forceReadOnly={isViewOnly}
                                    value={formData[fieldKey]}
                                    error={errors[fieldKey]}
                                    submitting={submitting}
                                    submitted={submitted}
                                    onDynamicFieldChange={onDynamicFieldChange}
                                    onValidate={validateField}
                                  />
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
                                  onRemoveSubformRow(subform.id, instanceId)
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
}
