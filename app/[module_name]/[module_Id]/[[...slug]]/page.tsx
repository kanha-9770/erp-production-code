"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Edit3, MousePointer2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import FormsContent from "@/components/dynamicSubmodule/formsContent";
import { PublicFormDialog } from "@/components/public-form-dialog";
import { useGetModuleByIdQuery } from "@/lib/api/modules";
import { useLazyGetAdminPermissionsQuery } from "@/lib/api/permissions";
import {
  useDeleteRecordMutation,
  useGetModuleRecordsQuery,
  useUpdateRecordMutation,
} from "@/lib/api/records";
import RecordsDisplay from "@/components/modules/recordsDisplay";
import { usePermissionContext } from "@/context/PermissionContext";
import { useGetUsersQuery } from "@/lib/api/users";   // ← Added

// Types
import type {
  FormModule,
  Form,
} from "@/types/forms";
import type {
  EnhancedFormRecord,
  FormFieldWithSection,
  EditingCell,
  PendingChange,
  PermissionItem,
  PermissionSummary,
} from "@/types/records";

// Utilities
import { formatFieldValue, getFieldIcon } from "@/lib/utils/fieldUtils";
import { processRecordData } from "@/lib/utils/recordUtils";

export default function ModulePage({
  params,
}: {
  params: { module_name: string; module_Id: string; slug?: string[] };
}) {
  const { toast } = useToast();
  const { module_name, module_Id, slug } = params;

  const moduleId = module_Id;

  const { hasPermission: checkModulePermission, isLoading: permCtxLoading } = usePermissionContext();

  // Core state
  const [selectedModule, setSelectedModule] = useState<FormModule | null>(null);
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const [formRecords, setFormRecords] = useState<EnhancedFormRecord[]>([]);
  const [allModuleForms, setAllModuleForms] = useState<Form[]>([]);
  const [formFieldsWithSections, setFormFieldsWithSections] = useState<
    FormFieldWithSection[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [formIds, setFormIds] = useState<string[]>([]);

  // UI / editing state
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

  // Permission state
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [permissionSummary, setPermissionSummary] = useState<PermissionSummary | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Users state - for showing real names instead of user IDs
  const { data: usersData = [], isLoading: usersLoading } = useGetUsersQuery({});

  // RTK Query
  const {
    data: moduleData,
    isLoading: moduleLoading,
    error: moduleError,
  } = useGetModuleByIdQuery(moduleId, { skip: !moduleId });

  const { data: allRecordsData, refetch: refetchRecords } =
    useGetModuleRecordsQuery(formIds, { skip: formIds.length === 0 });

  const [updateRecord] = useUpdateRecordMutation();
  const [deleteRecord] = useDeleteRecordMutation();
  const [triggerAdminPerms] = useLazyGetAdminPermissionsQuery();

  // Fetch permissions
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const data = await triggerAdminPerms({}).unwrap();

        if (!data.success || !data.data) return;

        const apiData = data.data;
        setPermissions(apiData.permissions ?? []);
        setIsAdmin(apiData.isAdmin ?? false);
        if (apiData.permissionSummary) setPermissionSummary(apiData.permissionSummary);
      } catch (error) {
        toast({
          title: "Permissions Error",
          description: "Could not load user permissions. Some features may be limited.",
          variant: "destructive",
        });
      }
    };

    fetchPermissions();
  }, []);

  // Module data processing
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

  // The Employee form (if the module owns one) drives the hybrid Employee
  // Master view: locked Identity fields the admin cannot delete plus any
  // custom fields they add via the form builder. We surface a "Customize"
  // button straight to the builder for that form, and on first admin load
  // we ensure the core Identity fields exist on the form.
  const employeeForm = allModuleForms.find(
    (f: any) => (f as any)?.isEmployeeForm === true,
  ) as Form | undefined;
  const [coreFieldsEnsured, setCoreFieldsEnsured] = useState<string | null>(null);

  useEffect(() => {
    if (!employeeForm || !isAdmin) return;
    if (coreFieldsEnsured === employeeForm.id) return;
    setCoreFieldsEnsured(employeeForm.id);
    fetch(`/api/forms/${employeeForm.id}/ensure-core-fields`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (data?.created > 0) {
          // Reload records so newly-injected fields appear as columns.
          refetchRecords();
        }
      })
      .catch(() => {
        // Silent — the page still works without the core fields, the admin
        // just won't see the Identity columns until ensure succeeds.
      });
  }, [employeeForm?.id, isAdmin, coreFieldsEnsured, refetchRecords]);

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

  // Records processing
  useEffect(() => {
    if (allRecordsData && selectedModule) {
      const moduleForms = selectedModule.forms || [];
      const allFieldsWithSections: FormFieldWithSection[] = [];

      moduleForms.forEach((form) => {
        let fieldOrder = 0;

        if (form.sections) {
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

        const processSubform = (subform: any, parentPath: string = "") => {
          const subformTitle = parentPath ? `${parentPath} → ${subform.name}` : subform.name;
          if (subform.fields) {
            subform.fields.forEach((field: any) => {
              const uniqueFieldId = `${form.id}_${field.id}`;
              allFieldsWithSections.push({
                ...field,
                id: uniqueFieldId,
                originalId: field.id,
                order: field.order || fieldOrder++,
                sectionTitle: subformTitle,
                sectionId: subform.id,
                formId: form.id,
                formName: form.name,
                subformId: subform.id,
                subformTitle: subform.name,
              });
            });
          }
          if (subform.childSubforms) {
            subform.childSubforms.forEach((child: any) => processSubform(child, subformTitle));
          }
        };

        if (form.subforms) {
          form.subforms.forEach((sf: any) => processSubform(sf));
        }
      });

      setFormFieldsWithSections(allFieldsWithSections);

      const rawRecords = allRecordsData?.records ?? allRecordsData ?? [];
      const recordsArray = Array.isArray(rawRecords) ? rawRecords : [];
      const enhancedRecords = recordsArray.map((record: any) =>
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

  // Optimistic record handlers
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

  // Save / discard pending changes (your original logic - kept fully intact)
  const saveAllPendingChanges = async (changesToSave?: Map<string, PendingChange>) => {
    const changesToProcess = changesToSave || pendingChanges;

    console.log(`[Save] saveAllPendingChanges called — ${changesToProcess.size} change(s)`);
    if (changesToProcess.size === 0) {
      console.log(`[Save] nothing to process, returning early`);
      return;
    }

    changesToProcess.forEach((change, key) => {
      console.log(`[Save] change key="${key}" | field="${change.fieldLabel}" | fieldId=${change.fieldId} | originalFieldId=${change.originalFieldId} | value="${change.value}" | type=${change.fieldType}`);
    });

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
        const recordDataKey = change.originalFieldId || change.fieldId;
        record.recordData = {
          ...record.recordData,
          [recordDataKey]: {
            value: change.value,
            type: change.fieldType,
            label: change.fieldLabel,
          },
        };

        const updated = record.processedData.map((pd: any) =>
          pd.fieldId === change.fieldId ||
            pd.fieldId === change.originalFieldId ||
            (change.fieldLabel && pd.fieldLabel === change.fieldLabel)
            ? { ...pd, value: change.value, displayValue: formatFieldValue(change.fieldType, change.value) }
            : pd,
        );

        const didMatch = updated.some((pd: any) =>
          pd.fieldId === change.fieldId ||
          pd.fieldId === change.originalFieldId ||
          (change.fieldLabel && pd.fieldLabel === change.fieldLabel),
        );

        if (!didMatch) {
          updated.push({
            recordId: change.recordId,
            recordIdFromAPI: change.recordId,
            fieldId: change.originalFieldId || change.fieldId,
            fieldLabel: change.fieldLabel || "",
            fieldType: change.fieldType,
            value: change.value,
            displayValue: formatFieldValue(change.fieldType, change.value),
            icon: change.fieldType,
            order: 999,
            sectionId: "other",
            sectionTitle: "unauthorized",
            formId: record.formId || "",
            formName: record.formName || "",
            lookup: {},
            options: [],
          });
        }

        record.processedData = updated;
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
          const record = formRecords.find((r) => r.id === change.recordId);
          const formId = record?.formId || "";
          changesByRecord.set(change.recordId, { changes: [], formId });
        }
        changesByRecord.get(change.recordId)!.changes.push(change);
      });

      for (const [actualRecordId, { changes, formId }] of changesByRecord) {
        const sourceRecord = formRecords.find((r) => r.id === actualRecordId);
        const updatedRecordData: Record<string, any> = { ...(sourceRecord?.recordData || {}) };

        changes.forEach((change) => {
          const key = change.originalFieldId || change.fieldId;
          updatedRecordData[key] = {
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
          throw new Error(`Failed to save record ${actualRecordId}`);
        }
      }

      await refetchRecords();
    } catch (error: any) {
      console.error(`[Save] ERROR:`, error);
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

  const toggleEditMode = () => {
    if (editMode === "locked") {
      const canEditAny = isAdmin || allModuleForms.some((f) => hasPermissionForForm(f.id, "EDIT"));
      if (!canEditAny) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to edit records.",
          variant: "destructive",
        });
        return;
      }
    }
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

  const hasPermissionForForm = (formId: string, permName: string) => {
    if (isAdmin) return true;
    const target = permName.toUpperCase();
    return permissions.some(
      (p: any) =>
        (p.name || "").toUpperCase() === target &&
        (p.form?.id === formId || !p.form?.id || p.form?.id === ""),
    );
  };

  const openFormDialog = (formId: string) => {
    const canOpen = isAdmin
      || hasPermissionForForm(formId, "VIEW")
      || hasPermissionForForm(formId, "CREATE")
      || hasPermissionForForm(formId, "EDIT")
      || hasPermissionForForm(formId, "DELETE");
    if (!canOpen) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this form.",
        variant: "destructive",
      });
      return;
    }
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

  const handleBulkDeleteRecords = async (recordIds: string[]) => {
    const resolvedOriginalIds = new Set<string>();

    for (const id of recordIds) {
      if (id.startsWith("merged__")) {
        const parts = id.split("__").slice(2);
        parts.forEach((origId) => {
          if (origId !== "empty") resolvedOriginalIds.add(origId);
        });
      } else {
        resolvedOriginalIds.add(id);
      }
    }

    const idsSet = resolvedOriginalIds;
    const recordsToDelete = formRecords.filter((r) => idsSet.has(r.id));
    setFormRecords((prev) => prev.filter((r) => !idsSet.has(r.id)));

    const deleteTasks = recordsToDelete.flatMap((record) => {
      if (record.formId === "merged" && record.originalRecordIds) {
        return Array.from(record.originalRecordIds.entries()).map(
          ([formId, recordId]) => ({ formId, recordId }),
        );
      }
      return [{ formId: record.formId, recordId: record.id }];
    });

    const results = await Promise.allSettled(
      deleteTasks.map((task) => deleteRecord(task).unwrap()),
    );
    const failedTasks = deleteTasks.filter((_, idx) => results[idx].status === "rejected");

    await refetchRecords();

    if (failedTasks.length > 0) {
      toast({
        title: "Partial Delete",
        description: `${deleteTasks.length - failedTasks.length} deleted, ${failedTasks.length} failed. Please retry.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Records Deleted",
        description: `${recordsToDelete.length} record(s) deleted successfully`,
      });
    }
  };

  const handleEditRecord = (record: EnhancedFormRecord) => {
    console.log("Edit record clicked", record);
  };

  const handleViewDetails = (record: EnhancedFormRecord) => {
    console.log("View details clicked", record);
  };

  // Render
  if (moduleLoading || loading || permCtxLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <Loader2 className="h-8 w-8 md:h-10 md:w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!checkModulePermission("VIEW", moduleId)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 gap-4">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="text-sm text-muted-foreground mt-1">
            You don&apos;t have permission to access this module.
          </p>
        </div>
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
    <div className="flex flex-col h-full p-2 gap-2 max-w-full overflow-hidden">
      <div className="shrink-0 space-y-2">
        {employeeForm && isAdmin && (
          <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2">
            <div className="text-xs text-amber-900 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-amber-600" />
              <span>
                <span className="font-medium">Hybrid form:</span>{" "}
                Identity fields are locked. Add or rearrange any other fields
                from the form builder.
              </span>
            </div>
            <Button asChild variant="outline" size="sm" className="h-7 text-xs">
              <Link href={`/builder/${employeeForm.id}`}>
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Customize Form
              </Link>
            </Button>
          </div>
        )}
        <FormsContent
          forms={allModuleForms}
          selectedForm={selectedForm}
          setSelectedForm={setSelectedForm}
          openFormDialog={openFormDialog}
          canCreateForForm={(formId) =>
            hasPermissionForForm(formId, "VIEW")
            || hasPermissionForForm(formId, "CREATE")
            || hasPermissionForForm(formId, "EDIT")
            || hasPermissionForForm(formId, "DELETE")
          }
        />
      </div>
      <div className="flex-1 min-h-0">
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
          onBulkDeleteRecords={handleBulkDeleteRecords}
          onViewDetails={handleViewDetails}
          permissions={permissions}
          isAdmin={isAdmin}
          users={usersData}                    // ← Real users passed here
        />
      </div>
      <PublicFormDialog
        formId={selectedFormForFilling}
        isOpen={isFormDialogOpen}
        onClose={handleFormClose}
        allowAdminPreview={isAdmin}
      />
    </div>
  );
}