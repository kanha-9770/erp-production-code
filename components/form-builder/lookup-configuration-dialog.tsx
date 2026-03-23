
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Database,
  FileText,
  Loader2,
  Layers,
  Info,
  ChevronLeft,
  ChevronRight,
  Layout,
  LayoutGrid,
  Check,
  Search,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { FormField } from "@/types/form-builder";
import { useLazyGetLookupSourcesQuery, useLazyGetLookupSectionsQuery, useLazyGetLookupDataQuery, useLazyGetLookupFieldsWithSectionQuery } from "@/lib/api/lookup";
import { useLazyGetMasterDataQuery, useLazyGetMasterDataByModuleQuery } from "@/lib/api/settings";

/* ===================== TYPES ===================== */
interface LookupSource {
  id: string;
  name: string;
  type: "form" | "module";
  parentId: string | null;
  hasIdField?: boolean;
  idFieldName?: string;
  description?: string;
  recordCount?: number;
}

interface MasterDropdown {
  id: string;
  name: string;
}

interface FormSection {
  id: string;
  name: string;
}

interface SourceField {
  name: string;
  label: string;
  type: string;
}

interface ValueMapping {
  parentValue: string;
  allowedChildValues: string[];
}

interface FieldDependency {
  childFieldName: string;
  parentFieldName: string;
  valueMappings: ValueMapping[];
}

interface SelectedField {
  fieldName: string;
  label: string;
  displayField: string;
  valueField: string;
  multiple: boolean;
  searchable: boolean;
  useIdField: boolean;
  isMaster?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (fields: Partial<FormField>[]) => void;
  sectionId: string;
  subformId?: string;
}

export default function LookupConfigurationDialog({
  open,
  onOpenChange,
  onConfirm,
  sectionId,
  subformId,
}: Props) {
  const { toast } = useToast();

  const [step, setStep] = useState<"selection" | "mapping">("selection");

  // Dynamic sources
  const [sources, setSources] = useState<LookupSource[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");

  // Master dropdowns (shown as tiles when module selected)
  const [masterDropdowns, setMasterDropdowns] = useState<MasterDropdown[]>([]);

  // Field data (dynamic only)
  const [sections, setSections] = useState<FormSection[]>([]);
  const [sourceFields, setSourceFields] = useState<SourceField[]>([]);
  const [selectedFields, setSelectedFields] = useState<SelectedField[]>([]);
  const [fieldSearch, setFieldSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);

  // Dependency configuration
  const [dependencies, setDependencies] = useState<FieldDependency[]>([]);
  const [masterDataValues, setMasterDataValues] = useState<Record<string, string[]>>({});
  const [loadingValues, setLoadingValues] = useState(false);

  const [triggerGetLookupSources] = useLazyGetLookupSourcesQuery();
  const [triggerGetLookupSections] = useLazyGetLookupSectionsQuery();
  const [triggerGetLookupData] = useLazyGetLookupDataQuery();
  const [triggerGetMasterData] = useLazyGetMasterDataQuery();
  const [triggerGetMasterDataByModule] = useLazyGetMasterDataByModuleQuery();
  const [triggerGetLookupFieldsWithSection] = useLazyGetLookupFieldsWithSectionQuery();

  /* ===================== COMPUTED DATA ===================== */
  const modules = useMemo(
    () => sources.filter((s) => s.type === "module"),
    [sources]
  );

  const forms = useMemo(() => {
    if (!selectedModuleId) return [];
    return sources.filter(
      (s) => s.type === "form" && s.parentId === selectedModuleId
    );
  }, [sources, selectedModuleId]);

  const activeSource = useMemo(
    () => sources.find((s) => s.id === (selectedFormId || selectedModuleId)),
    [sources, selectedFormId, selectedModuleId]
  );

  const filteredFields = useMemo(
    () =>
      sourceFields.filter((f) =>
        f.label.toLowerCase().includes(fieldSearch.toLowerCase())
      ),
    [sourceFields, fieldSearch]
  );

  const isReadyToShowFields = !!(
    selectedModuleId &&
    (selectedFormId || selectedSectionId === "all")
  );

  /* ===================== EFFECTS ===================== */
  useEffect(() => {
    if (open) {
      loadInitialData();
      resetSelection();
    }
  }, [open]);

  useEffect(() => {
    if (selectedFormId && selectedFormId !== "none") {
      fetchSections(selectedFormId);
    } else {
      setSections([]);
      setSelectedSectionId("all");
    }
  }, [selectedFormId]);

  useEffect(() => {
    const sourceId =
      selectedFormId && selectedFormId !== "none"
        ? selectedFormId
        : selectedModuleId;
    if (sourceId && selectedSectionId) {
      fetchFields(sourceId, selectedSectionId);
    } else {
      setSourceFields([]);
    }
  }, [selectedFormId, selectedModuleId, selectedSectionId]);

  useEffect(() => {
    if (selectedModuleId) {
      fetchMasterDropdowns(selectedModuleId);
    } else {
      setMasterDropdowns([]);
    }
  }, [selectedModuleId]);

  /* ===================== API LOGIC ===================== */
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const result = await triggerGetLookupSources().unwrap();
      if (result.success) setSources(result.data || []);

      // Load all masters (or filter later if needed)
      const mastersResult = await triggerGetMasterData().unwrap();
      if (mastersResult.dropdowns) {
        setMasterDropdowns(
          mastersResult.dropdowns.map((d: any) => ({
            id: d.id,
            name: d.master_data_type_name,
          }))
        );
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to load sources",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSections = async (formId: string) => {
    try {
      const result = await triggerGetLookupSections(formId).unwrap();
      if (result.success) setSections(result.data || []);
    } catch (e) {
      console.error("Failed to load sections");
    }
  };

  const fetchFields = async (sourceId: string, sectId: string) => {
    setLoadingFields(true);
    try {
      const result = await triggerGetLookupFieldsWithSection({ sourceId, sectionId: sectId }).unwrap();
      if (result.success) {
        const rawFields = Array.isArray(result.data)
          ? result.data
          : result.data.fields || [];
        setSourceFields(
          rawFields.map((f: any) =>
            typeof f === "string" ? { name: f, label: f, type: "text" } : f
          )
        );
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to fetch fields",
        variant: "destructive",
      });
    } finally {
      setLoadingFields(false);
    }
  };

  const fetchMasterDropdowns = async (moduleId: string) => {
    try {
      // Optional: filter masters by module if your API supports it
      const result = await triggerGetMasterDataByModule(moduleId).unwrap();
      if (result.dropdowns) {
        setMasterDropdowns(
          result.dropdowns.map((d: any) => ({
            id: d.id,
            name: d.master_data_type_name,
          }))
        );
      } else {
        setMasterDropdowns([]);
      }
    } catch (e) {
      console.error("Failed to load masters for module");
      setMasterDropdowns([]);
    }
  };

  /* ===================== FETCH VALUES FOR DEPENDENCY CONFIG ===================== */
  const fetchFieldValues = async (field: SelectedField): Promise<string[]> => {
    // Check cache first
    if (masterDataValues[field.fieldName]?.length) {
      return masterDataValues[field.fieldName];
    }

    if (field.isMaster) {
      try {
        // Master data API returns ALL dropdowns — find the matching one
        const result = await triggerGetMasterData().unwrap();
        if (result.dropdowns) {
          const dropdown = result.dropdowns.find((d: any) => d.id === field.fieldName);
          if (dropdown?.values?.length) {
            const vals = dropdown.values.map((v: any) => String(v.value || v.label || v));
            setMasterDataValues((prev) => ({ ...prev, [field.fieldName]: vals }));
            return vals;
          }
        }
      } catch {
        console.error("Failed to load master data values for", field.fieldName);
      }
      return [];
    }

    // Dynamic field — fetch unique values from lookup data
    try {
      const sourceId = selectedFormId && selectedFormId !== "none"
        ? selectedFormId
        : selectedModuleId;
      if (!sourceId) return [];

      const result = await triggerGetLookupData({ sourceId, limit: "200" }).unwrap();
      if (result.success && Array.isArray(result.data)) {
        const uniqueValues = new Set<string>();
        for (const item of result.data) {
          // Try matching by label or fieldName
          const fieldData = item[field.label]
            || Object.values(item).find((v: any) => v?.field_label === field.label)
            || Object.values(item).find((v: any) => v?.field_label === field.fieldName);
          const val = (fieldData as any)?.field_value;
          if (val != null && String(val).trim()) {
            uniqueValues.add(String(val));
          }
        }
        const vals = Array.from(uniqueValues).sort();
        if (vals.length > 0) {
          setMasterDataValues((prev) => ({ ...prev, [field.fieldName]: vals }));
        }
        return vals;
      }
    } catch {
      console.error("Failed to load field values for", field.fieldName);
    }
    return [];
  };

  const loadDependencyValues = async (fields: SelectedField[]) => {
    setLoadingValues(true);
    try {
      await Promise.all(fields.map((f) => fetchFieldValues(f)));
    } finally {
      setLoadingValues(false);
    }
  };

  /* ===================== ACTIONS ===================== */
  const resetSelection = () => {
    setStep("selection");
    setSelectedModuleId("");
    setSelectedFormId("");
    setSelectedSectionId("all");
    setSelectedFields([]);
    setFieldSearch("");
    setDependencies([]);
    setMasterDataValues({});
  };

  const handleFieldToggle = (field: SourceField) => {
    const isSelected = selectedFields.some(
      (f) => f.fieldName === field.name && !f.isMaster
    );
    if (isSelected) {
      setSelectedFields((prev) =>
        prev.filter((f) => f.fieldName !== field.name || f.isMaster)
      );
    } else {
      setSelectedFields((prev) => [
        ...prev,
        {
          fieldName: field.name,
          label: field.label,
          displayField: field.name,
          valueField: "id",
          multiple: false,
          searchable: true,
          useIdField: true,
          isMaster: false,
        },
      ]);
    }
  };

  const handleMasterToggle = (master: MasterDropdown) => {
    const isSelected = selectedFields.some(
      (f) => f.fieldName === master.id && f.isMaster
    );
    if (isSelected) {
      setSelectedFields((prev) =>
        prev.filter((f) => f.fieldName !== master.id || !f.isMaster)
      );
    } else {
      setSelectedFields((prev) => [
        ...prev,
        {
          fieldName: master.id,
          label: master.name,
          displayField: "value",
          valueField: "value",
          multiple: false,
          searchable: true,
          useIdField: false,
          isMaster: true,
        },
      ]);
    }
  };

  const onFinalConfirm = () => {
    const finalPayload: Partial<FormField>[] = selectedFields.map(
      (field, idx) => {
        // Check if this field has a dependency configured
        const dep = dependencies.find((d) => d.childFieldName === field.fieldName);
        const dependencyConfig = dep
          ? {
            parentFieldLabel: selectedFields.find((f) => f.fieldName === dep.parentFieldName)?.label || dep.parentFieldName,
            valueMappings: dep.valueMappings,
          }
          : undefined;

        if (field.isMaster) {
          return {
            sectionId: subformId ? undefined : sectionId,
            subformId,
            type: "lookup",
            label: field.label,
            order: idx,
            displayField: field.displayField,
            valueField: field.valueField,
            multiple: field.multiple,
            searchable: field.searchable,
            lookup: {
              sourceId: field.fieldName,
              sourceType: "master",
              multiple: field.multiple,
              searchable: field.searchable,
              useIdField: false,
              idFieldName: undefined,
              fieldMapping: {
                display: field.displayField,
                value: field.valueField,
                store: field.fieldName,
              },
              dependency: dependencyConfig,
            },
          };
        }

        return {
          sectionId: subformId ? undefined : sectionId,
          subformId,
          type: "lookup",
          label: field.label,
          order: idx,
          sourceModule: selectedModuleId.replace("module_", ""),
          sourceForm:
            selectedFormId && selectedFormId !== "none"
              ? selectedFormId.replace("form_", "")
              : undefined,
          displayField: field.displayField,
          valueField: field.valueField,
          multiple: field.multiple,
          searchable: field.searchable,
          lookup: {
            sourceId:
              selectedFormId && selectedFormId !== "none"
                ? selectedFormId
                : selectedModuleId,
            sourceType:
              selectedFormId && selectedFormId !== "none" ? "form" : "module",
            multiple: field.multiple,
            searchable: field.searchable,
            useIdField: !!activeSource?.hasIdField,
            idFieldName: activeSource?.idFieldName,
            fieldMapping: {
              display: field.displayField,
              value: field.valueField,
              store: field.fieldName,
            },
            dependency: dependencyConfig,
          },
        };
      }
    );

    onConfirm(finalPayload);
    onOpenChange(false);
  };

  /* ===================== EMPTY STATE ===================== */
  const EmptyState = ({
    icon,
    title,
    description,
  }: {
    icon: React.ReactNode;
    title: string;
    description: string;
  }) => (
    <div className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed rounded-2xl mx-auto max-w-lg">
      <div className="p-5 bg-muted rounded-full mb-6">{icon}</div>
      <h3 className="text-xl font-medium mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md">{description}</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* HEADER */}
        <DialogHeader className="px-6 py-4 border-b shrink-0 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <LayoutGrid className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  Lookup Configuration
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Select source data to create lookup fields
                </p>
              </div>
            </div>
            {subformId && (
              <Badge
                variant="outline"
                className="bg-purple-50 text-purple-700 border-purple-200 py-1 px-3"
              >
                <Layers className="h-3 w-3 mr-2" /> Subform Field
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* DROPDOWNS */}
        <div className="px-6 py-5 bg-muted/20 border-b shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Module */}
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Database className="h-3 w-3" /> Step 1: Module
              </Label>
              <Select
                value={selectedModuleId}
                onValueChange={(v) => {
                  setSelectedModuleId(v);
                  setSelectedFormId("");
                  setSelectedSectionId("all");
                  setSelectedFields([]);
                }}
              >
                <SelectTrigger className="bg-background h-11">
                  <SelectValue placeholder="Select Module..." />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Form */}
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FileText className="h-3 w-3" /> Step 2: Form
              </Label>
              <Select
                disabled={!selectedModuleId}
                value={selectedFormId}
                onValueChange={(v) => {
                  setSelectedFormId(v);
                  setSelectedSectionId("all");
                  setSelectedFields([]);
                }}
              >
                <SelectTrigger className="bg-background h-11">
                  <SelectValue
                    placeholder={
                      !selectedModuleId
                        ? "Select module first"
                        : "Select Form or Entire Module"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    -- Entire Module (No specific form) --
                  </SelectItem>
                  {forms.length > 0 ? (
                    forms.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No forms found in this module
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Section */}
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Layout className="h-3 w-3" /> Step 3: Section
              </Label>
              <Select
                disabled={!selectedFormId}
                value={selectedSectionId}
                onValueChange={(v) => {
                  setSelectedSectionId(v);
                  setSelectedFields([]);
                }}
              >
                <SelectTrigger className="bg-background h-11">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* MAIN BODY */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {step === "selection" ? (
            <div className="h-full flex flex-col">
              {isReadyToShowFields && (
                <div className="px-6 py-3 border-b bg-muted/5 flex items-center justify-between shrink-0">
                  <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search fields..."
                      className="pl-9 h-9"
                      value={fieldSearch}
                      onChange={(e) => setFieldSearch(e.target.value)}
                    />
                  </div>
                  <div className="text-sm font-medium">
                    {selectedFields.length} item
                    {selectedFields.length !== 1 ? "s" : ""} selected
                  </div>
                </div>
              )}

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6">
                  {!selectedModuleId ? (
                    <EmptyState
                      icon={<Database className="h-10 w-10" />}
                      title="Select a Module"
                      description="Choose which module contains the data you want to look up."
                    />
                  ) : !isReadyToShowFields ? (
                    <EmptyState
                      icon={<Layout className="h-10 w-10" />}
                      title="Select Form or Section"
                      description="Pick a form or keep 'All Sections' to continue."
                    />
                  ) : loadingFields ? (
                    <div className="flex flex-col items-center justify-center py-24 opacity-60">
                      <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                      <p className="font-medium">Loading fields...</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {/* Dynamic Form Fields */}
                      {filteredFields.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground mb-4">
                            Form Fields
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredFields.map((field) => {
                              const isChecked = selectedFields.some(
                                (f) => f.fieldName === field.name && !f.isMaster
                              );
                              return (
                                <div
                                  key={field.name}
                                  onClick={() => handleFieldToggle(field)}
                                  className={cn(
                                    "group relative p-4 border rounded-xl cursor-pointer transition-all flex flex-col gap-1 min-h-[84px]",
                                    isChecked
                                      ? "bg-primary/5 border-primary shadow-sm ring-1 ring-primary"
                                      : "bg-background hover:border-primary/50 hover:bg-muted/30"
                                  )}
                                >
                                  <div className="flex justify-between items-start">
                                    <span className="text-sm font-semibold truncate pr-6">
                                      {field.label}
                                    </span>
                                    <div
                                      className={cn(
                                        "h-5 w-5 rounded-full border flex items-center justify-center transition-colors shrink-0",
                                        isChecked
                                          ? "bg-primary border-primary"
                                          : "border-muted-foreground/30 group-hover:border-primary/50"
                                      )}
                                    >
                                      {isChecked && (
                                        <Check className="h-3 w-3 text-white" />
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground uppercase font-mono mt-1">
                                    {field.type || "text"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Master Dropdowns as selectable tiles */}
                      {masterDropdowns.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-muted-foreground mb-4">
                            Static Master Dropdowns
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {masterDropdowns.map((master) => {
                              const isChecked = selectedFields.some(
                                (f) => f.fieldName === master.id && f.isMaster
                              );
                              return (
                                <div
                                  key={master.id}
                                  onClick={() => handleMasterToggle(master)}
                                  className={cn(
                                    "group relative p-4 border rounded-xl cursor-pointer transition-all flex flex-col gap-1 min-h-[84px]",
                                    isChecked
                                      ? "bg-primary/5 border-primary shadow-sm ring-1 ring-primary"
                                      : "bg-background hover:border-primary/50 hover:bg-muted/30"
                                  )}
                                >
                                  <div className="flex justify-between items-start">
                                    <span className="text-sm font-semibold truncate pr-6">
                                      {master.name}
                                    </span>
                                    <div
                                      className={cn(
                                        "h-5 w-5 rounded-full border flex items-center justify-center transition-colors shrink-0",
                                        isChecked
                                          ? "bg-primary border-primary"
                                          : "border-muted-foreground/30 group-hover:border-primary/50"
                                      )}
                                    >
                                      {isChecked && (
                                        <Check className="h-3 w-3 text-white" />
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground uppercase font-mono mt-1">
                                    master
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* No content fallback */}
                      {filteredFields.length === 0 &&
                        masterDropdowns.length === 0 && (
                          <EmptyState
                            icon={<Database className="h-10 w-10 opacity-40" />}
                            title="No Items Found"
                            description="This module/form has no fields or master dropdowns yet."
                          />
                        )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : (
            /* MAPPING + DEPENDENCY STEP (combined) */
            <div className="h-full flex flex-col">
              <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2 shrink-0">
                <Info className="h-4 w-4 text-blue-600" />
                <p className="text-xs text-blue-800">
                  Configure field mapping.{selectedFields.length >= 2 && " Use <b>Depends On</b> to link fields — e.g. Machine depends on Category."}
                </p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6 space-y-6">
                  {/* Mapping table */}
                  <div className="border rounded-xl overflow-hidden shadow-sm">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-[200px]">Field</TableHead>
                          <TableHead>Display</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead className="w-[60px] text-center">Multi</TableHead>
                          <TableHead className="w-[60px] text-center">Search</TableHead>
                          {selectedFields.length >= 2 && (
                            <TableHead className="w-[160px]">Depends On</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedFields.map((field) => {
                          const dep = dependencies.find((d) => d.childFieldName === field.fieldName);
                          return (
                            <TableRow key={field.fieldName}>
                              <TableCell className="font-semibold text-xs">
                                {field.label} {field.isMaster ? <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">Master</Badge> : null}
                              </TableCell>
                              <TableCell>
                                <Select value={field.displayField} onValueChange={(v) => setSelectedFields((prev) => prev.map((f) => f.fieldName === field.fieldName ? { ...f, displayField: v } : f))}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {sourceFields.map((f) => (<SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>))}
                                    {field.isMaster && <SelectItem value="value">Value (default)</SelectItem>}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select value={field.valueField} onValueChange={(v) => setSelectedFields((prev) => prev.map((f) => f.fieldName === field.fieldName ? { ...f, valueField: v } : f))}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {sourceFields.map((f) => (<SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>))}
                                    {field.isMaster && <SelectItem value="value">Value (default)</SelectItem>}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox checked={field.multiple} disabled={field.isMaster} onCheckedChange={(v) => setSelectedFields((prev) => prev.map((f) => f.fieldName === field.fieldName ? { ...f, multiple: !!v } : f))} />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox checked={field.searchable} onCheckedChange={(v) => setSelectedFields((prev) => prev.map((f) => f.fieldName === field.fieldName ? { ...f, searchable: !!v } : f))} />
                              </TableCell>
                              {selectedFields.length >= 2 && (
                                <TableCell>
                                  <Select
                                    value={dep?.parentFieldName || "__none__"}
                                    onValueChange={(v) => {
                                      if (v === "__none__") {
                                        setDependencies((prev) => prev.filter((d) => d.childFieldName !== field.fieldName));
                                      } else {
                                        const existing = dependencies.find((d) => d.childFieldName === field.fieldName);
                                        if (existing) {
                                          setDependencies((prev) => prev.map((d) => d.childFieldName === field.fieldName ? { ...d, parentFieldName: v, valueMappings: [] } : d));
                                        } else {
                                          setDependencies((prev) => [...prev, { childFieldName: field.fieldName, parentFieldName: v, valueMappings: [] }]);
                                        }
                                        // Fetch values for both parent and child
                                        const parentField = selectedFields.find((f) => f.fieldName === v);
                                        if (parentField) loadDependencyValues([parentField, field]);
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">None</SelectItem>
                                      {selectedFields.filter((f) => f.fieldName !== field.fieldName).map((f) => (
                                        <SelectItem key={f.fieldName} value={f.fieldName}>{f.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Inline dependency value mappings — shown for each configured dependency */}
                  {dependencies.filter((d) => d.childFieldName && d.parentFieldName).map((dep, depIdx) => {
                    const parentField = selectedFields.find((f) => f.fieldName === dep.parentFieldName);
                    const childField = selectedFields.find((f) => f.fieldName === dep.childFieldName);
                    const parentValues = masterDataValues[dep.parentFieldName] || [];
                    const childValues = masterDataValues[dep.childFieldName] || [];
                    const assignedChildValues = new Set<string>();
                    dep.valueMappings.forEach((m) => m.allowedChildValues.forEach((v) => assignedChildValues.add(v)));

                    return (
                      <div key={depIdx} className="border rounded-xl p-4 space-y-3 bg-amber-50/50">
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <span className="text-muted-foreground">When</span>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{parentField?.label}</Badge>
                          <span className="text-muted-foreground">changes, filter</span>
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">{childField?.label}</Badge>
                        </div>

                        {loadingValues ? (
                          <div className="flex items-center gap-2 py-4 justify-center text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading values...
                          </div>
                        ) : parentValues.length > 0 && childValues.length > 0 ? (
                          <div className="border rounded-lg overflow-hidden bg-background">
                            <Table>
                              <TableHeader className="bg-muted/50">
                                <TableRow>
                                  <TableHead className="w-[180px] text-xs">When {parentField?.label} =</TableHead>
                                  <TableHead className="text-xs">Show these {childField?.label}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {parentValues.map((pVal) => {
                                  const mapping = dep.valueMappings.find((m) => m.parentValue === pVal);
                                  const currentAllowed = mapping?.allowedChildValues || [];
                                  return (
                                    <TableRow key={pVal}>
                                      <TableCell className="font-medium text-xs align-top py-2">{pVal}</TableCell>
                                      <TableCell className="py-2">
                                        <div className="flex flex-wrap gap-1.5">
                                          {childValues.map((cVal) => {
                                            const isChecked = currentAllowed.includes(cVal);
                                            const isAssignedElsewhere = !isChecked && assignedChildValues.has(cVal);
                                            return (
                                              <label key={cVal} className={cn(
                                                "flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] cursor-pointer transition-colors",
                                                isChecked ? "bg-primary/10 border-primary text-primary font-medium"
                                                  : isAssignedElsewhere ? "opacity-40 cursor-not-allowed"
                                                    : "hover:bg-muted/30"
                                              )}>
                                                <Checkbox checked={isChecked} disabled={isAssignedElsewhere} className="h-3 w-3"
                                                  onCheckedChange={(checked) => {
                                                    setDependencies((prev) => prev.map((d, i) => {
                                                      if (i !== depIdx) return d;
                                                      const existing = d.valueMappings.find((m) => m.parentValue === pVal);
                                                      let newMappings: ValueMapping[];
                                                      if (checked) {
                                                        newMappings = existing
                                                          ? d.valueMappings.map((m) => m.parentValue === pVal ? { ...m, allowedChildValues: [...m.allowedChildValues, cVal] } : m)
                                                          : [...d.valueMappings, { parentValue: pVal, allowedChildValues: [cVal] }];
                                                      } else {
                                                        newMappings = d.valueMappings.map((m) => m.parentValue === pVal ? { ...m, allowedChildValues: m.allowedChildValues.filter((v) => v !== cVal) } : m).filter((m) => m.allowedChildValues.length > 0);
                                                      }
                                                      return { ...d, valueMappings: newMappings };
                                                    }));
                                                  }}
                                                />
                                                {cVal}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">No values found. Make sure the source data has records.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/10 shrink-0">
          <div className="flex items-center justify-between w-full">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>

            <div className="flex gap-3">
              {step === "mapping" && (
                <Button variant="outline" onClick={() => setStep("selection")}>
                  <ChevronLeft className="h-4 w-4 mr-2" /> Back
                </Button>
              )}

              {step === "selection" ? (
                <Button
                  disabled={selectedFields.length === 0 || !isReadyToShowFields}
                  onClick={() => setStep("mapping")}
                  className="px-8"
                >
                  Configure <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={onFinalConfirm}
                  className="bg-green-600 hover:bg-green-700 text-white px-8"
                >
                  Create {selectedFields.length} Field
                  {selectedFields.length !== 1 ? "s" : ""}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}