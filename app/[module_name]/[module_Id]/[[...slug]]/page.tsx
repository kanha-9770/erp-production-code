"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Type,
  Mail,
  Hash,
  CalendarDays,
  Link,
  Upload,
  CheckSquare,
  Radio,
  ChevronDown,
  Lock,
  Edit3,
  MousePointer2,
  FileText,
} from "lucide-react";
import FormsContent from "@/components/dynamicSubmodule/formsContent";
import { PublicFormDialog } from "@/components/public-form-dialog";
import { useGetModuleByIdQuery } from "@/lib/api/modules";
import {
  useDeleteRecordMutation,
  useGetModuleRecordsQuery,
  useUpdateRecordMutation,
} from "@/lib/api/records";
import RecordsDisplay from "@/components/modules/recordsDisplay";

interface FormModule {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  children?: FormModule[];
  forms?: Form[];
}

interface Form {
  id: string;
  name: string;
  description?: string;
  moduleId: string;
  isPublished: boolean;
  updatedAt: string;
  sections: FormSection[];
}

interface FormSection {
  id: string;
  title: string;
  fields: FormField[];
}

interface FormField {
  id: string;
  label: string;
  type: string;
  order: number;
  placeholder?: string;
  description?: string;
  validation?: any;
  options?: any[];
  lookup?: any;
}

interface FormRecord {
  id: string;
  formId: string;
  formName?: string;
  recordData: Record<string, any>;
  submittedAt: string;
  status: "pending" | "approved" | "rejected" | "submitted";
}

interface ProcessedFieldData {
  recordId?: string;
  recordIdFromAPI?: string;
  lookup: any;
  options: any;
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  value: any;
  displayValue: string;
  icon: string;
  order: number;
  sectionId?: string;
  sectionTitle?: string;
  formId?: string;
  formName?: string;
}

interface EnhancedFormRecord extends FormRecord {
  processedData: ProcessedFieldData[];
  originalRecordIds?: Map<string, string>;
}

interface FormFieldWithSection extends FormField {
  originalId: string;
  sectionTitle: string;
  sectionId: string;
  formId: string;
  formName: string;
}

interface EditingCell {
  recordId: string;
  fieldId: string;
  value: any;
  originalValue: any;
  fieldType: string;
  options?: any[];
}

interface PendingChange {
  recordId: string;
  fieldId: string;
  originalFieldId: string;
  value: any;
  originalValue: any;
  fieldType: string;
  fieldLabel: string;
}

export default function ModulePage({
  params,
}: {
  params: { module_name: string; module_Id: string; slug?: string[] };
}) {
  const { toast } = useToast();
  const { module_name, module_Id, slug } = params;

  const moduleId = module_Id;
  const moduleName = module_name;

  console.log("ModulePage: Initialized", { moduleId, moduleName, slug });

  const [selectedModule, setSelectedModule] = useState<FormModule | null>(null);
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const [formRecords, setFormRecords] = useState<EnhancedFormRecord[]>([]);
  const [allModuleForms, setAllModuleForms] = useState<Form[]>([]);
  const [formFieldsWithSections, setFormFieldsWithSections] = useState<
    FormFieldWithSection[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"excel" | "table" | "grid" | "list">(
    "excel",
  );
  const [recordSearchQuery, setRecordSearchQuery] = useState("");
  const [recordSortField, setRecordSortField] = useState<string>("");
  const [recordSortOrder, setRecordSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(
    new Set(),
  );
  const [selectedFormFilter, setSelectedFormFilter] = useState<string>("all");
  const [selectedFormForFilling, setSelectedFormForFilling] = useState<
    string | null
  >(null);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<
    "locked" | "single-click" | "double-click"
  >("double-click");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, PendingChange>
  >(new Map());
  const [savingChanges, setSavingChanges] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  const [clickCount, setClickCount] = useState<Map<string, number>>(new Map());
  const [permissions, setPermissions] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Added useEffect hooks to log state changes with descriptive messages
  useEffect(() => {
    console.log("ModulePage: selectedModule updated", { selectedModule });
  }, [selectedModule]);

  useEffect(() => {
    console.log("ModulePage: selectedForm updated", { selectedForm });
  }, [selectedForm]);

  useEffect(() => {
    console.log("ModulePage: formRecords updated", {
      formRecordsLength: formRecords.length,
    });
  }, [formRecords]);

  useEffect(() => {
    console.log("ModulePage: allModuleForms updated", {
      allModuleFormsLength: allModuleForms.length,
    });
  }, [allModuleForms]);

  useEffect(() => {
    console.log("ModulePage: formFieldsWithSections updated", {
      formFieldsWithSectionsLength: formFieldsWithSections.length,
    });
  }, [formFieldsWithSections]);

  useEffect(() => {
    console.log("ModulePage: loading status updated", { loading });
  }, [loading]);

  useEffect(() => {
    console.log("ModulePage: viewMode updated", { viewMode });
  }, [viewMode]);

  useEffect(() => {
    console.log("ModulePage: recordSearchQuery updated", { recordSearchQuery });
  }, [recordSearchQuery]);

  useEffect(() => {
    console.log("ModulePage: recordSortField updated", { recordSortField });
  }, [recordSortField]);

  useEffect(() => {
    console.log("ModulePage: recordSortOrder updated", { recordSortOrder });
  }, [recordSortOrder]);

  useEffect(() => {
    console.log("ModulePage: currentPage updated", { currentPage });
  }, [currentPage]);

  useEffect(() => {
    console.log("ModulePage: recordsPerPage updated", { recordsPerPage });
  }, [recordsPerPage]);

  useEffect(() => {
    console.log("ModulePage: selectedRecords updated", {
      selectedRecordsSize: selectedRecords.size,
      selectedRecords: Array.from(selectedRecords),
    });
  }, [selectedRecords]);

  useEffect(() => {
    console.log("ModulePage: selectedFormFilter updated", {
      selectedFormFilter,
    });
  }, [selectedFormFilter]);

  useEffect(() => {
    console.log("ModulePage: selectedFormForFilling updated", {
      selectedFormForFilling,
    });
  }, [selectedFormForFilling]);

  useEffect(() => {
    console.log("ModulePage: isFormDialogOpen updated", { isFormDialogOpen });
  }, [isFormDialogOpen]);

  useEffect(() => {
    console.log("ModulePage: editMode updated", { editMode });
  }, [editMode]);

  useEffect(() => {
    console.log("ModulePage: editingCell updated", { editingCell });
  }, [editingCell]);

  useEffect(() => {
    console.log("ModulePage: pendingChanges updated", {
      pendingChangesSize: pendingChanges.size,
    });
  }, [pendingChanges]);

  useEffect(() => {
    console.log("ModulePage: savingChanges updated", { savingChanges });
  }, [savingChanges]);

  useEffect(() => {
    console.log("ModulePage: clickTimeout updated", {
      clickTimeout: clickTimeout ? "active" : "inactive",
    });
  }, [clickTimeout]);

  useEffect(() => {
    console.log("ModulePage: clickCount updated", {
      clickCountSize: clickCount.size,
      clickCounts: Object.fromEntries(clickCount),
    });
  }, [clickCount]);

  const {
    data: moduleData,
    isLoading: moduleLoading,
    error: moduleError,
  } = useGetModuleByIdQuery(moduleId, {
    skip: !moduleId,
  });
  console.log("ModulePage: useGetModuleByIdQuery called", {
    moduleData,
    moduleLoading,
    moduleError,
  });
  const [formIds, setFormIds] = useState<string[]>([]);

  useEffect(() => {
    console.log("ModulePage: formIds updated", {
      formIdsLength: formIds.length,
    });
  }, [formIds]);

  const { data: allRecordsData, refetch: refetchRecords } =
    useGetModuleRecordsQuery(formIds, {
      skip: formIds.length === 0,
    });
  console.log("ModulePage: useGetModuleRecordsQuery called", allRecordsData);
  useEffect(() => {
    console.log("ModulePage: allRecordsData updated", {
      allRecordsDataLength: allRecordsData ? allRecordsData.length : 0,
    });
  }, [allRecordsData]);

  const [updateRecord] = useUpdateRecordMutation();
  const [deleteRecord] = useDeleteRecordMutation();

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const response = await fetch("/api/admin/permissions");
        if (!response.ok) throw new Error("Failed to fetch permissions");
        const data = await response.json();
        console.log("ModulePage: Fetched permissions", data);
        if (data.success) {
          setPermissions(data.data.permissions || []);
          const hasAdminRole = data.data.unitsAndRoles?.some(
            (ua: any) => ua.role.isAdmin || ua.role.name === "ADMIN",
          );
          setIsAdmin(hasAdminRole);
        }
      } catch (error) {
        console.error("Error fetching permissions:", error);
      }
    };

    fetchPermissions();
  }, []);

  const openFormDialog = (formId: string) => {
    console.log("ModulePage: Opening form dialog", { formId });
    setSelectedFormForFilling(formId);
    setIsFormDialogOpen(true);
  };

  const closeFormDialog = () => {
    console.log("ModulePage: Closing form dialog");
    setIsFormDialogOpen(false);
    setSelectedFormForFilling(null);
  };

  const getFieldIcon = (fieldType: string) => {
    console.log("ModulePage: Getting field icon", { fieldType });
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

  const formatFieldValue = (fieldType: string, value: any): string => {
    console.log("ModulePage: Formatting field value", { fieldType, value });
    if (value === null || value === undefined) return "";
    if (value === "") return "";
    switch (fieldType) {
      case "date":
      case "datetime":
        if (value) {
          try {
            const date = new Date(value);
            return date.toLocaleDateString();
          } catch {
            return String(value);
          }
        }
        return "";
      case "email":
      case "tel":
      case "phone":
      case "text":
      case "textarea":
      case "url":
        return String(value);
      case "number":
        if (typeof value === "number") {
          return value.toLocaleString();
        }
        if (typeof value === "string" && !isNaN(Number(value))) {
          return Number(value).toLocaleString();
        }
        return String(value);
      case "checkbox":
      case "switch":
        if (typeof value === "boolean") {
          return value ? "✓ Yes" : "✗ No";
        }
        if (typeof value === "string") {
          return value.toLowerCase() === "true" || value === "1"
            ? "✓ Yes"
            : "✗ No";
        }
        return value ? "✓ Yes" : "✗ No";
      case "lookup":
        return String(value);
      case "file":
        if (typeof value === "object" && value !== null) {
          if (value.name) return String(value.name);
          if (Array.isArray(value)) {
            return `${value.length} file(s)`;
          }
          if (value.files && Array.isArray(value.files)) {
            return `${value.files.length} file(s)`;
          }
        }
        return String(value);
      case "radio":
      case "select":
        return String(value);
      default:
        if (typeof value === "object" && value !== null) {
          return JSON.stringify(value).substring(0, 50) + "...";
        }
        return String(value);
    }
  };

  const processRecordData = (
    record: FormRecord,
    formFields: FormFieldWithSection[],
  ): EnhancedFormRecord => {
    const processedData: ProcessedFieldData[] = [];

    // Create a quick-lookup map for known fields
    const fieldById = new Map<string, FormFieldWithSection>();
    formFields.forEach((field) => {
      fieldById.set(field.id, field);
      fieldById.set(field.originalId, field);
    });

    if (record.recordData && typeof record.recordData === "object") {
      // We iterate over EVERY key returned by the API (100% of the data)
      Object.entries(record.recordData).forEach(([fieldKey, fieldData]) => {
        // Check if we know this field from the Form Config
        const formField =
          fieldById.get(fieldKey) ||
          fieldById.get(fieldKey.split("_").pop() || "");

        // Extract the actual value (handles {value: "x"} vs just "x")
        const value =
          fieldData && typeof fieldData === "object" && "value" in fieldData
            ? fieldData.value
            : fieldData;

        // Identify the field type (default to text if unknown)
        const fieldType =
          formField?.type ||
          (fieldKey.startsWith("_dynamicRows_") ? "dynamicRows" : "text");
        const label = formField?.label || fieldKey;

        processedData.push({
          recordId: record.id,
          recordIdFromAPI: record.id,
          fieldId: fieldKey,
          fieldLabel: label,
          fieldType: fieldType,
          value: value,
          displayValue: formatFieldValue(fieldType, value),
          icon: fieldType,
          order: formField?.order ?? 999, // Unknown fields go to the end
          sectionId: formField?.sectionId || "other",
          sectionTitle: formField?.sectionTitle || "Uncategorized",
          formId: record.formId,
          formName: formField?.formName || record.formName || "Form",
          lookup: formField?.lookup || {},
          options: formField?.options || [],
        });
      });
    }

    // Sort by order so the table stays organized
    processedData.sort((a, b) => a.order - b.order);

    return {
      ...record,
      processedData,
    };
  };

  useEffect(() => {
    if (moduleData?.success && moduleData.data) {
      const module = moduleData.data as unknown as FormModule;
      setSelectedModule(module);

      // NEW: Collect forms from root module + ALL child modules
      const collectAllForms = (mod: any): Form[] => {
        const forms: Form[] = [...(mod.forms || [])];
        if (mod.children && mod.children.length > 0) {
          mod.children.forEach((child: any) => {
            forms.push(...collectAllForms(child));
          });
        }
        return forms;
      };

      const allForms = collectAllForms(module);
      console.log(
        "All forms in this module (including children):",
        allForms.length,
      );

      setAllModuleForms(allForms);
      setFormIds(allForms.map((f: Form) => f.id));

      setLoading(false);
    }
  }, [moduleData]);

  useEffect(() => {
    if (moduleError) {
      console.error("ModulePage: Error fetching module", moduleError);
      toast({
        title: "Error",
        description: "Failed to load module. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  }, [moduleError, toast]);

  const [optimisticRecords, setOptimisticRecords] = useState<
    Map<string, EnhancedFormRecord>
  >(new Map());

  useEffect(() => {
    console.log("ModulePage: optimisticRecords updated", {
      optimisticRecordsSize: optimisticRecords.size,
    });
  }, [optimisticRecords]);

  useEffect(() => {
    (window as any).__handleOptimisticRecordAdd = (newRecord: any) => {
      console.log("[v0] Optimistic record add:", newRecord);
      const enhancedRecord = processRecordData(
        newRecord,
        formFieldsWithSections,
      );
      setOptimisticRecords((prev) => {
        const updated = new Map(prev);
        updated.set(newRecord.id, enhancedRecord);
        return updated;
      });
      setFormRecords((prev) => [enhancedRecord, ...prev]);
    };
    (window as any).__handleOptimisticRecordRemove = (recordId: string) => {
      console.log("[v0] Optimistic record remove:", recordId);
      setOptimisticRecords((prev) => {
        const updated = new Map(prev);
        updated.delete(recordId);
        return updated;
      });
      setFormRecords((prev) => prev.filter((r) => r.id !== recordId));
    };
    (window as any).__handleOptimisticRecordReplace = (
      oldId: string,
      newRecord: any,
    ) => {
      console.log("[v0] Optimistic record replace:", {
        oldId,
        newId: newRecord.id,
      });

      setOptimisticRecords((prev) => {
        const updated = new Map(prev);
        updated.delete(oldId);
        return updated;
      });

      const enhancedRecord = processRecordData(
        newRecord,
        formFieldsWithSections,
      );

      setFormRecords((prev) =>
        prev.map((r) => (r.id === oldId ? enhancedRecord : r)),
      );
    };
    (window as any).__handleRecordsRefresh = () => {
      console.log("[v0] Records refresh triggered - refetching all records");
      refetchRecords();
    };

    return () => {
      delete (window as any).__handleOptimisticRecordAdd;
      delete (window as any).__handleOptimisticRecordRemove;
      delete (window as any).__handleOptimisticRecordReplace;
      delete (window as any).__handleRecordsRefresh;
    };
  }, [formFieldsWithSections]);

  useEffect(() => {
    if (allRecordsData && selectedModule) {
      const moduleForms = selectedModule.forms || [];
      const allFieldsWithSections: FormFieldWithSection[] = [];

      console.log(
        "ModulePage: Processing form fields with sections1",
        moduleForms,
      );
      moduleForms.forEach((form) => {
        if (form.sections) {
          let fieldOrder = 0;
          form.sections.forEach((section: any) => {
            if (section.fields) {
              section.fields.forEach((field: any) => {
                const uniqueFieldId = `${form.id}_${field.id}`;
                allFieldsWithSections.push({
                  ...field,
                  id: uniqueFieldId,
                  originalId: field.id,
                  order: field.order || fieldOrder++,
                  sectionTitle: section.title,
                  sectionId: section.id,
                  formId: form.id,
                  formName: form.name,
                });
              });
            }
          });
        }
      });

      console.log(
        "ModulePage: Processing form fields with sections2",
        moduleForms,
      );

      setFormFieldsWithSections(allFieldsWithSections);

      const enhancedRecords = allRecordsData.map((record) =>
        processRecordData(record, allFieldsWithSections),
      );

      const optimisticRecordIds = Array.from(optimisticRecords.keys());
      const filteredRealRecords = enhancedRecords.filter(
        (r) => !optimisticRecordIds.includes(r.id),
      );

      const existingOptimistics = Array.from(optimisticRecords.values());
      setFormRecords([...existingOptimistics, ...filteredRealRecords]);
      console.log("ModulePage: fetchAllModuleRecords completed", {
        recordsLoading: false,
      });
    }
  }, [allRecordsData, selectedModule, optimisticRecords]);

  // Added useEffect to log formRecords updates
  useEffect(() => {
    console.log("ModulePage: formRecords updated", formRecords);
  }, [formRecords]);

  const saveAllPendingChanges = async (
    changesToSave?: Map<string, PendingChange>,
  ) => {
    const changesToProcess = changesToSave || pendingChanges;

    console.log("[v0] saveAllPendingChanges called:", {
      changesToSaveProvided: !!changesToSave,
      pendingChangesSize: pendingChanges.size,
      changesToProcessSize: changesToProcess.size,
    });

    if (changesToProcess.size === 0) {
      console.log("[v0] No changes to save, returning early");
      return;
    }

    const optimisticUpdates = new Map<string, any>();

    changesToProcess.forEach((change) => {
      if (!optimisticUpdates.has(change.recordId)) {
        const record = formRecords.find((r) => r.id === change.recordId);
        if (record) {
          optimisticUpdates.set(change.recordId, { ...record });
        }
      }

      const record = optimisticUpdates.get(change.recordId);
      if (record) {
        record.recordData = {
          ...record.recordData,
          [change.originalFieldId || change.fieldId]: {
            value: change.value,
            type: change.fieldType,
            label: change.fieldLabel,
          },
        };

        record.processedData = record.processedData.map((pd: any) =>
          pd.fieldId === change.fieldId
            ? {
              ...pd,
              value: change.value,
              displayValue: formatFieldValue(change.fieldType, change.value),
            }
            : pd,
        );
      }
    });

    setFormRecords((prev) =>
      prev.map((record) => {
        const update = optimisticUpdates.get(record.id);
        return update || record;
      }),
    );

    if (changesToSave) {
      const newPendingChanges = new Map(pendingChanges);
      changesToSave.forEach((_, key) => {
        newPendingChanges.delete(key);
      });
      setPendingChanges(newPendingChanges);
    } else {
      setPendingChanges(new Map());
    }

    setEditingCell(null);

    setSavingChanges(true);
    try {
      const changesByRecord = new Map<
        string,
        { changes: PendingChange[]; formId: string }
      >();
      changesToProcess.forEach((change) => {
        if (!changesByRecord.has(change.recordId)) {
          const formId =
            formRecords
              .flatMap((r) => r.processedData)
              .find((pd) => pd.recordId === change.recordId)?.formId || "";

          changesByRecord.set(change.recordId, { changes: [], formId });
        }
        changesByRecord.get(change.recordId)!.changes.push(change);
      });

      let savedCount = 0;

      for (const [actualRecordId, { changes, formId }] of changesByRecord) {
        let updatedRecordData: Record<string, any> = {};

        const sourceRecord = formRecords.find((r) => r.id === actualRecordId);
        if (sourceRecord) {
          updatedRecordData = { ...sourceRecord.recordData };
        }

        changes.forEach((change) => {
          const dbFieldKey = change.originalFieldId || change.fieldId;

          updatedRecordData[dbFieldKey] = {
            value: change.value,
            type: change.fieldType,
            label: change.fieldLabel,
          };
        });

        const result = await updateRecord({
          formId,
          recordId: actualRecordId,
          body: {
            recordData: updatedRecordData,
            status: sourceRecord?.status || "submitted",
            submittedBy: "admin",
          },
        }).unwrap();

        if (!result.success) {
          throw new Error(
            `Failed to save record ${actualRecordId}: ${result.error || "Unknown error"}`,
          );
        }

        savedCount += changes.length;
      }

      refetchRecords();
    } catch (error: any) {
      console.error("[v0] Save error:", error);

      await refetchRecords();

      toast({
        title: "Error Saving Changes",
        description:
          error.message ||
          "Failed to save changes. Changes have been reverted.",
        variant: "destructive",
      });
    } finally {
      setSavingChanges(false);
    }
  };

  const discardAllPendingChanges = () => {
    setPendingChanges(new Map());
    setEditingCell(null);

    setFormRecords(
      formRecords.map((record) => {
        let needsUpdate = false;
        const updatedRecordData = { ...record.recordData };
        const updatedProcessedData = [...record.processedData];

        pendingChanges.forEach((change) => {
          if (change.recordId === record.id) {
            needsUpdate = true;
            updatedRecordData[change.fieldId] = {
              ...updatedRecordData[change.fieldId],
              value: change.originalValue,
            };
            const fieldIndex = updatedProcessedData.findIndex(
              (pd) => pd.fieldId === change.fieldId,
            );
            if (fieldIndex !== -1) {
              updatedProcessedData[fieldIndex] = {
                ...updatedProcessedData[fieldIndex],
                value: change.originalValue,
                displayValue: formatFieldValue(
                  change.fieldType,
                  change.originalValue,
                ),
              };
            }
          }
        });

        return needsUpdate
          ? {
            ...record,
            recordData: updatedRecordData,
            processedData: updatedProcessedData,
          }
          : record;
      }),
    );

    toast({
      title: "Changes Discarded",
      description: "All unsaved changes have been discarded",
    });
  };

  const toggleEditMode = () => {
    console.log("ModulePage: toggleEditMode triggered", {
      currentEditMode: editMode,
    });
    if (editMode !== "locked" && editingCell) {
      setEditingCell(null);
    }
    setPendingChanges(new Map());
    cycleEditMode();
  };

  const cycleEditMode = () => {
    console.log("ModulePage: cycleEditMode triggered", {
      currentEditMode: editMode,
    });
    setEditingCell(null);
    setPendingChanges(new Map());
    setClickCount(new Map());
    if (editMode === "locked") {
      setEditMode("double-click");
    } else if (editMode === "double-click") {
      setEditMode("single-click");
    } else {
      setEditMode("locked");
    }
    console.log("ModulePage: New editMode set", { newEditMode: editMode });
  };

  const getEditModeInfo = () => {
    console.log("ModulePage: getEditModeInfo called", { editMode });
    switch (editMode) {
      case "locked":
        return {
          icon: Lock,
          label: "🔒 LOCKED",
          description: "Read Only Mode",
          color: "text-red-600 bg-red-50 border-red-300 hover:bg-red-100",
        };
      case "single-click":
        return {
          icon: MousePointer2,
          label: "👆 SINGLE CLICK",
          description: "Click any cell to edit",
          color: "text-blue-600 bg-blue-50 border-blue-300 hover:bg-blue-100",
        };
      case "double-click":
        return {
          icon: Edit3,
          label: "👆👆 DOUBLE CLICK",
          description: "Double-click any cell to edit",
          color:
            "text-green-600 bg-green-50 border-green-300 hover:bg-green-100",
        };
    }
  };

  const fetchModuleById = async (id: string) => {
    console.log("ModulePage: fetchModuleById started", { moduleId: id });
    try {
      setLoading(true);
      const response = await fetch(`/api/modules/${id}`);
      const data = await response.json();
      console.log("ModulePage: fetchModuleById response", { data });

      if (data.success) {
        setSelectedModule(data.data);
        console.log("ModulePage: selectedModule set", { module: data.data });
      } else {
        throw new Error(data.error || "Failed to fetch module");
      }
    } catch (error: any) {
      console.error("ModulePage: Error fetching module", error);
      toast({
        title: "Error",
        description: "Failed to load module. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      console.log("ModulePage: fetchModuleById completed", { loading: false });
    }
  };

  const handleDeleteRecord = async (record: EnhancedFormRecord) => {
    try {
      // Optimistic update: remove records immediately
      const recordsToRemove = new Set<string>();
      if (record.formId === "merged" && record.originalRecordIds) {
        record.originalRecordIds!.forEach((recordId) => {
          recordsToRemove.add(recordId);
        });
      } else {
        recordsToRemove.add(record.id);
      }
      setFormRecords((prev) => prev.filter((r) => !recordsToRemove.has(r.id)));

      // Perform deletions
      let deletePromises: Promise<any>[] = [];
      if (record.formId === "merged" && record.originalRecordIds) {
        deletePromises = Array.from(record.originalRecordIds.entries()).map(
          ([formId, recordId]) =>
            deleteRecord({
              formId,
              recordId,
            }).unwrap(),
        );
      } else {
        deletePromises = [
          deleteRecord({
            formId: record.formId,
            recordId: record.id,
          }).unwrap(),
        ];
      }

      const results = await Promise.allSettled(deletePromises);

      const failedResults = results.filter(
        (result) => result.status === "rejected",
      );
      if (failedResults.length > 0) {
        // Revert optimistic update by refetching
        await refetchRecords();
        throw new Error("Some records failed to delete");
      }

      // Success: refetch to ensure consistency
      await refetchRecords();

      toast({
        title: "Record Deleted",
        description: "The record has been successfully deleted",
      });
    } catch (error: any) {
      console.error("Error deleting record:", error);
      // Refetch already called in catch for revert
      toast({
        title: "Error",
        description: error.message || "Failed to delete record",
        variant: "destructive",
      });
    }
  };

  const handleFormClose = async () => {
    closeFormDialog();
    await refetchRecords();
  };

  const handleEditRecord = (record: EnhancedFormRecord) => {
    console.log("Edit record clicked", record);
  };

  const handleViewDetails = (record: EnhancedFormRecord) => {
    console.log("View details clicked", record);
  };

  if (moduleLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <Loader2 className="h-8 w-8 md:h-10 md:w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!selectedModule) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <p className="text-sm md:text-base text-muted-foreground text-center">
          Module not found
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-2 space-y-2 max-w-full overflow-x-hidden">
      <FormsContent
        forms={allModuleForms}
        selectedForm={selectedForm}
        setSelectedForm={setSelectedForm}
        openFormDialog={openFormDialog}
      />
      <RecordsDisplay
        allModuleForms={allModuleForms}
        formRecords={formRecords}
        formFieldsWithSections={formFieldsWithSections}
        recordSearchQuery={recordSearchQuery}
        selectedFormFilter={selectedFormFilter}
        recordsPerPage={recordsPerPage}
        currentPage={currentPage}
        selectedRecords={selectedRecords}
        editMode={editMode}
        editingCell={editingCell}
        pendingChanges={pendingChanges}
        savingChanges={savingChanges}
        recordSortField={recordSortField}
        recordSortOrder={recordSortOrder}
        setRecordSearchQuery={setRecordSearchQuery}
        setSelectedFormFilter={setSelectedFormFilter}
        setRecordsPerPage={setRecordsPerPage}
        setCurrentPage={setCurrentPage}
        setSelectedRecords={setSelectedRecords}
        setRecordSortField={setRecordSortField}
        setRecordSortOrder={setRecordSortOrder}
        getFieldIcon={getFieldIcon}
        getEditModeInfo={getEditModeInfo}
        toggleEditMode={toggleEditMode}
        saveAllPendingChanges={saveAllPendingChanges}
        discardAllPendingChanges={discardAllPendingChanges}
        setEditingCell={setEditingCell}
        setPendingChanges={setPendingChanges}
        setFormRecords={setFormRecords}
        onEditRecord={handleEditRecord}
        onDeleteRecord={handleDeleteRecord}
        onViewDetails={handleViewDetails}
        permissions={permissions}
        isAdmin={isAdmin}
      />
      <PublicFormDialog
        formId={selectedFormForFilling}
        isOpen={isFormDialogOpen}
        onClose={handleFormClose}
        allowAdminPreview={isAdmin}
      />
    </div>
  );
}
