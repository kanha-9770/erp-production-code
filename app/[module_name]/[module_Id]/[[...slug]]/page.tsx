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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// Matches the PermissionItem shape returned by the updated API
interface PermissionItem {
  id: string;
  name: string;
  category: string;
  resource: string;
  canDelegate: boolean;
  source: "role" | "user";
  module: { id: string; name: string };
  form: { id: string; name: string };
  grantedBy: string;
  grantedTo: string;
  reason?: string;
  expiresAt?: string | null;
}

interface PermissionSummary {
  total: number;
  fromRole: number;
  fromUser: number;
  denied: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ModulePage({
  params,
}: {
  params: { module_name: string; module_Id: string; slug?: string[] };
}) {
  const { toast } = useToast();
  const { module_name, module_Id, slug } = params;

  const moduleId = module_Id;
  const moduleName = module_name;

  // ── Core state ──────────────────────────────────────────────────────────────
  const [selectedModule, setSelectedModule] = useState<FormModule | null>(null);
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const [formRecords, setFormRecords] = useState<EnhancedFormRecord[]>([]);
  const [allModuleForms, setAllModuleForms] = useState<Form[]>([]);
  const [formFieldsWithSections, setFormFieldsWithSections] = useState<
    FormFieldWithSection[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [formIds, setFormIds] = useState<string[]>([]);

  // ── UI / editing state ──────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"excel" | "table" | "grid" | "list">("excel");
  const [recordSearchQuery, setRecordSearchQuery] = useState("");
  const [recordSortField, setRecordSortField] = useState<string>("");
  const [recordSortOrder, setRecordSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [selectedFormFilter, setSelectedFormFilter] = useState<string>("all");
  const [selectedFormForFilling, setSelectedFormForFilling] = useState<string | null>(null);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<"locked" | "single-click" | "double-click">("double-click");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map());
  const [savingChanges, setSavingChanges] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  const [clickCount, setClickCount] = useState<Map<string, number>>(new Map());
  const [optimisticRecords, setOptimisticRecords] = useState<Map<string, EnhancedFormRecord>>(new Map());

  // ── Permission state (typed to match the new API) ───────────────────────────
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [permissionSummary, setPermissionSummary] = useState<PermissionSummary | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // ── RTK Query ───────────────────────────────────────────────────────────────
  const {
    data: moduleData,
    isLoading: moduleLoading,
    error: moduleError,
  } = useGetModuleByIdQuery(moduleId, { skip: !moduleId });

  const { data: allRecordsData, refetch: refetchRecords } =
    useGetModuleRecordsQuery(formIds, { skip: formIds.length === 0 });

  const [updateRecord] = useUpdateRecordMutation();
  const [deleteRecord] = useDeleteRecordMutation();

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch permissions — uses isAdmin flag returned directly from the new endpoint
  // and stores both role-based AND user-based permissions in the same array.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        // Build URL with formId if a form is selected
        let url = "/api/admin/permissions";
        if (selectedForm?.id) {
          url += `?formId=${selectedForm.id}`;
        }

        console.log("[Permissions] Fetching from:", url);

        const response = await fetch(url, {
          credentials: "include", // important for cookies/auth
          cache: "no-store",      // prevent stale data in dev
        });

        if (!response.ok) {
          throw new Error(`Permissions fetch failed: ${response.status}`);
        }

        const data = await response.json();
        console.log("[Permissions] Raw response:", data);

        if (!data.success || !data.data) {
          console.warn("[Permissions] API returned success:false or no data");
          return;
        }

        const apiData = data.data;

        const allPermissions: PermissionItem[] = apiData.permissions ?? [];
        setPermissions(allPermissions);

        setIsAdmin(apiData.isAdmin ?? false);

        if (apiData.permissionSummary) {
          setPermissionSummary(apiData.permissionSummary);
          console.log("[Permissions] Summary:", apiData.permissionSummary);
        }

        console.log("[Permissions] Loaded successfully", {
          total: allPermissions.length,
          roleBased: allPermissions.filter((p) => p.source === "role").length,
          userBased: allPermissions.filter((p) => p.source === "user").length,
          isAdmin: apiData.isAdmin,
          formSpecific: !!selectedForm?.id,
        });
      } catch (error) {
        console.error("[Permissions] Fetch error:", error);
        toast({
          title: "Permissions Error",
          description: "Could not load user permissions. Some features may be limited.",
          variant: "destructive",
        });
      }
    };

    fetchPermissions();
  }, [selectedForm?.id]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Module data processing
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (moduleData?.success && moduleData.data) {
      const module = moduleData.data as unknown as FormModule;
      setSelectedModule(module);

      const collectAllForms = (mod: any): Form[] => {
        const forms: Form[] = [...(mod.forms || [])];
        if (mod.children?.length > 0) {
          mod.children.forEach((child: any) => {
            forms.push(...collectAllForms(child));
          });
        }
        return forms;
      };

      const allForms = collectAllForms(module);
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Records processing
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (allRecordsData && selectedModule) {
      const moduleForms = selectedModule.forms || [];
      const allFieldsWithSections: FormFieldWithSection[] = [];

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
    }
  }, [allRecordsData, selectedModule, optimisticRecords]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Optimistic record handlers (exposed on window for child components)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (window as any).__handleOptimisticRecordAdd = (newRecord: any) => {
      const enhancedRecord = processRecordData(newRecord, formFieldsWithSections);
      setOptimisticRecords((prev) => {
        const updated = new Map(prev);
        updated.set(newRecord.id, enhancedRecord);
        return updated;
      });
      setFormRecords((prev) => [enhancedRecord, ...prev]);
    };

    (window as any).__handleOptimisticRecordRemove = (recordId: string) => {
      setOptimisticRecords((prev) => {
        const updated = new Map(prev);
        updated.delete(recordId);
        return updated;
      });
      setFormRecords((prev) => prev.filter((r) => r.id !== recordId));
    };

    (window as any).__handleOptimisticRecordReplace = (oldId: string, newRecord: any) => {
      setOptimisticRecords((prev) => {
        const updated = new Map(prev);
        updated.delete(oldId);
        return updated;
      });
      const enhancedRecord = processRecordData(newRecord, formFieldsWithSections);
      setFormRecords((prev) => prev.map((r) => (r.id === oldId ? enhancedRecord : r)));
    };

    (window as any).__handleRecordsRefresh = () => {
      refetchRecords();
    };

    return () => {
      delete (window as any).__handleOptimisticRecordAdd;
      delete (window as any).__handleOptimisticRecordRemove;
      delete (window as any).__handleOptimisticRecordReplace;
      delete (window as any).__handleRecordsRefresh;
    };
  }, [formFieldsWithSections]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  const getFieldIcon = (fieldType: string) => {
    switch (fieldType) {
      case "text": return Type;
      case "email": return Mail;
      case "number": return Hash;
      case "date":
      case "datetime": return CalendarDays;
      case "checkbox": return CheckSquare;
      case "radio": return Radio;
      case "select": return ChevronDown;
      case "file": return Upload;
      case "lookup": return Link;
      case "textarea": return FileText;
      case "tel":
      case "phone": return Hash;
      case "url": return Link;
      default: return Type;
    }
  };

  const formatFieldValue = (fieldType: string, value: any): string => {
    if (value === null || value === undefined || value === "") return "";

    switch (fieldType) {
      case "date":
      case "datetime":
        try { return new Date(value).toLocaleDateString(); }
        catch { return String(value); }

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
          return value.toLowerCase() === "true" || value === "1" ? "✓ Yes" : "✗ No";
        return value ? "✓ Yes" : "✗ No";

      case "lookup": return String(value);

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

      default:
        if (typeof value === "object" && value !== null)
          return JSON.stringify(value).substring(0, 50) + "...";
        return String(value);
    }
  };

  const processRecordData = (
    record: FormRecord,
    formFields: FormFieldWithSection[],
  ): EnhancedFormRecord => {
    const processedData: ProcessedFieldData[] = [];

    const fieldById = new Map<string, FormFieldWithSection>();
    formFields.forEach((field) => {
      fieldById.set(field.id, field);
      fieldById.set(field.originalId, field);
    });

    if (record.recordData && typeof record.recordData === "object") {
      Object.entries(record.recordData).forEach(([fieldKey, fieldData]) => {
        const formField =
          fieldById.get(fieldKey) ||
          fieldById.get(fieldKey.split("_").pop() || "");

        const value =
          fieldData && typeof fieldData === "object" && "value" in fieldData
            ? fieldData.value
            : fieldData;

        const fieldType =
          formField?.type ||
          (fieldKey.startsWith("_dynamicRows_") ? "dynamicRows" : "text");

        processedData.push({
          recordId: record.id,
          recordIdFromAPI: record.id,
          fieldId: fieldKey,
          fieldLabel: formField?.label || fieldKey,
          fieldType,
          value,
          displayValue: formatFieldValue(fieldType, value),
          icon: fieldType,
          order: formField?.order ?? 999,
          sectionId: formField?.sectionId || "other",
          sectionTitle: formField?.sectionTitle || "Uncategorized",
          formId: record.formId,
          formName: formField?.formName || record.formName || "Form",
          lookup: formField?.lookup || {},
          options: formField?.options || [],
        });
      });
    }

    processedData.sort((a, b) => a.order - b.order);
    return { ...record, processedData };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Save / discard pending changes
  // ─────────────────────────────────────────────────────────────────────────────
  const saveAllPendingChanges = async (changesToSave?: Map<string, PendingChange>) => {
    const changesToProcess = changesToSave || pendingChanges;
    if (changesToProcess.size === 0) return;

    const optimisticUpdates = new Map<string, any>();

    changesToProcess.forEach((change) => {
      if (!optimisticUpdates.has(change.recordId)) {
        const record = formRecords.find((r) => r.id === change.recordId);
        if (record) optimisticUpdates.set(change.recordId, { ...record });
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
            ? { ...pd, value: change.value, displayValue: formatFieldValue(change.fieldType, change.value) }
            : pd,
        );
      }
    });

    setFormRecords((prev) =>
      prev.map((record) => optimisticUpdates.get(record.id) || record),
    );

    if (changesToSave) {
      const newPendingChanges = new Map(pendingChanges);
      changesToSave.forEach((_, key) => newPendingChanges.delete(key));
      setPendingChanges(newPendingChanges);
    } else {
      setPendingChanges(new Map());
    }

    setEditingCell(null);
    setSavingChanges(true);

    try {
      const changesByRecord = new Map<string, { changes: PendingChange[]; formId: string }>();

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

      for (const [actualRecordId, { changes, formId }] of changesByRecord) {
        const sourceRecord = formRecords.find((r) => r.id === actualRecordId);
        const updatedRecordData: Record<string, any> = { ...(sourceRecord?.recordData || {}) };

        changes.forEach((change) => {
          updatedRecordData[change.originalFieldId || change.fieldId] = {
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
          throw new Error(`Failed to save record ${actualRecordId}: ${result.error || "Unknown error"}`);
        }
      }

      refetchRecords();
    } catch (error: any) {
      console.error("[v0] Save error:", error);
      await refetchRecords();
      toast({
        title: "Error Saving Changes",
        description: error.message || "Failed to save changes. Changes have been reverted.",
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
          if (change.recordId !== record.id) return;
          needsUpdate = true;
          updatedRecordData[change.fieldId] = {
            ...updatedRecordData[change.fieldId],
            value: change.originalValue,
          };
          const idx = updatedProcessedData.findIndex((pd) => pd.fieldId === change.fieldId);
          if (idx !== -1) {
            updatedProcessedData[idx] = {
              ...updatedProcessedData[idx],
              value: change.originalValue,
              displayValue: formatFieldValue(change.fieldType, change.originalValue),
            };
          }
        });

        return needsUpdate
          ? { ...record, recordData: updatedRecordData, processedData: updatedProcessedData }
          : record;
      }),
    );

    toast({ title: "Changes Discarded", description: "All unsaved changes have been discarded" });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Edit mode
  // ─────────────────────────────────────────────────────────────────────────────
  const toggleEditMode = () => {
    if (editMode !== "locked" && editingCell) setEditingCell(null);
    setPendingChanges(new Map());
    cycleEditMode();
  };

  const cycleEditMode = () => {
    setEditingCell(null);
    setPendingChanges(new Map());
    setClickCount(new Map());
    if (editMode === "locked") setEditMode("double-click");
    else if (editMode === "double-click") setEditMode("single-click");
    else setEditMode("locked");
  };

  const getEditModeInfo = () => {
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
          color: "text-green-600 bg-green-50 border-green-300 hover:bg-green-100",
        };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Form dialog
  // ─────────────────────────────────────────────────────────────────────────────
  const openFormDialog = (formId: string) => {
    setSelectedFormForFilling(formId);
    setIsFormDialogOpen(true);
  };

  const closeFormDialog = () => {
    setIsFormDialogOpen(false);
    setSelectedFormForFilling(null);
  };

  const handleFormClose = async () => {
    closeFormDialog();
    await refetchRecords();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Record actions
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDeleteRecord = async (record: EnhancedFormRecord) => {
    try {
      const recordsToRemove = new Set<string>();
      if (record.formId === "merged" && record.originalRecordIds) {
        record.originalRecordIds.forEach((recordId) => recordsToRemove.add(recordId));
      } else {
        recordsToRemove.add(record.id);
      }
      setFormRecords((prev) => prev.filter((r) => !recordsToRemove.has(r.id)));

      let deletePromises: Promise<any>[];
      if (record.formId === "merged" && record.originalRecordIds) {
        deletePromises = Array.from(record.originalRecordIds.entries()).map(
          ([formId, recordId]) => deleteRecord({ formId, recordId }).unwrap(),
        );
      } else {
        deletePromises = [deleteRecord({ formId: record.formId, recordId: record.id }).unwrap()];
      }

      const results = await Promise.allSettled(deletePromises);
      const failedResults = results.filter((r) => r.status === "rejected");

      if (failedResults.length > 0) {
        await refetchRecords();
        throw new Error("Some records failed to delete");
      }

      await refetchRecords();
      toast({ title: "Record Deleted", description: "The record has been successfully deleted" });
    } catch (error: any) {
      console.error("Error deleting record:", error);
      toast({ title: "Error", description: error.message || "Failed to delete record", variant: "destructive" });
    }
  };

  const handleEditRecord = (record: EnhancedFormRecord) => {
    console.log("Edit record clicked", record);
  };

  const handleViewDetails = (record: EnhancedFormRecord) => {
    console.log("View details clicked", record);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
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