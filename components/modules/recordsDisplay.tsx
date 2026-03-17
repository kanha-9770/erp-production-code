"use client";
import React, { useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Filter,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Eye,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  GripVertical,
  Columns,
  WrapText,
  SlidersHorizontal,
  MessageSquare,
  Layers,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
// DnD Kit imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import AdvancedFilterSidebar from "./AdvancedFilterSidebar";
import { DynamicDataPreviewModal2 } from "../DynamicDataPreviewModal";
import { getFormulaEvaluator } from "@/lib/formula/evaluator";
import { extractFieldReferences } from "@/lib/formula/parser"; // already there

// ── Types — imported from shared type files (Week 1 refactor) ──────────────
import type {
  ProcessedFieldData,
  EnhancedFormRecord,
  FormFieldWithSection,
  EditingCell,
  PendingChange,
  FieldFilter,
  User,
  Comment,
  ConditionalFormatRule,
  Permission,
  FieldGroup,
  SubformGroup,
  FormGroup,
} from "@/types/records";
import type { Form } from "@/types/forms";

// Re-export FieldFilter so existing consumers of this module are not broken
export type { FieldFilter };

interface RecordsDisplayProps {
  allModuleForms: Form[];
  formRecords: EnhancedFormRecord[];
  formFieldsWithSections: FormFieldWithSection[];
  recordSearchQuery: string;
  recordsPerPage: number;
  currentPage: number;
  selectedRecords: Set<string>;
  editMode: "locked" | "single-click" | "double-click";
  editingCell: EditingCell | null;
  pendingChanges: Map<string, PendingChange>;
  savingChanges: boolean;
  recordSortField: string;
  recordSortOrder: "asc" | "desc";
  setRecordSearchQuery: (query: string) => void;
  setRecordsPerPage: (count: number) => void;
  setCurrentPage: (page: number) => void;
  setSelectedRecords: (records: Set<string>) => void;
  setRecordSortField: (field: string) => void;
  setRecordSortOrder: (order: "asc" | "desc") => void;
  getFieldIcon: (fieldType: string) => any;
  getEditModeInfo: () => {
    icon: any;
    label: string;
    description: string;
    color: string;
  };
  toggleEditMode: () => void;
  saveAllPendingChanges: (
    changesToSave?: Map<string, PendingChange>,
  ) => Promise<void>;
  discardAllPendingChanges: () => void;
  setEditingCell: (cell: EditingCell | null) => void;
  setPendingChanges: (changes: Map<string, PendingChange>) => void;
  setFormRecords: (records: EnhancedFormRecord[]) => void;
  onEditRecord: (record: EnhancedFormRecord) => void;
  onDeleteRecord: (record: EnhancedFormRecord) => Promise<void>;
  onViewDetails: (record: EnhancedFormRecord) => void;
  permissions?: Permission[];
  isAdmin?: boolean;
  users?: User[];
}

// ── Field utilities — imported from shared utility files (Week 1 refactor) ──
import { isImageUrl, isImageField, formatDynamicRowValue } from "@/lib/utils/fieldUtils";

// ============== SUB-COMPONENTS ==============

/**
 * A dialog to display nested dynamic row data (subform rows) in a table format.
 */
const DynamicDataPreviewModal = ({
  isOpen,
  onClose,
  rows,
  title,
  fieldDefinitions,
  formFieldsWithSections,
}: {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  title: string;
  fieldDefinitions?: { id: string; label: string; type: string }[];
  formFieldsWithSections: FormFieldWithSection[];
}) => {
  if (!rows || rows.length === 0) return null;

  // Get all keys from the first row except internal ones
  const headers = Object.keys(rows[0]).filter((key) => !key.startsWith("_"));

  const getHeaderLabel = (id: string) => {
    // 1. Look into the specific field definitions passed to the modal
    const found = fieldDefinitions?.find((def) => def.id === id);
    if (found && found.label) return found.label;
    // 2. Fallback: Search the global formFieldsWithSections
    const globalFound = formFieldsWithSections.find(
      (f) => f.id === id || f.originalId === id,
    );
    if (globalFound) return globalFound.label;
    // 3. Clean up the ID if still not found
    return (
      id
        .replace(/cm[a-z0-9]{22}/g, "")
        .replace(/_/g, " ")
        .trim() || id
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-white">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Table2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-gray-900">
                {title}
              </DialogTitle>
              <DialogDescription>
                Detailed breakdown of {rows.length} entries.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto px-6 pb-6">
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-gray-500 font-medium w-12 text-center">
                    #
                  </th>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-gray-700 font-semibold capitalize whitespace-nowrap"
                    >
                      {getHeaderLabel(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-400 text-center font-mono text-xs">
                      {idx + 1}
                    </td>
                    {headers.map((header) => (
                      <td key={header} className="px-4 py-3 text-gray-600">
                        {typeof row[header] === "object"
                          ? "Nested Data"
                          : String(row[header] ?? "NaN")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter className="bg-gray-50 p-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            className="px-8 bg-transparent"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SortableColumnHeader = ({
  field,
  columnWidths,
  handleResizeStart,
  isMergedMode,
  getFieldIcon,
  recordSortField,
  recordSortOrder,
  activeFieldFilters,
  handleOpenAdvancedFilterForColumn,
}: {
  field: FormFieldWithSection;
  columnWidths: Map<string, number>;
  handleResizeStart: (
    e: React.MouseEvent,
    fieldId: string,
    currentWidth: number,
  ) => void;
  isMergedMode: boolean;
  getFieldIcon: (fieldType: string) => any;
  recordSortField: string;
  recordSortOrder: "asc" | "desc";
  activeFieldFilters: FieldFilter[];
  handleOpenAdvancedFilterForColumn: (fieldId: string) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const columnWidth = columnWidths.get(field.id) || 192;
  const style = transform
    ? {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: 9999,
      opacity: isDragging ? 0.95 : 1,
    }
    : { transition };

  const tooltipParts = [];
  if (isMergedMode && field.formName) tooltipParts.push(field.formName);
  if (field.subformTitle) tooltipParts.push(field.subformTitle);
  if (field.sectionTitle && field.sectionTitle !== "Default Section") {
    tooltipParts.push(field.sectionTitle);
  }
  tooltipParts.push(field.label);
  const tooltipText = tooltipParts.filter(Boolean).join(" → ");

  return (
    <div
      ref={setNodeRef}
      style={{
        width: `${columnWidth}px`,
        flexShrink: 0,
        position: "relative" as const,
        boxSizing: "border-box" as const,
        ...style,
      }}
      className={cn(
        "h-10 border-r border-gray-300 bg-slate-100 flex items-center text-xs font-bold text-gray-900 px-2 group",
        isDragging && "shadow-2xl ring-4 ring-blue-400 ring-opacity-30",
        "hover:bg-slate-200",
      )}
    >
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute inset-y-0 left-0 w-[calc(100%-90px)] cursor-grab active:cursor-grabbing z-10"
      />
      {isDragging && (
        <div className="absolute inset-0 bg-white rounded-lg shadow-2xl border-2 border-blue-500 pointer-events-none z-30" />
      )}
      <div className="relative w-full h-full flex items-center justify-between z-0">
        <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
          {isMergedMode && field.formName && (
            <div className="text-[10px] text-blue-600/90 font-semibold uppercase tracking-wide truncate w-full">
              {field.formName}
            </div>
          )}
          <div className="flex items-center gap-1 w-full">
            {React.createElement(getFieldIcon(field.type), {
              className: "h-3.5 w-3.5 flex-shrink-0 text-gray-600",
            })}
            <span className="truncate text-xs font-bold text-gray-900">
              {field.label}
            </span>
            {recordSortField === field.id &&
              (recordSortOrder === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 flex-shrink-0" />
              ))}
            {(isMergedMode ||
              field.subformTitle ||
              (field.sectionTitle &&
                field.sectionTitle !== "Default Section")) && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="p-0.5 hover:bg-gray-200/50 rounded cursor-pointer"
                      type="button"
                    >
                      <ChevronDown className="h-3.5 w-3.5 text-gray-500 hover:text-gray-700" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="text-xs max-w-xs">
                    {tooltipText}
                  </PopoverContent>
                </Popover>
              )}
          </div>
        </div>
        {!isImageField(field.label) && (
          <div className="flex items-center gap-1 flex-shrink-0 relative z-20">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200",
                activeFieldFilters.some((f) => f.fieldId === field.id)
                  ? "opacity-100 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-md"
                  : "hover:bg-blue-50 hover:shadow-sm",
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenAdvancedFilterForColumn(field.id);
              }}
              title="Filter this column"
            >
              <svg
                className={cn(
                  "h-3.5 w-3.5",
                  activeFieldFilters.some((f) => f.fieldId === field.id)
                    ? "text-white"
                    : "text-gray-500",
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
            </Button>
          </div>
        )}
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500 bg-transparent group-hover:bg-blue-400 opacity-0 hover:opacity-100 transition-all duration-200 z-40"
        onMouseDown={(e) => {
          e.stopPropagation();
          handleResizeStart(e, field.id, columnWidth);
        }}
        title="Resize column"
      />
    </div>
  );
};

const SortableColumnItem: React.FC<{
  field: FormFieldWithSection;
  isChecked: boolean;
  onToggle: () => void;
  isMergedMode: boolean;
  getFieldIcon: (type: string) => any;
}> = ({ field, isChecked, onToggle, isMergedMode, getFieldIcon }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all",
        isDragging && "shadow-lg z-50 bg-white",
      )}
    >
      <Checkbox id={field.id} checked={isChecked} onCheckedChange={onToggle} />
      <label
        htmlFor={field.id}
        className="flex-1 text-sm font-medium cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {React.createElement(getFieldIcon(field.type), {
            className: "h-4 w-4 text-gray-600",
          })}
          <span>{field.label}</span>
        </div>
        {isMergedMode && (
          <div className="text-xs text-gray-500 mt-1">
            {field.formName}
            {field.subformTitle && ` • ${field.subformTitle}`}
            {field.sectionTitle &&
              field.sectionTitle !== "Default Section" &&
              ` • ${field.sectionTitle}`}
          </div>
        )}
      </label>
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>
    </div>
  );
};

// ============== MAIN COMPONENT ==============

const RecordsDisplay: React.FC<RecordsDisplayProps> = ({
  allModuleForms,
  formRecords,
  formFieldsWithSections,
  recordSearchQuery,
  recordsPerPage,
  currentPage,
  selectedRecords,
  editMode,
  editingCell,
  pendingChanges,
  savingChanges,
  recordSortField,
  recordSortOrder,
  setRecordSearchQuery,
  setRecordsPerPage,
  setSelectedRecords,
  getFieldIcon,
  saveAllPendingChanges,
  setEditingCell,
  setPendingChanges,
  onDeleteRecord,
  onViewDetails,
  setFormRecords,
  permissions = [],
  isAdmin = false,
  users = [],
}) => {
  console.log("RecordsDisplay received permissions:", {
    isAdmin,
    permissionCount: permissions.length,
    permissions: permissions.map((p) => ({
      id: p.id,
      name: p.name,
      resource: p.resource,
      formId: p.form?.id,
      formName: p.form?.name,
      moduleId: p.module?.id,
      moduleName: p.module?.name,
    })),
  });
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
  const tableContainerRef = React.useRef<HTMLDivElement>(null);
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
  const [lastPointerDownTime, setLastPointerDownTime] =
    React.useState<number>(0);
  const DOUBLE_CLICK_THRESHOLD = 300;
  // State for Dynamic Row Preview Modal
  console.log("formRecord", formRecords);

  const [previewData, setPreviewData] = React.useState<{
    isOpen: boolean;
    rows: any[];
    title: string;
    fieldDefinitions?: { id: string; label: string; type: string }[];
  }>({
    isOpen: false,
    rows: [],
    title: "",
    fieldDefinitions: [],
  });
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
  const [conditionalRules, setConditionalRules] = React.useState<
    ConditionalFormatRule[]
  >([]);
  // Add near other state declarations
  const [formulaDependencies, setFormulaDependencies] = React.useState<
    Map<string, Set<string>>
  >(new Map());
  // key = formula fieldId, value = Set of fieldIds it depends on

  // ============== EFFECTS ==============
  // ── MERGE REAL FORMULA CONFIG (exactly like PublicFormDialog) ──
  const [enhancedFormFields, setEnhancedFormFields] = React.useState<
    FormFieldWithSection[]
  >([]);

  React.useEffect(() => {
    const mergeFormulas = async () => {
      const res = await fetch("/api/testing");
      const result = await res.json();

      if (!result.success || !Array.isArray(result.data)) return;

      const formulas = result.data;

      const updated = formFieldsWithSections.map((field) => {
        const match = formulas.find((f: any) => f.formFieldId === field.id);
        if (!match) return field;

        return {
          ...field,
          type: "formula",
          formula: match.expression, // ← your existing field.formula
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

      setEnhancedFormFields(updated);
      // Also update formulaDependencies with real config
    };

    mergeFormulas();
  }, [formFieldsWithSections]);
  const getFormulaEvaluatorInstance = () => getFormulaEvaluator();

  const recalculateFormulasForRecord = (
    record: EnhancedFormRecord,
    changedFieldIds: Set<string> = new Set(),
  ) => {
    console.log(`[Formula] recalculateFormulasForRecord START — recordId=${record.id}`, {
      changedFieldIds: Array.from(changedFieldIds),
      processedDataFields: record.processedData.map((p) => ({ id: p.fieldId, value: p.value })),
    });

    const newProcessed = [...record.processedData];
    const affected = new Set<string>();
    const runningValues: Record<string, any> = {};

    // Build current values keyed by every possible identifier so formula
    // expressions that reference fields by label, raw ID, or composite ID
    // all resolve correctly.
    const currentValues: Record<string, any> = {};
    record.processedData.forEach((pd) => {
      // The pending-change key uses the composite field ID (fieldDef.id).
      // Find the enhanced field that matches this pd so we can look it up.
      const ef = enhancedFormFields.find(
        (f) => f.originalId === pd.fieldId || f.label === pd.fieldLabel,
      );
      const pendingKey = ef
        ? `${record.id}-${ef.id}`         // composite key used when storing changes
        : `${record.id}-${pd.fieldId}`;   // fallback: raw key
      const pending = pendingChanges.get(pendingKey);
      const val = pending ? pending.value : pd.value;

      // Store under all useful keys
      currentValues[pd.fieldId] = val;                        // raw DB ID
      if (pd.fieldLabel) currentValues[pd.fieldLabel] = val; // human label
      if (ef) {
        if (ef.id)         currentValues[ef.id]         = val; // composite ID
        if (ef.originalId) currentValues[ef.originalId] = val; // raw ID (dup-safe)
      }
    });

    console.log(`[Formula] currentValues built:`, currentValues);

    // Get sorted formula fields to handle formula chaining
    const formulaFieldsToProcess = enhancedFormFields
      .filter((f) => f.type === "formula" && f.properties?.formulaConfig)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    console.log(`[Formula] formulaFields to process:`, formulaFieldsToProcess.map((f) => ({ id: f.id, label: f.label, expression: f.properties?.formulaConfig?.expression })));

    // Use enhanced fields for formulas
    formulaFieldsToProcess.forEach((formulaField) => {
      const config = formulaField.properties.formulaConfig!;
      const deps = formulaDependencies.get(formulaField.id) || new Set();

      // Skip if no relevant change and we're filtering by changed fields
      if (
        changedFieldIds.size > 0 &&
        !Array.from(deps).some((d) => changedFieldIds.has(d))
      ) {
        console.log(`[Formula] SKIPPED ${formulaField.label} — no matching dep in changedFieldIds`, {
          deps: Array.from(deps), changedFieldIds: Array.from(changedFieldIds),
        });
        return;
      }

      try {
        const evaluator = getFormulaEvaluatorInstance();

        // Build variables for this formula, supporting chaining
        const variables: Record<string, any> = {};
        const referencedIds = extractFieldReferences(config.expression);

        console.log(`[Formula] ${formulaField.label} — expression="${config.expression}" referencedIds=`, referencedIds);

        referencedIds.forEach((refId) => {
          if (
            currentValues[refId] !== undefined &&
            currentValues[refId] !== null &&
            currentValues[refId] !== ""
          ) {
            variables[refId] = currentValues[refId];
          } else if (runningValues[refId] !== undefined) {
            // Support formula chaining - use previously calculated formula values
            variables[refId] = runningValues[refId];
          } else {
            variables[refId] = currentValues[refId];
          }
        });

        console.log(`[Formula] ${formulaField.label} — variables resolved:`, variables);

        const result = evaluator.evaluate(
          config.expression,
          variables,
          config.returnType || "Text",
          config.blankPreference || "Empty",
          formulaFieldsToProcess, // evaluatorFields
          config.decimalPlaces ?? 2,
        );

        console.log(`[Formula] ${formulaField.label} — evaluator result:`, result);

        let finalValue = result.success
          ? result.value
          : config.blankPreference === "Zero"
            ? 0
            : "";

        // Format like PublicFormDialog
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

        console.log(`[Formula] ${formulaField.label} — finalValue=${finalValue}`);

        // Match by composite ID, raw (originalId), or label — whichever the
        // processedData entry was created with.
        const idx = newProcessed.findIndex(
          (p) =>
            p.fieldId === formulaField.id ||
            p.fieldId === formulaField.originalId ||
            p.fieldLabel === formulaField.label,
        );
        console.log(`[Formula] ${formulaField.label} — idx in processedData=${idx} (formulaField.id=${formulaField.id} originalId=${formulaField.originalId})`);
        if (idx !== -1) {
          newProcessed[idx] = {
            ...newProcessed[idx],
            value: finalValue,
            displayValue: String(finalValue),
          };
          affected.add(formulaField.id);
          // Store result under all keys for chaining (other formulas may reference by label)
          try {
            const chainVal = Number(finalValue) || result.value;
            runningValues[formulaField.id] = chainVal;
            if (formulaField.originalId) runningValues[formulaField.originalId] = chainVal;
            if (formulaField.label) runningValues[formulaField.label] = chainVal;
          } catch {
            runningValues[formulaField.id] = result.value;
          }
        } else {
          // Formula field not yet in processedData — add it so it renders in the column.
          // Use composite ID (formulaField.id) to match getUniqueFieldDefinitions deduplication.
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
          try {
            const chainVal = Number(finalValue) || result.value;
            runningValues[formulaField.id] = chainVal;
            if (formulaField.originalId) runningValues[formulaField.originalId] = chainVal;
            if (formulaField.label) runningValues[formulaField.label] = chainVal;
          } catch {
            runningValues[formulaField.id] = result.value;
          }
        }
      } catch (err) {
        console.error(`Formula error in ${formulaField.label}:`, err);
        const idx = newProcessed.findIndex(
          (p) =>
            p.fieldId === formulaField.id ||
            p.fieldId === formulaField.originalId ||
            p.fieldLabel === formulaField.label,
        );
        if (idx !== -1) {
          newProcessed[idx] = {
            ...newProcessed[idx],
            value: "",
            displayValue: "Error",
          };
        }
      }
    });

    return {
      updatedProcessedData: newProcessed,
      affectedFormulaFields: affected,
    };
  };
  React.useEffect(() => {
    const deps = new Map<string, Set<string>>();

    enhancedFormFields.forEach((field) => {
      if (field.type === "formula" && field.properties?.formulaConfig?.expression) {
        // Extract referenced field IDs from the formula expression
        const referencedIds = extractFieldReferences(field.properties.formulaConfig.expression);
        deps.set(field.id, new Set(referencedIds));
      }
    });

    setFormulaDependencies(deps);
  }, [enhancedFormFields]);

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
      } catch (e) {
        console.warn("Failed to load comments from localStorage", e);
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

  React.useEffect(() => {
    const saved = localStorage.getItem("table-conditional-rules");
    if (saved) {
      try {
        setConditionalRules(JSON.parse(saved));
      } catch (e) {
        console.warn("Failed to load conditional rules", e);
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

  React.useEffect(() => {
    if (
      allModuleForms.length > 0 &&
      activeTab !== "merged" &&
      !allModuleForms.some((f) => f.id === activeTab)
    ) {
      setActiveTab("merged");
    }
  }, [allModuleForms, activeTab]);

  const isMergedMode = activeTab === "merged";
  const currentFormId = isMergedMode ? "all" : activeTab;

  // ============== PERMISSION HELPERS ==============

  const hasPermissionForForm = React.useCallback(
    (formId: string, permName: string) => {
      if (isAdmin) return true;
      return permissions.some(
        (p) =>
          p.resource === "form" && p.form.id === formId && p.name === permName,
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
    (record: EnhancedFormRecord): boolean => {
      if (isAdmin) return true;
      const forms = getRecordForms(record);
      return forms.every((formId) => hasPermissionForForm(formId, "EDIT"));
    },
    [getRecordForms, hasPermissionForForm, isAdmin],
  );

  const canDeleteRecord = React.useCallback(
    (record: EnhancedFormRecord): boolean => {
      if (isAdmin) return true;
      const forms = getRecordForms(record);
      return forms.every((formId) => hasPermissionForForm(formId, "DELETE"));
    },
    [getRecordForms, hasPermissionForForm, isAdmin],
  );

  const updateRecordWithNewProcessedData = useCallback(
    (recordId: string, newProcessed: ProcessedFieldData[]) => {
      setFormRecords((prev) =>
        prev.map((rec) =>
          rec.id === recordId ? { ...rec, processedData: newProcessed } : rec,
        ),
      );
    },
    [setFormRecords],
  );

  // ============== DATA PROCESSING HELPERS ==============
  // formatDynamicRowValue is now imported from @/lib/utils/fieldUtils

  const getLabelForField = (
    fieldId: string,
    record: EnhancedFormRecord,
  ): string => {
    // 1. Check standard fields first
    const standardField = formFieldsWithSections.find(
      (f) => f.id === fieldId || f.originalId === fieldId,
    );
    if (
      standardField &&
      !standardField.label.startsWith("cmk") &&
      !standardField.label.startsWith("cm")
    ) {
      return standardField.label;
    }

    // 2. Check for Dynamic Row Labels (Subform Titles)
    if (fieldId.startsWith("_dynamicRows_")) {
      const subformId = fieldId.replace("_dynamicRows_", "");

      // Check in recordData.subforms first (new structure)
      if (record.recordData?.subforms?.[subformId]) {
        return record.recordData.subforms[subformId].subformName || "Subform";
      }

      // Look in the record's form subforms for the subform name
      const subforms = record.form?.subforms || [];
      for (const subform of subforms) {
        if (subform.id === subformId) return subform.name;
        // Check childSubforms recursively
        const checkChildSubforms = (sfs: any[]): string | null => {
          for (const sf of sfs) {
            if (sf.id === subformId) return sf.name;
            if (sf.childSubforms) {
              const found = checkChildSubforms(sf.childSubforms);
              if (found) return found;
            }
          }
          return null;
        };
        if (subform.childSubforms) {
          const found = checkChildSubforms(subform.childSubforms);
          if (found) return found;
        }
      }
      // Also check sections for backwards compatibility
      const sections = record.form?.sections || [];
      for (const section of sections) {
        const subform = section.subforms?.find((s: any) => s.id === subformId);
        if (subform) return subform.name;
      }
    }

    // 3. Check in recordData.sections (new structure)
    if (record.recordData?.sections) {
      for (const [_, sectionData] of Object.entries(
        record.recordData.sections,
      ) as [string, any][]) {
        if (sectionData.fields?.[fieldId]) {
          return sectionData.fields[fieldId].label || "Unknown Field";
        }
      }
    }

    // 4. Check in recordData.subforms (new structure)
    if (record.recordData?.subforms) {
      for (const [_, subformData] of Object.entries(
        record.recordData.subforms,
      ) as [string, any][]) {
        if (subformData.fields?.[fieldId]) {
          return subformData.fields[fieldId].label || "Unknown Field";
        }
        // Check child subforms
        if (subformData.childSubforms) {
          const searchChildSubforms = (
            children: Record<string, any>,
          ): string | null => {
            for (const [_, childData] of Object.entries(children) as [
              string,
              any,
            ][]) {
              if (childData.fields?.[fieldId]) {
                return childData.fields[fieldId].label || null;
              }
              if (childData.childSubforms) {
                const found = searchChildSubforms(childData.childSubforms);
                if (found) return found;
              }
            }
            return null;
          };
          const found = searchChildSubforms(subformData.childSubforms);
          if (found) return found;
        }
      }
    }

    // 5. Deep search inside Subforms for field labels (form schema)
    if (record.form?.subforms) {
      const searchInSubforms = (subforms: any[]): string | null => {
        for (const sf of subforms) {
          const field = sf.fields?.find((f: any) => f.id === fieldId);
          if (field) return field.label;
          // Check sections within subform
          if (sf.sections) {
            for (const sec of sf.sections) {
              const secField = sec.fields?.find((f: any) => f.id === fieldId);
              if (secField) return secField.label;
            }
          }
          // Check child subforms
          if (sf.childSubforms) {
            const found = searchInSubforms(sf.childSubforms);
            if (found) return found;
          }
        }
        return null;
      };
      const foundLabel = searchInSubforms(record.form.subforms);
      if (foundLabel) return foundLabel;
    }

    // 6. Legacy: Check sections structure
    if (record.form?.sections) {
      for (const section of record.form.sections) {
        if (section.subforms) {
          for (const s of section.subforms) {
            const field = s.fields?.find((f: any) => f.id === fieldId);
            if (field) return field.label;
          }
        }
        const field = section.fields?.find((f: any) => f.id === fieldId);
        if (field) return field.label;
      }
    }

    return "Unknown Field";
  };

  const buildProcessedDataFromRecordData = (
    rec: EnhancedFormRecord,
  ): ProcessedFieldData[] => {
    if (!rec.recordData) return [];

    const results: ProcessedFieldData[] = [];

    // Helper to format display value
    const formatDisplayValue = (
      value: any,
      type: string,
      key: string,
    ): string => {
      if (value === null || value === undefined || value === "") {
        return "NaN";
      }

      // ── NEW: Handle address field ────────────────────────────────
      if (type === "address" && typeof value === "object" && value !== null) {
        const addr = value as Record<string, string>;

        // Build readable string – only include non-empty parts
        const parts: string[] = [];

        if (addr.line1) parts.push(addr.line1.trim());
        if (addr.line2) parts.push(addr.line2.trim());
        if (addr.city) parts.push(addr.city.trim());
        if (addr.state) parts.push(addr.state.trim());
        if (addr.postal) parts.push(addr.postal.trim());
        if (addr.country) parts.push(addr.country.trim());

        // Join with commas, but avoid double commas or trailing ones
        return parts.filter(Boolean).join(", ") || "NaN";
      }

      // ── Existing cases ───────────────────────────────────────────
      if (key.startsWith("_dynamicRows_")) {
        return formatDynamicRowValue(value);
      } else if (Array.isArray(value)) {
        const imgCount = value.filter((v: any) => isImageUrl(v)).length;
        return imgCount > 0 ? `${imgCount} image(s)` : value.join(", ");
      } else if (isImageUrl(value)) {
        return "Image";
      } else if (type === "number" && !isNaN(Number(value))) {
        return Number(value).toLocaleString();
      } else {
        return String(value);
      }
    };

    // Helper to get field definitions for subform dynamic rows
    const getFieldDefinitions = (
      subformId: string,
    ): { id: string; label: string; type: string }[] => {
      // Check new structure: recordData.subforms
      const subformData = rec.recordData?.subforms?.[subformId];
      if (subformData?.fields) {
        return Object.values(subformData.fields).map((f: any) => ({
          id: f.fieldId,
          label: f.label,
          type: f.type,
        }));
      }

      // Check form.subforms
      if (rec.form?.subforms) {
        const findSubform = (subforms: any[]): any | null => {
          for (const sf of subforms) {
            if (sf.id === subformId) return sf;
            if (sf.childSubforms) {
              const found = findSubform(sf.childSubforms);
              if (found) return found;
            }
          }
          return null;
        };
        const foundSubform = findSubform(rec.form.subforms);
        if (foundSubform?.fields) {
          return foundSubform.fields.map((f: any) => ({
            id: f.id,
            label: f.label,
            type: f.type,
          }));
        }
      }

      // Legacy: form.sections[].subforms[]
      if (rec.form?.sections) {
        for (const sec of rec.form.sections) {
          const sub = sec.subforms?.find((s: any) => s.id === subformId);
          if (sub?.fields) {
            return sub.fields.map((f: any) => ({
              id: f.id,
              label: f.label,
              type: f.type,
            }));
          }
        }
      }
      return [];
    };

    // ===== CHECK IF NEW STRUCTURED FORMAT (has sections/subforms as top-level keys) =====
    const hasNewStructure = rec.recordData.sections || rec.recordData.subforms;

    if (hasNewStructure) {
      // Process sections
      if (rec.recordData.sections) {
        Object.entries(rec.recordData.sections).forEach(
          ([sectionId, sectionData]: [string, any]) => {
            const sectionTitle = sectionData.sectionTitle || "Default Section";

            // Process fields within section
            if (sectionData.fields) {
              Object.entries(sectionData.fields).forEach(
                ([fieldId, fieldEntry]: [string, any]) => {
                  const value = fieldEntry.value;
                  const type = fieldEntry.type || "text";
                  const displayVal = formatDisplayValue(value, type, fieldId);

                  results.push({
                    recordId: rec.id,
                    fieldId: fieldId,
                    fieldLabel:
                      fieldEntry.label || getLabelForField(fieldId, rec),
                    fieldType: type,
                    value: value,
                    displayValue: displayVal,
                    order: fieldEntry.order ?? 999,
                    sectionId: sectionId,
                    sectionTitle: sectionTitle,
                    subformId: fieldEntry.subformId,
                    subformTitle: fieldEntry.subformName,
                    formId: rec.formId,
                    formName:
                      rec.recordData.formName ||
                      rec.form?.name ||
                      rec.formName ||
                      "Unknown Form",
                    lookup: fieldEntry.lookup || {},
                    options: fieldEntry.options || [],
                    fieldDefinitions: [],
                    icon: "",
                  });
                },
              );
            }
          },
        );
      }

      // Process subforms
      if (rec.recordData.subforms) {
        Object.entries(rec.recordData.subforms).forEach(
          ([subformId, subformData]: [string, any]) => {
            const subformName = subformData.subformName || "Subform";
            const fieldDefs = getFieldDefinitions(subformId);

            // Process fields directly in subform
            if (subformData.fields) {
              Object.entries(subformData.fields).forEach(
                ([fieldId, fieldEntry]: [string, any]) => {
                  const value = fieldEntry.value;
                  const type = fieldEntry.type || "text";
                  const displayVal = formatDisplayValue(value, type, fieldId);

                  results.push({
                    recordId: rec.id,
                    fieldId: fieldId,
                    fieldLabel:
                      fieldEntry.label || getLabelForField(fieldId, rec),
                    fieldType: type,
                    value: value,
                    displayValue: displayVal,
                    order: fieldEntry.order ?? 999,
                    sectionId: fieldEntry.sectionId || "default",
                    sectionTitle: fieldEntry.sectionTitle || "General",
                    subformId: subformId,
                    subformTitle: subformName,
                    formId: rec.formId,
                    formName:
                      rec.recordData.formName ||
                      rec.form?.name ||
                      rec.formName ||
                      "Unknown Form",
                    lookup: fieldEntry.lookup || {},
                    options: fieldEntry.options || [],
                    fieldDefinitions: [],
                    icon: "",
                  });
                },
              );
            }

            // Process dynamic rows in subform
            if (
              subformData.rows &&
              Array.isArray(subformData.rows) &&
              subformData.rows.length > 0
            ) {
              const dynamicRowKey = `_dynamicRows_${subformId}`;
              const rowValues = subformData.rows.map((row: any) => {
                const rowData: Record<string, any> = {};
                if (row.fields) {
                  Object.entries(row.fields).forEach(
                    ([fId, fEntry]: [string, any]) => {
                      rowData[fId] = fEntry.value;
                    },
                  );
                }
                return rowData;
              });

              results.push({
                recordId: rec.id,
                fieldId: dynamicRowKey,
                fieldLabel: subformName,
                fieldType: "dynamicRows",
                value: rowValues,
                displayValue: formatDynamicRowValue(rowValues),
                order: subformData.order ?? 999,
                sectionId: "default",
                sectionTitle: "Subforms",
                subformId: subformId,
                subformTitle: subformName,
                formId: rec.formId,
                formName:
                  rec.recordData.formName ||
                  rec.form?.name ||
                  rec.formName ||
                  "Unknown Form",
                lookup: {},
                options: [],
                fieldDefinitions: fieldDefs,
                icon: "",
              });
            }

            // Process child subforms recursively
            if (subformData.childSubforms) {
              const processChildSubforms = (
                childSubforms: Record<string, any>,
                parentSubformName: string,
              ) => {
                Object.entries(childSubforms).forEach(
                  ([childSubformId, childSubformData]: [string, any]) => {
                    const childSubformName =
                      childSubformData.subformName || "Child Subform";
                    const childFieldDefs = getFieldDefinitions(childSubformId);

                    // Process child subform fields
                    if (childSubformData.fields) {
                      Object.entries(childSubformData.fields).forEach(
                        ([fieldId, fieldEntry]: [string, any]) => {
                          const value = fieldEntry.value;
                          const type = fieldEntry.type || "text";
                          const displayVal = formatDisplayValue(
                            value,
                            type,
                            fieldId,
                          );

                          results.push({
                            recordId: rec.id,
                            fieldId: fieldId,
                            fieldLabel:
                              fieldEntry.label ||
                              getLabelForField(fieldId, rec),
                            fieldType: type,
                            value: value,
                            displayValue: displayVal,
                            order: fieldEntry.order ?? 999,
                            sectionId: fieldEntry.sectionId || "default",
                            sectionTitle: fieldEntry.sectionTitle || "General",
                            subformId: childSubformId,
                            subformTitle: `${parentSubformName} → ${childSubformName}`,
                            formId: rec.formId,
                            formName:
                              rec.recordData.formName ||
                              rec.form?.name ||
                              rec.formName ||
                              "Unknown Form",
                            lookup: fieldEntry.lookup || {},
                            options: fieldEntry.options || [],
                            fieldDefinitions: [],
                            icon: "",
                          });
                        },
                      );
                    }

                    // Process child subform dynamic rows
                    if (
                      childSubformData.rows &&
                      Array.isArray(childSubformData.rows) &&
                      childSubformData.rows.length > 0
                    ) {
                      const dynamicRowKey = `_dynamicRows_${childSubformId}`;
                      const rowValues = childSubformData.rows.map(
                        (row: any) => {
                          const rowData: Record<string, any> = {};
                          if (row.fields) {
                            Object.entries(row.fields).forEach(
                              ([fId, fEntry]: [string, any]) => {
                                rowData[fId] = fEntry.value;
                              },
                            );
                          }
                          return rowData;
                        },
                      );

                      results.push({
                        recordId: rec.id,
                        fieldId: dynamicRowKey,
                        fieldLabel: childSubformName,
                        fieldType: "dynamicRows",
                        value: rowValues,
                        displayValue: formatDynamicRowValue(rowValues),
                        order: childSubformData.order ?? 999,
                        sectionId: "default",
                        sectionTitle: "Subforms",
                        subformId: childSubformId,
                        subformTitle: `${parentSubformName} → ${childSubformName}`,
                        formId: rec.formId,
                        formName:
                          rec.recordData.formName ||
                          rec.form?.name ||
                          rec.formName ||
                          "Unknown Form",
                        lookup: {},
                        options: [],
                        fieldDefinitions: childFieldDefs,
                        icon: "",
                      });
                    }

                    // Recursively process nested child subforms
                    if (childSubformData.childSubforms) {
                      processChildSubforms(
                        childSubformData.childSubforms,
                        `${parentSubformName} → ${childSubformName}`,
                      );
                    }
                  },
                );
              };

              processChildSubforms(subformData.childSubforms, subformName);
            }
          },
        );
      }

      return results;
    }

    // ===== LEGACY FORMAT: field IDs as direct keys =====
    return Object.entries(rec.recordData).map(
      ([key, fieldEntry]: [string, any]) => {
        let displayVal = "";
        const value = fieldEntry.value;
        const type = fieldEntry.type || "text";

        // --- LOGIC FOR FIELD DEFINITIONS (MODAL HEADERS) ---
        let fieldDefs = fieldEntry.fieldDefinitions || [];

        // If definitions are missing from the record data, look them up in the Form Schema
        if (fieldDefs.length === 0 && key.startsWith("_dynamicRows_")) {
          fieldDefs = getFieldDefinitions(key.replace("_dynamicRows_", ""));
        }

        // --- LOGIC FOR DISPLAY VALUE (TABLE CELL CONTENT) ---
        displayVal = formatDisplayValue(value, type, key);

        // --- CONSTRUCT HIERARCHY INFO ---
        let sectionId = fieldEntry.sectionId || "default";
        let sectionTitle = fieldEntry.sectionTitle || "General";
        let subformId: string | undefined = fieldEntry.subformId;
        let subformTitle: string | undefined =
          fieldEntry.subformTitle || fieldEntry.subformName;

        // Enhanced logic to assign subform and section for hierarchy
        // Check new structure: form.subforms -> sections
        if (!subformId && rec.form?.subforms) {
          const findFieldInSubforms = (
            subforms: any[],
          ): {
            subformId: string;
            subformTitle: string;
            sectionId?: string;
            sectionTitle?: string;
          } | null => {
            for (const sf of subforms) {
              // Check direct fields in subform
              const foundField = sf.fields?.find(
                (f: any) => f.id === key || f.id === key.split("__")[0],
              );
              if (foundField) {
                return {
                  subformId: sf.id,
                  subformTitle: sf.name,
                };
              }
              // Check sections within subform
              if (sf.sections) {
                for (const sec of sf.sections) {
                  const secField = sec.fields?.find(
                    (f: any) => f.id === key || f.id === key.split("__")[0],
                  );
                  if (secField) {
                    return {
                      subformId: sf.id,
                      subformTitle: sf.name,
                      sectionId: sec.id,
                      sectionTitle: sec.title,
                    };
                  }
                }
              }
              // Check child subforms
              if (sf.childSubforms) {
                const found = findFieldInSubforms(sf.childSubforms);
                if (found) return found;
              }
            }
            return null;
          };
          const foundInfo = findFieldInSubforms(rec.form.subforms);
          if (foundInfo) {
            subformId = foundInfo.subformId;
            subformTitle = foundInfo.subformTitle;
            if (foundInfo.sectionId) sectionId = foundInfo.sectionId;
            if (foundInfo.sectionTitle) sectionTitle = foundInfo.sectionTitle;
          }
        }

        // For dynamic rows
        if (key.startsWith("_dynamicRows_")) {
          const dynSubformId = key.replace("_dynamicRows_", "");

          // Check new structure
          if (rec.form?.subforms) {
            const findSubform = (
              subforms: any[],
            ): { subformId: string; subformTitle: string } | null => {
              for (const sf of subforms) {
                if (sf.id === dynSubformId) {
                  return { subformId: sf.id, subformTitle: sf.name };
                }
                if (sf.childSubforms) {
                  const found = findSubform(sf.childSubforms);
                  if (found) return found;
                }
              }
              return null;
            };
            const foundInfo = findSubform(rec.form.subforms);
            if (foundInfo) {
              subformId = foundInfo.subformId;
              subformTitle = foundInfo.subformTitle;
            }
          }

          // Legacy structure
          if (!subformId && rec.form?.sections) {
            for (const section of rec.form.sections) {
              const subform = section.subforms?.find(
                (s: any) => s.id === dynSubformId,
              );
              if (subform) {
                sectionId = section.id;
                sectionTitle = section.title;
                subformId = subform.id;
                subformTitle = subform.name;
                break;
              }
            }
          }
        }

        // For instance fields (e.g., fieldId__instance_...)
        if (key.includes("__") && key.includes("_instance_")) {
          const [baseFieldId] = key.split("__");

          // Check new structure
          if (rec.form?.subforms) {
            const findFieldInSubforms = (
              subforms: any[],
            ): {
              subformId: string;
              subformTitle: string;
              sectionId?: string;
              sectionTitle?: string;
            } | null => {
              for (const sf of subforms) {
                const foundField = sf.fields?.find(
                  (f: any) => f.id === baseFieldId,
                );
                if (foundField) {
                  return { subformId: sf.id, subformTitle: sf.name };
                }
                if (sf.sections) {
                  for (const sec of sf.sections) {
                    const secField = sec.fields?.find(
                      (f: any) => f.id === baseFieldId,
                    );
                    if (secField) {
                      return {
                        subformId: sf.id,
                        subformTitle: sf.name,
                        sectionId: sec.id,
                        sectionTitle: sec.title,
                      };
                    }
                  }
                }
                if (sf.childSubforms) {
                  const found = findFieldInSubforms(sf.childSubforms);
                  if (found) return found;
                }
              }
              return null;
            };
            const foundInfo = findFieldInSubforms(rec.form.subforms);
            if (foundInfo) {
              subformId = foundInfo.subformId;
              subformTitle = foundInfo.subformTitle;
              if (foundInfo.sectionId) sectionId = foundInfo.sectionId;
              if (foundInfo.sectionTitle) sectionTitle = foundInfo.sectionTitle;
            }
          }

          // Legacy structure
          if (!subformId && rec.form?.sections) {
            for (const section of rec.form.sections) {
              for (const subform of section.subforms || []) {
                const foundField = subform.fields?.find(
                  (f: any) => f.id === baseFieldId,
                );
                if (foundField) {
                  sectionId = section.id;
                  sectionTitle = section.title;
                  subformId = subform.id;
                  subformTitle = subform.name;
                  break;
                }
              }
              if (subformId) break;
            }
          }
        }

        return {
          recordId: rec.id,
          fieldId: key,
          fieldLabel: fieldEntry.label || getLabelForField(key, rec),
          fieldType: type,
          value: value,
          displayValue: displayVal,
          order: fieldEntry.order ?? 999,
          sectionId,
          sectionTitle,
          subformId,
          subformTitle,
          formId: rec.formId,
          formName: rec.form?.name || rec.formName || "Unknown Form",
          lookup: fieldEntry.lookup || {},
          options: fieldEntry.options || [],
          fieldDefinitions: fieldDefs,
          icon: "",
        };
      },
    );
  };

  const getFieldData = React.useCallback(
    (
      record: EnhancedFormRecord,
      fieldDef: FormFieldWithSection,
    ): ProcessedFieldData | undefined => {
      // ── FORMULAS ARE ALREADY CALCULATED BY recalculateFormulasForRecord ──
      // We just return the latest value from processedData
      const matchedField = record.processedData.find(
        (pd) =>
          pd.fieldId === fieldDef.id ||
          pd.fieldId === fieldDef.originalId ||
          pd.fieldLabel === fieldDef.label,
      );
      return matchedField;
    },
    [pendingChanges, enhancedFormFields], // ← important change
  );

  const getUniqueFieldDefinitions = (
    baseRecords: EnhancedFormRecord[],
    isMerged: boolean,
    selectedFormFilter: string,
  ) => {
    const fieldMap = new Map<string, FormFieldWithSection>();

    baseRecords.forEach((record) => {
      record.processedData.forEach((pd) => {
        // Filter out unknown fields
        if (pd.fieldLabel === "Unknown Field") {
          return;
        }

        const key = isMerged ? `${pd.formId}-${pd.fieldId}` : pd.fieldId;
        if (
          !isMerged &&
          pd.formId !== selectedFormFilter &&
          record.formId !== selectedFormFilter
        ) {
          return;
        }
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

    const relevantFields = isMerged
      ? formFieldsWithSections
      : formFieldsWithSections.filter((f) => f.formId === selectedFormFilter);

    relevantFields.forEach((f) => {
      if (f.label === "Unknown Field") return;

      const key = isMerged ? `${f.formId}-${f.id}` : f.id;
      if (!fieldMap.has(key)) {
        fieldMap.set(key, f);
      }
    });

    return Array.from(fieldMap.values()).sort((a, b) => a.order - b.order);
  };

  const sortRecords = (records: EnhancedFormRecord[]): EnhancedFormRecord[] => {
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
        const fieldDataA = targetFormId
          ? a.processedData.find(
            (pd) =>
              (pd.formId || a.formId) === targetFormId &&
              pd.fieldId === targetFieldId,
          )
          : a.processedData.find((pd) => pd.fieldId === targetFieldId);
        const fieldDataB = targetFormId
          ? b.processedData.find(
            (pd) =>
              (pd.formId || b.formId) === targetFormId &&
              pd.fieldId === targetFieldId,
          )
          : b.processedData.find((pd) => pd.fieldId === targetFieldId);
        valA = fieldDataA?.displayValue || fieldDataA?.value || "";
        valB = fieldDataB?.displayValue || fieldDataB?.value || "";
      }
      if (valA < valB) return recordSortOrder === "asc" ? -1 : 1;
      if (valA > valB) return recordSortOrder === "asc" ? 1 : -1;
      return 0;
    });
  };

  // Add this function near the top of the file (or in utils)
  function evaluateFormula(
    formula: string,
    variables: Record<string, any>,
    returnType: string = "text",
  ): { success: boolean; value: any } {
    try {
      // Very simple replacement-based evaluation (good enough for num1 + num2)
      let expr = formula;

      // Replace field references like {{num1}} or {num1} or just num1
      Object.entries(variables).forEach(([key, val]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}|\\{${key}\\}|${key}`, "g");
        expr = expr.replace(regex, String(val ?? 0));
      });

      // Basic math evaluation (you can use mathjs later for safety)
      // WARNING: this uses new Function → only use if formulas are trusted!
      const fn = new Function("return " + expr);
      const rawResult = fn();

      let finalValue = rawResult;

      // Type coercion based on returnType
      if (returnType === "number") {
        finalValue = Number(rawResult);
        if (isNaN(finalValue)) finalValue = 0;
      }

      return { success: true, value: finalValue };
    } catch (err) {
      console.warn("Formula evaluation failed:", err);
      return { success: false, value: null };
    }
  }

  const applyFieldFilters = (
    records: EnhancedFormRecord[],
  ): EnhancedFormRecord[] => {
    if (activeFieldFilters.length === 0) return records;
    return records.filter((record) =>
      activeFieldFilters.every((filter) => {
        const fieldDef = formFieldsWithSections.find(
          (f) => f.id === filter.fieldId,
        );
        if (!fieldDef) return false;
        const fieldData = getFieldData(record, fieldDef);
        if (!fieldData) return filter.operator === "isEmpty";
        const value = fieldData.value;
        const filterValue = filter.value;
        switch (filter.operator) {
          case "is empty":
          case "isEmpty":
            return value === null || value === undefined || value === "";
          case "is not empty":
          case "isNotEmpty":
            return value !== null && value !== undefined && value !== "";
          case "is true":
          case "isTrue":
            return value === true || value === "true";
          case "is false":
          case "isFalse":
            return value === false || value === "false" || !value;
          case "is":
          case "equals":
            return (
              String(value).toLowerCase() === String(filterValue).toLowerCase()
            );
          case "isn't":
            return (
              String(value).toLowerCase() !== String(filterValue).toLowerCase()
            );
          case "contains":
            return String(value)
              .toLowerCase()
              .includes(String(filterValue).toLowerCase());
          case "doesn't contain":
            return !String(value)
              .toLowerCase()
              .includes(String(filterValue).toLowerCase());
          case "starts with":
          case "startsWith":
            return String(value)
              .toLowerCase()
              .startsWith(String(filterValue).toLowerCase());
          case "ends with":
          case "endsWith":
            return String(value)
              .toLowerCase()
              .endsWith(String(filterValue).toLowerCase());
          case "greater than":
          case "greaterThan":
            return (
              filter.fieldType === "number" &&
              Number(value) > Number(filterValue)
            );
          case "less than":
          case "lessThan":
            return (
              filter.fieldType === "number" &&
              Number(value) < Number(filterValue)
            );
          case "between": {
            if (filter.fieldType === "number") {
              const numValue = Number(value);
              return (
                numValue >= Number(filterValue) &&
                numValue <= Number(filter.value2)
              );
            }
            if (
              filter.fieldType === "date" ||
              filter.fieldType === "datetime"
            ) {
              const dateValue = new Date(value);
              return (
                dateValue >= new Date(filterValue) &&
                dateValue <= new Date(filter.value2 || filterValue)
              );
            }
            return false;
          }
          case "after":
            return (
              (filter.fieldType === "date" ||
                filter.fieldType === "datetime") &&
              new Date(value) > new Date(filterValue)
            );
          case "before":
            return (
              (filter.fieldType === "date" ||
                filter.fieldType === "datetime") &&
              new Date(value) < new Date(filterValue)
            );
          case "is one of":
          case "isOneOf":
            return (
              Array.isArray(filterValue) &&
              filterValue.some(
                (v) => String(value).toLowerCase() === String(v).toLowerCase(),
              )
            );
          default:
            return true;
        }
      }),
    );
  };

  const getConditionalStyle = (
    fieldDef: FormFieldWithSection,
    value: any,
    displayText: string,
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
          const ruleVal = rule.value ? String(rule.value).toLowerCase() : "";
          switch (rule.condition) {
            case "equals":
              return v === ruleVal;
            case "notEquals":
              return v !== ruleVal;
            case "contains":
              return v.includes(ruleVal);
            case "notContains":
              return !v.includes(ruleVal);
            case "startsWith":
              return v.startsWith(ruleVal);
            case "endsWith":
              return v.endsWith(ruleVal);
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
            const dayOfWeek = today.getDay();
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - dayOfWeek);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            return dateOnly >= startOfWeek && dateOnly <= endOfWeek;
          }
          case "nextWeek": {
            const startOfNextWeek = new Date(today);
            startOfNextWeek.setDate(today.getDate() - today.getDay() + 7);
            const endOfNextWeek = new Date(startOfNextWeek);
            endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
            return dateOnly >= startOfNextWeek && dateOnly <= endOfNextWeek;
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
  };

  const handleCellPointerDown = React.useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      record: EnhancedFormRecord,
      fieldDef: FormFieldWithSection,
    ) => {
      // Only handle left click
      if (e.button !== 0) return;

      const now = Date.now();

      if (now - lastPointerDownTime < DOUBLE_CLICK_THRESHOLD) {
        // This is a double click/tap
        e.preventDefault();
        e.stopPropagation();

        if (
          editMode === "double-click" &&
          !savingChanges &&
          !isImageField(fieldDef.label) &&
          hasPermissionForForm(fieldDef.formId, "EDIT")
        ) {
          const fieldData = getFieldData(record, fieldDef);

          // Allow editing ALWAYS (even if empty / null / NaN / undefined)
          setEditingCell({
            recordId: record.id,
            fieldId: fieldDef.id,
            value: fieldData?.value ?? "", // start empty if null/undefined
            originalValue: fieldData?.value ?? "",
            fieldType: fieldDef.type,
            options: fieldDef.options,
          });
          setSelectedCell(`${record.id}-${fieldDef.id}`);
          setFocusedCell(`${record.id}-${fieldDef.id}`);
        }

        setLastPointerDownTime(0); // reset
      } else {
        setLastPointerDownTime(now);
      }
    },
    [
      lastPointerDownTime,
      editMode,
      savingChanges,
      setEditingCell,
      setSelectedCell,
      setFocusedCell,
      getFieldData,
      hasPermissionForForm,
      isImageField,
    ],
  );

  // ============== EDITOR RENDERER ==============

  const renderFieldEditor = (
    record: EnhancedFormRecord,
    fieldDef: FormFieldWithSection,
    actualValue: any,
    displayText: string,
  ) => {
    const fieldData = getFieldData(record, fieldDef);
    const actualRecordId = fieldData?.recordId || record.id;
    const pendingChange = pendingChanges.get(`${record.id}-${fieldDef.id}`);
    const currentValue = pendingChange ? pendingChange.value : actualValue;
    const originalValue = fieldData?.value ?? "";
    const originalFieldId = fieldData?.fieldId || fieldDef.originalId;
    const hasImages = Array.isArray(currentValue)
      ? currentValue.some(isImageUrl)
      : isImageUrl(currentValue);

    if (isImageField(fieldDef.label) || hasImages) {
      return (
        <Input
          value={displayText}
          disabled
          className="h-7 text-[10px] sm:text-xs p-1 bg-gray-100"
        />
      );
    }

    const handleAutoSave = () => {
      const pendingKey = `${record.id}-${fieldDef.id}`;
      const pendingChange = pendingChanges.get(pendingKey);

      console.log(`[AutoSave] triggered — record=${record.id} field="${fieldDef.label}" (${fieldDef.id})`);
      console.log(`[AutoSave] pendingChange found:`, pendingChange ?? "NONE — nothing to save");

      if (!pendingChange) {
        setEditingCell(null);
        return;
      }

      // ── Step 1: build a record with the new value baked into processedData ──
      // record here comes from populatedRecordsWithPending so the pending value
      // is already applied; this ensures recalculation uses the latest value
      // even if the memo hasn't committed yet.
      const tempRecord: EnhancedFormRecord = {
        ...record,
        processedData: record.processedData.map((pd) =>
          pd.fieldId === fieldDef.id ||
          pd.fieldId === fieldDef.originalId ||
          pd.fieldLabel === fieldDef.label
            ? { ...pd, value: pendingChange.value }
            : pd,
        ),
      };

      console.log(`[AutoSave] tempRecord processedData (fields with values):`,
        tempRecord.processedData.map((p) => ({ fieldId: p.fieldId, label: p.fieldLabel, value: p.value }))
      );

      // ── Step 2: recalculate ALL formula fields using the updated record ──
      const { updatedProcessedData } = recalculateFormulasForRecord(tempRecord, new Set());

      console.log(`[AutoSave] formula recalc result:`,
        updatedProcessedData
          .filter((p) => p.fieldType === "formula")
          .map((p) => ({ fieldId: p.fieldId, label: p.fieldLabel, value: p.value }))
      );

      // ── Step 3: build saveMap — edited field + any changed formula fields ──
      const saveMap = new Map<string, PendingChange>([[pendingKey, pendingChange]]);

      console.log(`[AutoSave] saveMap initial — edited field "${fieldDef.label}" = "${pendingChange.value}"`);

      enhancedFormFields
        .filter((f) => f.type === "formula" && f.properties?.formulaConfig)
        .forEach((formulaField) => {
          // Find the recalculated value for this formula field
          const recalcPd = updatedProcessedData.find(
            (p) =>
              p.fieldId === formulaField.id ||
              p.fieldId === formulaField.originalId ||
              p.fieldLabel === formulaField.label,
          );

          if (!recalcPd) {
            console.log(`[AutoSave] formula "${formulaField.label}" — no recalcPd found, skipping`);
            return;
          }

          // Find what the formula currently holds in the record (before this edit)
          const existingPd = record.processedData.find(
            (p) =>
              p.fieldId === formulaField.id ||
              p.fieldId === formulaField.originalId ||
              p.fieldLabel === formulaField.label,
          );

          const oldValue = existingPd?.value ?? "";
          const newValue = recalcPd.value;

          console.log(`[AutoSave] formula "${formulaField.label}" — old="${oldValue}" new="${newValue}" changed=${String(oldValue) !== String(newValue)}`);

          // Always include formula in save so DB stays in sync
          const formulaKey = `${record.id}-${formulaField.id}`;
          saveMap.set(formulaKey, {
            recordId: record.id,
            fieldId: formulaField.id,
            originalFieldId: formulaField.originalId || formulaField.id,
            value: newValue,
            originalValue: oldValue,
            fieldType: "formula",
            fieldLabel: formulaField.label,
          });
        });

      console.log(`[AutoSave] final saveMap keys:`, Array.from(saveMap.keys()));
      console.log(`[AutoSave] calling saveAllPendingChanges with ${saveMap.size} change(s)`);

      saveAllPendingChanges(saveMap);
      setEditingCell(null);
    };

    if (!["lookup", "dropdown", "select"].includes(fieldDef.type)) {
      let editValue = currentValue ?? "";

      // ── Special case: Address field ────────────────────────────────
      if (
        fieldDef.type === "address" &&
        typeof currentValue === "object" &&
        currentValue !== null
      ) {
        const addr = currentValue as Record<string, string>;
        const parts: string[] = [];

        if (addr.line1) parts.push(addr.line1.trim());
        if (addr.line2) parts.push(addr.line2.trim());
        if (addr.city) parts.push(addr.city.trim());
        if (addr.state) parts.push(addr.state.trim());
        if (addr.postal) parts.push(addr.postal.trim());
        if (addr.country) parts.push(addr.country.trim());
        editValue = parts.filter(Boolean).join(", ");
      }

      return (
        <Input
          value={editValue}
          onChange={(e) => {
            const newRawValue = e.target.value;
            let finalValue: any = newRawValue;

            if (fieldDef.type === "address") {
              // Very simple split-based parsing (you can improve this later)
              const parts = newRawValue
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);

              // Naive mapping - assumes order: line1, line2?, city, state, postal, country
              finalValue = {
                line1: parts[0] || "",
                line2: parts[1] || "",
                city: parts[2] || "",
                state: parts[3] || "",
                postal: parts[4] || "",
                country: parts[5] || "",
              };

              // If user cleared everything → empty object or null
              if (Object.values(finalValue).every((v) => !v)) {
                finalValue = {};
              }
            }

            const currentRecord = populatedRecordsWithPending.find(
              (r: { id: string }) => r.id === record.id,
            );
            if (!currentRecord) {
              console.warn("Record not found during edit:", record.id);
              return;
            }

            const newPending = new Map(pendingChanges);
            newPending.set(`${currentRecord.id}-${fieldDef.id}`, {
              recordId: actualRecordId,
              fieldId: fieldDef.id,
              originalFieldId: originalFieldId,
              value: finalValue,
              originalValue,
              fieldType: fieldDef.type,
              fieldLabel: fieldDef.label,
            });

            // Setting pending changes is sufficient — populatedRecordsWithPending
            // will apply the new value and recalculate dependent formulas in the
            // same render cycle. Calling updateRecordWithNewProcessedData here
            // would trigger an extra setFormRecords on every keystroke, causing
            // unnecessary re-renders and potential focus loss.
            setPendingChanges(newPending);
          }}
          onBlur={handleAutoSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAutoSave();
            } else if (e.key === "Escape") {
              const newPending = new Map(pendingChanges);
              newPending.delete(`${record.id}-${fieldDef.id}`);
              setPendingChanges(newPending);
              setEditingCell(null);
            }
          }}
          autoFocus
          className="h-7 text-[10px] sm:text-xs p-1"
          placeholder={
            fieldDef.type === "address"
              ? "e.g. 123 Main St, Jaipur, Rajasthan, 302001, India"
              : ""
          }
        />
      );
    }

    const options =
      fieldDef.type === "lookup"
        ? (fieldDef.lookup?.options ?? [])
        : (fieldDef.options ?? []);
    const normalised = options.map((opt: any) => ({
      value: opt.value ?? opt.id ?? opt,
      label: opt.label ?? opt.name ?? opt,
    }));

    return (
      <Select
        value={currentValue?.toString() ?? ""}
        onValueChange={(newValue) => {
          const currentRecord = formRecords.find((r) => r.id === record.id);
          if (!currentRecord) {
            console.warn("Record not found during select change");
            return;
          }
          const newPending = new Map(pendingChanges);
          newPending.set(`${currentRecord.id}-${fieldDef.id}`, {
            recordId: actualRecordId,
            fieldId: fieldDef.id,
            originalFieldId: originalFieldId,
            value: newValue,
            originalValue,
            fieldType: fieldDef.type,
            fieldLabel: fieldDef.label,
          });
          // Setting pending changes is sufficient — populatedRecordsWithPending
          // recalculates formulas on the next render. No extra setFormRecords needed.
          setPendingChanges(newPending);

          setTimeout(() => {
            saveAllPendingChanges(
              new Map([
                [
                  `${record.id}-${fieldDef.id}`,
                  newPending.get(`${record.id}-${fieldDef.id}`)!,
                ],
              ]),
            );
          }, 0);
        }}
        onOpenChange={(open) => !open && setEditingCell(null)}
      >
        <SelectTrigger className="h-7 text-[10px] sm:text-xs p-1">
          <SelectValue placeholder="— Select —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {normalised.map((opt: any) => (
            <SelectItem key={opt.value} value={opt.value.toString()}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  // ============== EVENT HANDLERS ==============

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

  React.useEffect(() => {
    if (!resizingColumn) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartX;
      const newWidth = Math.max(100, resizeStartWidth + deltaX);
      setColumnWidths((prev) => {
        const updated = new Map(prev);
        updated.set(resizingColumn, newWidth);
        return updated;
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

  const toggleCellExpansion = (cellKey: string) => {
    setExpandedCells((prev) => {
      const updated = new Set(prev);
      updated.has(cellKey) ? updated.delete(cellKey) : updated.add(cellKey);
      return updated;
    });
  };

  React.useEffect(() => {
    const allFieldIds = formFieldsWithSections.map((f) => f.id);
    setVisibleFields(new Set(allFieldIds));
  }, [formFieldsWithSections]);

  const displayedFields = orderedFields.filter((field) =>
    visibleFields.has(field.id),
  );

  const toggleFieldVisibility = (fieldId: string) => {
    setVisibleFields((prev) => {
      const updated = new Set(prev);
      if (updated.has(fieldId)) {
        updated.delete(fieldId);
      } else {
        updated.add(fieldId);
      }
      return updated;
    });
  };

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tableContainerRef.current &&
        !tableContainerRef.current.contains(e.target as Node)
      ) {
        setFocusedCell(null);
        setSelectedCell(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // ============== COMPUTED DATA ==============

  const populatedRecordsWithPending = useMemo(() => {
    return formRecords.map((record) => {
      // Clone to avoid mutation
      const enhanced = { ...record };

      // Apply pending changes for this record
      let hasPending = false;
      const updatedProcessed = [...enhanced.processedData];

      pendingChanges.forEach((change, changeKey) => {
        if (!changeKey.startsWith(`${record.id}-`)) return;
        hasPending = true;

        const fieldId = change.fieldId;
        // pd.fieldId is a raw field ID; change.fieldId may be composite (formId_fieldId).
        // Fall back to change.originalFieldId (raw) so the lookup succeeds.
        const pdIndex = updatedProcessed.findIndex(
          (pd) =>
            pd.fieldId === fieldId ||
            (change.originalFieldId && pd.fieldId === change.originalFieldId) ||
            (change.fieldLabel && pd.fieldLabel === change.fieldLabel),
        );
        console.log(
          `[PendingApply] record=${record.id} fieldId=${fieldId} originalFieldId=${change.originalFieldId} pdIndex=${pdIndex}`,
          "processedData fieldIds:", updatedProcessed.map((p) => p.fieldId),
        );

        if (pdIndex !== -1) {
          // Update display value using the same formatting logic you use elsewhere
          const displayVal =
            typeof change.value === "number"
              ? change.value.toLocaleString()
              : String(change.value ?? "—");

          updatedProcessed[pdIndex] = {
            ...updatedProcessed[pdIndex],
            value: change.value,
            displayValue: displayVal,
          };
        }
      });

      enhanced.processedData = updatedProcessed;

      // If any changes were applied → re-evaluate ALL formulas for this record.
      // Pass empty Set so no formula is skipped by the dependency check
      // (composite vs raw field ID mismatch would otherwise cause all to be skipped).
      if (hasPending) {
        console.log(`[PendingMemo] hasPending=true for record=${record.id}, triggering formula recalc`);
        const { updatedProcessedData } = recalculateFormulasForRecord(
          enhanced,
          new Set(),
        );
        enhanced.processedData = updatedProcessedData;
        console.log(`[PendingMemo] formula recalc done for record=${record.id}`, updatedProcessedData.map((p) => ({ id: p.fieldId, value: p.value })));
      }

      return enhanced;
    });
  }, [
    formRecords,
    pendingChanges,
    enhancedFormFields, // ← add this
    formulaDependencies,
  ]);

  const baseRecords = React.useMemo(
    () =>
      isMergedMode
        ? populatedRecordsWithPending
        : populatedRecordsWithPending.filter(
          (r: { formId: string }) => r.formId === activeTab,
        ),
    [isMergedMode, populatedRecordsWithPending, activeTab],
  );

  const sortedRecords = sortRecords(baseRecords);
  let filteredRecords = sortedRecords;

  if (recordSearchQuery) {
    const lowerQuery = recordSearchQuery.toLowerCase();
    filteredRecords = filteredRecords.filter((record) =>
      record.processedData.some((pd) =>
        (pd.displayValue ?? "").toString().toLowerCase().includes(lowerQuery),
      ),
    );
  }

  if (columnSearchFieldId && columnSearchValue) {
    const lowerQuery = columnSearchValue.toLowerCase();
    filteredRecords = filteredRecords.filter((record) => {
      const fieldDef = formFieldsWithSections.find(
        (f) => f.id === columnSearchFieldId,
      );
      if (!fieldDef) return true;
      const fieldData = getFieldData(record, fieldDef);
      if (!fieldData) return false;
      return (fieldData.displayValue ?? "")
        .toString()
        .toLowerCase()
        .includes(lowerQuery);
    });
  }

  filteredRecords = applyFieldFilters(filteredRecords);

  const startIdx = (currentPage - 1) * recordsPerPage;
  const endIdx = currentPage * recordsPerPage;
  const paginatedRecords = filteredRecords.slice(startIdx, endIdx);

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
  }, [baseRecords, isMergedMode, currentFormId]);

  // ============== DND ==============

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
        const oldIndex = items.findIndex((f) => f.id === active.id);
        const newIndex = items.findIndex((f) => f.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
    setActiveDragId(null);
  };

  const handleOpenAdvancedFilterForColumn = (fieldId: string) => {
    setSelectedFieldForAdvancedFilter(fieldId);
    setIsFilterSidebarOpen(true);
  };

  React.useEffect(() => {
    if (!isFilterSidebarOpen) {
      setSelectedFieldForAdvancedFilter(null);
      setColumnSearchFieldId(null);
      setColumnSearchValue("");
    }
  }, [isFilterSidebarOpen]);

  React.useEffect(() => {
    const calculateFillers = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = 40;
      const rowHeight = 36;
      const maxRows = Math.floor((containerHeight - headerHeight) / rowHeight);
      setNumDummyRows(Math.max(0, maxRows - paginatedRecords.length));
    };
    const timer = setTimeout(calculateFillers, 100);
    const resizeHandler = () => calculateFillers();
    window.addEventListener("resize", resizeHandler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", resizeHandler);
    };
  }, [paginatedRecords.length]);

  const handleViewDetails = (record: EnhancedFormRecord) => {
    setSelectedRecord(record);
    setViewDetailsOpen(true);
    onViewDetails(record);
  };

  const handleConfirmDelete = async () => {
    if (recordToDelete) {
      try {
        await onDeleteRecord(recordToDelete);
      } catch (error) {
        console.error("Deletion error:", error);
      }
    }
    setDeleteConfirmOpen(false);
    setRecordToDelete(null);
  };

  const handleOpenDeleteConfirm = (record: EnhancedFormRecord) => {
    if (canDeleteRecord(record)) {
      setRecordToDelete(record);
      setDeleteConfirmOpen(true);
    }
  };

  // Comment functions
  const addComment = () => {
    if (!activeCommentCell || !newComment.trim()) return;
    const mentionRegex = /@\[([^\]]+)\]\(([^\)]+)\)/g;
    const mentions: { name: string; id: string }[] = [];
    let match;
    while ((match = mentionRegex.exec(newComment))) {
      mentions.push({ name: match[1], id: match[2] });
    }
    const cleanText = newComment.replace(mentionRegex, "@$1");
    const newC: Comment = {
      id: Date.now().toString(),
      author: "Current User",
      text: cleanText,
      timestamp: new Date().toISOString(),
      mentions,
    };
    setComments((prev) => {
      const newMap = new Map(prev);
      const old = newMap.get(activeCommentCell) || [];
      newMap.set(activeCommentCell, [...old, newC]);
      return newMap;
    });
    setNewComment("");
  };

  const requestDeleteComment = (commentId: string) =>
    setConfirmDeleteCommentId(commentId);

  const cancelDeleteComment = () => setConfirmDeleteCommentId(null);

  // ============== HIERARCHY GROUPING (form -> subform -> section) ==============

  // Compute hierarchical groups for headers: Form -> Subform -> Section -> Fields
  const hierarchyGroups = React.useMemo(() => {
    const formMap = new Map<string, FormGroup>();

    displayedFields.forEach((field) => {
      // Get or create form group
      let formGroup = formMap.get(field.formId);
      if (!formGroup) {
        formGroup = {
          id: field.formId,
          name: field.formName,
          subforms: [],
          directSections: [],
        };
        formMap.set(field.formId, formGroup);
      }

      // If field has a subform, add to subform group
      if (field.subformId) {
        let subformGroup = formGroup.subforms.find(
          (sf) => sf.id === field.subformId,
        );
        if (!subformGroup) {
          subformGroup = {
            id: field.subformId,
            name: field.subformTitle || "Subform",
            sections: [],
          };
          formGroup.subforms.push(subformGroup);
        }

        // Add to section within subform
        let sectionGroup = subformGroup.sections.find(
          (sec) => sec.id === field.sectionId,
        );
        if (!sectionGroup) {
          sectionGroup = {
            id: field.sectionId,
            title:
              field.sectionTitle !== "Default Section"
                ? field.sectionTitle
                : undefined,
            fields: [],
          };
          subformGroup.sections.push(sectionGroup);
        }
        sectionGroup.fields.push(field);
      } else {
        // Field is directly in a section (no subform)
        let sectionGroup = formGroup.directSections.find(
          (sec) => sec.id === field.sectionId,
        );
        if (!sectionGroup) {
          sectionGroup = {
            id: field.sectionId,
            title:
              field.sectionTitle !== "Default Section"
                ? field.sectionTitle
                : undefined,
            fields: [],
          };
          formGroup.directSections.push(sectionGroup);
        }
        sectionGroup.fields.push(field);
      }
    });

    return Array.from(formMap.values());
  }, [displayedFields]);

  // Helper to compute group width
  const getGroupWidth = (fields: FormFieldWithSection[]) => {
    return fields.reduce((sum, f) => sum + (columnWidths.get(f.id) || 192), 0);
  };

  // Get all fields in order from hierarchy

  // ============== RENDER ==============

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-gray-50 overflow-x-hidden overflow-y-hidden">
        {/* Advanced Filter Sidebar */}
        <AdvancedFilterSidebar
          isOpen={isFilterSidebarOpen}
          onClose={() => setIsFilterSidebarOpen(false)}
          fields={
            orderedFields.length > 0 ? orderedFields : formFieldsWithSections
          }
          filters={activeFieldFilters}
          onFiltersChange={(newFilters) => {
            setActiveFieldFilters(newFilters);
            setCurrentPage(1);
          }}
          isMergedMode={isMergedMode}
          preselectedFieldId={selectedFieldForAdvancedFilter}
          onColumnSearch={(fieldId, searchValue) => {
            setColumnSearchFieldId(fieldId);
            setColumnSearchValue(searchValue);
          }}
        />
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <Card className="border-none rounded-none shadow-none bg-transparent overflow-hidden flex-1 flex flex-col">
            <CardContent className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
              <div className="flex flex-col sm:flex-row gap-3 relative">
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFilterSidebarOpen(!isFilterSidebarOpen)}
                    className={cn(
                      "h-9 gap-2 transition-all duration-200",
                      activeFieldFilters.length > 0
                        ? "border-blue-500 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700"
                        : "hover:bg-gray-50 hover:border-gray-400",
                    )}
                  >
                    <Filter className="h-4 w-4" />
                    Filters
                    {activeFieldFilters.length > 0 && (
                      <span className="bg-white text-blue-600 text-xs font-bold rounded-full px-2 py-0.5 ml-1 shadow-sm">
                        {activeFieldFilters.length}
                      </span>
                    )}
                  </Button>
                </div>
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search all records..."
                      value={recordSearchQuery}
                      onChange={(e) => setRecordSearchQuery(e.target.value)}
                      className="pl-10 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-9 text-sm rounded-lg transition-all duration-200 hover:border-gray-400"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Select
                    value={recordsPerPage.toString()}
                    onValueChange={(v) => setRecordsPerPage(Number(v))}
                  >
                    <SelectTrigger className="h-9 rounded-lg border-gray-300 hover:border-gray-400 transition-all duration-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[100, 200, 400, 500].map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n} per page
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2 bg-transparent"
                      >
                        <SlidersHorizontal className="h-4 w-4" /> Conditional
                        Formatting
                        {conditionalRules.length > 0 && (
                          <span className="bg-blue-100 text-blue-800 text-xs font-bold rounded-full px-2 py-0.5">
                            {conditionalRules.length}
                          </span>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-96">
                      <DropdownMenuLabel>
                        Conditional Formatting Rules
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {conditionalRules.length === 0 ? (
                        <div className="text-center py-4 text-sm text-gray-500">
                          No rules defined yet
                        </div>
                      ) : (
                        conditionalRules.map((rule, idx) => {
                          const fieldLabel =
                            formFieldsWithSections.find(
                              (f) => f.id === rule.fieldId,
                            )?.label ||
                            (rule.fieldId === "all"
                              ? "All columns"
                              : "Unknown");
                          return (
                            <div
                              key={rule.id}
                              className="p-2 border-b flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-medium">
                                  {fieldLabel}
                                </span>{" "}
                                <span className="text-gray-600">
                                  {rule.condition}
                                </span>{" "}
                                {rule.value && (
                                  <span className="font-medium">
                                    {'"'}
                                    {rule.value}
                                    {'"'}
                                  </span>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() =>
                                  setConditionalRules((rules) =>
                                    rules.filter((_, i) => i !== idx),
                                  )
                                }
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          setConditionalRules((prev) => [
                            ...prev,
                            {
                              id: Date.now().toString(),
                              fieldId: "all",
                              condition: "today",
                              backgroundColor: "#fffbeb",
                              textColor: "#f59e0b",
                              bold: true,
                            },
                          ])
                        }
                      >
                        + Due Today - Amber Highlight
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="bg-white border border-gray-300 rounded-md p-1.5 hover:bg-gray-100 hover:border-gray-400 transition-all shadow-sm"
                        title="Column Options"
                      >
                        <SlidersHorizontal className="w-4 h-4 text-black" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Column Options</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setIsWrapTextEnabled(!isWrapTextEnabled)}
                        className="cursor-pointer"
                      >
                        <WrapText className="h-4 w-4 mr-2" />{" "}
                        {isWrapTextEnabled ? "Clip Text" : "Wrap Text"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setIsManageColumnsOpen(true)}
                        className="cursor-pointer"
                      >
                        <Columns className="h-4 w-4 mr-2" /> Manage Columns
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="border border-gray-200 bg-white rounded-xl overflow-hidden shadow-lg flex-1 flex flex-col">
                <div
                  className="flex-1 overflow-y-auto overflow-x-scroll min-h-0"
                  ref={tableContainerRef}
                >
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="inline-block min-w-max">
                      <div>
                        {/* Header Row 1: Form Names (when merged) */}
                        {isMergedMode && hierarchyGroups.length > 1 && (
                          <div className="flex bg-gradient-to-r from-indigo-100 via-purple-100 to-indigo-100 border-b-2 border-gray-400 sticky top-0 z-30 min-w-max shadow-sm">
                            <div className="w-10 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
                            <div className="w-12 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
                            <div className="w-20 sm:w-24 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
                            {hierarchyGroups.map((formGroup) => {
                              const formWidth =
                                formGroup.directSections.reduce(
                                  (sum, sec) => sum + getGroupWidth(sec.fields),
                                  0,
                                ) +
                                formGroup.subforms.reduce(
                                  (sum, sf) =>
                                    sum +
                                    sf.sections.reduce(
                                      (s, sec) => s + getGroupWidth(sec.fields),
                                      0,
                                    ),
                                  0,
                                );
                              return (
                                <div
                                  key={formGroup.id}
                                  className="h-8 bg-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-900 border-r border-gray-300"
                                  style={{ width: `${formWidth}px` }}
                                >
                                  {formGroup.name}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Header Row 2: Subform Names */}
                        <div
                          className={cn(
                            "flex bg-gradient-to-r from-slate-100 via-gray-100 to-slate-100 border-b-2 border-gray-400 sticky z-20 min-w-max shadow-sm",
                            isMergedMode && hierarchyGroups.length > 1
                              ? "top-8"
                              : "top-0",
                          )}
                        >
                          <div className="w-10 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <Checkbox
                              checked={
                                selectedRecords.size ===
                                paginatedRecords.length &&
                                paginatedRecords.length > 0
                              }
                              onCheckedChange={(checked) =>
                                setSelectedRecords(
                                  checked
                                    ? new Set(paginatedRecords.map((r) => r.id))
                                    : new Set(),
                                )
                              }
                              className="h-4 w-4"
                            />
                          </div>
                          <div className="w-12 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
                            #
                          </div>
                          <div className="w-20 sm:w-24 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
                            Actions
                          </div>
                          {hierarchyGroups.map((formGroup) => (
                            <React.Fragment key={formGroup.id}>
                              {/* Direct sections (no subform) */}
                              {formGroup.directSections.map((sec) => (
                                <div
                                  key={`${formGroup.id}-direct-${sec.id}`}
                                  className="h-10 bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-800 border-r border-gray-300"
                                  style={{
                                    width: `${getGroupWidth(sec.fields)}px`,
                                  }}
                                >
                                  {sec.title || "Fields"}
                                </div>
                              ))}
                              {/* Subforms */}
                              {formGroup.subforms.map((sf) => {
                                const sfWidth = sf.sections.reduce(
                                  (sum, sec) => sum + getGroupWidth(sec.fields),
                                  0,
                                );
                                return (
                                  <div
                                    key={sf.id}
                                    className="h-10 bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-800 border-r border-gray-300"
                                    style={{ width: `${sfWidth}px` }}
                                  >
                                    {sf.name}
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </div>

                        {/* Header Row 4: Field Names */}
                        <div
                          className={cn(
                            "flex bg-slate-100 border-b border-gray-300 shadow-sm",
                            "sticky z-10",
                            isMergedMode && hierarchyGroups.length > 1
                              ? "top-[70px]"
                              : "top-[40px]",
                          )}
                        >
                          <div className="w-10 flex-shrink-0" />
                          <div className="w-12 flex-shrink-0" />
                          <div className="w-20 sm:w-24 flex-shrink-0" />

                          <SortableContext
                            items={displayedFields.map((f) => f.id)}
                            strategy={horizontalListSortingStrategy}
                          >
                            {hierarchyGroups.flatMap((formGroup) => [
                              ...formGroup.directSections.flatMap((sec) =>
                                sec.fields.map((field) => (
                                  <SortableColumnHeader
                                    key={field.id}
                                    field={field}
                                    columnWidths={columnWidths}
                                    handleResizeStart={handleResizeStart}
                                    isMergedMode={isMergedMode}
                                    getFieldIcon={getFieldIcon}
                                    recordSortField={recordSortField}
                                    recordSortOrder={recordSortOrder}
                                    activeFieldFilters={activeFieldFilters}
                                    handleOpenAdvancedFilterForColumn={
                                      handleOpenAdvancedFilterForColumn
                                    }
                                  />
                                )),
                              ),
                              ...formGroup.subforms.flatMap((sf) =>
                                sf.sections.flatMap((sec) =>
                                  sec.fields.map((field) => (
                                    <SortableColumnHeader
                                      key={field.id}
                                      field={field}
                                      columnWidths={columnWidths}
                                      handleResizeStart={handleResizeStart}
                                      isMergedMode={isMergedMode}
                                      getFieldIcon={getFieldIcon}
                                      recordSortField={recordSortField}
                                      recordSortOrder={recordSortOrder}
                                      activeFieldFilters={activeFieldFilters}
                                      handleOpenAdvancedFilterForColumn={
                                        handleOpenAdvancedFilterForColumn
                                      }
                                    />
                                  )),
                                ),
                              ),
                            ])}
                          </SortableContext>
                        </div>

                        {/* Data Rows */}
                        {paginatedRecords.length === 0 ? (
                          <div className="flex items-center justify-center py-12 text-gray-500">
                            <p className="text-sm font-medium">
                              No records found
                            </p>
                          </div>
                        ) : (
                          <>
                            {paginatedRecords.map((record, rowIndex) => {
                              const canEditThisRecord = canEditRecord(record);
                              const canDeleteThisRecord =
                                canDeleteRecord(record);
                              return (
                                <div
                                  key={record.id}
                                  className="flex hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all duration-200 min-w-max border-b border-gray-200 last:border-b-0"
                                >
                                  <div className="w-10 h-9 border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
                                    <Checkbox
                                      checked={selectedRecords.has(record.id)}
                                      onCheckedChange={(c) => {
                                        const newSel = new Set(selectedRecords);
                                        c
                                          ? newSel.add(record.id)
                                          : newSel.delete(record.id);
                                        setSelectedRecords(newSel);
                                      }}
                                      className="h-4 w-4"
                                    />
                                  </div>
                                  <div className="w-12 h-9 border-r border-gray-200 bg-gray-50 flex items-center justify-center text-xs font-semibold text-gray-700 flex-shrink-0">
                                    {startIdx + rowIndex + 1}
                                  </div>
                                  <div className="w-20 sm:w-24 h-9 border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          className="h-6 w-6 p-0 hover:bg-gray-200 rounded"
                                        >
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        className="w-44"
                                      >
                                        <DropdownMenuLabel className="text-xs font-bold">
                                          Actions
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-xs cursor-pointer"
                                          onClick={() =>
                                            handleViewDetails(record)
                                          }
                                        >
                                          <Eye className="h-4 w-4 mr-2" /> View
                                          Details
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className={cn(
                                            "text-xs text-red-600 cursor-pointer",
                                            !canDeleteThisRecord &&
                                            "text-gray-400 opacity-50",
                                          )}
                                          onClick={() =>
                                            handleOpenDeleteConfirm(record)
                                          }
                                          disabled={!canDeleteThisRecord}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />{" "}
                                          Delete Record
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                  {/* Data cells following hierarchy */}
                                  {hierarchyGroups.flatMap((formGroup) => [
                                    ...formGroup.directSections.flatMap((sec) =>
                                      sec.fields.map((fieldDef) => {
                                        const fieldData = getFieldData(
                                          record,
                                          fieldDef,
                                        );
                                        const pendingChange =
                                          pendingChanges.get(
                                            `${record.id}-${fieldDef.id}`,
                                          );
                                        const actualValue = pendingChange
                                          ? pendingChange.value
                                          : fieldData?.value || null;
                                        const displayText = pendingChange
                                          ? String(pendingChange.value ?? "")
                                          : fieldData?.displayValue || "";
                                        const isEditing =
                                          editingCell?.recordId === record.id &&
                                          editingCell?.fieldId === fieldDef.id;
                                        const cellKey = `${record.id}-${fieldDef.id}`;
                                        const isExpanded =
                                          expandedCells.has(cellKey);
                                        const columnWidth =
                                          columnWidths.get(fieldDef.id) || 192;
                                        const hasImages = Array.isArray(
                                          actualValue,
                                        )
                                          ? actualValue.some(isImageUrl)
                                          : isImageUrl(actualValue);
                                        const isImageColumn =
                                          isImageField(fieldDef.label) ||
                                          hasImages;
                                        const hasComments =
                                          (comments.get(cellKey) || []).length >
                                          0;

                                        return (
                                          <div
                                            key={cellKey}
                                            className={cn(
                                              "bg-white px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 relative",
                                              isWrapTextEnabled || isExpanded
                                                ? "h-auto min-h-[36px] py-2 items-start"
                                                : "h-9 items-center",
                                              selectedCell === cellKey &&
                                              "bg-blue-50/70 border-2 border-blue-500 shadow-sm z-10",
                                              isEditing &&
                                              "ring-2 ring-inset ring-blue-600 bg-blue-50 shadow-inner z-20",
                                              pendingChange &&
                                              !isEditing &&
                                              "bg-gradient-to-r from-yellow-50 to-amber-50 font-semibold",
                                              editMode !== "locked" &&
                                              !isEditing &&
                                              !isImageColumn &&
                                              "cursor-pointer hover:bg-gray-50",
                                              focusedCell === cellKey &&
                                              !isEditing &&
                                              "ring-1 ring-blue-300 ring-inset",
                                            )}
                                            style={{
                                              width: `${columnWidth}px`,
                                              boxShadow:
                                                "inset -1px 0 0 0 #e5e7eb",
                                            }}
                                            onClick={() => {
                                              if (
                                                !isEditing &&
                                                editMode !== "locked" &&
                                                !isImageColumn
                                              ) {
                                                setSelectedCell(cellKey);
                                                setFocusedCell(cellKey);
                                              }
                                            }}
                                            onPointerDown={(e) =>
                                              handleCellPointerDown(
                                                e,
                                                record,
                                                fieldDef,
                                              )
                                            }
                                            onContextMenu={(e) => {
                                              if (!isImageColumn) {
                                                e.preventDefault();
                                                setFocusedCell(cellKey);
                                                setActiveCommentCell(cellKey);
                                              }
                                            }}
                                          >
                                            <div
                                              className={cn(
                                                "w-full h-full flex items-center",
                                                isWrapTextEnabled || isExpanded
                                                  ? "items-start py-2"
                                                  : "",
                                              )}
                                            >
                                              {isEditing ? (
                                                renderFieldEditor(
                                                  record,
                                                  fieldDef,
                                                  actualValue,
                                                  displayText,
                                                )
                                              ) : isImageColumn ? (
                                                <div className="flex items-center gap-2 flex-wrap py-1">
                                                  {Array.isArray(
                                                    actualValue,
                                                  ) ? (
                                                    actualValue
                                                      .filter(isImageUrl)
                                                      .slice(0, 3)
                                                      .map(
                                                        (
                                                          url: string,
                                                          idx: number,
                                                        ) => (
                                                          <img
                                                            key={idx}
                                                            src={
                                                              url ||
                                                              "/placeholder.svg"
                                                            }
                                                            alt="Field data"
                                                            className="h-7 w-7 object-cover rounded border border-gray-300"
                                                            onError={(e) =>
                                                            (e.currentTarget.style.display =
                                                              "none")
                                                            }
                                                          />
                                                        ),
                                                      )
                                                  ) : isImageUrl(
                                                    actualValue,
                                                  ) ? (
                                                    <img
                                                      src={
                                                        actualValue ||
                                                        "/placeholder.svg"
                                                      }
                                                      alt="Field data"
                                                      className="h-7 w-7 object-cover rounded border border-gray-300"
                                                      onError={(e) =>
                                                      (e.currentTarget.style.display =
                                                        "none")
                                                      }
                                                    />
                                                  ) : (
                                                    <span className="text-xs text-gray-400">
                                                      No image
                                                    </span>
                                                  )}
                                                </div>
                                              ) : (
                                                <div className="relative group w-full h-full">
                                                  <div
                                                    className={cn(
                                                      "w-full text-sm text-gray-700 leading-tight py-2 uppercase-data",
                                                      isWrapTextEnabled ||
                                                        isExpanded
                                                        ? "whitespace-normal break-words"
                                                        : "whitespace-nowrap overflow-hidden text-ellipsis",
                                                    )}
                                                    style={getConditionalStyle(
                                                      fieldDef,
                                                      actualValue,
                                                      displayText,
                                                    )}
                                                    title={displayText}
                                                  >
                                                    {(displayText ?? "") === ""
                                                      ? "—"
                                                      : displayText}
                                                  </div>
                                                  {!isWrapTextEnabled &&
                                                    displayText &&
                                                    displayText.length > 40 && (
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          toggleCellExpansion(
                                                            cellKey,
                                                          );
                                                        }}
                                                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs rounded shadow-sm p-0.5 z-20"
                                                      >
                                                        {isExpanded ? (
                                                          <ChevronUp className="h-3 w-3" />
                                                        ) : (
                                                          <ChevronDown className="h-3 w-3" />
                                                        )}
                                                      </button>
                                                    )}
                                                </div>
                                              )}
                                            </div>
                                            {hasComments && (
                                              <div className="absolute top-0 right-0 group z-10">
                                                <button
                                                  className="bg-yellow-400 text-white p-0.5 rounded-bl text-xs"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveCommentCell(
                                                      cellKey,
                                                    );
                                                  }}
                                                >
                                                  <MessageSquare className="h-3 w-3" />
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }),
                                    ),
                                    ...formGroup.subforms.flatMap((sf) =>
                                      sf.sections.flatMap((sec) =>
                                        sec.fields.map((fieldDef) => {
                                          const fieldData = getFieldData(
                                            record,
                                            fieldDef,
                                          );
                                          const pendingChange =
                                            pendingChanges.get(
                                              `${record.id}-${fieldDef.id}`,
                                            );
                                          const actualValue = pendingChange
                                            ? pendingChange.value
                                            : fieldData?.value || null;
                                          const displayText = pendingChange
                                            ? String(pendingChange.value ?? "")
                                            : fieldData?.displayValue || "";
                                          const isEditing =
                                            editingCell?.recordId ===
                                            record.id &&
                                            editingCell?.fieldId ===
                                            fieldDef.id;
                                          const cellKey = `${record.id}-${fieldDef.id}`;
                                          const isExpanded =
                                            expandedCells.has(cellKey);
                                          const columnWidth =
                                            columnWidths.get(fieldDef.id) ||
                                            192;
                                          const hasImages = Array.isArray(
                                            actualValue,
                                          )
                                            ? actualValue.some(isImageUrl)
                                            : isImageUrl(actualValue);
                                          const isImageColumn =
                                            isImageField(fieldDef.label) ||
                                            hasImages;
                                          const hasComments =
                                            (comments.get(cellKey) || [])
                                              .length > 0;

                                          return (
                                            <div
                                              key={cellKey}
                                              className={cn(
                                                "bg-white px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 relative",
                                                isWrapTextEnabled || isExpanded
                                                  ? "h-auto min-h-[36px] py-2 items-start"
                                                  : "h-9 items-center",
                                                selectedCell === cellKey &&
                                                "bg-blue-50/70 border-2 border-blue-500 shadow-sm z-10",
                                                isEditing &&
                                                "ring-2 ring-inset ring-blue-600 bg-blue-50 shadow-inner z-20",
                                                pendingChange &&
                                                !isEditing &&
                                                "bg-gradient-to-r from-yellow-50 to-amber-50 font-semibold",
                                                editMode !== "locked" &&
                                                !isEditing &&
                                                !isImageColumn &&
                                                "cursor-pointer hover:bg-gray-50",
                                                focusedCell === cellKey &&
                                                !isEditing &&
                                                "ring-1 ring-blue-300 ring-inset",
                                              )}
                                              style={{
                                                width: `${columnWidth}px`,
                                                boxShadow:
                                                  "inset -1px 0 0 0 #e5e7eb",
                                              }}
                                              onClick={() => {
                                                if (
                                                  !isEditing &&
                                                  editMode !== "locked" &&
                                                  !isImageColumn
                                                ) {
                                                  setSelectedCell(cellKey);
                                                  setFocusedCell(cellKey);
                                                }
                                              }}
                                              onPointerDown={(e) =>
                                                handleCellPointerDown(
                                                  e,
                                                  record,
                                                  fieldDef,
                                                )
                                              }
                                              onContextMenu={(e) => {
                                                if (!isImageColumn) {
                                                  e.preventDefault();
                                                  setFocusedCell(cellKey);
                                                  setActiveCommentCell(cellKey);
                                                }
                                              }}
                                            >
                                              <div
                                                className={cn(
                                                  "w-full h-full flex items-center",
                                                  isWrapTextEnabled ||
                                                    isExpanded
                                                    ? "items-start py-2"
                                                    : "",
                                                )}
                                              >
                                                {isEditing ? (
                                                  renderFieldEditor(
                                                    record,
                                                    fieldDef,
                                                    actualValue,
                                                    displayText,
                                                  )
                                                ) : isImageColumn ? (
                                                  <div className="flex items-center gap-2 flex-wrap py-1">
                                                    {Array.isArray(
                                                      actualValue,
                                                    ) ? (
                                                      actualValue
                                                        .filter(isImageUrl)
                                                        .slice(0, 3)
                                                        .map(
                                                          (
                                                            url: string,
                                                            idx: number,
                                                          ) => (
                                                            <img
                                                              key={idx}
                                                              src={
                                                                url ||
                                                                "/placeholder.svg"
                                                              }
                                                              alt="Field data"
                                                              className="h-7 w-7 object-cover rounded border border-gray-300"
                                                              onError={(e) =>
                                                              (e.currentTarget.style.display =
                                                                "none")
                                                              }
                                                            />
                                                          ),
                                                        )
                                                    ) : isImageUrl(
                                                      actualValue,
                                                    ) ? (
                                                      <img
                                                        src={
                                                          actualValue ||
                                                          "/placeholder.svg"
                                                        }
                                                        alt="Field data"
                                                        className="h-7 w-7 object-cover rounded border border-gray-300"
                                                        onError={(e) =>
                                                        (e.currentTarget.style.display =
                                                          "none")
                                                        }
                                                      />
                                                    ) : (
                                                      <span className="text-xs text-gray-400">
                                                        No image
                                                      </span>
                                                    )}
                                                  </div>
                                                ) : fieldDef.id.startsWith(
                                                  "_dynamicRows_",
                                                ) &&
                                                  Array.isArray(actualValue) ? (
                                                  <div
                                                    className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setPreviewData({
                                                        isOpen: true,
                                                        rows: actualValue,
                                                        title: fieldDef.label,
                                                        fieldDefinitions:
                                                          fieldData?.fieldDefinitions,
                                                      });
                                                    }}
                                                  >
                                                    <div className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                                      <Layers className="h-3 w-3" />{" "}
                                                      {actualValue.length}
                                                    </div>
                                                    <span className="text-gray-400 text-xs truncate max-w-[120px] italic">
                                                      {displayText ||
                                                        "Click to view"}
                                                    </span>
                                                  </div>
                                                ) : (
                                                  <div className="relative group w-full h-full">
                                                    <div
                                                      className={cn(
                                                        "w-full text-sm text-gray-700 leading-tight py-2 uppercase-data",
                                                        isWrapTextEnabled ||
                                                          isExpanded
                                                          ? "whitespace-normal break-words"
                                                          : "whitespace-nowrap overflow-hidden text-ellipsis",
                                                      )}
                                                      style={getConditionalStyle(
                                                        fieldDef,
                                                        actualValue,
                                                        displayText,
                                                      )}
                                                      title={displayText}
                                                    >
                                                      {(displayText ?? "") ===
                                                        ""
                                                        ? "NaN"
                                                        : displayText}
                                                    </div>
                                                    {!isWrapTextEnabled &&
                                                      displayText &&
                                                      displayText.length >
                                                      40 && (
                                                        <button
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleCellExpansion(
                                                              cellKey,
                                                            );
                                                          }}
                                                          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs rounded shadow-sm p-0.5 z-20"
                                                        >
                                                          {isExpanded ? (
                                                            <ChevronUp className="h-3 w-3" />
                                                          ) : (
                                                            <ChevronDown className="h-3 w-3" />
                                                          )}
                                                        </button>
                                                      )}
                                                  </div>
                                                )}
                                              </div>
                                              {hasComments && (
                                                <div className="absolute top-0 right-0 group z-10">
                                                  <button
                                                    className="bg-yellow-400 text-white p-0.5 rounded-bl text-xs"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setActiveCommentCell(
                                                        cellKey,
                                                      );
                                                    }}
                                                  >
                                                    <MessageSquare className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        }),
                                      ),
                                    ),
                                  ])}
                                </div>
                              );
                            })}
                            {/* Dummy rows for filling space */}
                            {Array.from({ length: numDummyRows }).map(
                              (_, i) => (
                                <div
                                  key={`dummy-${i}`}
                                  className="flex h-9 border-b border-gray-200 bg-white min-w-max last:border-b-0"
                                >
                                  <div className="w-10 border-r border-gray-200 flex-shrink-0" />
                                  <div className="w-12 border-r border-gray-200 flex-shrink-0" />
                                  <div className="w-20 sm:w-24 border-r border-gray-200 flex-shrink-0" />
                                  {displayedFields.map((field) => (
                                    <div
                                      key={field.id}
                                      className="border-r border-gray-200 bg-white px-3 flex-shrink-0"
                                      style={{
                                        width: `${columnWidths.get(field.id) || 192}px`,
                                      }}
                                    />
                                  ))}
                                </div>
                              ),
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <DragOverlay>
                      {activeDragId ? (
                        <div className="bg-white shadow-2xl border-2 border-blue-500 rounded-lg px-4 py-2 opacity-90 font-medium">
                          {orderedFields.find((f) => f.id === activeDragId)
                            ?.label || "Column"}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                </div>
                <div className="border-t border-gray-300 bg-gray-50 px-4 py-2 flex items-center gap-1 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab("merged")}
                    className={cn(
                      "px-5 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap",
                      activeTab === "merged"
                        ? "bg-white text-blue-700 border-t-2 border-l border-r border-blue-500 shadow-sm -mt-px"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-200",
                    )}
                  >
                    Merged Data
                  </button>
                  {allModuleForms.map((form) => (
                    <button
                      key={form.id}
                      onClick={() => setActiveTab(form.id)}
                      className={cn(
                        "px-5 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap",
                        activeTab === form.id
                          ? "bg-white text-blue-700 border-t-2 border-l border-r border-blue-500 shadow-sm -mt-px"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-200",
                      )}
                    >
                      {form.name}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Manage Columns Dialog */}
          <Dialog
            open={isManageColumnsOpen}
            onOpenChange={setIsManageColumnsOpen}
          >
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Manage Columns</DialogTitle>
                <DialogDescription>
                  Select and reorder visible columns
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => {
                    if (e.over && e.active.id !== e.over.id) {
                      setOrderedFields((items) => {
                        const oldIndex = items.findIndex(
                          (f) => f.id === e.active.id,
                        );
                        const newIndex = items.findIndex(
                          (f) => f.id === e.over.id,
                        );
                        return arrayMove(items, oldIndex, newIndex);
                      });
                    }
                  }}
                >
                  <SortableContext
                    items={orderedFields.map((f) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {orderedFields.map((field) => (
                        <SortableColumnItem
                          key={field.id}
                          field={field}
                          isChecked={visibleFields.has(field.id)}
                          onToggle={() => toggleFieldVisibility(field.id)}
                          isMergedMode={isMergedMode}
                          getFieldIcon={getFieldIcon}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
              <DialogFooter>
                <Button onClick={() => setIsManageColumnsOpen(false)}>
                  Apply Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dynamic Data Preview Modal */}
          <DynamicDataPreviewModal
            isOpen={previewData.isOpen}
            onClose={() =>
              setPreviewData((prev) => ({ ...prev, isOpen: false }))
            }
            rows={previewData.rows}
            title={previewData.title}
            fieldDefinitions={previewData.fieldDefinitions}
            formFieldsWithSections={formFieldsWithSections}
          />

          {/* Delete Confirmation Dialog */}
          <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogDescription>
                  This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleConfirmDelete}>
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Comments Dialog */}
          <Dialog
            open={!!activeCommentCell}
            onOpenChange={() => setActiveCommentCell(null)}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Comments</DialogTitle>
              </DialogHeader>
              <div className="max-h-60 overflow-y-auto space-y-3">
                {comments.get(activeCommentCell || "")?.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 border border-gray-200 rounded-lg relative group/comment"
                  >
                    <button
                      onClick={() => requestDeleteComment(c.id)}
                      className="absolute top-2 right-2 opacity-0 group-hover/comment:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1 text-xs"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{c.author}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(c.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{c.text}</p>
                  </div>
                )) || <p className="text-sm text-gray-500">No comments yet.</p>}
              </div>
              <div className="mt-4">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full"
                />
              </div>
              <DialogFooter>
                <Button onClick={addComment}>Add Comment</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {viewDetailsOpen && selectedRecord && (
            <DynamicDataPreviewModal2
              isOpen={viewDetailsOpen}
              onClose={() => setViewDetailsOpen(false)}
              rows={[selectedRecord]}
              title={selectedRecord.title || "Record Details"}
              formFieldsWithSections={[]}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default RecordsDisplay;

function formatFormulaResult(value: any, returnType?: string): string {
  if (value === null || value === undefined) return "—";

  if (returnType === "number") {
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (returnType === "currency") {
    return `₹${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }
  if (returnType === "percent") {
    return `${Number(value).toFixed(2)}%`;
  }
  return String(value);
}
