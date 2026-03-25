"use client";
import type React from "react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  AlertCircle,
  Loader2,
  FolderOpen,
  FormInput,
  Check,
  ChevronsUpDown,
  Settings2,
} from "lucide-react";

import {
  FORMULA_FUNCTIONS,
  FORMULA_OPERATORS,
  DECIMAL_PLACES_OPTIONS,
  BLANK_PREFERENCE_OPTIONS,
} from "@/lib/formula/constants";
import {
  extractFieldReferences,
  validateFormulaSyntax,
} from "@/lib/formula/parser";
import { getFormulaEvaluator } from "@/lib/formula/evaluator";
import type {
  FormulaReturnType,
  BlankPreference,
  FormFieldInfo,
} from "@/lib/formula/types";
import { useLazyGetFormTotalQuery } from "@/lib/api/forms";
import { useLazyGetMasterDataQuery } from "@/lib/api/settings";

// ═══════════════════════════════════════════════════════════════════════════════
// MultiSelect – Extracted OUTSIDE the FormulaBuilder so React treats it as a
// stable component identity. When it was defined *inside* FormulaBuilder, every
// state change in the parent created a brand-new component type, causing React
// to unmount → remount the Popover. That destroyed the open/close state and
// made the dropdown "disappear" whenever the user clicked an option.
// ═══════════════════════════════════════════════════════════════════════════════
function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 text-xs w-full justify-between"
        >
          {value.length > 0 ? `${value.length} selected` : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                onSelect={() => {
                  if (value.includes(option.value)) {
                    onChange(value.filter((v) => v !== option.value));
                  } else {
                    onChange([...value, option.value]);
                  }
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${
                    value.includes(option.value)
                      ? "opacity-100"
                      : "opacity-0"
                  }`}
                />
                {option.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════

interface FormulaBuilderProps {
  formId: string;
  fieldLabel: string;
  onSave: (config: FormulaConfig) => void;
  onCancel: () => void;
  initialConfig?: FormulaConfig;
}

export interface FormulaConfig {
  fieldLabel: string;
  expression: string;
  returnType: FormulaReturnType;
  decimalPlaces: number;
  blankPreference: BlankPreference;
  sources?: {
    moduleIds: string[];
    formIds: string[];
  };
}

export function FormulaBuilder({
  formId,
  fieldLabel,
  onSave,
  onCancel,
  initialConfig,
}: FormulaBuilderProps) {
  const [expression, setExpression] = useState("");
  const [returnType, setReturnType] = useState<FormulaReturnType>(
    initialConfig?.returnType ?? "Number"
  );
  const [decimalPlaces, setDecimalPlaces] = useState(
    initialConfig?.decimalPlaces ?? 2
  );
  const [blankPreference, setBlankPreference] = useState<BlankPreference>(
    initialConfig?.blankPreference ?? "Empty"
  );

  // Sync settings whenever initialConfig changes (component may stay mounted across edits)
  useEffect(() => {
    setReturnType(initialConfig?.returnType ?? "Number");
    setDecimalPlaces(initialConfig?.decimalPlaces ?? 2);
    setBlankPreference(initialConfig?.blankPreference ?? "Empty");
  }, [initialConfig]);

  const [syntaxValid, setSyntaxValid] = useState(true);
  const [syntaxErrors, setSyntaxErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState("");
  const [selectedFunctionHelp, setSelectedFunctionHelp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modules, setModules] = useState<any[]>([]);
  const [allForms, setAllForms] = useState<
    { id: string; name: string; moduleId: string }[]
  >([]);

  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [selectedFormIds, setSelectedFormIds] = useState<string[]>([formId]);

  const [moduleFields, setModuleFields] = useState<
    Record<string, { name: string; fields: FormFieldInfo[] }>
  >({});

  const [sourcesDialogOpen, setSourcesDialogOpen] = useState(false);
  const [triggerGetFormTotal] = useLazyGetFormTotalQuery();
  const [triggerGetMasterData] = useLazyGetMasterDataQuery();

  // Load master data
  useEffect(() => {
    async function loadMasterData() {
      try {
        const json = await triggerGetMasterData().unwrap();
        setModules(json.modules || []);
        setAllForms(json.forms || []);
      } catch (err) {
        console.error("Failed to load master data:", err);
      }
    }
    loadMasterData();
  }, []);

  // Reset to current form when the field being edited changes
  useEffect(() => {
    setSelectedFormIds([formId]);
    setSelectedModuleIds([]);
  }, [formId]);

  // Restore sources from initialConfig if editing (runs after the formId reset)
  useEffect(() => {
    if (initialConfig?.sources) {
      setSelectedModuleIds(initialConfig.sources.moduleIds);
      setSelectedFormIds(
        initialConfig.sources.formIds.length > 0
          ? initialConfig.sources.formIds
          : [formId]
      );
    }
  }, [initialConfig, formId]);

  // Auto-select current form and its module if no selections
  useEffect(() => {
    if (allForms.length > 0 && selectedModuleIds.length === 0 && selectedFormIds.length === 0) {
      const currentForm = allForms.find((f) => f.id === formId);
      if (currentForm) {
        setSelectedModuleIds([currentForm.moduleId]);
        setSelectedFormIds([formId]);
      }
    }
  }, [allForms, formId, selectedModuleIds.length, selectedFormIds.length]);

  const flatModules = useMemo(() => {
    const flats: { id: string; name: string; indent: number }[] = [];
    function traverse(node: any, indent: number = 0) {
      flats.push({ id: node.id, name: node.name, indent });
      if (node.children) {
        node.children.forEach((child: any) => traverse(child, indent + 1));
      }
    }
    modules.forEach((mod: any) => traverse(mod));
    return flats;
  }, [modules]);

  const availableForms = useMemo(() => {
    if (selectedModuleIds.length === 0) return allForms;
    return allForms.filter((f) => selectedModuleIds.includes(f.moduleId));
  }, [selectedModuleIds, allForms]);

  const moduleOptions = useMemo(
    () =>
      flatModules.map((m) => ({
        value: m.id,
        label: "\u00A0".repeat(m.indent * 2) + m.name,
      })),
    [flatModules]
  );

  const formOptions = useMemo(
    () =>
      [...availableForms]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({
          value: f.id,
          label: f.name + (f.id === formId ? " (Current Form)" : ""),
        })),
    [availableForms, formId]
  );

  // Load fields from all selected forms
  useEffect(() => {
    async function loadSelectedForms() {
      if (selectedFormIds.length === 0) {
        setModuleFields({});
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const results = await Promise.all(
          selectedFormIds.map(async (fid) => {
            const json = await triggerGetFormTotal(fid).unwrap();
            if (!json.success || !json.data) throw new Error("Invalid response");

            const data = json.data;

            // Current form fields (now includes formula fields)
            const currentFields: FormFieldInfo[] = data.currentModuleFields
              .flatMap((formEntry: any) =>
                formEntry.fields
                  .map((field: any) => {
                    // Use actual return type for formula fields
                    let fieldType = field.type.toLowerCase();
                    if (
                      field.type === "formula" &&
                      field.properties?.formulaConfig?.returnType
                    ) {
                      fieldType = field.properties.formulaConfig.returnType.toLowerCase();
                    }
                    return {
                      id: field.id,
                      label: field.label,
                      type: fieldType,
                      databaseName: field.label,
                    };
                  })
              )
              .sort((a, b) => a.label.localeCompare(b.label));

            // Parent module fields (same logic)
            let parentFields: FormFieldInfo[] = [];
            if (data.parentModule && data.parentModuleFields) {
              parentFields = data.parentModuleFields
                .flatMap((formEntry: any) =>
                  formEntry.fields
                    .map((field: any) => {
                      let fieldType = field.type.toLowerCase();
                      if (
                        field.type === "formula" &&
                        field.properties?.formulaConfig?.returnType
                      ) {
                        fieldType = field.properties.formulaConfig.returnType.toLowerCase();
                      }
                      return {
                        id: field.id,
                        label: field.label,
                        type: fieldType,
                        databaseName: field.label,
                      };
                    })
                )
                .sort((a, b) => a.label.localeCompare(b.label));
            }

            return {
              currentMod: data.currentModule,
              currentFields,
              parentMod: data.parentModule,
              parentFields,
            };
          })
        );

        const merged: Record<string, { name: string; fields: FormFieldInfo[] }> = {};

        for (const r of results) {
          if (r.currentMod) {
            if (!merged[r.currentMod.id]) {
              merged[r.currentMod.id] = { name: r.currentMod.name, fields: [] };
            }
            const existing = new Set(merged[r.currentMod.id].fields.map((f) => f.id));
            for (const f of r.currentFields) {
              if (!existing.has(f.id)) {
                merged[r.currentMod.id].fields.push(f);
              }
            }
          }
          if (r.parentMod) {
            if (!merged[r.parentMod.id]) {
              merged[r.parentMod.id] = { name: r.parentMod.name, fields: [] };
            }
            const existing = new Set(merged[r.parentMod.id].fields.map((f) => f.id));
            for (const f of r.parentFields) {
              if (!existing.has(f.id)) {
                merged[r.parentMod.id].fields.push(f);
              }
            }
          }
        }

        setModuleFields(merged);
      } catch (err) {
        console.error(err);
        setError("Failed to load fields");
      } finally {
        setLoading(false);
      }
    }

    loadSelectedForms();
  }, [selectedFormIds]);

  const groupedFields = useMemo(() => {
    return Object.entries(moduleFields).reduce(
      (acc, [_, mod]) => {
        acc[mod.name] = mod.fields;
        return acc;
      },
      {} as Record<string, FormFieldInfo[]>
    );
  }, [moduleFields]);

  const allFields = useMemo(() => {
    return Object.values(moduleFields).flatMap((mod) => mod.fields);
  }, [moduleFields]);

  const labelToId = useMemo(() => {
    return new Map<string, string>(allFields.map((f) => [f.label, f.id]));
  }, [allFields]);

  const idToLabel = useMemo(() => {
    return new Map<string, string>(allFields.map((f) => [f.id, f.label]));
  }, [allFields]);

  // Track which initialConfig we have already converted so that adding/changing
  // form sources (which reloads allFields) does NOT overwrite the user's edits.
  const expressionInitializedForRef = useRef<typeof initialConfig | null>(null);

  // Reset the ref whenever initialConfig changes so the new config's expression
  // gets converted fresh on next field load.
  useEffect(() => {
    expressionInitializedForRef.current = null;
    if (!initialConfig) setExpression("");
  }, [initialConfig]);

  // Convert initial expression from IDs to labels — runs once per initialConfig,
  // then skips on subsequent allFields changes to preserve user edits.
  useEffect(() => {
    if (!initialConfig) return;                  // already cleared above
    if (loading || allFields.length === 0) return; // wait for fields to load
    if (expressionInitializedForRef.current === initialConfig) return; // already done

    expressionInitializedForRef.current = initialConfig;

    const displayExpression = initialConfig.expression.replace(
      /\{([^}]+)\}/g,
      (_, id) => `{${idToLabel.get(id) || id}}`
    );
    setExpression(displayExpression);
  }, [initialConfig, loading, allFields, idToLabel]);

  const totalFields = allFields.length;

  const groupedFunctions = useMemo(() => {
    const g: Record<string, any[]> = {};
    FORMULA_FUNCTIONS.forEach((f) => {
      if (!g[f.category]) g[f.category] = [];
      g[f.category].push(f);
    });
    return g;
  }, []);

  const groupedOperators = useMemo(() => {
    const g: Record<string, any[]> = {};
    FORMULA_OPERATORS.forEach((op) => {
      if (!g[op.category]) g[op.category] = [];
      g[op.category].push(op);
    });
    return g;
  }, []);

  const insertField = useCallback(
    (label: string) => setExpression((prev) => `${prev}{${label}}`),
    []
  );

  const insertFunction = useCallback(
    (name: string) => setExpression((prev) => `${prev}${prev ? " " : ""}${name}()`),
    []
  );

  const insertOperator = useCallback(
    (symbol: string) => setExpression((prev) => `${prev} ${symbol} `),
    []
  );

  const handleExpressionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setExpression(val);
    const { valid, errors } = validateFormulaSyntax(val);
    setSyntaxValid(valid);
    setSyntaxErrors(errors);
  };

  const handlePreview = useCallback(() => {
    if (!syntaxValid || !expression.trim()) {
      setPreviewError("Enter a valid formula first");
      setPreview(null);
      return;
    }
    try {
      const evaluator = getFormulaEvaluator();
      const NUMERIC_SET = new Set([
        "number", "currency", "decimal", "percent", "long-integer",
        "rollup", "auto-number", "rating", "prediction", "slider", "integer",
      ]);
      const BOOLEAN_SET = new Set(["checkbox", "decision", "boolean", "switch", "toggle"]);
      const CHOICE_SET = new Set(["radio", "select", "picklist", "lookup", "user", "multi-select"]);

      const vars = allFields.reduce((acc, f) => {
        const ft = f.type.toLowerCase();
        let sampleValue: any;

        if (NUMERIC_SET.has(ft)) {
          sampleValue = 100;
        } else if (ft === "date") {
          sampleValue = "2026-01-01";
        } else if (ft === "time") {
          sampleValue = "09:30";
        } else if (ft === "datetime") {
          sampleValue = "2026-01-01T09:30:00";
        } else if (BOOLEAN_SET.has(ft)) {
          sampleValue = true;
        } else if (CHOICE_SET.has(ft)) {
          sampleValue = "Option A";
        } else {
          // text, textarea, email, url, phone, etc. – all string types
          sampleValue = "Sample Text";
        }

        acc[f.label] = sampleValue;
        return acc;
      }, {} as Record<string, any>);

      const result = evaluator.evaluate(
        expression,
        vars,
        returnType,
        blankPreference,
        allFields
      );

      if (result.success) {
        setPreview(result.value);
        setPreviewError("");
      } else {
        setPreview(null);
        setPreviewError(result.error || "Evaluation failed");
      }
    } catch (err) {
      setPreview(null);
      setPreviewError("Preview failed: " + (err instanceof Error ? err.message : String(err)));
    }
  }, [syntaxValid, expression, allFields, returnType, blankPreference]);

  const handleSave = () => {
    if (!syntaxValid || !expression.trim()) return;

    // Convert display expression (labels) to saved expression (IDs)
    const savedExpression = expression.replace(
      /\{([^}]+)\}/g,
      (match, label) => {
        const id = labelToId.get(label) || label; // Fallback to label if ID not found (though unlikely)
        return `{${id}}`;
      }
    );

    onSave({
      fieldLabel,
      expression: savedExpression,
      returnType,
      decimalPlaces,
      blankPreference,
      sources: {
        moduleIds: selectedModuleIds,
        formIds: selectedFormIds,
      },
    });
  };

  const references = extractFieldReferences(expression);

  return (
    <div className="w-full max-w-6xl mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="text-lg sm:text-xl">Formula Builder</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Build formulas using fields from multiple modules and forms
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 sm:space-y-6">
          {/* Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Field Label</Label>
              <Input value={fieldLabel} disabled className="h-8 text-xs bg-muted" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Return Type</Label>
              <Select value={returnType} onValueChange={(v) => setReturnType(v as FormulaReturnType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Number", "Text", "Date", "Time", "DateTime", "Boolean", "Currency", "Percent", "Picklist"].map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Decimals</Label>
              <Select value={String(decimalPlaces)} onValueChange={(v) => setDecimalPlaces(Number(v))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECIMAL_PLACES_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Blank As</Label>
              <Select value={blankPreference} onValueChange={(v) => setBlankPreference(v as BlankPreference)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLANK_PREFERENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Expression */}
          <div className="space-y-2">
            <Label className="text-sm">Expression</Label>
            <Textarea
              value={expression}
              onChange={handleExpressionChange}
              placeholder="e.g., {Salary} + {Bonus} * 0.1"
              className="font-mono text-sm min-h-24"
            />
            {!syntaxValid && syntaxErrors.length > 0 && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {syntaxErrors[0]}
              </p>
            )}
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {/* Functions */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-1">
                <FolderOpen className="h-4 w-4" />
                Functions
              </h3>
              <ScrollArea className="h-48 sm:h-64 border rounded bg-muted/30">
                <div className="p-2 space-y-2">
                  {Object.entries(groupedFunctions).map(([cat, funcs]) => (
                    <div key={cat} className="space-y-1">
                      <p className="text-xs text-muted-foreground px-2">{cat}</p>
                      {funcs.map((f) => (
                        <button
                          key={f.name}
                          onClick={() => {
                            insertFunction(f.name);
                            // Toggle help on click for touch devices
                            setSelectedFunctionHelp((prev: any) =>
                              prev?.name === f.name ? null : f
                            );
                          }}
                          onMouseEnter={() => setSelectedFunctionHelp(f)}
                          onMouseLeave={() => setSelectedFunctionHelp(null)}
                          className="w-full text-left text-xs px-3 py-1 rounded hover:bg-accent"
                        >
                          {f.name}()
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Fields - Single Button + Dialog */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium flex items-center gap-1 shrink-0">
                  <FormInput className="h-4 w-4" />
                  Fields ({totalFields})
                </h3>

                <Dialog open={sourcesDialogOpen} onOpenChange={setSourcesDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                      <Settings2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Manage Field Sources</span>
                      <span className="sm:hidden">Sources</span>
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="w-full max-w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                      <DialogTitle>Select Modules & Forms</DialogTitle>
                      <DialogDescription>
                        Current form is automatically included. Add more modules and forms as needed.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 py-4 overflow-y-auto">
                      {/* Modules */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Modules</Label>
                        <MultiSelect
                          options={moduleOptions}
                          value={selectedModuleIds}
                          onChange={setSelectedModuleIds}
                          placeholder="Select modules..."
                        />
                        <div className="flex flex-wrap gap-1">
                          {selectedModuleIds.map((id) => {
                            const mod = flatModules.find((m) => m.id === id);
                            return (
                              <Badge key={id} variant="secondary" className="text-xs">
                                {mod?.name}
                                <button
                                  onClick={() => setSelectedModuleIds((p) => p.filter((x) => x !== id))}
                                  className="ml-2 hover:text-red-600"
                                >
                                  ×
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
                      </div>

                      {/* Forms */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Forms</Label>
                        <MultiSelect
                          options={formOptions}
                          value={selectedFormIds}
                          onChange={setSelectedFormIds}
                          placeholder="Select forms..."
                        />
                        <div className="flex flex-wrap gap-1">
                          {selectedFormIds.map((id) => {
                            const frm = allForms.find((f) => f.id === id);
                            const isCurrent = id === formId;
                            return (
                              <Badge
                                key={id}
                                variant={isCurrent ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {frm?.name} {isCurrent && "(Current)"}
                                {!isCurrent && (
                                  <button
                                    onClick={() => setSelectedFormIds((p) => p.filter((x) => x !== id))}
                                    className="ml-2 hover:text-red-600"
                                  >
                                    ×
                                  </button>
                                )}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t">
                      <Button onClick={() => setSourcesDialogOpen(false)}>Done</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Fields List */}
              {loading ? (
                <div className="h-48 sm:h-64 border rounded bg-muted/30 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : error ? (
                <div className="h-48 sm:h-64 border rounded bg-red-50 text-red-700 text-xs flex items-center justify-center p-3">
                  {error}
                </div>
              ) : totalFields === 0 ? (
                <div className="h-48 sm:h-64 border rounded bg-muted/30 text-muted-foreground text-xs flex items-center justify-center">
                  No fields available
                </div>
              ) : (
                <ScrollArea className="h-48 sm:h-64 border rounded bg-muted/30">
                  <div className="p-2 space-y-3">
                    {Object.entries(groupedFields).map(([groupName, fields]) => (
                      <div key={groupName} className="space-y-2">
                        <div className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block bg-blue-100 text-blue-800">
                          {groupName}
                        </div>
                        {fields.map((field) => (
                          <button
                            key={field.id}
                            onClick={() => insertField(field.label)}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded hover:bg-accent transition group"
                          >
                            <span className="truncate">{field.label}</span>
                            <Badge variant="outline" className="text-xs px-1.5 opacity-60 group-hover:opacity-100">
                              {field.type}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Operators */}
            <div className="space-y-2 md:col-span-2 lg:col-span-1">
              <h3 className="text-sm font-medium">Operators</h3>
              <ScrollArea className="h-48 sm:h-64 border rounded bg-muted/30">
                <div className="p-2 space-y-2">
                  {Object.entries(groupedOperators).map(([cat, ops]) => (
                    <div key={cat} className="space-y-1">
                      <p className="text-xs text-muted-foreground px-2">{cat}</p>
                      <div className="grid grid-cols-4 gap-1">
                        {ops.map((op) => (
                          <button
                            key={op.symbol}
                            onClick={() => insertOperator(op.symbol)}
                            className="text-sm font-bold py-2 rounded hover:bg-accent"
                          >
                            {op.symbol}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Function Help */}
          {selectedFunctionHelp && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
              <p className="font-mono font-bold">{selectedFunctionHelp.name}()</p>
              <p className="text-blue-800 mt-1">{selectedFunctionHelp.description}</p>
              {selectedFunctionHelp.example && (
                <p className="text-blue-700 text-xs mt-2 italic">
                  Example: {selectedFunctionHelp.example}
                </p>
              )}
            </div>
          )}

          {/* Referenced Fields */}
          {references.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded p-3">
              <p className="text-sm font-medium text-purple-900">
                Referenced fields: {references.join(", ")}
              </p>
            </div>
          )}

          {/* Preview */}
          <div className="space-y-3">
            <Button
              onClick={handlePreview}
              disabled={!syntaxValid || !expression.trim() || loading}
              variant="secondary"
              size="sm"
            >
              Preview Result
            </Button>
            {preview !== null && (
              <div className="bg-green-50 border border-green-300 rounded p-4 font-mono text-green-800">
                <p className="text-sm font-semibold">Preview Result:</p>
                <p className="text-lg mt-1">{String(preview)}</p>
              </div>
            )}
            {previewError && (
              <div className="bg-red-50 border border-red-300 rounded p-4 text-red-900 text-sm">
                <p className="font-semibold">Preview Error:</p>
                <p className="mt-1">{previewError}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!syntaxValid || !expression.trim()} className="w-full sm:w-auto">
              Save Formula
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}