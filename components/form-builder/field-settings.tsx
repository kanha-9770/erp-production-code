"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Check,
  ChevronsUpDown,
  Settings,
  X,
  Plus,
  Database,
  FileText,
  Zap,
  Info,
  Loader2,
  Save,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { FormField, FieldOption } from "@/types/form-builder";
import { useLazyGetFormFullQuery } from "@/lib/api/forms";
import { useLazyGetLookupSourcesQuery, useLazyGetLookupFieldsQuery } from "@/lib/api/lookup";

export interface DependentOptionGroup {
  parentValue: string;
  options: FieldOption[];
}

interface DependentOptionsEditorProps {
  field: FormField;
  allFormFields: FormField[];
  onUpdate: (updates: Partial<FormField>) => void;
}

function DependentOptionsEditor({
  field,
  allFormFields,
  onUpdate,
}: DependentOptionsEditorProps) {
  const possibleParents = allFormFields.filter((f) => {
    if (f.id === field.id) return false;
    const t = String(f.type || "").trim().toLowerCase();
    return (
      t.includes("select") ||
      t.includes("dropdown") ||
      t.includes("combo") ||
      t.includes("radio") ||
      t.includes("choice") ||
      t === "multiselect" ||
      t === "multi-select" ||
      t === "singleselect" ||
      t === "single-select"
    );
  });

  const selectedParent = allFormFields.find((f) => f.id === field.parentFieldId);

  let parentOptions: FieldOption[] = [];
  if (selectedParent) {
    if (selectedParent.isDependent) {
      parentOptions = (selectedParent.dependentGroups || []).flatMap(
        (group) => group.options || [],
      );
      const uniqueMap = new Map<string, FieldOption>();
      parentOptions.forEach((opt) => {
        if (opt.value && !uniqueMap.has(opt.value)) uniqueMap.set(opt.value, opt);
      });
      parentOptions = Array.from(uniqueMap.values());
    } else {
      parentOptions = selectedParent.options ?? [];
    }
  }

  const addGroup = () => {
    const newGroup: DependentOptionGroup = {
      parentValue: "",
      options: [
        {
          id: `opt_${Date.now()}`,
          label: "New Option",
          value: `val_${Date.now()}`,
          order: 0,
        },
      ],
    };
    onUpdate({ dependentGroups: [...(field.dependentGroups || []), newGroup] });
  };

  const updateGroup = (groupIndex: number, updates: Partial<DependentOptionGroup>) => {
    const groups = [...(field.dependentGroups || [])];
    groups[groupIndex] = { ...groups[groupIndex], ...updates };
    onUpdate({ dependentGroups: groups });
  };

  const removeGroup = (groupIndex: number) => {
    const groups = (field.dependentGroups || []).filter((_, i) => i !== groupIndex);
    onUpdate({ dependentGroups: groups });
  };

  const addChildOption = (groupIndex: number) => {
    const group = field.dependentGroups?.[groupIndex];
    if (!group) return;
    const newOption: FieldOption = {
      id: `opt_${Date.now()}`,
      label: "New Option",
      value: `val_${Date.now()}`,
      order: group.options.length,
    };
    const newOptions = [...group.options, newOption];
    updateGroup(groupIndex, { options: newOptions });
  };

  const updateChildOption = (groupIndex: number, optionIndex: number, updates: Partial<FieldOption>) => {
    const group = field.dependentGroups?.[groupIndex];
    if (!group) return;
    const newOptions = [...group.options];
    newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates };
    updateGroup(groupIndex, { options: newOptions });
  };

  const removeChildOption = (groupIndex: number, optionIndex: number) => {
    const group = field.dependentGroups?.[groupIndex];
    if (!group) return;
    const newOptions = group.options.filter((_, i) => i !== optionIndex);
    updateGroup(groupIndex, { options: newOptions });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Parent Field (controls this dropdown)</Label>
        <Select
          value={field.parentFieldId || ""}
          onValueChange={(value) => onUpdate({ parentFieldId: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select which field controls the options" />
          </SelectTrigger>
          <SelectContent>
            {possibleParents.map((parent) => (
              <SelectItem key={parent.id} value={parent.id}>
                {parent.label || "Unnamed Field"} ({parent.type || "unknown"})
              </SelectItem>
            ))}
            {possibleParents.length === 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                <strong>No suitable parent fields found yet.</strong>
                <br />
                Add a dropdown, radio, or select field first.
              </div>
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          This field will show different options depending on the selection in the parent field.
        </p>
      </div>

      <div className="space-y-4">
        {(field.dependentGroups || []).map((group, groupIndex) => (
          <Card key={groupIndex} className="p-4 border border-gray-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 space-y-1.5">
                <Label>
                  When parent value is
                  {selectedParent && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({selectedParent.label})
                    </span>
                  )}
                </Label>
                {parentOptions.length > 0 ? (
                  <Select
                    value={group.parentValue}
                    onValueChange={(value) => updateGroup(groupIndex, { parentValue: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select value from parent field" />
                    </SelectTrigger>
                    <SelectContent>
                      {parentOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label} ({opt.value})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={group.parentValue}
                    onChange={(e) => updateGroup(groupIndex, { parentValue: e.target.value })}
                    placeholder={
                      selectedParent
                        ? "Parent has no options yet – enter manually or add options to parent"
                        : "Select a parent field first"
                    }
                    disabled={!selectedParent}
                  />
                )}
                {parentOptions.length === 0 && selectedParent && (
                  <p className="text-xs text-amber-700 mt-1">
                    Parent field has no options defined. You can still type a value manually.
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => removeGroup(groupIndex)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-3 pl-4 border-l-2 border-gray-200">
              <p className="text-sm font-medium text-gray-700">
                Options shown when the above value is selected:
              </p>
              {group.options.map((option, optIndex) => (
                <div key={option.id} className="flex items-center gap-2">
                  <Input
                    value={option.label}
                    onChange={(e) =>
                      updateChildOption(groupIndex, optIndex, {
                        label: e.target.value,
                        value: e.target.value,
                      })
                    }
                    placeholder="e.g. Jaipur, Jodhpur, Udaipur"
                    className="flex-1"
                  />
                  <Input
                    value={option.value}
                    onChange={(e) =>
                      updateChildOption(groupIndex, optIndex, {
                        value: e.target.value,
                      })
                    }
                    placeholder="e.g. jaipur, jodhpur"
                    className="w-44"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => removeChildOption(groupIndex, optIndex)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => addChildOption(groupIndex)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add child option
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Button onClick={addGroup} variant="outline" className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add New Group (for another parent value)
      </Button>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
        <strong>Example:</strong>
        <br />
        If parent = "State" with options "Rajasthan", "Gujarat"
        <br />→ you will see a dropdown with those values instead of typing manually.
      </div>
    </div>
  );
}

interface FieldSettingsProps {
  field: FormField;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (updates: Partial<FormField>) => void;
  formId?: string;
}

export default function FieldSettings({
  field,
  open,
  onOpenChange,
  onUpdate,
  formId: propFormId,
}: FieldSettingsProps) {
  const params = useParams();
  const routeFormId =
    params?.formId || params?.id || params?.form_id || params?.slug;
  const effectiveFormId =
    propFormId || (typeof routeFormId === "string" ? routeFormId : undefined);

  const { toast } = useToast();

  const [localField, setLocalField] = useState<FormField>(field);
  const [allFormFields, setAllFormFields] = useState<FormField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [lookupSources, setLookupSources] = useState<any[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [loadingLookupFields, setLoadingLookupFields] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [triggerGetFormFull] = useLazyGetFormFullQuery();
  const [triggerGetLookupSources] = useLazyGetLookupSourcesQuery();
  const [triggerGetLookupFields] = useLazyGetLookupFieldsQuery();

  useEffect(() => {
    if (!open) return;
    if (!effectiveFormId) {
      toast({
        title: "Warning",
        description: "Cannot load other form fields — form ID is missing",
        variant: "default",
      });
      setLoadingFields(false);
      return;
    }

    const loadFullFormFields = async () => {
      setLoadingFields(true);
      try {
        const json = await triggerGetFormFull(effectiveFormId).unwrap();
        if (!json.success || !json.data) throw new Error("Invalid response");

        const fullForm = json.data;
        const collected: FormField[] = [];
        fullForm.sections?.forEach((section: any) => {
          if (Array.isArray(section.fields)) collected.push(...section.fields);
        });

        const collectSubforms = (subs: any[] = []) => {
          subs.forEach((sf) => {
            if (Array.isArray(sf.fields)) collected.push(...sf.fields);
            if (Array.isArray(sf.childSubforms)) collectSubforms(sf.childSubforms);
          });
        };
        collectSubforms(fullForm.subforms || []);

        setAllFormFields(collected);
      } catch (err: any) {
        console.error("Failed to load form fields:", err);
        toast({
          title: "Error",
          description: "Could not load other fields for dependent options",
          variant: "destructive",
        });
      } finally {
        setLoadingFields(false);
      }
    };

    loadFullFormFields();
  }, [open, effectiveFormId, toast, triggerGetFormFull]);

  useEffect(() => {
    if (open) {
      setLocalField(field);
      setHasChanges(false);
    }
  }, [field, open]);

  useEffect(() => {
    if (localField.type === "lookup") {
      loadLookupSources();
    }
  }, [localField.type]);

  useEffect(() => {
    if (localField.lookup?.sourceId) {
      loadAvailableFields(localField.lookup.sourceId);
    }
  }, [localField.lookup?.sourceId]);

  const loadLookupSources = async () => {
    setLoadingSources(true);
    try {
      const result = await triggerGetLookupSources().unwrap();
      if (result.success) {
        setLookupSources(result.data || []);
      }
    } catch (error) {
      console.error("Error loading lookup sources:", error);
      toast({
        title: "Error",
        description: "Failed to load lookup sources",
        variant: "destructive",
      });
    } finally {
      setLoadingSources(false);
    }
  };

  const loadAvailableFields = async (sourceId: string) => {
    setLoadingLookupFields(true);
    try {
      const result = await triggerGetLookupFields(sourceId).unwrap();
      if (result.success) {
        setAvailableFields(result.data?.fields || []);
      }
    } catch (error) {
      console.error("Error loading available fields:", error);
      setAvailableFields(["id", "name", "title", "label", "description", "email"]);
    } finally {
      setLoadingLookupFields(false);
    }
  };

  const handleFieldUpdate = (updates: Partial<FormField>) => {
    const updatedField = { ...localField, ...updates };
    setLocalField(updatedField);
    setHasChanges(true);
  };

  const handleVisibilityChange = (visible: boolean) => {
    const newProperties = { ...(localField.properties || {}), hidden: !visible };
    handleFieldUpdate({ visible, properties: newProperties });
  };

  const handleValidationChange = (key: string, value: any) => {
    const newValidation = { ...localField.validation, [key]: value };
    handleFieldUpdate({ validation: newValidation });
  };

  const handlePropertiesChange = (key: string, value: any) => {
    const newProperties = { ...localField.properties, [key]: value };
    handleFieldUpdate({ properties: newProperties });
  };

  const handleLookupChange = (key: string, value: any) => {
    const currentLookup = localField.lookup || {};
    const newLookup = { ...currentLookup, [key]: value };
    handleFieldUpdate({ lookup: newLookup });
  };

  const handleFieldMappingUpdate = (mappingKey: string, value: string) => {
    const currentLookup = localField.lookup || {};
    const currentMapping = currentLookup.fieldMapping || {
      display: "name",
      value: "id",
      store: "name",
    };
    const newLookup = {
      ...currentLookup,
      fieldMapping: { ...currentMapping, [mappingKey]: value },
    };
    handleFieldUpdate({ lookup: newLookup });
  };

  const handleSourceSelect = (sourceId: string) => {
    const source = lookupSources.find((s) => s.id === sourceId);
    const newLookup = {
      sourceId,
      sourceType: source?.type as "form" | "module" | "static",
      multiple: localField.lookup?.multiple || false,
      searchable: localField.lookup?.searchable !== false,
      fieldMapping: {
        display: "name",
        value: "id",
        store: "name",
        description: "description",
      },
    };
    handleFieldUpdate({ lookup: newLookup });
    setSourceOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      onUpdate(localField);
      setHasChanges(false);
      onOpenChange(false);
      toast({
        title: "Success",
        description: "Field settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save field settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      setShowConfirmDialog(true);
    } else {
      onOpenChange(false);
    }
  };

  const confirmDiscard = () => {
    setShowConfirmDialog(false);
    onOpenChange(false);
  };

  const cancelDiscard = () => {
    setShowConfirmDialog(false);
  };

  const addOption = () => {
    const newOption: FieldOption = {
      id: `opt_${Date.now()}`,
      label: "New Option",
      value: "New Option",
      order: (localField.options || []).length,
    };
    handleFieldUpdate({ options: [...(localField.options || []), newOption] });
  };

  const updateOption = (index: number, updates: Partial<FieldOption>) => {
    const newOptions = [...(localField.options || [])];
    newOptions[index] = { ...newOptions[index], ...updates };
    handleFieldUpdate({ options: newOptions });
  };

  const removeOption = (index: number) => {
    const newOptions = (localField.options || []).filter((_, i) => i !== index);
    handleFieldUpdate({ options: newOptions });
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "form":
        return <FileText className="h-4 w-4" />;
      case "module":
        return <Database className="h-4 w-4" />;
      case "static":
        return <Zap className="h-4 w-4" />;
      default:
        return <Database className="h-4 w-4" />;
    }
  };

  const getSourceTypeLabel = (type: string) => {
    switch (type) {
      case "form":
        return "Form";
      case "module":
        return "Module";
      case "static":
        return "Built-in";
      default:
        return "Unknown";
    }
  };

  const selectedSource = lookupSources.find(
    (source) => source.id === localField.lookup?.sourceId,
  );

  const isLocationField = ["location", "newlocation"].includes(localField.type ?? "");

  const supportsPattern = [
    "text",
    "textarea",
    "email",
    "url",
    "tel",
    "password",
    "number",
  ].includes(localField.type ?? "");

  const conditionalParent = allFormFields.find(
    (f) => f.id === localField.conditional?.parentFieldId,
  );

  const conditionalParentHasOptions = Boolean(
    conditionalParent?.options && conditionalParent.options.length > 0,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Field Settings - {localField.label || "Unnamed"}
              {hasChanges && <Badge variant="secondary">Unsaved Changes</Badge>}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="general" className="flex-1 overflow-hidden">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[350px] mt-4 border rounded-lg">
              {/* GENERAL TAB */}
              <TabsContent value="general" className="space-y-6 p-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>
                      Configure the basic properties of your field
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="label">Label</Label>
                        <Input
                          id="label"
                          value={localField.label}
                          onChange={(e) => handleFieldUpdate({ label: e.target.value })}
                          placeholder="Field label"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="placeholder">Placeholder</Label>
                        <Input
                          id="placeholder"
                          value={localField.placeholder || ""}
                          onChange={(e) => handleFieldUpdate({ placeholder: e.target.value })}
                          placeholder="Placeholder text"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={localField.description || ""}
                        onChange={(e) => handleFieldUpdate({ description: e.target.value })}
                        placeholder="Field description or help text"
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="width">Width</Label>
                        <Select
                          value={localField.width}
                          onValueChange={(value: "full" | "half" | "third" | "quarter") =>
                            handleFieldUpdate({ width: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select width" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="full">Full Width</SelectItem>
                            <SelectItem value="half">Half Width</SelectItem>
                            <SelectItem value="third">Third Width</SelectItem>
                            <SelectItem value="quarter">Quarter Width</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="defaultValue">Default Value</Label>
                        <Input
                          id="defaultValue"
                          value={localField.defaultValue || ""}
                          onChange={(e) => handleFieldUpdate({ defaultValue: e.target.value })}
                          placeholder="Default value"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Visible</Label>
                        <p className="text-sm text-muted-foreground">
                          Show this field in the form
                        </p>
                      </div>
                      <Switch
                        checked={localField.visible ?? true}
                        onCheckedChange={(checked) => handleVisibilityChange(!!checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Read Only</Label>
                        <p className="text-sm text-muted-foreground">
                          Make this field read-only
                        </p>
                      </div>
                      <Switch
                        checked={localField.readonly ?? false}
                        onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
                      />
                    </div>

                    {localField.type === "date" && (
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Auto-fetch Current Date</Label>
                          <p className="text-sm text-muted-foreground">
                            Automatically set the current date as the default value
                          </p>
                        </div>
                        <Switch
                          checked={localField.properties?.autoFetchDate ?? false}
                          onCheckedChange={(checked) =>
                            handlePropertiesChange("autoFetchDate", checked)
                          }
                        />
                      </div>
                    )}

                    {localField.type === "time" && (
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Auto-fetch Current Time</Label>
                          <p className="text-sm text-muted-foreground">
                            Automatically set the current time as the default value
                          </p>
                        </div>
                        <Switch
                          checked={localField.properties?.autoFetchTime ?? false}
                          onCheckedChange={(checked) =>
                            handlePropertiesChange("autoFetchTime", checked)
                          }
                        />
                      </div>
                    )}

                    {isLocationField && (
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Auto-fetch Current Location</Label>
                          <p className="text-sm text-muted-foreground">
                            Automatically fill the user's GPS location (address + coordinates)
                          </p>
                        </div>
                        <Switch
                          checked={localField.properties?.autoFetchLocation ?? false}
                          onCheckedChange={(checked) =>
                            handlePropertiesChange("autoFetchLocation", checked)
                          }
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {localField.type === "lookup" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Lookup Configuration</CardTitle>
                      <CardDescription>
                        Configure the data source and field mapping for this lookup field
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label>Data Source</Label>
                        <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={sourceOpen}
                              className="w-full justify-between"
                              disabled={loadingSources}
                            >
                              {loadingSources ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Loading sources...
                                </>
                              ) : selectedSource ? (
                                <>
                                  {getSourceIcon(selectedSource.type)}
                                  <span className="ml-2">{selectedSource.name}</span>
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {getSourceTypeLabel(selectedSource.type)}
                                  </span>
                                </>
                              ) : (
                                "Select data source"
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0">
                            <Command>
                              <CommandInput placeholder="Search sources..." />
                              <CommandList>
                                <CommandEmpty>No sources found.</CommandEmpty>
                                <CommandGroup>
                                  {lookupSources.map((source) => (
                                    <CommandItem
                                      key={source.id}
                                      value={source.id}
                                      onSelect={() => handleSourceSelect(source.id)}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          source.id === localField.lookup?.sourceId
                                            ? "opacity-100"
                                            : "opacity-0",
                                        )}
                                      />
                                      <div className="flex items-center gap-2">
                                        {getSourceIcon(source.type)}
                                        <span>{source.name}</span>
                                      </div>
                                      <span className="ml-auto text-xs text-muted-foreground">
                                        {getSourceTypeLabel(source.type)}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>

                      {localField.lookup?.sourceId && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Field to Display</Label>
                              <Select
                                value={localField.lookup?.fieldMapping?.display || "name"}
                                onValueChange={(value) =>
                                  handleFieldMappingUpdate("display", value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select display field" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableFields?.map((field) => (
                                    <SelectItem key={field} value={field}>
                                      {field}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Field to Store</Label>
                              <Select
                                value={localField.lookup?.fieldMapping?.store || "name"}
                                onValueChange={(value) =>
                                  handleFieldMappingUpdate("store", value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select store field" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableFields.map((field) => (
                                    <SelectItem key={field} value={field}>
                                      {field}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Allow Multiple Selection</Label>
                              <p className="text-sm text-muted-foreground">
                                Users can select multiple values
                              </p>
                            </div>
                            <Switch
                              checked={localField.lookup?.multiple || false}
                              onCheckedChange={(checked) =>
                                handleLookupChange("multiple", checked)
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Searchable</Label>
                              <p className="text-sm text-muted-foreground">
                                Allow searching within the dropdown
                              </p>
                            </div>
                            <Switch
                              checked={localField.lookup?.searchable !== false}
                              onCheckedChange={(checked) =>
                                handleLookupChange("searchable", checked)
                              }
                            />
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* VALIDATION TAB */}
              <TabsContent value="validation" className="space-y-6 p-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Validation Rules</CardTitle>
                    <CardDescription>Define rules for valid input</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Required</Label>
                        <p className="text-sm text-muted-foreground">
                          User must fill this field
                        </p>
                      </div>
                      <Switch
                        checked={localField.validation?.required ?? false}
                        onCheckedChange={(checked) =>
                          handleValidationChange("required", checked)
                        }
                      />
                    </div>

                    {supportsPattern && (
                      <div className="space-y-2">
                        <Label htmlFor="pattern">Pattern (Regex)</Label>
                        <Input
                          id="pattern"
                          value={localField.validation?.pattern || ""}
                          onChange={(e) =>
                            handleValidationChange("pattern", e.target.value)
                          }
                          placeholder="e.g. ^[0-9]{10}$ for 10-digit number"
                        />
                        <p className="text-xs text-muted-foreground">
                          Regular expression to validate input format
                        </p>
                      </div>
                    )}

                    {(localField.type === "number" ||
                      localField.type === "decimal") && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="min">Minimum Value</Label>
                              <Input
                                id="min"
                                type="number"
                                value={localField.validation?.min ?? ""}
                                onChange={(e) =>
                                  handleValidationChange(
                                    "min",
                                    e.target.value ? Number(e.target.value) : undefined,
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="max">Maximum Value</Label>
                              <Input
                                id="max"
                                type="number"
                                value={localField.validation?.max ?? ""}
                                onChange={(e) =>
                                  handleValidationChange(
                                    "max",
                                    e.target.value ? Number(e.target.value) : undefined,
                                  )
                                }
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="step">Step (increment)</Label>
                            <Input
                              id="step"
                              type="number"
                              value={localField.validation?.step ?? ""}
                              onChange={(e) =>
                                handleValidationChange(
                                  "step",
                                  e.target.value ? Number(e.target.value) : undefined,
                                )
                              }
                              placeholder="e.g. 0.01 for decimals"
                            />
                          </div>
                        </>
                      )}

                    <div className="space-y-2">
                      <Label htmlFor="errorMessage">Custom Error Message</Label>
                      <Input
                        id="errorMessage"
                        value={localField.validation?.errorMessage || ""}
                        onChange={(e) =>
                          handleValidationChange("errorMessage", e.target.value)
                        }
                        placeholder="e.g. Please enter a valid email address"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* OPTIONS TAB */}
              <TabsContent value="options" className="space-y-6 p-6">
                {["select", "multi-select", "radio"].includes(
                  localField.type ?? "",
                ) && (
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>Field Options</CardTitle>
                            <CardDescription>
                              {localField.isDependent
                                ? `Configure dependent / cascading options (${allFormFields.length} fields available)`
                                : "Configure static options"}
                            </CardDescription>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Label htmlFor="dependent-toggle">Dependent Mode</Label>
                            <Switch
                              id="dependent-toggle"
                              checked={localField.isDependent ?? false}
                              onCheckedChange={(checked) => {
                                handleFieldUpdate({
                                  isDependent: checked,
                                  dependentGroups: checked
                                    ? (localField.dependentGroups ?? [])
                                    : undefined,
                                  options: checked
                                    ? undefined
                                    : (localField.options ?? []),
                                  parentFieldId: checked
                                    ? localField.parentFieldId
                                    : undefined,
                                });
                              }}
                            />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6 pt-6">
                        {loadingFields ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                        ) : localField.isDependent ? (
                          <DependentOptionsEditor
                            field={localField}
                            allFormFields={allFormFields}
                            onUpdate={handleFieldUpdate}
                          />
                        ) : (
                          <div className="space-y-3">
                            {(localField.options || []).map((option, index) => (
                              <div
                                key={option.id}
                                className="flex items-center gap-2 p-3 border rounded-lg"
                              >
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <Input
                                    value={option.label}
                                    onChange={(e) =>
                                      updateOption(index, {
                                        label: e.target.value,
                                        value: e.target.value,
                                      })
                                    }
                                    placeholder="Option label"
                                  />
                                  <Input
                                    value={option.value}
                                    onChange={(e) =>
                                      updateOption(index, { value: e.target.value })
                                    }
                                    placeholder="Option value"
                                  />
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeOption(index)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button onClick={addOption} variant="outline" className="w-full">
                              <Plus className="h-4 w-4 mr-2" />
                              Add Option
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                {localField.type === "file" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>File Upload Settings</CardTitle>
                      <CardDescription>
                        Configure file upload restrictions
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="accept">Accepted File Types</Label>
                        <Input
                          id="accept"
                          value={localField.properties?.accept || ""}
                          onChange={(e) =>
                            handlePropertiesChange("accept", e.target.value)
                          }
                          placeholder=".jpg,.png,.pdf"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Multiple Files</Label>
                          <p className="text-sm text-muted-foreground">
                            Allow multiple file uploads
                          </p>
                        </div>
                        <Switch
                          checked={localField.properties?.multiple || false}
                          onCheckedChange={(checked) =>
                            handlePropertiesChange("multiple", checked)
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ADVANCED TAB – Unique ID feature lives here */}
              <TabsContent value="advanced" className="space-y-6 p-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Advanced Settings</CardTitle>
                    <CardDescription>
                      Additional field configuration options
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Conditional Visibility */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Conditional Visibility</Label>
                        <p className="text-sm text-muted-foreground">
                          Show/hide based on other field values
                        </p>
                      </div>
                      <Switch
                        checked={!!localField.conditional}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleFieldUpdate({
                              conditional: {
                                type: "show",
                                parentFieldId: "",
                                value: "",
                              },
                            });
                          } else {
                            handleFieldUpdate({ conditional: undefined });
                          }
                        }}
                      />
                    </div>

                    {localField.conditional && (
                      <div className="pl-6 border-l-2 border-gray-200 space-y-4">
                        <div className="space-y-2">
                          <Label>Condition Type</Label>
                          <Select
                            value={localField.conditional?.type || "show"}
                            onValueChange={(value) =>
                              handleFieldUpdate({
                                conditional: {
                                  ...localField.conditional,
                                  type: value,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select condition type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="show">Show when...</SelectItem>
                              <SelectItem value="hide">Hide when...</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Parent Field</Label>
                          <Select
                            value={localField.conditional?.parentFieldId || ""}
                            onValueChange={(value) =>
                              handleFieldUpdate({
                                conditional: {
                                  ...localField.conditional,
                                  parentFieldId: value,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select parent field" />
                            </SelectTrigger>
                            <SelectContent>
                              {allFormFields
                                .filter((f) => f.id !== field.id)
                                .map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.label || "Unnamed"} ({f.type})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Condition Value</Label>
                          {conditionalParentHasOptions ? (
                            <Select
                              value={localField.conditional?.value || ""}
                              onValueChange={(value) =>
                                handleFieldUpdate({
                                  conditional: {
                                    ...localField.conditional,
                                    value,
                                  },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select value that triggers visibility" />
                              </SelectTrigger>
                              <SelectContent>
                                {conditionalParent.options.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label} ({opt.value})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={localField.conditional?.value || ""}
                              onChange={(e) =>
                                handleFieldUpdate({
                                  conditional: {
                                    ...localField.conditional,
                                    value: e.target.value,
                                  },
                                })
                              }
                              placeholder="e.g. Yes, true, 1, Rajasthan"
                            />
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {conditionalParentHasOptions
                              ? "Choose from the parent's available options"
                              : "Enter the exact value that should trigger visibility (case-sensitive)"}
                          </p>
                        </div>

                        {localField.conditional?.parentFieldId &&
                          localField.conditional?.value && (
                            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
                              <strong>Active condition:</strong> This field will
                              be{" "}
                              <strong>
                                {localField.conditional.type === "show" ? "shown" : "hidden"}
                              </strong>{" "}
                              when{" "}
                              <em>{conditionalParent?.label || "selected field"}</em> ={" "}
                              <strong>"{localField.conditional.value}"</strong>
                            </div>
                          )}
                      </div>
                    )}

                    {/* Custom Styling */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Custom Styling</Label>
                        <p className="text-sm text-muted-foreground">
                          Apply custom CSS classes or inline styles
                        </p>
                      </div>
                      <Switch
                        checked={!!localField.styling}
                        onCheckedChange={(checked) =>
                          handleFieldUpdate({ styling: checked ? {} : undefined })
                        }
                      />
                    </div>

                    {localField.styling && (
                      <div className="pl-6 border-l-2 border-gray-200 space-y-4">
                        <div className="space-y-2">
                          <Label>Custom Class</Label>
                          <Input
                            value={localField.styling?.className || ""}
                            onChange={(e) =>
                              handleFieldUpdate({
                                styling: {
                                  ...localField.styling,
                                  className: e.target.value,
                                },
                              })
                            }
                            placeholder="e.g. bg-blue-50 border-blue-300"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Custom Style (CSS)</Label>
                          <Input
                            value={localField.styling?.style || ""}
                            onChange={(e) =>
                              handleFieldUpdate({
                                styling: {
                                  ...localField.styling,
                                  style: e.target.value,
                                },
                              })
                            }
                            placeholder="e.g. color: #2563eb; font-weight: bold;"
                          />
                        </div>
                      </div>
                    )}

                    {/* ── UNIQUE ID FEATURE ── Only shown in Advanced tab for unique-id fields */}
                    {localField.type === "unique-id" && (
                      <>
                        <Separator className="my-6" />
                        <div className="space-y-6">
                          <div className="flex items-center gap-3">
                            <Hash className="h-6 w-6 text-blue-600" />
                            <div>
                              <h3 className="text-lg font-semibold">Unique ID Settings</h3>
                              <p className="text-sm text-muted-foreground">
                                Configure how this unique identifier is generated
                              </p>
                            </div>
                          </div>

                          {/* Generation Mode */}
                          <div className="space-y-2">
                            <Label>Generation Mode</Label>
                            <Select
                              value={localField.properties?.uniqueIdMode || "uuid"}
                              onValueChange={(value) =>
                                handlePropertiesChange("uniqueIdMode", value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="uuid">UUID (recommended)</SelectItem>
                                <SelectItem value="sequential">Sequential Number</SelectItem>
                                <SelectItem value="prefix">Prefix + Number</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              {localField.properties?.uniqueIdMode === "uuid" &&
                                "Generates random 36-char UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)"}
                              {localField.properties?.uniqueIdMode === "sequential" &&
                                "Increments number for each new record (1, 2, 3...)"}
                              {localField.properties?.uniqueIdMode === "prefix" &&
                                "Custom prefix + padded number (e.g. INV-0001)"}
                            </p>
                          </div>

                          {/* Prefix (only for prefix mode) */}
                          {localField.properties?.uniqueIdMode === "prefix" && (
                            <div className="space-y-2">
                              <Label>Prefix</Label>
                              <Input
                                value={localField.properties?.uniqueIdPrefix || ""}
                                onChange={(e) =>
                                  handlePropertiesChange("uniqueIdPrefix", e.target.value)
                                }
                                placeholder="e.g. INV-, EMP-, TKT-"
                                maxLength={10}
                              />
                              <p className="text-xs text-muted-foreground">
                                Will be added before the number (e.g. INV-000001)
                              </p>
                            </div>
                          )}

                          {/* Start & Padding (for sequential & prefix modes) */}
                          {(localField.properties?.uniqueIdMode === "sequential" ||
                            localField.properties?.uniqueIdMode === "prefix") && (
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Start From</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={localField.properties?.uniqueIdStart || "1"}
                                    onChange={(e) =>
                                      handlePropertiesChange(
                                        "uniqueIdStart",
                                        Number(e.target.value) || 1
                                      )
                                    }
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    First record gets this number
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Minimum Digits</Label>
                                  <Select
                                    value={String(
                                      localField.properties?.uniqueIdMinDigits || "6"
                                    )}
                                    onValueChange={(v) =>
                                      handlePropertiesChange("uniqueIdMinDigits", Number(v))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="4">4 (0001)</SelectItem>
                                      <SelectItem value="5">5 (00001)</SelectItem>
                                      <SelectItem value="6">6 (000001)</SelectItem>
                                      <SelectItem value="7">7 (0000001)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    Zero-padding for consistent length
                                  </p>
                                </div>
                              </div>
                            )}

                          {/* Visibility & Editability */}
                          <div className="grid grid-cols-2 gap-6 pt-4 border-t">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <Label>Hidden from Users</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Field is generated but not visible
                                  </p>
                                </div>
                                <Switch
                                  checked={localField.properties?.hidden ?? true}
                                  onCheckedChange={(checked) =>
                                    handlePropertiesChange("hidden", checked)
                                  }
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <Label>Read Only</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Prevent manual editing (recommended)
                                  </p>
                                </div>
                                <Switch
                                  checked={localField.readonly !== false}
                                  onCheckedChange={(checked) =>
                                    handleFieldUpdate({ readonly: checked })
                                  }
                                />
                              </div>
                            </div>
                          </div>

                          {/* Preview hint */}
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                            <strong>Note:</strong> The actual ID is generated when a record is created.
                            Admins can override it manually if read-only is turned off.
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <div className="flex justify-between items-center gap-2 pt-4 border-t px-6 py-4">
            <div className="text-sm text-muted-foreground">
              {hasChanges && "You have unsaved changes"}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !hasChanges}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in this field settings. Closing now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscard}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Yes, discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}