"use client";

/**
 * AdvancedFilter — multi-condition filter popover for the real-estate
 * workspace tables.
 *
 * Inspired by `components/modules/AdvancedFilterSidebar.tsx` (which is the
 * form-records UX users asked for), but stripped of its form-builder
 * dependencies. This component is generic: pages declare a list of
 * {@link FilterField} definitions describing what's filterable, and the
 * popover renders the right operator picker and value input(s) per field
 * type.
 *
 * The component is fully controlled. Pages own the conditions array and
 * pass it back through `value` / `onChange`. Combine with
 * {@link applyAdvancedFilters} (in `apply-advanced-filters.ts`) for the
 * client-side filtering pass.
 *
 * Why client-side: every existing real-estate RTK query already supports
 * a small set of server-side filters (search, status). We layer this
 * multi-condition filter on TOP of the server-filtered rows so we can
 * cover every column without touching every backend endpoint. The user's
 * page-size is bounded by the RTK pagination anyway, so the local pass is
 * O(rows on screen).
 */

import { useMemo, useState } from "react";
import { Plus, X, Filter as FilterIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────

export type FilterFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "boolean";

export interface FilterField {
  /** Stable id — used by `getValue` accessor + persistence. */
  id: string;
  /** Human label shown in the field picker. */
  label: string;
  /** Drives which operators are offered and what value input to render. */
  type: FilterFieldType;
  /** For `select` fields, the available options. */
  options?: Array<{ value: string; label: string }>;
  /** Pulls the comparable value off a row. Defaults to `row[id]`. */
  getValue?: (row: any) => unknown;
}

export interface FilterCondition {
  fieldId: string;
  /** Stable operator code — see {@link OPERATORS_BY_TYPE} below. */
  operator: string;
  /** Primary value. Stringified for transport (UI inputs are strings). */
  value: string;
  /** Used only by range operators (e.g. "between"). */
  value2?: string;
}

// ─── Operator catalog ────────────────────────────────────────────────────

const OPERATORS_BY_TYPE: Record<
  FilterFieldType,
  Array<{ value: string; label: string }>
> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "equals", label: "is" },
    { value: "not_equals", label: "isn't" },
    { value: "starts_with", label: "starts with" },
    { value: "ends_with", label: "ends with" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  number: [
    { value: "equals", label: "=" },
    { value: "not_equals", label: "≠" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
    { value: "between", label: "between" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  date: [
    { value: "equals", label: "on" },
    { value: "before", label: "before" },
    { value: "after", label: "after" },
    { value: "between", label: "between" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  select: [
    { value: "equals", label: "is" },
    { value: "not_equals", label: "isn't" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  boolean: [
    { value: "is_true", label: "is true" },
    { value: "is_false", label: "is false" },
  ],
};

/** Operators that don't need a value input. */
const NO_VALUE_OPS = new Set(["empty", "not_empty", "is_true", "is_false"]);
/** Operators that need a second value input. */
const SECOND_VALUE_OPS = new Set(["between"]);

export function operatorsForField(field: FilterField) {
  return OPERATORS_BY_TYPE[field.type] ?? OPERATORS_BY_TYPE.text;
}

export function isNoValueOp(op: string) {
  return NO_VALUE_OPS.has(op);
}

export function isRangeOp(op: string) {
  return SECOND_VALUE_OPS.has(op);
}

/**
 * Drop conditions that aren't fully filled in. Used both internally (when
 * the user clicks Apply) and externally (`applyAdvancedFilters` skips
 * incomplete rows so a half-typed condition doesn't blank the table).
 */
export function validConditions(
  conditions: FilterCondition[],
): FilterCondition[] {
  return conditions.filter((c) => {
    if (!c.fieldId || !c.operator) return false;
    if (isNoValueOp(c.operator)) return true;
    if (isRangeOp(c.operator))
      return Boolean(c.value && c.value.trim()) && Boolean(c.value2 && c.value2.trim());
    return Boolean(c.value && c.value.trim());
  });
}

// ─── Component ────────────────────────────────────────────────────────────

interface AdvancedFilterProps {
  fields: FilterField[];
  value: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
  /** Inline label shown on the trigger button. Default "Filter". */
  triggerLabel?: string;
  /** Disable the entire trigger (e.g. while data is loading). */
  disabled?: boolean;
  /** Extra className on the trigger button. */
  className?: string;
}

export function AdvancedFilter({
  fields,
  value,
  onChange,
  triggerLabel = "Filter",
  disabled,
  className,
}: AdvancedFilterProps) {
  const [open, setOpen] = useState(false);
  // Local draft — only commits to parent on Apply, so half-typed
  // conditions don't blank the table while the user is composing.
  const [draft, setDraft] = useState<FilterCondition[]>(value);

  // Sync draft whenever the popover opens or the externally-controlled
  // value changes (e.g. user clicked a saved view).
  const openChange = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };

  const activeCount = useMemo(() => validConditions(value).length, [value]);

  const fieldsById = useMemo(() => {
    const m = new Map<string, FilterField>();
    for (const f of fields) m.set(f.id, f);
    return m;
  }, [fields]);

  const addCondition = () => {
    const first = fields[0];
    if (!first) return;
    setDraft((prev) => [
      ...prev,
      {
        fieldId: first.id,
        operator: operatorsForField(first)[0].value,
        value: "",
      },
    ]);
  };

  const updateCondition = (idx: number, patch: Partial<FilterCondition>) => {
    setDraft((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };

  const removeCondition = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const apply = () => {
    onChange(validConditions(draft));
    setOpen(false);
  };

  const clearAll = () => {
    setDraft([]);
    onChange([]);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("h-8 gap-1.5", className)}
        >
          <FilterIcon className="h-3.5 w-3.5" />
          <span>{triggerLabel}</span>
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-4 min-w-4 px-1 text-[10px] font-semibold"
            >
              {activeCount}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[520px] max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="border-b px-3 py-2.5 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Advanced filter</div>
            <div className="text-[11px] text-muted-foreground">
              Match rows where{" "}
              <span className="font-medium text-foreground">all</span>{" "}
              conditions are true.
            </div>
          </div>
          {draft.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setDraft([])}
            >
              Reset
            </Button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
          {draft.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No conditions yet. Click <span className="font-medium">+ Add condition</span> below to filter by any column.
            </div>
          ) : (
            draft.map((cond, i) => {
              const field = fieldsById.get(cond.fieldId);
              const ops = field ? operatorsForField(field) : [];
              const noVal = isNoValueOp(cond.operator);
              const range = isRangeOp(cond.operator);
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto] gap-2 items-start"
                >
                  <div className="grid grid-cols-2 gap-2">
                    {/* Field picker */}
                    <Select
                      value={cond.fieldId}
                      onValueChange={(v) => {
                        const nextField = fieldsById.get(v);
                        if (!nextField) return;
                        const nextOp =
                          operatorsForField(nextField)[0]?.value ?? "";
                        updateCondition(i, {
                          fieldId: v,
                          operator: nextOp,
                          value: "",
                          value2: "",
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Operator picker */}
                    <Select
                      value={cond.operator}
                      onValueChange={(v) =>
                        updateCondition(i, { operator: v, value: "", value2: "" })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Operator" />
                      </SelectTrigger>
                      <SelectContent>
                        {ops.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Value input(s) */}
                    {!noVal && (
                      <div
                        className={cn(
                          "col-span-2 grid gap-2",
                          range ? "grid-cols-2" : "grid-cols-1",
                        )}
                      >
                        <ValueInput
                          field={field}
                          value={cond.value}
                          onChange={(v) => updateCondition(i, { value: v })}
                          placeholder={range ? "From" : "Value"}
                        />
                        {range && (
                          <ValueInput
                            field={field}
                            value={cond.value2 ?? ""}
                            onChange={(v) => updateCondition(i, { value2: v })}
                            placeholder="To"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeCondition(i)}
                    aria-label="Remove condition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs w-full justify-center border border-dashed"
            onClick={addCondition}
            disabled={fields.length === 0}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add condition
          </Button>
        </div>

        <div className="border-t px-3 py-2.5 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={clearAll}
            disabled={activeCount === 0 && draft.length === 0}
          >
            Clear all
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              onClick={apply}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Value input — switches widget based on field type ───────────────────

function ValueInput({
  field,
  value,
  onChange,
  placeholder,
}: {
  field: FilterField | undefined;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  if (!field) {
    return (
      <Input
        className="h-8 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={placeholder ?? "Pick a value"} />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "number") {
    return (
      <Input
        type="number"
        className="h-8 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  if (field.type === "date") {
    return (
      <Input
        type="date"
        className="h-8 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <Input
      className="h-8 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}
