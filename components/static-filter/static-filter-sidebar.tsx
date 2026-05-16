"use client";

/**
 * Static-list field filter sidebar.
 *
 * Same visual language and operator semantics as the dynamic-form records
 * filter sidebar (`components/modules/AdvancedFilterSidebar.tsx`), but built
 * for typed lists (StaffingPlan, JobOpening, …) where each row is a plain
 * object instead of a `processedData[]` payload.
 *
 * Pages declare which of their columns are filterable via a
 * `StaticFilterField<T>[]` config (id, label, type, accessor) and pass the
 * active `FieldFilter[]` state in. The sidebar handles operator selection,
 * value entry, the "select values from records" picker, and "clear all".
 * Applying the filters to the dataset is the page's responsibility — call
 * `applyStaticFilters(records, fields, filters)` from `./apply-filters`.
 */

import React from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FieldFilter, StaticFilterField } from "./types";

const getOperatorsForFieldType = (fieldType: string) => {
  switch (fieldType) {
    case "text":
      return [
        { value: "is", label: "is" },
        { value: "isn't", label: "isn't" },
        { value: "contains", label: "contains" },
        { value: "doesn't contain", label: "doesn't contain" },
        { value: "starts with", label: "starts with" },
        { value: "ends with", label: "ends with" },
        { value: "is one of", label: "is one of" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ];
    case "number":
      return [
        { value: "is", label: "is" },
        { value: "isn't", label: "isn't" },
        { value: "greater than", label: "greater than" },
        { value: "less than", label: "less than" },
        { value: "between", label: "between" },
        { value: "is one of", label: "is one of" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ];
    case "date":
      return [
        { value: "is", label: "is" },
        { value: "isn't", label: "isn't" },
        { value: "after", label: "after" },
        { value: "before", label: "before" },
        { value: "between", label: "between" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ];
    case "boolean":
      return [
        { value: "is true", label: "is true" },
        { value: "is false", label: "is false" },
      ];
    case "select":
      return [
        { value: "is", label: "is" },
        { value: "isn't", label: "isn't" },
        { value: "is one of", label: "is one of" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ];
    default:
      return [
        { value: "is", label: "is" },
        { value: "contains", label: "contains" },
        { value: "is one of", label: "is one of" },
        { value: "is empty", label: "is empty" },
        { value: "is not empty", label: "is not empty" },
      ];
  }
};

const needsValueInput = (operator: string) =>
  !["is empty", "is not empty", "is true", "is false"].includes(operator);

const needsSecondValue = (operator: string) => operator === "between";

interface ExpandedFieldState {
  fieldId: string;
  operator: string;
  value: string;
  value2?: string;
}

// ── Value Picker Dialog ────────────────────────────────────────────────────

interface ValuePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldLabel: string;
  allValues: string[];
  selectedValues: string[];
  onApply: (values: string[]) => void;
}

const ValuePickerDialog: React.FC<ValuePickerDialogProps> = ({
  open,
  onOpenChange,
  fieldLabel,
  allValues,
  selectedValues,
  onApply,
}) => {
  const [localSelected, setLocalSelected] = React.useState<Set<string>>(
    new Set(selectedValues),
  );
  const [dialogSearch, setDialogSearch] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setLocalSelected(new Set(selectedValues));
      setDialogSearch("");
    }
  }, [open, selectedValues]);

  const filtered = React.useMemo(() => {
    if (!dialogSearch) return allValues;
    const q = dialogSearch.toLowerCase();
    return allValues.filter((v) => v.toLowerCase().includes(q));
  }, [allValues, dialogSearch]);

  const toggleValue = (val: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  const selectAll = () => setLocalSelected(new Set(filtered));
  const clearAll = () =>
    setLocalSelected((prev) => {
      const next = new Set(prev);
      for (const v of filtered) next.delete(v);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Select values for &quot;{fieldLabel}&quot;
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Choose one or more values to filter by.
            {localSelected.size > 0 && ` ${localSelected.size} selected`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search values"
            value={dialogSearch}
            onChange={(e) => setDialogSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={selectAll}
            className="font-medium text-primary hover:underline"
          >
            Select all{dialogSearch ? " visible" : ""}
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Clear{dialogSearch ? " visible" : " all"}
          </button>
        </div>

        {localSelected.size > 0 && (
          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
            {Array.from(localSelected).map((val) => (
              <Badge
                key={val}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                onClick={() => toggleValue(val)}
              >
                {val.length > 20 ? val.slice(0, 20) + "…" : val}
                <X className="h-2.5 w-2.5 ml-1" />
              </Badge>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 max-h-60 overflow-y-auto border rounded-md">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No values found
            </div>
          ) : (
            filtered.map((val) => {
              const isChecked = localSelected.has(val);
              return (
                <label
                  key={val}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors border-b last:border-b-0",
                    isChecked ? "bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleValue(val)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs truncate">{val}</span>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(Array.from(localSelected));
              onOpenChange(false);
            }}
            className="text-xs"
          >
            Apply ({localSelected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Main Sidebar ───────────────────────────────────────────────────────────

interface StaticFilterSidebarProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: StaticFilterField<T>[];
  filters: FieldFilter[];
  onFiltersChange: (filters: FieldFilter[]) => void;
  /** Source records — used to populate the "select values from records"
   * picker. The component never mutates them. */
  records: T[];
}

export function StaticFilterSidebar<T>({
  open,
  onOpenChange,
  fields,
  filters,
  onFiltersChange,
  records,
}: StaticFilterSidebarProps<T>) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [fieldFiltersExpanded, setFieldFiltersExpanded] = React.useState(true);
  const [expandedFields, setExpandedFields] = React.useState<
    Map<string, ExpandedFieldState>
  >(() => {
    const m = new Map<string, ExpandedFieldState>();
    for (const f of filters) {
      m.set(f.fieldId, {
        fieldId: f.fieldId,
        operator: f.operator,
        value: f.value,
        value2: f.value2,
      });
    }
    return m;
  });

  const [valuePickerOpen, setValuePickerOpen] = React.useState(false);
  const [valuePickerFieldId, setValuePickerFieldId] = React.useState<
    string | null
  >(null);

  // Keep the local expanded-fields map in sync with parent-driven filter
  // resets (e.g. "Clear all" from a saved-view switch).
  React.useEffect(() => {
    setExpandedFields((prev) => {
      const next = new Map<string, ExpandedFieldState>();
      for (const f of filters) {
        next.set(f.fieldId, {
          fieldId: f.fieldId,
          operator: f.operator,
          value: f.value,
          value2: f.value2,
        });
      }
      // Preserve "checked but no value yet" rows the user opened locally.
      for (const [id, st] of prev) {
        if (!next.has(id) && !filters.find((f) => f.fieldId === id)) {
          if (st.value === "" && !st.value2) next.set(id, st);
        }
      }
      return next;
    });
  }, [filters]);

  const toggleFieldExpansion = (fieldId: string, checked: boolean) => {
    if (checked) {
      const field = fields.find((f) => f.id === fieldId);
      if (!field) return;
      const operators = getOperatorsForFieldType(field.type);
      setExpandedFields(
        new Map(
          expandedFields.set(fieldId, {
            fieldId,
            operator: operators[0].value,
            value: "",
          }),
        ),
      );
    } else {
      const newExpanded = new Map(expandedFields);
      newExpanded.delete(fieldId);
      setExpandedFields(newExpanded);
      onFiltersChange(filters.filter((f) => f.fieldId !== fieldId));
    }
  };

  const updateFieldFilter = (
    fieldId: string,
    updates: Partial<ExpandedFieldState>,
  ) => {
    const current = expandedFields.get(fieldId);
    if (!current) return;

    const updated = { ...current, ...updates };
    setExpandedFields(new Map(expandedFields.set(fieldId, updated)));

    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;

    const existingFilterIndex = filters.findIndex((f) => f.fieldId === fieldId);
    const newFilter: FieldFilter = {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.type,
      operator: updated.operator,
      value: updated.value,
      value2: updated.value2,
    };

    if (existingFilterIndex >= 0) {
      const newFilters = [...filters];
      newFilters[existingFilterIndex] = newFilter;
      onFiltersChange(newFilters);
    } else {
      onFiltersChange([...filters, newFilter]);
    }
  };

  const isFieldExpanded = (fieldId: string) => expandedFields.has(fieldId);
  const getFieldExpandedData = (fieldId: string) => expandedFields.get(fieldId);

  const filteredFields = React.useMemo(() => {
    if (!searchQuery) return fields;
    const q = searchQuery.toLowerCase();
    return fields.filter((f) => f.label.toLowerCase().includes(q));
  }, [fields, searchQuery]);

  const getUniqueValuesForField = React.useCallback(
    (field: StaticFilterField<T>): string[] => {
      if (!records || records.length === 0) return [];
      const set = new Set<string>();
      for (const r of records) {
        const v = field.accessor(r);
        if (v === null || v === undefined) continue;
        const str = String(v).trim();
        if (str) set.add(str);
      }
      return Array.from(set).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
    },
    [records],
  );

  const valuePickerField = valuePickerFieldId
    ? fields.find((f) => f.id === valuePickerFieldId)
    : null;

  const valuePickerAllValues = React.useMemo(() => {
    if (!valuePickerField) return [];
    return getUniqueValuesForField(valuePickerField);
  }, [valuePickerField, getUniqueValuesForField]);

  const valuePickerSelected = React.useMemo(() => {
    if (!valuePickerFieldId) return [];
    const expanded = expandedFields.get(valuePickerFieldId);
    if (!expanded || !expanded.value) return [];
    return expanded.value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }, [valuePickerFieldId, expandedFields]);

  const handleValuePickerApply = (values: string[]) => {
    if (!valuePickerFieldId) return;
    const joinedValue = values.join(", ");
    if (values.length > 1) {
      updateFieldFilter(valuePickerFieldId, {
        operator: "is one of",
        value: joinedValue,
      });
    } else {
      updateFieldFilter(valuePickerFieldId, { value: joinedValue });
    }
  };

  const clearAll = () => {
    setExpandedFields(new Map());
    onFiltersChange([]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-xs p-0 flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b bg-muted/40">
          <SheetTitle className="text-[15px] font-semibold tracking-tight">
            Filters
          </SheetTitle>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search fields"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-8 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted z-10"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {filters.length > 0 && (
            <div className="flex items-center justify-between mt-2.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Badge
                  variant="default"
                  className="h-4 min-w-[18px] px-1 text-[10px]"
                >
                  {filters.length}
                </Badge>
                active filter{filters.length > 1 ? "s" : ""}
              </span>
              <button
                onClick={clearAll}
                className="text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => setFieldFiltersExpanded(!fieldFiltersExpanded)}
            className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted/40 transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                !fieldFiltersExpanded && "-rotate-90",
              )}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Filter by Field
            </span>
          </button>
          {fieldFiltersExpanded && (
            <div className="px-3 pb-3 space-y-1.5">
              {filteredFields.map((field) => {
                const isExpanded = isFieldExpanded(field.id);
                const expandedData = getFieldExpandedData(field.id);
                const operators = getOperatorsForFieldType(field.type);

                return (
                  <div key={field.id} className="rounded-md">
                    <label className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
                      <Checkbox
                        checked={isExpanded}
                        onCheckedChange={(checked) =>
                          toggleFieldExpansion(field.id, !!checked)
                        }
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-sm font-medium flex-1 truncate">
                        {field.label}
                      </span>
                    </label>

                    {isExpanded && expandedData && (
                      <div className="ml-5 mt-1.5 space-y-1.5 pr-2">
                        <Select
                          value={expandedData.operator}
                          onValueChange={(v) =>
                            updateFieldFilter(field.id, { operator: v })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {operators.map((op) => (
                              <SelectItem
                                key={op.value}
                                value={op.value}
                                className="text-xs"
                              >
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {needsValueInput(expandedData.operator) && (
                          <>
                            {field.type === "select" &&
                            field.options &&
                            expandedData.operator !== "is one of" ? (
                              <Select
                                value={expandedData.value || ""}
                                onValueChange={(val) =>
                                  updateFieldFilter(field.id, {
                                    value: val === "__clear__" ? "" : val,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select a value" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem
                                    value="__clear__"
                                    className="text-xs text-muted-foreground italic"
                                  >
                                    — Clear —
                                  </SelectItem>
                                  {field.options.map((opt) => (
                                    <SelectItem
                                      key={opt.value}
                                      value={opt.value}
                                      className="text-xs"
                                    >
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={
                                  field.type === "number"
                                    ? "number"
                                    : field.type === "date"
                                      ? "date"
                                      : "text"
                                }
                                placeholder={
                                  expandedData.operator === "is one of"
                                    ? "value1, value2, …"
                                    : "Type here"
                                }
                                value={expandedData.value}
                                onChange={(e) =>
                                  updateFieldFilter(field.id, {
                                    value: e.target.value,
                                  })
                                }
                                className="h-8 text-xs"
                              />
                            )}
                          </>
                        )}

                        {needsSecondValue(expandedData.operator) && (
                          <Input
                            type={
                              field.type === "number"
                                ? "number"
                                : field.type === "date"
                                  ? "date"
                                  : "text"
                            }
                            placeholder="And"
                            value={expandedData.value2 || ""}
                            onChange={(e) =>
                              updateFieldFilter(field.id, {
                                value2: e.target.value,
                              })
                            }
                            className="h-8 text-xs"
                          />
                        )}

                        {expandedData.operator === "is one of" &&
                          expandedData.value && (
                            <div className="flex flex-wrap gap-1">
                              {expandedData.value
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean)
                                .map((val) => (
                                  <Badge
                                    key={val}
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 h-5 cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => {
                                      const current = expandedData.value
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean);
                                      const updated = current.filter(
                                        (v) => v !== val,
                                      );
                                      updateFieldFilter(field.id, {
                                        value: updated.join(", "),
                                        operator:
                                          updated.length > 1
                                            ? "is one of"
                                            : updated.length === 1
                                              ? "is"
                                              : "is one of",
                                      });
                                    }}
                                  >
                                    {val.length > 15
                                      ? val.slice(0, 15) + "…"
                                      : val}
                                    <X className="h-2.5 w-2.5 ml-0.5" />
                                  </Badge>
                                ))}
                            </div>
                          )}

                        {needsValueInput(expandedData.operator) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-[11px]"
                            onClick={() => {
                              setValuePickerFieldId(field.id);
                              setValuePickerOpen(true);
                            }}
                          >
                            Select values from records
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredFields.length === 0 && (
                <div className="px-2 py-6 text-xs text-center text-muted-foreground">
                  No fields match &quot;{searchQuery}&quot;
                </div>
              )}
            </div>
          )}
        </div>

        <ValuePickerDialog
          open={valuePickerOpen}
          onOpenChange={setValuePickerOpen}
          fieldLabel={valuePickerField?.label || ""}
          allValues={valuePickerAllValues}
          selectedValues={valuePickerSelected}
          onApply={handleValuePickerApply}
        />
      </SheetContent>
    </Sheet>
  );
}
