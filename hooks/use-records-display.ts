"use client";

import React, { useMemo } from "react";
import {
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { getFormulaEvaluator } from "@/lib/formula/evaluator";
import { extractFieldReferences } from "@/lib/formula/parser";
import {
  isImageUrl,
  isImageField,
  formatDynamicRowValue,
} from "@/lib/utils/fieldUtils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type {
  ProcessedFieldData,
  EnhancedFormRecord,
  FormFieldWithSection,
  EditingCell,
  PendingChange,
  FieldFilter,
  Permission,
  Comment,
  ConditionalFormatRule,
  FormGroup,
} from "@/types/records";

// ─── Options ─────────────────────────────────────────────────────────────────

export interface UseRecordsDisplayOptions {
  formRecords: EnhancedFormRecord[];
  formFieldsWithSections: FormFieldWithSection[];
  recordSearchQuery: string;
  recordsPerPage: number;
  currentPage: number;
  editMode: "locked" | "single-click" | "double-click";
  editingCell: EditingCell | null;
  pendingChanges: Map<string, PendingChange>;
  savingChanges: boolean;
  recordSortField: string;
  recordSortOrder: "asc" | "desc";
  permissions: Permission[];
  isAdmin: boolean;
  setCurrentPage: (page: number) => void;
  setEditingCell: (cell: EditingCell | null) => void;
  setPendingChanges: (changes: Map<string, PendingChange>) => void;
  saveAllPendingChanges: (
    changesToSave?: Map<string, PendingChange>,
  ) => Promise<void>;
  onDeleteRecord: (record: EnhancedFormRecord) => Promise<void>;
  onViewDetails: (record: EnhancedFormRecord) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecordsDisplay({
  formRecords,
  formFieldsWithSections,
  recordSearchQuery,
  recordsPerPage,
  currentPage,
  editMode,
  editingCell,
  pendingChanges,
  savingChanges,
  recordSortField,
  recordSortOrder,
  permissions,
  isAdmin,
  setCurrentPage,
  setEditingCell,
  setPendingChanges,
  saveAllPendingChanges,
  onDeleteRecord,
  onViewDetails,
}: UseRecordsDisplayOptions) {
  const { fullName: currentUserName } = useCurrentUser();

  // ── State ────────────────────────────────────────────────────────────────────

  const tableContainerRef = React.useRef<HTMLDivElement>(null);

  const [viewDetailsOpen, setViewDetailsOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] =
    React.useState<EnhancedFormRecord | null>(null);
  const [columnWidths, setColumnWidths] = React.useState<Map<string, number>>(
    new Map(),
  );
  const [expandedCells, setExpandedCells] = React.useState<Set<string>>(
    new Set(),
  );
  const [resizingColumn, setResizingColumn] = React.useState<string | null>(
    null,
  );
  const [resizeStartX, setResizeStartX] = React.useState<number>(0);
  const [resizeStartWidth, setResizeStartWidth] = React.useState<number>(0);
  const [numDummyRows, setNumDummyRows] = React.useState(0);
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = React.useState(false);
  const [activeFieldFilters, setActiveFieldFilters] = React.useState<
    FieldFilter[]
  >([]);
  const [selectedFieldForAdvancedFilter, setSelectedFieldForAdvancedFilter] =
    React.useState<string | null>(null);
  const [columnSearchFieldId, setColumnSearchFieldId] = React.useState<
    string | null
  >(null);
  const [columnSearchValue, setColumnSearchValue] = React.useState<string>("");
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [recordToDelete, setRecordToDelete] =
    React.useState<EnhancedFormRecord | null>(null);
  const lastPointerDownTimeRef = React.useRef<number>(0);
  const DOUBLE_CLICK_THRESHOLD = 400;
  const [previewData, setPreviewData] = React.useState<{
    isOpen: boolean;
    rows: any[];
    title: string;
    fieldDefinitions?: { id: string; label: string; type: string }[];
  }>({ isOpen: false, rows: [], title: "", fieldDefinitions: [] });
  const [orderedFields, setOrderedFields] = React.useState<
    FormFieldWithSection[]
  >([]);
  const [visibleFields, setVisibleFields] = React.useState<Set<string>>(
    new Set(),
  );
  const [isManageColumnsOpen, setIsManageColumnsOpen] = React.useState(false);
  const [isWrapTextEnabled, setIsWrapTextEnabled] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<string>("merged");
  const [focusedCell, setFocusedCell] = React.useState<string | null>(null);
  const [selectedCell, setSelectedCell] = React.useState<string | null>(null);
  const [comments, setComments] = React.useState<Map<string, Comment[]>>(
    new Map(),
  );
  const [activeCommentCell, setActiveCommentCell] = React.useState<
    string | null
  >(null);
  const [newComment, setNewComment] = React.useState<string>("");
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = React.useState<
    string | null
  >(null);
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(
    null,
  );
  const [editingCommentText, setEditingCommentText] =
    React.useState<string>("");
  const [conditionalRules, setConditionalRules] = React.useState<
    ConditionalFormatRule[]
  >([]);
  const [formulaDependencies, setFormulaDependencies] = React.useState<
    Map<string, Set<string>>
  >(new Map());
  const [enhancedFormFields, setEnhancedFormFields] = React.useState<
    FormFieldWithSection[]
  >([]);

  React.useEffect(() => {
    console.log("[Hook] Fields state updated:", {
      formFieldsWithSectionsCount: formFieldsWithSections.length,
      formFieldsWithSections: formFieldsWithSections.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
      })),
      enhancedFormFieldsCount: enhancedFormFields.length,
      enhancedFormFields: enhancedFormFields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
      })),
    });
  }, [formFieldsWithSections, enhancedFormFields]);

  // ── Derived flags ────────────────────────────────────────────────────────────

  const isMergedMode = activeTab === "merged";
  const currentFormId = isMergedMode ? "all" : activeTab;

  // ── Formula config fetch ─────────────────────────────────────────────────────

  React.useEffect(() => {
    const mergeFormulas = async () => {
      try {
        console.log("[Hook] Fetching formulas from /api/testing...");
        const res = await fetch("/api/testing");
        console.log("[Hook] API response status:", res.status);
        const result = await res.json();
        console.log("[Hook] API response:", {
          success: result.success,
          dataCount: Array.isArray(result.data) ? result.data.length : 0,
          data: result.data,
        });

        if (!result.success || !Array.isArray(result.data)) {
          console.warn("[Hook] API response invalid - no formulas loaded", {
            success: result.success,
            hasData: Array.isArray(result.data),
          });
          setEnhancedFormFields(formFieldsWithSections);
          return;
        }

        const formulas = result.data;
        console.log("[Hook] Processing formulas:", {
          count: formulas.length,
          formulas: formulas.map((f: any) => ({
            formFieldId: f.formFieldId,
            expression: f.expression,
            returnType: f.returnType,
          })),
        });

        const updated = formFieldsWithSections.map((field) => {
          const match = formulas.find((f: any) => f.formFieldId === field.id);
          if (!match) return field;
          console.log("[Hook] Found formula match:", {
            fieldId: field.id,
            fieldLabel: field.label,
            expression: match.expression,
          });
          return {
            ...field,
            type: "formula",
            formula: match.expression,
            returnType: match.returnType,
            properties: {
              ...field.properties,
              formulaConfig: {
                expression: match.expression,
                returnType: match.returnType,
                decimalPlaces: match.formField?.decimalPlaces ?? 2,
                blankPreference: match.blankPreference ?? "Empty",
              },
            },
          } as FormFieldWithSection;
        });

        console.log("[Hook] Enhanced fields created:", {
          total: updated.length,
          formulas: updated
            .filter((f) => f.type === "formula")
            .map((f) => ({ id: f.id, label: f.label })),
        });

        setEnhancedFormFields(updated);
      } catch (err) {
        console.error("[Hook] Error fetching formulas:", err);
        setEnhancedFormFields(formFieldsWithSections);
      }
    };
    mergeFormulas();
  }, [formFieldsWithSections]);

  React.useEffect(() => {
    const deps = new Map<string, Set<string>>();
    enhancedFormFields.forEach((field) => {
      if (
        field.type === "formula" &&
        field.properties?.formulaConfig?.expression
      ) {
        const referencedIds = extractFieldReferences(
          field.properties.formulaConfig.expression,
        );
        deps.set(field.id, new Set(referencedIds));
      }
    });
    setFormulaDependencies(deps);
  }, [enhancedFormFields]);

  // ── Comment persistence ──────────────────────────────────────────────────────

  React.useEffect(() => {
    const saved = localStorage.getItem("table-cell-comments");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const loadedMap = new Map<string, Comment[]>();
        Object.entries(parsed).forEach(([key, value]) => {
          loadedMap.set(key, value as Comment[]);
        });
        setComments(loadedMap);
      } catch {
        // ignore malformed localStorage data
      }
    }
  }, []);

  React.useEffect(() => {
    if (comments.size > 0) {
      const serializable: Record<string, Comment[]> = {};
      comments.forEach((value, key) => {
        serializable[key] = value;
      });
      localStorage.setItem("table-cell-comments", JSON.stringify(serializable));
    } else {
      localStorage.removeItem("table-cell-comments");
    }
  }, [comments]);

  // ── Conditional rules persistence ───────────────────────────────────────────

  React.useEffect(() => {
    const saved = localStorage.getItem("table-conditional-rules");
    if (saved) {
      try {
        setConditionalRules(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  React.useEffect(() => {
    if (conditionalRules.length > 0) {
      localStorage.setItem(
        "table-conditional-rules",
        JSON.stringify(conditionalRules),
      );
    } else {
      localStorage.removeItem("table-conditional-rules");
    }
  }, [conditionalRules]);

  // ── Visible fields storage key ────────────────────────────────────────────────
  const visibleFieldsInitRef = React.useRef(false);
  const orderedFieldsInitRef = React.useRef(false);

  const visibleFieldsStorageKey = useMemo(() => {
    if (formFieldsWithSections.length === 0) return null;
    const fingerprint = formFieldsWithSections
      .map((f) => f.id)
      .sort()
      .join(",");
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      hash = ((hash << 5) - hash + fingerprint.charCodeAt(i)) | 0;
    }
    return `visible-columns-${hash}`;
  }, [formFieldsWithSections]);

  // ── Visible fields init from orderedFields ──────────────────────────────────
  // When orderedFields loads (from data), initialize visibleFields if not yet done.
  // This ensures visibleFields is based on actual available fields, not just schema.

  React.useEffect(() => {
    if (orderedFields.length === 0) return;
    const orderedFieldIds = new Set(orderedFields.map((f) => f.id));

    if (!visibleFieldsInitRef.current) {
      visibleFieldsInitRef.current = true;
      // Try to restore from localStorage
      if (visibleFieldsStorageKey) {
        try {
          const saved = localStorage.getItem(visibleFieldsStorageKey);
          if (saved) {
            const savedIds: string[] = JSON.parse(saved);
            const validSaved = savedIds.filter((id) => orderedFieldIds.has(id));
            if (validSaved.length > 0) {
              setVisibleFields(new Set(validSaved));
              orderedFieldsInitRef.current = true;
              return;
            }
          }
        } catch {
          /* ignore corrupt data */
        }
      }
      // No saved preference — default to ALL fields (or limit to reasonable number)
      // Using all fields by default ensures data is visible on first load
      const defaultIds = getDefaultFields(orderedFields).map((f) => f.id);
      setVisibleFields(new Set(defaultIds));
      orderedFieldsInitRef.current = true;
      return;
    }

    // After init: preserve user choices, only handle added/removed fields
    setVisibleFields((prev) => {
      const added = [...orderedFieldIds].filter((id) => !prev.has(id));
      const removed = [...prev].filter((id) => !orderedFieldIds.has(id));
      if (added.length === 0 && removed.length === 0) return prev;
      const next = new Set(prev);
      removed.forEach((id) => next.delete(id));
      // Auto-show newly added fields by default
      added.forEach((id) => next.add(id));
      return next;
    });
  }, [orderedFields, visibleFieldsStorageKey]);

  // ── Persist visible fields to localStorage on change ────────────────────────
  React.useEffect(() => {
    if (
      visibleFieldsStorageKey &&
      visibleFieldsInitRef.current &&
      orderedFieldsInitRef.current
    ) {
      localStorage.setItem(
        visibleFieldsStorageKey,
        JSON.stringify([...visibleFields]),
      );
    }
  }, [visibleFields, visibleFieldsStorageKey]);

  // ── Click outside → deselect ─────────────────────────────────────────────────

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        tableContainerRef.current &&
        !tableContainerRef.current.contains(e.target as Node)
      ) {
        setFocusedCell(null);
        setSelectedCell(null);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // ── Filter sidebar close ─────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isFilterSidebarOpen) {
      setSelectedFieldForAdvancedFilter(null);
      setColumnSearchFieldId(null);
      setColumnSearchValue("");
    }
  }, [isFilterSidebarOpen]);

  // ── Column resize ────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!resizingColumn) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(
        100,
        resizeStartWidth + (e.clientX - resizeStartX),
      );
      setColumnWidths((prev) => {
        const m = new Map(prev);
        m.set(resizingColumn, newWidth);
        return m;
      });
    };
    const handleMouseUp = () => setResizingColumn(null);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  // ── Permission helpers ───────────────────────────────────────────────────────

  const hasPermissionForForm = React.useCallback(
    (formId: string, permName: string) => {
      if (isAdmin) return true;
      const target = permName.toUpperCase();
      return permissions.some(
        (p) =>
          (p.name || "").toUpperCase() === target &&
          // Match form-specific permission OR module-level permission
          // (module-level has form.id empty/"", applies to all forms in the module)
          (p.form?.id === formId || !p.form?.id || p.form?.id === ""),
      );
    },
    [permissions, isAdmin],
  );

  const getRecordForms = React.useCallback(
    (record: EnhancedFormRecord): string[] => {
      if (record.formId !== "merged") return [record.formId];
      return Array.from(record.originalRecordIds?.keys() || []);
    },
    [],
  );

  const canEditRecord = React.useCallback(
    (record: EnhancedFormRecord) => {
      if (isAdmin) return true;
      return getRecordForms(record).every((fId) =>
        hasPermissionForForm(fId, "EDIT"),
      );
    },
    [getRecordForms, hasPermissionForForm, isAdmin],
  );

  const canDeleteRecord = React.useCallback(
    (record: EnhancedFormRecord) => {
      if (isAdmin) return true;
      return getRecordForms(record).every((fId) =>
        hasPermissionForForm(fId, "DELETE"),
      );
    },
    [getRecordForms, hasPermissionForForm, isAdmin],
  );

  // True if the user can delete ANY record (used for bulk delete button visibility)
  const canDeleteAny = React.useMemo(() => {
    if (isAdmin) return true;
    return permissions.some((p) => (p.name || "").toUpperCase() === "DELETE");
  }, [permissions, isAdmin]);

  // ── Formula evaluation ───────────────────────────────────────────────────────

  const recalculateFormulasForRecord = React.useCallback(
    (record: EnhancedFormRecord, changedFieldIds: Set<string> = new Set()) => {
      const newProcessed = [...record.processedData];
      const affected = new Set<string>();
      const runningValues: Record<string, any> = {};

      const currentValues: Record<string, any> = {};
      record.processedData.forEach((pd) => {
        const ef = enhancedFormFields.find(
          (f) =>
            f.originalId === pd.fieldId ||
            f.id === pd.fieldId ||
            `${record.formId}_${pd.fieldId}` === f.id,
        );
        const pendingKey = ef
          ? `${record.id}-${ef.id}`
          : `${record.id}-${pd.fieldId}`;
        const pending = pendingChanges.get(pendingKey);
        const val = pending ? pending.value : pd.value;
        currentValues[pd.fieldId] = val;
        if (pd.fieldLabel) currentValues[pd.fieldLabel] = val;
        if (ef) {
          if (ef.id) currentValues[ef.id] = val;
          if (ef.originalId) currentValues[ef.originalId] = val;
        }
      });

      const formulaFieldsToProcess = enhancedFormFields
        .filter((f) => f.type === "formula" && f.properties?.formulaConfig)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      formulaFieldsToProcess.forEach((formulaField) => {
        const config = formulaField.properties.formulaConfig!;
        const deps = formulaDependencies.get(formulaField.id) || new Set();
        if (
          changedFieldIds.size > 0 &&
          !Array.from(deps).some((d) => changedFieldIds.has(d))
        )
          return;

        try {
          const evaluator = getFormulaEvaluator();
          const variables: Record<string, any> = {};
          extractFieldReferences(config.expression).forEach((refId) => {
            variables[refId] =
              currentValues[refId] !== undefined &&
              currentValues[refId] !== null &&
              currentValues[refId] !== ""
                ? currentValues[refId]
                : runningValues[refId] !== undefined
                  ? runningValues[refId]
                  : currentValues[refId];
          });

          const result = evaluator.evaluate(
            config.expression,
            variables,
            config.returnType || "Text",
            config.blankPreference || "Empty",
            formulaFieldsToProcess.map((f) => ({ ...f, databaseName: f.id })),
            config.decimalPlaces ?? 2,
          );

          let finalValue = result.success
            ? result.value
            : config.blankPreference === "Zero"
              ? 0
              : "";

          if (
            ["Number", "Currency", "Percent"].includes(config.returnType || "")
          ) {
            const num = Number(finalValue);
            if (!isNaN(num)) {
              finalValue = num.toFixed(config.decimalPlaces || 2);
              if (config.returnType === "Currency")
                finalValue = `₹${finalValue}`;
              if (config.returnType === "Percent")
                finalValue = `${finalValue}%`;
            }
          }

          const storeChain = (val: any) => {
            try {
              const cv = Number(val) || result.value;
              runningValues[formulaField.id] = cv;
              if (formulaField.originalId)
                runningValues[formulaField.originalId] = cv;
              if (formulaField.label) runningValues[formulaField.label] = cv;
            } catch {
              runningValues[formulaField.id] = result.value;
            }
          };

          const idx = newProcessed.findIndex(
            (p) =>
              p.fieldId === formulaField.id ||
              p.fieldId === formulaField.originalId,
          );
          if (idx !== -1) {
            newProcessed[idx] = {
              ...newProcessed[idx],
              value: finalValue,
              displayValue: String(finalValue),
            };
            affected.add(formulaField.id);
            storeChain(finalValue);
          } else {
            newProcessed.push({
              fieldId: formulaField.id,
              fieldLabel: formulaField.label,
              fieldType: "formula",
              value: finalValue,
              displayValue: String(finalValue),
              order: formulaField.order ?? 999,
              sectionId: formulaField.sectionId || "default",
              sectionTitle: formulaField.sectionTitle || "General",
              subformId: formulaField.subformId,
              subformTitle: formulaField.subformTitle,
              formId: formulaField.formId || "",
              formName: formulaField.formName || "",
              lookup: {},
              options: [],
              fieldDefinitions: [],
              icon: "",
            });
            affected.add(formulaField.id);
            storeChain(finalValue);
          }
        } catch {
          const idx = newProcessed.findIndex(
            (p) =>
              p.fieldId === formulaField.id ||
              p.fieldId === formulaField.originalId,
          );
          if (idx !== -1)
            newProcessed[idx] = {
              ...newProcessed[idx],
              value: "",
              displayValue: "Error",
            };
        }
      });

      return {
        updatedProcessedData: newProcessed,
        affectedFormulaFields: affected,
      };
    },
    [enhancedFormFields, formulaDependencies, pendingChanges],
  );

  // ── Field data ───────────────────────────────────────────────────────────────

  const getFieldData = React.useCallback(
    (
      record: EnhancedFormRecord,
      fieldDef: FormFieldWithSection,
    ): ProcessedFieldData | undefined => {
      const rawId = fieldDef.originalId || fieldDef.id;
      // Match strictly by field ID — never by label.
      // processedData stores the raw field ID; column definitions store either
      // the raw ID (originalId) or compound ID (formId_fieldId).
      return record.processedData.find(
        (pd) =>
          pd.fieldId === rawId ||
          pd.fieldId === fieldDef.id ||
          `${record.formId}_${pd.fieldId}` === fieldDef.id,
      );
    },
    [pendingChanges, enhancedFormFields],
  );

  // ── Unique field definitions (column list) ────────────────────────────────────

  const getUniqueFieldDefinitions = React.useCallback(
    (
      recs: EnhancedFormRecord[],
      isMerged: boolean,
      selectedFormFilter: string,
    ) => {
      const fieldMap = new Map<string, FormFieldWithSection>();
      recs.forEach((record) => {
        record.processedData.forEach((pd) => {
          if (pd.fieldLabel === "Unknown Field") return;
          const key = isMerged ? `${pd.formId}-${pd.fieldId}` : pd.fieldId;
          if (
            !isMerged &&
            pd.formId !== selectedFormFilter &&
            record.formId !== selectedFormFilter
          )
            return;
          if (!fieldMap.has(key)) {
            fieldMap.set(key, {
              id: pd.fieldId,
              originalId: pd.fieldId,
              label: pd.fieldLabel,
              type: pd.fieldType,
              order: pd.order,
              sectionTitle: pd.sectionTitle || "General",
              sectionId: pd.sectionId || "default",
              subformId: pd.subformId,
              subformTitle: pd.subformTitle,
              formId: pd.formId || record.formId,
              formName: pd.formName || record.formName || "",
            });
          }
        });
      });
      const relevant = isMerged
        ? formFieldsWithSections
        : formFieldsWithSections.filter((f) => f.formId === selectedFormFilter);
      relevant.forEach((f) => {
        if (f.label === "Unknown Field") return;
        // Use originalId (raw field id) so keys match the processedData-derived entries.
        // formFieldsWithSections stores compound ids (formId_fieldId) in f.id but
        // processedData uses the raw fieldId — using originalId keeps them in sync.
        const rawId = f.originalId || f.id;
        const key = isMerged ? `${f.formId}-${rawId}` : rawId;
        if (fieldMap.has(key)) {
          // Merge options/lookup/validation/properties from the full field definition
          // into the stripped entry that was built from processedData (which lacks these).
          const existing = fieldMap.get(key)! as any;
          const src = f as any;
          // Options: merge if missing or empty array
          if (
            (!existing.options ||
              (Array.isArray(existing.options) &&
                existing.options.length === 0)) &&
            src.options?.length
          )
            existing.options = src.options;
          if (!existing.lookup && src.lookup) existing.lookup = src.lookup;
          if (!existing.validation && src.validation)
            existing.validation = src.validation;
          if (!existing.properties && src.properties)
            existing.properties = src.properties;
          if (!existing.styling && src.styling) existing.styling = src.styling;
          if (!existing.formula && src.formula) existing.formula = src.formula;
          if (!existing.placeholder && src.placeholder)
            existing.placeholder = src.placeholder;
          if (!existing.description && src.description)
            existing.description = src.description;
          // Dependent dropdown fields
          if (src.isDependent != null) existing.isDependent = src.isDependent;
          if (src.parentFieldId) existing.parentFieldId = src.parentFieldId;
          if (src.dependentGroups?.length)
            existing.dependentGroups = src.dependentGroups;
        } else {
          fieldMap.set(key, f);
        }
      });
      // Final dedup: by originalId (raw field id) to catch any remaining duplicates
      // where one entry used compound id and another used raw id for the same field.
      const seenRawIds = new Set<string>();
      return Array.from(fieldMap.values())
        .sort((a, b) => a.order - b.order)
        .filter((f) => {
          const rawId = f.originalId || f.id;
          const dedupKey = isMerged ? `${f.formId}-${rawId}` : rawId;
          if (seenRawIds.has(dedupKey)) return false;
          seenRawIds.add(dedupKey);
          return true;
        });
    },
    [formFieldsWithSections],
  );

  // ── Sort ─────────────────────────────────────────────────────────────────────

  const sortRecords = React.useCallback(
    (records: EnhancedFormRecord[]): EnhancedFormRecord[] => {
      return [...records].sort((a, b) => {
        let valA: any, valB: any;
        if (recordSortField === "submittedAt") {
          valA = new Date(a.submittedAt).getTime();
          valB = new Date(b.submittedAt).getTime();
        } else if (recordSortField === "status") {
          valA = a.status;
          valB = b.status;
        } else {
          let targetFieldId: string, targetFormId: string | undefined;
          if (recordSortField.includes("_")) {
            const parts = recordSortField.split("_", 2);
            targetFormId = parts[0];
            targetFieldId = parts[1];
          } else {
            targetFieldId = recordSortField;
          }
          const fd = (r: EnhancedFormRecord) =>
            targetFormId
              ? r.processedData.find(
                  (pd) =>
                    (pd.formId || r.formId) === targetFormId &&
                    pd.fieldId === targetFieldId,
                )
              : r.processedData.find((pd) => pd.fieldId === targetFieldId);
          valA = fd(a)?.displayValue || fd(a)?.value || "";
          valB = fd(b)?.displayValue || fd(b)?.value || "";
        }
        if (valA < valB) return recordSortOrder === "asc" ? -1 : 1;
        if (valA > valB) return recordSortOrder === "asc" ? 1 : -1;
        return 0;
      });
    },
    [recordSortField, recordSortOrder],
  );

  // ── Field filters ────────────────────────────────────────────────────────────

  const applyFieldFilters = React.useCallback(
    (records: EnhancedFormRecord[]): EnhancedFormRecord[] => {
      if (activeFieldFilters.length === 0) return records;
      return records.filter((record) =>
        activeFieldFilters.every((filter) => {
          // Match by composite id, raw/original id, OR label — orderedFields may
          // carry raw ids (from processedData) while formFieldsWithSections uses
          // composite ids (formId_fieldId).
          const fieldDef = formFieldsWithSections.find(
            (f) =>
              f.id === filter.fieldId ||
              f.originalId === filter.fieldId ||
              (filter.fieldLabel && f.label === filter.fieldLabel),
          );
          if (!fieldDef) return true; // unknown field — don't exclude

          // Also look up processedData with both composite and raw id
          const fd = fieldDef
            ? (getFieldData(record, fieldDef) ??
              record.processedData.find((pd) => pd.fieldId === filter.fieldId))
            : undefined;

          // No data found for this field in the record
          if (!fd) {
            return (
              filter.operator === "is empty" || filter.operator === "isEmpty"
            );
          }

          const rawValue = fd.value;
          // Use displayValue for string comparisons so user-visible text is matched
          const displayStr = (fd.displayValue ?? rawValue ?? "").toString();
          const rawStr = String(rawValue ?? "");
          const fv = filter.value;

          // Skip filters where user hasn't entered a value yet (except value-less operators)
          const valuelessOps = [
            "is empty",
            "isEmpty",
            "is not empty",
            "isNotEmpty",
            "is true",
            "isTrue",
            "is false",
            "isFalse",
          ];
          if (
            !valuelessOps.includes(filter.operator) &&
            (fv === undefined || fv === null || fv === "")
          ) {
            return true; // no filter value entered — pass through
          }

          const fvLower = String(fv).toLowerCase();

          switch (filter.operator) {
            case "is empty":
            case "isEmpty":
              return (
                rawValue === null ||
                rawValue === undefined ||
                rawValue === "" ||
                (Array.isArray(rawValue) && rawValue.length === 0)
              );
            case "is not empty":
            case "isNotEmpty":
              return (
                rawValue !== null &&
                rawValue !== undefined &&
                rawValue !== "" &&
                !(Array.isArray(rawValue) && rawValue.length === 0)
              );
            case "is true":
            case "isTrue":
              return rawValue === true || rawValue === "true";
            case "is false":
            case "isFalse":
              return rawValue === false || rawValue === "false" || !rawValue;
            case "is":
            case "equals":
              return (
                rawStr.toLowerCase() === fvLower ||
                displayStr.toLowerCase() === fvLower
              );
            case "isn't":
              return (
                rawStr.toLowerCase() !== fvLower &&
                displayStr.toLowerCase() !== fvLower
              );
            case "contains":
              return (
                displayStr.toLowerCase().includes(fvLower) ||
                rawStr.toLowerCase().includes(fvLower)
              );
            case "doesn't contain":
              return (
                !displayStr.toLowerCase().includes(fvLower) &&
                !rawStr.toLowerCase().includes(fvLower)
              );
            case "starts with":
            case "startsWith":
              return (
                displayStr.toLowerCase().startsWith(fvLower) ||
                rawStr.toLowerCase().startsWith(fvLower)
              );
            case "ends with":
            case "endsWith":
              return (
                displayStr.toLowerCase().endsWith(fvLower) ||
                rawStr.toLowerCase().endsWith(fvLower)
              );
            case "greater than":
            case "greaterThan":
              return (
                filter.fieldType === "number" && Number(rawValue) > Number(fv)
              );
            case "less than":
            case "lessThan":
              return (
                filter.fieldType === "number" && Number(rawValue) < Number(fv)
              );
            case "between": {
              if (filter.fieldType === "number") {
                const nv = Number(rawValue);
                return nv >= Number(fv) && nv <= Number(filter.value2);
              }
              if (
                filter.fieldType === "date" ||
                filter.fieldType === "datetime"
              ) {
                const dv = new Date(rawValue);
                return (
                  dv >= new Date(fv) && dv <= new Date(filter.value2 || fv)
                );
              }
              return false;
            }
            case "after":
              return (
                (filter.fieldType === "date" ||
                  filter.fieldType === "datetime") &&
                new Date(rawValue) > new Date(fv)
              );
            case "before":
              return (
                (filter.fieldType === "date" ||
                  filter.fieldType === "datetime") &&
                new Date(rawValue) < new Date(fv)
              );
            case "is one of":
            case "isOneOf": {
              // Support both array and comma-separated string
              const candidates = Array.isArray(fv)
                ? fv.map((v: any) => String(v).toLowerCase())
                : String(fv)
                    .split(",")
                    .map((s: string) => s.trim().toLowerCase())
                    .filter(Boolean);
              const valLower = rawStr.toLowerCase();
              const dispLower = displayStr.toLowerCase();
              return candidates.some(
                (c: string) => valLower === c || dispLower === c,
              );
            }
            default:
              return true;
          }
        }),
      );
    },
    [activeFieldFilters, formFieldsWithSections, getFieldData],
  );

  // ── Conditional styling ──────────────────────────────────────────────────────

  const getConditionalStyle = React.useCallback(
    (
      fieldDef: FormFieldWithSection,
      value: any,
      _displayText: string,
    ): React.CSSProperties => {
      const isDateField = ["date", "datetime"].includes(fieldDef.type);
      const isFormulaDate =
        fieldDef.type === "formula" &&
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(value);

      if (!isDateField && !isFormulaDate) {
        const matchingRule = conditionalRules
          .filter((r) => r.fieldId === "all" || r.fieldId === fieldDef.id)
          .find((rule) => {
            const v = String(value ?? "").toLowerCase();
            const rv = rule.value ? String(rule.value).toLowerCase() : "";
            switch (rule.condition) {
              case "equals":
                return v === rv;
              case "notEquals":
                return v !== rv;
              case "contains":
                return v.includes(rv);
              case "notContains":
                return !v.includes(rv);
              case "startsWith":
                return v.startsWith(rv);
              case "endsWith":
                return v.endsWith(rv);
              case "greaterThan":
                return (
                  !isNaN(Number(value)) &&
                  !isNaN(Number(rule.value)) &&
                  Number(value) > Number(rule.value)
                );
              case "lessThan":
                return (
                  !isNaN(Number(value)) &&
                  !isNaN(Number(rule.value)) &&
                  Number(value) < Number(rule.value)
                );
              case "isEmpty":
                return value === null || value === undefined || value === "";
              case "isNotEmpty":
                return value !== null && value !== undefined && value !== "";
              default:
                return false;
            }
          });
        if (!matchingRule) return {};
        return {
          color: matchingRule.textColor,
          backgroundColor: matchingRule.backgroundColor,
          fontWeight: matchingRule.bold ? "bold" : undefined,
          fontStyle: matchingRule.italic ? "italic" : undefined,
          textDecoration: matchingRule.underline ? "underline" : undefined,
        };
      }

      const dateValue = new Date(value);
      if (isNaN(dateValue.getTime())) return {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dateOnly = new Date(
        dateValue.getFullYear(),
        dateValue.getMonth(),
        dateValue.getDate(),
      );
      const daysDiff = Math.floor(
        (dateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      const matchingDateRule = conditionalRules
        .filter(
          (r) =>
            (r.fieldId === "all" || r.fieldId === fieldDef.id) &&
            [
              "today",
              "overdue",
              "dueSoon",
              "pastDue",
              "thisWeek",
              "nextWeek",
            ].includes(r.condition),
        )
        .find((rule) => {
          switch (rule.condition) {
            case "today":
              return daysDiff === 0;
            case "overdue":
              return daysDiff < 0;
            case "dueSoon":
              return daysDiff >= 0 && daysDiff <= 7;
            case "pastDue":
              return daysDiff < -7;
            case "thisWeek": {
              const sow = new Date(today);
              sow.setDate(today.getDate() - today.getDay());
              const eow = new Date(sow);
              eow.setDate(sow.getDate() + 6);
              return dateOnly >= sow && dateOnly <= eow;
            }
            case "nextWeek": {
              const sonw = new Date(today);
              sonw.setDate(today.getDate() - today.getDay() + 7);
              const eonw = new Date(sonw);
              eonw.setDate(sonw.getDate() + 6);
              return dateOnly >= sonw && dateOnly <= eonw;
            }
            default:
              return false;
          }
        });

      if (matchingDateRule) {
        return {
          color: matchingDateRule.textColor || "#ffffff",
          backgroundColor: matchingDateRule.backgroundColor || "#ef4444",
          fontWeight: matchingDateRule.bold ? "bold" : "normal",
          padding: "2px 6px",
          borderRadius: "4px",
        };
      }
      return {};
    },
    [conditionalRules],
  );

  // ── Cell pointer / click handlers ────────────────────────────────────────────

  const enterCellEdit = React.useCallback(
    (record: EnhancedFormRecord, fieldDef: FormFieldWithSection) => {
      const fd = getFieldData(record, fieldDef);
      setEditingCell({
        recordId: record.id,
        fieldId: fieldDef.id,
        value: fd?.value ?? "",
        originalValue: fd?.value ?? "",
        fieldType: fieldDef.type,
        options: fieldDef.options,
      });
      setSelectedCell(`${record.id}-${fieldDef.id}`);
      setFocusedCell(`${record.id}-${fieldDef.id}`);
    },
    [getFieldData, setEditingCell, setSelectedCell, setFocusedCell],
  );

  const handleCellPointerDown = React.useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      record: EnhancedFormRecord,
      fieldDef: FormFieldWithSection,
    ) => {
      if (e.button !== 0) return;
      // ── Common guards ──
      if (
        editMode === "locked" ||
        savingChanges ||
        isImageField(fieldDef.label)
      )
        return;
      if (!hasPermissionForForm(fieldDef.formId, "EDIT")) return;
      // ── Formula fields are read-only, cannot be edited ──
      if (fieldDef.type === "formula" && fieldDef.properties?.formulaConfig)
        return;

      if (editMode === "single-click") {
        // Single-click → enter edit immediately on pointer-down
        e.preventDefault();
        enterCellEdit(record, fieldDef);
        return;
      }

      // ── Double-click detection (using ref for reliability) ──
      const now = Date.now();
      if (now - lastPointerDownTimeRef.current < DOUBLE_CLICK_THRESHOLD) {
        e.preventDefault();
        e.stopPropagation();
        enterCellEdit(record, fieldDef);
        lastPointerDownTimeRef.current = 0;
      } else {
        lastPointerDownTimeRef.current = now;
      }
    },
    [editMode, savingChanges, hasPermissionForForm, enterCellEdit],
  );

  // ── Column resize handler ────────────────────────────────────────────────────

  const handleResizeStart = (
    e: React.MouseEvent,
    fieldId: string,
    currentWidth: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(fieldId);
    setResizeStartX(e.clientX);
    setResizeStartWidth(currentWidth);
  };

  // ── Cell expansion ───────────────────────────────────────────────────────────

  const toggleCellExpansion = (cellKey: string) => {
    setExpandedCells((prev) => {
      const s = new Set(prev);
      s.has(cellKey) ? s.delete(cellKey) : s.add(cellKey);
      return s;
    });
  };

  // ── Field visibility ─────────────────────────────────────────────────────────

  const toggleFieldVisibility = (fieldId: string) => {
    setVisibleFields((prev) => {
      const s = new Set(prev);
      s.has(fieldId) ? s.delete(fieldId) : s.add(fieldId);
      // Ensure orderedFieldsInitRef is set if user is toggling (means fields exist)
      orderedFieldsInitRef.current = true;
      return s;
    });
  };

  const allFieldsVisible =
    orderedFields.length > 0 &&
    orderedFields.every((f) => visibleFields.has(f.id));

  const toggleAllFieldsVisibility = () => {
    if (allFieldsVisible) {
      // When deselect all → go to default 4 (NOT empty)
      const defaultIds = getDefaultFields(orderedFields).map((f) => f.id);

      setVisibleFields(new Set(defaultIds));
    } else {
      setVisibleFields(new Set(orderedFields.map((f) => f.id)));
    }
  };

  // ── Advanced filter opener ───────────────────────────────────────────────────

  const handleOpenAdvancedFilterForColumn = (fieldId: string) => {
    setSelectedFieldForAdvancedFilter(fieldId);
    setIsFilterSidebarOpen(true);
  };

  // ── Delete handlers ──────────────────────────────────────────────────────────

  const handleOpenDeleteConfirm = (record: EnhancedFormRecord) => {
    if (canDeleteRecord(record)) {
      setRecordToDelete(record);
      setDeleteConfirmOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    const record = recordToDelete;

    // CLOSE IMMEDIATELY
    setDeleteConfirmOpen(false);
    setRecordToDelete(null);

    if (record) {
      try {
        await onDeleteRecord(record); // run in background
      } catch (error) {
        console.error("Deletion error:", error);
      }
    }
  };

  // ── View details ─────────────────────────────────────────────────────────────

  const handleViewDetails = (record: EnhancedFormRecord) => {
    setSelectedRecord(record);
    setViewDetailsOpen(true);
    onViewDetails(record);
  };

  // ── Comments ─────────────────────────────────────────────────────────────────

  const addComment = () => {
    if (!activeCommentCell || !newComment.trim()) return;
    const mentionRegex = /@\[([^\]]+)\]\(([^\)]+)\)/g;
    const mentions: { name: string; id: string }[] = [];
    let match;
    while ((match = mentionRegex.exec(newComment)))
      mentions.push({ name: match[1], id: match[2] });
    const cleanText = newComment.replace(mentionRegex, "@$1");
    const newC: Comment = {
      id: Date.now().toString(),
      author: currentUserName || "Unknown User",
      text: cleanText,
      timestamp: new Date().toISOString(),
      mentions,
    };
    setComments((prev) => {
      const m = new Map(prev);
      m.set(activeCommentCell, [...(m.get(activeCommentCell) || []), newC]);
      return m;
    });
    setNewComment("");
  };

  const requestDeleteComment = (commentId: string) =>
    setConfirmDeleteCommentId(commentId);
  const cancelDeleteComment = () => setConfirmDeleteCommentId(null);

  const deleteComment = (commentId: string) => {
    if (!activeCommentCell) return;
    setComments((prev) => {
      const m = new Map(prev);
      const cellComments = m.get(activeCommentCell);
      if (cellComments) {
        const filtered = cellComments.filter((c) => c.id !== commentId);
        if (filtered.length > 0) {
          m.set(activeCommentCell, filtered);
        } else {
          m.delete(activeCommentCell);
        }
      }
      return m;
    });
    setConfirmDeleteCommentId(null);
  };

  const startEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
  };

  const saveEditComment = () => {
    if (!activeCommentCell || !editingCommentId || !editingCommentText.trim())
      return;
    setComments((prev) => {
      const m = new Map(prev);
      const cellComments = m.get(activeCommentCell);
      if (cellComments) {
        m.set(
          activeCommentCell,
          cellComments.map((c) =>
            c.id === editingCommentId
              ? { ...c, text: editingCommentText.trim() }
              : c,
          ),
        );
      }
      return m;
    });
    setEditingCommentId(null);
    setEditingCommentText("");
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText("");
  };

  // ── DnD ──────────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) =>
    setActiveDragId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedFields((items) => {
        const oi = items.findIndex((f) => f.id === active.id);
        const ni = items.findIndex((f) => f.id === over.id);
        return arrayMove(items, oi, ni);
      });
    }
    setActiveDragId(null);
  };

  // ── Computed data ─────────────────────────────────────────────────────────────

  const populatedRecordsWithPending = useMemo(() => {
    return formRecords.map((record) => {
      const enhanced = { ...record };
      let hasPending = false;
      const updatedProcessed = [...enhanced.processedData];

      pendingChanges.forEach((change, changeKey) => {
        // Match by key prefix (normal records) OR by change.recordId (merged records)
        if (
          !changeKey.startsWith(`${record.id}-`) &&
          change.recordId !== record.id
        )
          return;
        hasPending = true;
        const pdIndex = updatedProcessed.findIndex(
          (pd) =>
            pd.fieldId === change.fieldId ||
            (change.originalFieldId && pd.fieldId === change.originalFieldId),
        );
        if (pdIndex !== -1) {
          updatedProcessed[pdIndex] = {
            ...updatedProcessed[pdIndex],
            value: change.value,
            displayValue:
              typeof change.value === "number"
                ? change.value.toLocaleString()
                : String(change.value ?? "—"),
          };
        }
      });

      enhanced.processedData = updatedProcessed;

      if (hasPending) {
        const { updatedProcessedData } = recalculateFormulasForRecord(
          enhanced,
          new Set(),
        );
        enhanced.processedData = updatedProcessedData;
      }

      return enhanced;
    });
  }, [
    formRecords,
    pendingChanges,
    enhancedFormFields,
    formulaDependencies,
    recalculateFormulasForRecord,
  ]);

  const baseRecords = useMemo(() => {
    if (!isMergedMode) {
      return populatedRecordsWithPending.filter((r) => r.formId === activeTab);
    }

    // ── Merged mode: combine records from different forms by row index ──
    // Group records by formId, preserving their order within each form
    const formGroups = new Map<string, EnhancedFormRecord[]>();
    populatedRecordsWithPending.forEach((record) => {
      const group = formGroups.get(record.formId) || [];
      group.push(record);
      formGroups.set(record.formId, group);
    });

    const formIds = Array.from(formGroups.keys());
    if (formIds.length <= 1) {
      // Only one form (or none) — no merging needed
      return populatedRecordsWithPending;
    }

    // Find max row count across all forms
    const maxRows = Math.max(
      ...Array.from(formGroups.values()).map((g) => g.length),
    );

    // Build merged records by pairing rows at the same index
    const mergedRecords: EnhancedFormRecord[] = [];
    for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
      // Use the first form's record at this index as the base (if it exists)
      let baseRecord: EnhancedFormRecord | null = null;
      const combinedProcessedData: ProcessedFieldData[] = [];
      const originalIds = new Map<string, string>();

      for (const formId of formIds) {
        const formRecs = formGroups.get(formId)!;
        const rec = formRecs[rowIdx];
        if (!rec) continue;

        // Track original record ids for each form
        originalIds.set(formId, rec.id);

        // Pick the first available record as the base
        if (!baseRecord) {
          baseRecord = rec;
        }

        // Add all processedData from this form's record
        combinedProcessedData.push(...rec.processedData);
      }

      if (!baseRecord) continue;

      mergedRecords.push({
        ...baseRecord,
        id: `merged__${rowIdx}__${formIds.map((fid) => formGroups.get(fid)?.[rowIdx]?.id || "empty").join("__")}`,
        formId: "merged",
        formName: "Merged",
        processedData: combinedProcessedData,
        originalRecordIds: originalIds,
      });
    }

    return mergedRecords;
  }, [isMergedMode, populatedRecordsWithPending, activeTab]);

  // ── Ordered fields update ─────────────────────────────────────────────────────

  React.useEffect(() => {
    const uniqueFields = getUniqueFieldDefinitions(
      baseRecords,
      isMergedMode,
      currentFormId,
    );
    setOrderedFields((prev) => {
      if (prev.length !== uniqueFields.length) return uniqueFields;
      const prevIds = prev
        .map((f) => f.id)
        .sort()
        .join(",");
      const newIds = uniqueFields
        .map((f) => f.id)
        .sort()
        .join(",");
      if (prevIds !== newIds) return uniqueFields;
      return prev;
    });
  }, [baseRecords, isMergedMode, currentFormId, getUniqueFieldDefinitions]);

  // ── Dummy row filler ─────────────────────────────────────────────────────────

  React.useEffect(() => {
    const calc = () => {
      if (!tableContainerRef.current) return;
      // Header is ~72px in merged mode (section header + field header rows).
      // Use Math.floor so dummy rows never trigger a false vertical scrollbar
      // when data already fits — real overflow still scrolls via overflow-y-auto.
      const HEADER_PX = 72;
      const ROW_PX = 36;
      const maxRows = Math.floor(
        (tableContainerRef.current.clientHeight - HEADER_PX) / ROW_PX,
      );
      const paginatedLen = applyFieldFilters(sortRecords(baseRecords)).slice(
        (currentPage - 1) * recordsPerPage,
        currentPage * recordsPerPage,
      ).length;
      setNumDummyRows(Math.max(0, maxRows - paginatedLen));
    };
    const timer = setTimeout(calc, 100);
    window.addEventListener("resize", calc);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", calc);
    };
  }, [baseRecords, currentPage, recordsPerPage]);

  // ── Hierarchy grouping ────────────────────────────────────────────────────────
  // FALLBACK: If visibleFields is empty but orderedFields has content, show all.
  // This prevents empty tables when state hasn't fully synced on initial load.
  // If user has selected specific columns, show only those
  // Fallback: if no columns selected, show first 4 default columns

  // Get default fields safely
  const getDefaultFields = (fields: FormFieldWithSection[]) => {
    const defaults = fields.filter((f) => (f as any).isDefault);

    if (defaults.length > 0) return defaults;

    // fallback → first 4 fields
    return fields.slice(0, 4);
  };

  const displayedFields = useMemo(() => {
    const selected = orderedFields.filter((f) => visibleFields.has(f.id));

    // If user selected something → show that
    if (selected.length > 0) {
      return selected;
    }

    // Otherwise → show default 4 fields + always include formula fields for real-time updates
    const defaultFields = getDefaultFields(orderedFields);
    const formulaFields = orderedFields.filter(
      (f) => f.type === "formula" && f.properties?.formulaConfig,
    );
    const combined = [
      ...defaultFields,
      ...formulaFields.filter(
        (ff) => !defaultFields.some((df) => df.id === ff.id),
      ),
    ];
    return combined;
  }, [orderedFields, visibleFields]);

  const hierarchyGroups = useMemo(() => {
    const formMap = new Map<string, FormGroup>();
    // Use safe accessor for displayedFields which might now include all fields
    const fieldsToGroup = displayedFields;
    fieldsToGroup.forEach((field) => {
      let fg = formMap.get(field.formId);
      if (!fg) {
        fg = {
          id: field.formId,
          name: field.formName,
          subforms: [],
          directSections: [],
        };
        formMap.set(field.formId, fg);
      }
      if (field.subformId) {
        let sfg = fg.subforms.find((sf) => sf.id === field.subformId);
        if (!sfg) {
          sfg = {
            id: field.subformId,
            name: field.subformTitle || "Subform",
            sections: [],
          };
          fg.subforms.push(sfg);
        }
        let sec = sfg.sections.find((s) => s.id === field.sectionId);
        if (!sec) {
          sec = {
            id: field.sectionId,
            title:
              field.sectionTitle !== "Default Section"
                ? field.sectionTitle
                : undefined,
            fields: [],
          };
          sfg.sections.push(sec);
        }
        sec.fields.push(field);
      } else {
        let sec = fg.directSections.find((s) => s.id === field.sectionId);
        if (!sec) {
          sec = {
            id: field.sectionId,
            title:
              field.sectionTitle !== "Default Section"
                ? field.sectionTitle
                : undefined,
            fields: [],
          };
          fg.directSections.push(sec);
        }
        sec.fields.push(field);
      }
    });
    return Array.from(formMap.values());
  }, [displayedFields]);

  // ── Filtered + paginated records ──────────────────────────────────────────────

  const filteredRecords = useMemo(() => {
    let records = sortRecords(baseRecords);

    if (recordSearchQuery) {
      const q = recordSearchQuery.toLowerCase();
      records = records.filter((r) =>
        r.processedData.some((pd) =>
          (pd.displayValue ?? "").toString().toLowerCase().includes(q),
        ),
      );
    }

    if (columnSearchFieldId && columnSearchValue) {
      const q = columnSearchValue.toLowerCase();
      records = records.filter((r) => {
        const fieldDef = formFieldsWithSections.find(
          (f) =>
            f.id === columnSearchFieldId ||
            f.originalId === columnSearchFieldId,
        );
        if (!fieldDef) return true;
        const fd =
          getFieldData(r, fieldDef) ??
          r.processedData.find((pd) => pd.fieldId === columnSearchFieldId);
        if (!fd) return false;
        return (fd.displayValue ?? "").toString().toLowerCase().includes(q);
      });
    }

    return applyFieldFilters(records);
  }, [
    baseRecords,
    recordSearchQuery,
    columnSearchFieldId,
    columnSearchValue,
    formFieldsWithSections,
    getFieldData,
    applyFieldFilters,
    sortRecords,
  ]);

  const startIdx = (currentPage - 1) * recordsPerPage;
  const paginatedRecords = filteredRecords.slice(
    startIdx,
    startIdx + recordsPerPage,
  );

  // ── Return ────────────────────────────────────────────────────────────────────

  return {
    // Refs
    tableContainerRef,
    // State
    viewDetailsOpen,
    setViewDetailsOpen,
    selectedRecord,
    columnWidths,
    expandedCells,
    numDummyRows,
    isFilterSidebarOpen,
    setIsFilterSidebarOpen,
    activeFieldFilters,
    setActiveFieldFilters,
    selectedFieldForAdvancedFilter,
    columnSearchFieldId,
    setColumnSearchFieldId,
    columnSearchValue,
    setColumnSearchValue,
    activeDragId,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    recordToDelete,
    previewData,
    setPreviewData,
    orderedFields,
    setOrderedFields,
    visibleFields,
    setVisibleFields,
    isManageColumnsOpen,
    setIsManageColumnsOpen,
    isWrapTextEnabled,
    setIsWrapTextEnabled,
    activeTab,
    setActiveTab,
    focusedCell,
    setFocusedCell,
    selectedCell,
    setSelectedCell,
    comments,
    setComments,
    activeCommentCell,
    setActiveCommentCell,
    newComment,
    setNewComment,
    confirmDeleteCommentId,
    setConfirmDeleteCommentId,
    conditionalRules,
    setConditionalRules,
    enhancedFormFields,
    // Derived
    isMergedMode,
    currentFormId,
    // Computed
    populatedRecordsWithPending,
    baseRecords,
    filteredRecords,
    paginatedRecords,
    startIdx,
    displayedFields,
    hierarchyGroups,
    // Helpers
    canEditRecord,
    canDeleteRecord,
    hasPermissionForForm,
    canDeleteAny,
    getFieldData,
    getConditionalStyle,
    recalculateFormulasForRecord,
    sortRecords,
    applyFieldFilters,
    // Handlers
    handleResizeStart,
    toggleCellExpansion,
    toggleFieldVisibility,
    toggleAllFieldsVisibility,
    allFieldsVisible,
    handleCellPointerDown,
    handleOpenAdvancedFilterForColumn,
    handleOpenDeleteConfirm,
    handleConfirmDelete,
    handleViewDetails,
    addComment,
    requestDeleteComment,
    cancelDeleteComment,
    deleteComment,
    editingCommentId,
    editingCommentText,
    setEditingCommentText,
    startEditComment,
    saveEditComment,
    cancelEditComment,
    currentUserName,
    // DnD
    sensors,
    handleDragStart,
    handleDragEnd,
  };
}
