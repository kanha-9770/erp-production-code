// "use client";
// import React, { useCallback } from "react";
// import { Card, CardContent } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Checkbox } from "@/components/ui/checkbox";
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuLabel,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { Eye, Pencil, Trash2, MoreHorizontal, Loader2 } from "lucide-react";
// import { cn } from "@/lib/utils";
// import { TooltipProvider } from "@/components/ui/tooltip";
// import { DndContext, closestCenter, DragOverlay } from "@dnd-kit/core";
// import {
//   arrayMove,
//   SortableContext,
//   verticalListSortingStrategy,
// } from "@dnd-kit/sortable";
// import AdvancedFilterSidebar from "./AdvancedFilterSidebar";
// import { PublicFormDialog } from "@/components/public-form-dialog";
// import { SubformPreviewModal } from "./SubformPreviewModal";
// import { SortableColumnItem } from "./SortableColumnItem";
// import { RecordTableToolbar } from "./RecordTableToolbar";
// import { RecordTableHeader } from "./RecordTableHeader";
// import { RecordCell } from "./RecordCell";
// import { isImageUrl, isImageField } from "@/lib/utils/fieldUtils";
// import { useRecordsDisplay } from "@/hooks/use-records-display";
// import { LookupField } from "@/components/forms/lookup-field";
// import {
//   useCreateSavedFilterMutation,
// } from "@/lib/api/saved-filters";

// import type {
//   ProcessedFieldData,
//   EnhancedFormRecord,
//   FormFieldWithSection,
//   EditingCell,
//   PendingChange,
//   FieldFilter,
//   User,
//   Comment,
//   ConditionalFormatRule,
//   Permission,
// } from "@/types/records";
// import type { Form } from "@/types/forms";

// // Re-export FieldFilter so existing consumers of this module are not broken
// export type { FieldFilter };

// interface RecordsDisplayProps {
//   allModuleForms: Form[];
//   formRecords: EnhancedFormRecord[];
//   formFieldsWithSections: FormFieldWithSection[];
//   recordSearchQuery: string;
//   recordsPerPage: number;
//   currentPage: number;
//   selectedRecords: Set<string>;
//   editMode: "locked" | "single-click" | "double-click";
//   editingCell: EditingCell | null;
//   pendingChanges: Map<string, PendingChange>;
//   savingChanges: boolean;
//   recordSortField: string;
//   recordSortOrder: "asc" | "desc";
//   setRecordSearchQuery: (query: string) => void;
//   setRecordsPerPage: (count: number) => void;
//   setCurrentPage: (page: number) => void;
//   setSelectedRecords: (records: Set<string>) => void;
//   setRecordSortField: (field: string) => void;
//   setRecordSortOrder: (order: "asc" | "desc") => void;
//   getFieldIcon: (fieldType: string) => any;
//   getEditModeInfo: () => {
//     icon: any;
//     label: string;
//     description: string;
//     color: string;
//   };
//   toggleEditMode: () => void;
//   saveAllPendingChanges: (
//     changesToSave?: Map<string, PendingChange>,
//   ) => Promise<void>;
//   discardAllPendingChanges: () => void;
//   setEditingCell: (cell: EditingCell | null) => void;
//   setPendingChanges: (changes: Map<string, PendingChange>) => void;
//   setFormRecords: (records: EnhancedFormRecord[]) => void;
//   onEditRecord: (record: EnhancedFormRecord) => void;
//   onDeleteRecord: (record: EnhancedFormRecord) => Promise<void>;
//   onBulkDeleteRecords?: (recordIds: string[]) => Promise<void>;
//   onViewDetails: (record: EnhancedFormRecord) => void;
//   permissions?: Permission[];
//   isAdmin?: boolean;
//   users?: User[];
// }

// /**
//  * Flatten structured or legacy recordData into a plain { fieldId: value } map.
//  * Handles three formats:
//  *   1. New structured: { sections: { sId: { fields: { fId: value } } }, subforms: { ... }, ... }
//  *   2. Legacy object:  { fieldId: { value, type, ... }, ... }
//  *   3. Flat:           { fieldId: value, ... }
//  */
// function flattenRecordData(recordData: Record<string, any> | null | undefined): Record<string, any> {
//   if (!recordData) return {};
//   const plain: Record<string, any> = {};

//   // Extract from structured sections
//   if (recordData.sections && typeof recordData.sections === "object") {
//     for (const section of Object.values(recordData.sections) as any[]) {
//       const fields = section?.fields;
//       if (fields && typeof fields === "object") {
//         for (const [fieldId, val] of Object.entries(fields)) {
//           plain[fieldId] = val && typeof val === "object" && "value" in val ? val.value : val;
//         }
//       }
//     }
//   }

//   // Extract from structured subforms (static fields + dynamic rows)
//   if (recordData.subforms && typeof recordData.subforms === "object") {
//     for (const subform of Object.values(recordData.subforms) as any[]) {
//       const fields = subform?.fields;
//       if (fields && typeof fields === "object") {
//         for (const [fieldId, val] of Object.entries(fields)) {
//           plain[fieldId] = val && typeof val === "object" && "value" in val ? val.value : val;
//         }
//       }
//       // Preserve dynamic rows data
//       if (Array.isArray(subform?.rows) && subform.rows.length > 0) {
//         // Dynamic rows are handled via _dynamicRows_ keys in usePublicForm
//       }
//     }
//   }

//   // Fallback: iterate top-level keys for legacy/flat records
//   const structuredKeys = new Set(["formId", "formName", "sections", "subforms", "metadata"]);
//   for (const [key, entry] of Object.entries(recordData)) {
//     if (structuredKeys.has(key)) continue;
//     if (plain[key] !== undefined) continue; // already extracted from sections
//     plain[key] = entry && typeof entry === "object" && "value" in entry ? entry.value : entry;
//   }

//   return plain;
// }

// // ============== MAIN COMPONENT ==============

// const RecordsDisplay: React.FC<RecordsDisplayProps> = ({
//   allModuleForms,
//   formRecords,
//   formFieldsWithSections,
//   recordSearchQuery,
//   recordsPerPage,
//   currentPage,
//   selectedRecords,
//   editMode,
//   editingCell,
//   pendingChanges,
//   savingChanges,
//   recordSortField,
//   recordSortOrder,
//   setRecordSearchQuery,
//   setRecordsPerPage,
//   setCurrentPage,
//   setSelectedRecords,
//   setRecordSortField,
//   setRecordSortOrder,
//   getFieldIcon,
//   saveAllPendingChanges,
//   setEditingCell,
//   setPendingChanges,
//   onEditRecord,
//   onDeleteRecord,
//   onBulkDeleteRecords,
//   onViewDetails,
//   permissions = [],
//   isAdmin = false,
//   users = [],
// }) => {
//   // ── Hook ─────────────────────────────────────────────────────────────────────
//   const {
//     tableContainerRef,
//     viewDetailsOpen,
//     setViewDetailsOpen,
//     selectedRecord,
//     columnWidths,
//     expandedCells,
//     numDummyRows,
//     isFilterSidebarOpen,
//     setIsFilterSidebarOpen,
//     activeFieldFilters,
//     setActiveFieldFilters,
//     selectedFieldForAdvancedFilter,
//     columnSearchFieldId,
//     setColumnSearchFieldId,
//     columnSearchValue,
//     setColumnSearchValue,
//     activeDragId,
//     deleteConfirmOpen,
//     setDeleteConfirmOpen,
//     previewData,
//     setPreviewData,
//     orderedFields,
//     setOrderedFields,
//     visibleFields,
//     isManageColumnsOpen,
//     setIsManageColumnsOpen,
//     isWrapTextEnabled,
//     setIsWrapTextEnabled,
//     activeTab,
//     setActiveTab,
//     focusedCell,
//     setFocusedCell,
//     selectedCell,
//     setSelectedCell,
//     comments,
//     setComments,
//     activeCommentCell,
//     setActiveCommentCell,
//     newComment,
//     setNewComment,
//     confirmDeleteCommentId,
//     conditionalRules,
//     setConditionalRules,
//     enhancedFormFields,
//     isMergedMode,
//     populatedRecordsWithPending,
//     paginatedRecords,
//     startIdx,
//     displayedFields,
//     hierarchyGroups,
//     canEditRecord,
//     canDeleteRecord,
//     canDeleteAny,
//     getFieldData,
//     getConditionalStyle,
//     recalculateFormulasForRecord,
//     handleResizeStart,
//     toggleCellExpansion,
//     toggleFieldVisibility,
//     toggleAllFieldsVisibility,
//     allFieldsVisible,
//     handleCellPointerDown,
//     handleOpenAdvancedFilterForColumn,
//     handleOpenDeleteConfirm,
//     handleConfirmDelete,
//     handleViewDetails,
//     addComment,
//     requestDeleteComment,
//     cancelDeleteComment,
//     deleteComment,
//     editingCommentId,
//     editingCommentText,
//     setEditingCommentText,
//     startEditComment,
//     saveEditComment,
//     cancelEditComment,
//     currentUserName,
//     sensors,
//     handleDragStart,
//     handleDragEnd,
//   } = useRecordsDisplay({
//     formRecords,
//     formFieldsWithSections,
//     recordSearchQuery,
//     recordsPerPage,
//     currentPage,
//     editMode,
//     editingCell,
//     pendingChanges,
//     savingChanges,
//     recordSortField,
//     recordSortOrder,
//     permissions,
//     isAdmin,
//     setCurrentPage,
//     setEditingCell,
//     setPendingChanges,
//     saveAllPendingChanges,
//     onDeleteRecord,
//     onViewDetails,
//   });

//   // ── Save filter from toolbar ──────────────────────────────────────────────────
//   const moduleId = allModuleForms[0]?.moduleId || allModuleForms[0]?.id || "";
//   const [createSavedFilter, { isLoading: isSavingFilter }] = useCreateSavedFilterMutation();
//   const [saveFilterDialogOpen, setSaveFilterDialogOpen] = React.useState(false);
//   const [saveFilterName, setSaveFilterName] = React.useState("");

//   const handleToolbarSaveFilter = useCallback(() => {
//     setSaveFilterName("");
//     setSaveFilterDialogOpen(true);
//   }, []);

//   const handleConfirmSaveFilter = useCallback(async () => {
//     if (!saveFilterName.trim() || !moduleId || activeFieldFilters.length === 0) return;
//     try {
//       await createSavedFilter({
//         name: saveFilterName.trim(),
//         moduleId,
//         filters: activeFieldFilters,
//       }).unwrap();
//       setSaveFilterDialogOpen(false);
//       setSaveFilterName("");
//     } catch (err) {
//       console.error("Failed to save filter:", err);
//     }
//   }, [saveFilterName, moduleId, activeFieldFilters, createSavedFilter]);

//   // ── Cell event callbacks ──────────────────────────────────────────────────────
//   const handleCellClick = useCallback(
//     (cellKey: string) => {
//       setSelectedCell(cellKey);
//       setFocusedCell(cellKey);
//     },
//     [setSelectedCell, setFocusedCell],
//   );
//   const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
//   const [editRecordOpen, setEditRecordOpen] = React.useState(false);
//   const [editingRecord, setEditingRecord] = React.useState<EnhancedFormRecord | null>(null);

//   const handleCellContextMenu = useCallback(
//     (cellKey: string) => {
//       setFocusedCell(cellKey);
//       setActiveCommentCell(cellKey);
//     },
//     [setFocusedCell, setActiveCommentCell],
//   );

//   const handlePreviewClick = useCallback(
//     (
//       rows: any[],
//       title: string,
//       fieldDefinitions?: { id: string; label: string; type: string }[],
//     ) => {
//       setPreviewData({ isOpen: true, rows, title, fieldDefinitions });
//     },
//     [setPreviewData],
//   );

//   const handleColumnSort = useCallback(
//     (fieldId: string) => {
//       if (recordSortField === fieldId) {
//         // Toggle order, or clear if already desc
//         if (recordSortOrder === "asc") {
//           setRecordSortOrder("desc");
//         } else {
//           setRecordSortField("");
//         }
//       } else {
//         setRecordSortField(fieldId);
//         setRecordSortOrder("asc");
//       }
//     },
//     [recordSortField, recordSortOrder, setRecordSortField, setRecordSortOrder],
//   );

//   const handleCommentClick = useCallback(
//     (cellKey: string) => {
//       setActiveCommentCell(cellKey);
//     },
//     [setActiveCommentCell],
//   );

//   // ── renderFieldEditor — keeps inline so it can close over hook state ─────────
//   const renderFieldEditor = (
//     record: EnhancedFormRecord,
//     fieldDef: FormFieldWithSection,
//     actualValue: any,
//     displayText: string,
//   ) => {
//     const fieldData = getFieldData(record, fieldDef);
//     const actualRecordId = fieldData?.recordId || record.id;
//     const pendingChange = pendingChanges.get(`${record.id}-${fieldDef.id}`);
//     const currentValue = pendingChange ? pendingChange.value : actualValue;
//     const originalValue = fieldData?.value ?? "";
//     const originalFieldId = fieldData?.fieldId || fieldDef.originalId;
//     const hasImages = Array.isArray(currentValue)
//       ? currentValue.some(isImageUrl)
//       : isImageUrl(currentValue);

//     if (isImageField(fieldDef.label) || hasImages) {
//       return (
//         <Input
//           value={displayText}
//           disabled
//           className="h-7 text-[10px] sm:text-xs p-1 bg-gray-100"
//         />
//       );
//     }

//     // ── Formula fields are read-only and show calculated values ──
//     if (fieldDef.type === "formula" && fieldDef.properties?.formulaConfig) {
//       return (
//         <Input
//           value={displayText}
//           readOnly
//           disabled
//           className="h-7 text-[10px] sm:text-xs p-1 bg-gray-100 cursor-not-allowed font-medium"
//         />
//       );
//     }

//     const handleAutoSave = () => {
//       const pendingKey = `${record.id}-${fieldDef.id}`;

//       // Try to read from pendingChanges first; if stale (React batching),
//       // construct the change from closure variables that are always current.
//       const pendingChange: PendingChange = pendingChanges.get(pendingKey) ?? {
//         recordId: actualRecordId,
//         fieldId: fieldDef.id,
//         originalFieldId: originalFieldId,
//         value: currentValue,
//         originalValue,
//         fieldType: fieldDef.type,
//         fieldLabel: fieldDef.label,
//         sectionId: fieldDef.sectionId,
//       };

//       // Nothing actually changed — skip save
//       if (
//         pendingChange.value === pendingChange.originalValue ||
//         (pendingChange.value === originalValue && !pendingChanges.has(pendingKey))
//       ) {
//         setEditingCell(null);
//         return;
//       }

//       // ── Step 1: build a record with the new value baked into processedData ──
//       const tempRecord: EnhancedFormRecord = {
//         ...record,
//         processedData: record.processedData.map((pd) =>
//           pd.fieldId === fieldDef.id ||
//             pd.fieldId === fieldDef.originalId ||
//             (pd.fieldLabel === fieldDef.label && pd.sectionId === fieldDef.sectionId)
//             ? { ...pd, value: pendingChange.value }
//             : pd,
//         ),
//       };

//       // ── Step 2: recalculate ALL formula fields using the updated record ──
//       const { updatedProcessedData } = recalculateFormulasForRecord(
//         tempRecord,
//         new Set(),
//       );

//       // ── Step 3: build saveMap — edited field + any changed formula fields ──
//       const saveMap = new Map<string, PendingChange>([
//         [pendingKey, pendingChange],
//       ]);

//       enhancedFormFields
//         .filter((f) => f.type === "formula" && f.properties?.formulaConfig)
//         .forEach((formulaField) => {
//           const recalcPd = updatedProcessedData.find(
//             (p) =>
//               p.fieldId === formulaField.id ||
//               p.fieldId === formulaField.originalId ||
//               (p.fieldLabel === formulaField.label && p.sectionId === formulaField.sectionId),
//           );

//           if (!recalcPd) return;

//           const existingPd = record.processedData.find(
//             (p) =>
//               p.fieldId === formulaField.id ||
//               p.fieldId === formulaField.originalId ||
//               (p.fieldLabel === formulaField.label && p.sectionId === formulaField.sectionId),
//           );

//           const oldValue = existingPd?.value ?? "";
//           const newValue = recalcPd.value;

//           const formulaKey = `${record.id}-${formulaField.id}`;
//           saveMap.set(formulaKey, {
//             recordId: record.id,
//             fieldId: formulaField.id,
//             originalFieldId: formulaField.originalId || formulaField.id,
//             value: newValue,
//             originalValue: oldValue,
//             fieldType: "formula",
//             fieldLabel: formulaField.label,
//             sectionId: formulaField.sectionId,
//           });
//         });

//       saveAllPendingChanges(saveMap);
//       setEditingCell(null);
//     };

//     if (!["lookup", "dropdown", "select"].includes(fieldDef.type)) {
//       let editValue = currentValue ?? "";

//       // ── Special case: Address field ──
//       if (
//         fieldDef.type === "address" &&
//         typeof currentValue === "object" &&
//         currentValue !== null
//       ) {
//         const addr = currentValue as Record<string, string>;
//         const parts: string[] = [];
//         if (addr.line1) parts.push(addr.line1.trim());
//         if (addr.line2) parts.push(addr.line2.trim());
//         if (addr.city) parts.push(addr.city.trim());
//         if (addr.state) parts.push(addr.state.trim());
//         if (addr.postal) parts.push(addr.postal.trim());
//         if (addr.country) parts.push(addr.country.trim());
//         editValue = parts.filter(Boolean).join(", ");
//       }

//       return (
//         <Input
//           value={editValue}
//           onChange={(e) => {
//             const newRawValue = e.target.value;
//             let finalValue: any = newRawValue;

//             if (fieldDef.type === "address") {
//               const parts = newRawValue
//                 .split(",")
//                 .map((p) => p.trim())
//                 .filter(Boolean);
//               finalValue = {
//                 line1: parts[0] || "",
//                 line2: parts[1] || "",
//                 city: parts[2] || "",
//                 state: parts[3] || "",
//                 postal: parts[4] || "",
//                 country: parts[5] || "",
//               };
//               if (Object.values(finalValue).every((v) => !v)) {
//                 finalValue = {};
//               }
//             }

//             const currentRecord = populatedRecordsWithPending.find(
//               (r: { id: string }) => r.id === record.id,
//             );
//             if (!currentRecord) {
//               console.warn("Record not found during edit:", record.id);
//               return;
//             }

//             const newPending = new Map(pendingChanges);
//             newPending.set(`${currentRecord.id}-${fieldDef.id}`, {
//               recordId: actualRecordId,
//               fieldId: fieldDef.id,
//               originalFieldId: originalFieldId,
//               value: finalValue,
//               originalValue,
//               fieldType: fieldDef.type,
//               fieldLabel: fieldDef.label,
//               sectionId: fieldDef.sectionId,
//             });

//             // ── REAL-TIME FORMULA CALCULATION ──
//             // Build temp record with the new value to recalculate formulas
//             const tempRecordForFormula: EnhancedFormRecord = {
//               ...currentRecord,
//               processedData: currentRecord.processedData.map((pd) => {
//                 // Check if this field matches the edited field
//                 if (
//                   pd.fieldId === fieldDef.id ||
//                   pd.fieldId === fieldDef.originalId ||
//                   (pd.fieldLabel === fieldDef.label && pd.sectionId === fieldDef.sectionId)
//                 ) {
//                   return { ...pd, value: finalValue };
//                 }
//                 // Apply other pending changes
//                 for (const [key, change] of newPending) {
//                   if (!key.startsWith(`${currentRecord.id}-`)) continue;
//                   if (
//                     pd.fieldId === change.fieldId ||
//                     pd.fieldId === change.originalFieldId ||
//                     (pd.fieldLabel === change.fieldLabel && pd.sectionId === change.sectionId)
//                   ) {
//                     return { ...pd, value: change.value };
//                   }
//                 }
//                 return pd;
//               }),
//             };

//             // Recalculate all formulas with the new values
//             const { updatedProcessedData } = recalculateFormulasForRecord(
//               tempRecordForFormula,
//               new Set(),
//             );

//             // Add updated formula values to pending changes
//             updatedProcessedData.forEach((pd) => {
//               if (pd.fieldType === "formula") {
//                 const oldPd = currentRecord.processedData.find(
//                   (p) => p.fieldId === pd.fieldId || (p.fieldLabel === pd.fieldLabel && p.sectionId === pd.sectionId),
//                 );
//                 const oldValue = oldPd?.value ?? "";
//                 // Add formula to pending changes if value changed OR if it's a new formula
//                 if (oldValue !== pd.value) {
//                   // Try to find the formula field using multiple matching strategies
//                   let formulaField = enhancedFormFields.find(
//                     (f) =>
//                       f.type === "formula" &&
//                       (f.id === pd.fieldId ||
//                         f.originalId === pd.fieldId ||
//                         (f.label === pd.fieldLabel && f.sectionId === pd.sectionId)),
//                   );

//                   // Fallback: match by label + sectionId if ID matching fails
//                   if (!formulaField && pd.fieldLabel) {
//                     formulaField = enhancedFormFields.find(
//                       (f) => f.type === "formula" && f.label === pd.fieldLabel && f.sectionId === pd.sectionId,
//                     );
//                   }

//                   if (formulaField) {
//                     const formulaKey = `${currentRecord.id}-${formulaField.id}`;
//                     newPending.set(formulaKey, {
//                       recordId: currentRecord.id,
//                       fieldId: formulaField.id,
//                       originalFieldId: formulaField.originalId || formulaField.id,
//                       value: pd.value,
//                       originalValue: oldValue,
//                       fieldType: "formula",
//                       fieldLabel: pd.fieldLabel || formulaField.label,
//                       sectionId: formulaField.sectionId,
//                     });
//                   }
//                 }
//               }
//             });

//             setPendingChanges(newPending);
//           }}
//           onBlur={handleAutoSave}
//           onKeyDown={(e) => {
//             if (e.key === "Enter") {
//               e.preventDefault();
//               handleAutoSave();
//             } else if (e.key === "Escape") {
//               const newPending = new Map(pendingChanges);
//               newPending.delete(`${record.id}-${fieldDef.id}`);
//               setPendingChanges(newPending);
//               setEditingCell(null);
//             }
//           }}
//           autoFocus
//           className="h-7 text-[10px] sm:text-xs p-1"
//           placeholder={
//             fieldDef.type === "address"
//               ? "e.g. 123 Main St, Jaipur, Rajasthan, 302001, India"
//               : ""
//           }
//         />
//       );
//     }

//     const fd = fieldDef as any;

//     // ── Lookup fields with sourceId: use LookupField component ──────────
//     if (fieldDef.type === "lookup" && fieldDef.lookup?.sourceId) {
//       const depConfig = fd.lookup?.dependency;
//       let parentVal: string | undefined;

//       if (depConfig?.parentFieldLabel || fd.isDependent) {
//         // Find parent field definition by parentFieldId or by parentFieldLabel
//         let parentFieldDef: any = null;
//         if (fd.parentFieldId) {
//           parentFieldDef = enhancedFormFields.find(
//             (f: any) => f.id === fd.parentFieldId || f.originalId === fd.parentFieldId,
//           );
//         }
//         if (!parentFieldDef && depConfig?.parentFieldLabel) {
//           parentFieldDef = enhancedFormFields.find(
//             (f: any) => f.label === depConfig.parentFieldLabel && f.id !== fieldDef.id,
//           );
//         }

//         if (parentFieldDef) {
//           // Check pendingChanges first for most up-to-date value
//           const parentPending = pendingChanges.get(`${record.id}-${parentFieldDef.id}`);
//           if (parentPending) {
//             parentVal = parentPending.value != null ? String(parentPending.value) : undefined;
//           } else if (record.processedData) {
//             const parentPd = record.processedData.find(
//               (pd: any) =>
//                 pd.fieldId === (parentFieldDef.originalId || parentFieldDef.id) ||
//                 pd.fieldLabel === parentFieldDef.label,
//             );
//             parentVal = parentPd?.value != null ? String(parentPd.value) : undefined;
//           }
//         }

//         // Final fallback: search processedData directly by label
//         if (parentVal === undefined && depConfig?.parentFieldLabel && record.processedData) {
//           const parentPd = record.processedData.find(
//             (pd: any) => pd.fieldLabel === depConfig.parentFieldLabel,
//           );
//           parentVal = parentPd?.value != null ? String(parentPd.value) : undefined;
//         }
//       }

//       return (
//         <div
//           className="w-full"
//           onClick={(e) => e.stopPropagation()}
//           onPointerDown={(e) => e.stopPropagation()}
//         >
//           <LookupField
//             field={{
//               id: fieldDef.originalId || fieldDef.id,
//               label: fieldDef.label,
//               type: fieldDef.type,
//               placeholder: fieldDef.placeholder,
//               description: fieldDef.description,
//               validation: fieldDef.validation || {},
//               lookup: { ...fieldDef.lookup, allowCustomValues: false },
//             }}
//             value={currentValue}
//             onChange={(newValue) => {
//               const change: PendingChange = {
//                 recordId: actualRecordId,
//                 fieldId: fieldDef.id,
//                 originalFieldId: originalFieldId,
//                 value: newValue,
//                 originalValue,
//                 fieldType: fieldDef.type,
//                 fieldLabel: fieldDef.label,
//                 sectionId: fieldDef.sectionId,
//               };

//               const newPending = new Map(pendingChanges);
//               newPending.set(`${record.id}-${fieldDef.id}`, change);

//               // Clear dependent children when this lookup changes
//               enhancedFormFields.forEach((childField: any) => {
//                 if (
//                   childField.id !== fieldDef.id &&
//                   ((childField.isDependent &&
//                     childField.parentFieldId === (fieldDef.originalId || fieldDef.id)) ||
//                     childField.lookup?.dependency?.parentFieldLabel === fieldDef.label)
//                 ) {
//                   const childChange: PendingChange = {
//                     recordId: actualRecordId,
//                     fieldId: childField.id,
//                     originalFieldId: childField.originalId || childField.id,
//                     value: null,
//                     originalValue: "",
//                     fieldType: childField.type,
//                     fieldLabel: childField.label,
//                     sectionId: childField.sectionId,
//                   };
//                   newPending.set(`${record.id}-${childField.id}`, childChange);
//                 }
//               });

//               setPendingChanges(newPending);

//               // Save immediately with explicit map — no setTimeout to avoid stale closures
//               saveAllPendingChanges(
//                 new Map([[`${record.id}-${fieldDef.id}`, change]]),
//               );
//             }}
//             parentValue={parentVal}
//           />
//         </div>
//       );
//     }

//     // ── Resolve options based on field configuration ────────────────────
//     let normalised: { value: string; label: string }[] = [];

//     if (fd.isDependent && fd.parentFieldId && fd.dependentGroups?.length) {
//       // Dependent/cascading dropdown: options come from dependentGroups
//       const parentFieldDef = enhancedFormFields.find(
//         (f: any) =>
//           f.id === fd.parentFieldId || f.originalId === fd.parentFieldId,
//       );
//       const parentLabel = parentFieldDef?.label;

//       const parentPd = record.processedData.find(
//         (pd) =>
//           pd.fieldId === fd.parentFieldId ||
//           (parentLabel && pd.fieldLabel === parentLabel) ||
//           (fd.parentFieldId && pd.fieldId.endsWith(fd.parentFieldId)),
//       );
//       const parentVal = parentPd?.value != null ? String(parentPd.value) : "";
//       const matchingGroup = (fd.dependentGroups as any[]).find(
//         (g) => String(g.parentValue) === parentVal,
//       );
//       if (matchingGroup?.options?.length) {
//         normalised = matchingGroup.options.map((opt: any) => ({
//           value: opt.value ?? opt.id ?? opt,
//           label: opt.label ?? opt.name ?? opt,
//         }));
//       }
//     } else {
//       // Regular dropdown / select
//       const rawOptions = fieldDef.options ?? [];
//       normalised = rawOptions.map((opt: any) => ({
//         value: opt.value ?? opt.id ?? opt,
//         label: opt.label ?? opt.name ?? opt,
//       }));
//     }

//     return (
//       <Select
//         value={currentValue?.toString() ?? ""}
//         onValueChange={(newValue) => {
//           const change: PendingChange = {
//             recordId: actualRecordId,
//             fieldId: fieldDef.id,
//             originalFieldId: originalFieldId,
//             value: newValue,
//             originalValue,
//             fieldType: fieldDef.type,
//             fieldLabel: fieldDef.label,
//             sectionId: fieldDef.sectionId,
//           };

//           const newPending = new Map(pendingChanges);
//           newPending.set(`${record.id}-${fieldDef.id}`, change);

//           // ── REAL-TIME FORMULA CALCULATION ──
//           const tempRecordForFormula: EnhancedFormRecord = {
//             ...record,
//             processedData: record.processedData.map((pd) => {
//               if (
//                 pd.fieldId === fieldDef.id ||
//                 pd.fieldId === fieldDef.originalId ||
//                 (pd.fieldLabel === fieldDef.label && pd.sectionId === fieldDef.sectionId)
//               ) {
//                 return { ...pd, value: newValue };
//               }
//               for (const [key, chg] of newPending) {
//                 if (!key.startsWith(`${record.id}-`)) continue;
//                 if (
//                   pd.fieldId === chg.fieldId ||
//                   pd.fieldId === chg.originalFieldId ||
//                   (pd.fieldLabel === chg.fieldLabel && pd.sectionId === chg.sectionId)
//                 ) {
//                   return { ...pd, value: chg.value };
//                 }
//               }
//               return pd;
//             }),
//           };

//           const { updatedProcessedData } = recalculateFormulasForRecord(
//             tempRecordForFormula,
//             new Set(),
//           );

//           updatedProcessedData.forEach((pd) => {
//             if (pd.fieldType === "formula") {
//               const oldPd = record.processedData.find(
//                 (p) => p.fieldId === pd.fieldId || (p.fieldLabel === pd.fieldLabel && p.sectionId === pd.sectionId),
//               );
//               const oldValue = oldPd?.value ?? "";

//               // Add formula to pending changes if value changed OR if it's a new formula
//               if (oldValue !== pd.value) {
//                 // Try to find the formula field using multiple matching strategies
//                 let formulaField = enhancedFormFields.find(
//                   (f) =>
//                     f.type === "formula" &&
//                     (f.id === pd.fieldId ||
//                       f.originalId === pd.fieldId ||
//                       (f.label === pd.fieldLabel && f.sectionId === pd.sectionId)),
//                 );

//                 // Fallback: match by label + sectionId if ID matching fails
//                 if (!formulaField && pd.fieldLabel) {
//                   formulaField = enhancedFormFields.find(
//                     (f) => f.type === "formula" && f.label === pd.fieldLabel && f.sectionId === pd.sectionId,
//                   );
//                 }

//                 if (formulaField) {
//                   const formulaKey = `${record.id}-${formulaField.id}`;
//                   newPending.set(formulaKey, {
//                     recordId: record.id,
//                     fieldId: formulaField.id,
//                     originalFieldId: formulaField.originalId || formulaField.id,
//                     value: pd.value,
//                     originalValue: oldValue,
//                     fieldType: "formula",
//                     fieldLabel: pd.fieldLabel || formulaField.label,
//                     sectionId: formulaField.sectionId,
//                   });
//                 }
//               }
//             }
//           });

//           setPendingChanges(newPending);

//           // Save immediately with updated formula values
//           saveAllPendingChanges(newPending);
//         }}
//         onOpenChange={(open) => !open && setEditingCell(null)}
//       >
//         <SelectTrigger className="h-7 text-[10px] sm:text-xs p-1">
//           <SelectValue placeholder="— Select —" />
//         </SelectTrigger>
//         <SelectContent>
//           <SelectItem value="__none__">— None —</SelectItem>
//           {normalised.map((opt: any) => (
//             <SelectItem key={opt.value} value={opt.value.toString()}>
//               {opt.label}
//             </SelectItem>
//           ))}
//         </SelectContent>
//       </Select>
//     );
//   };

//   // ============== RENDER ==============

//   return (
//     <TooltipProvider>
//       <div className="flex h-full min-h-0 bg-gray-50 overflow-x-hidden overflow-y-hidden">
//         {/* Advanced Filter Sidebar */}
//         <AdvancedFilterSidebar
//           isOpen={isFilterSidebarOpen}
//           onClose={() => setIsFilterSidebarOpen(false)}
//           fields={
//             orderedFields.length > 0 ? orderedFields : formFieldsWithSections
//           }
//           filters={activeFieldFilters}
//           onFiltersChange={(newFilters) => {
//             setActiveFieldFilters(newFilters);
//             setCurrentPage(1);
//           }}
//           isMergedMode={isMergedMode}
//           preselectedFieldId={selectedFieldForAdvancedFilter}
//           onColumnSearch={(fieldId, searchValue) => {
//             setColumnSearchFieldId(fieldId);
//             setColumnSearchValue(searchValue);
//           }}
//           records={formRecords}
//         />

//         <div className="flex-1 flex flex-col min-h-0 min-w-0">
//           <Card className="border-none rounded-none shadow-none bg-transparent overflow-hidden flex-1 flex flex-col">
//             <CardContent className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
//               {/* Toolbar */}
//               <RecordTableToolbar
//                 isFilterSidebarOpen={isFilterSidebarOpen}
//                 setIsFilterSidebarOpen={setIsFilterSidebarOpen}
//                 activeFieldFilters={activeFieldFilters}
//                 recordSearchQuery={recordSearchQuery}
//                 setRecordSearchQuery={setRecordSearchQuery}
//                 recordsPerPage={recordsPerPage}
//                 setRecordsPerPage={setRecordsPerPage}
//                 conditionalRules={conditionalRules}
//                 setConditionalRules={setConditionalRules}
//                 formFieldsWithSections={formFieldsWithSections}
//                 isWrapTextEnabled={isWrapTextEnabled}
//                 setIsWrapTextEnabled={setIsWrapTextEnabled}
//                 setIsManageColumnsOpen={setIsManageColumnsOpen}
//                 recordSortField={recordSortField}
//                 recordSortOrder={recordSortOrder}
//                 setRecordSortField={setRecordSortField}
//                 setRecordSortOrder={setRecordSortOrder}
//                 onSaveFilter={handleToolbarSaveFilter}
//                 canSaveFilter={activeFieldFilters.length > 0 && !!moduleId}
//                 moduleId={moduleId || undefined}
//                 onApplySavedFilter={(filters) => {
//                   setActiveFieldFilters(filters);
//                   setCurrentPage(1);
//                 }}
//               />

//               <div className="border border-gray-200 bg-white rounded-xl overflow-hidden shadow-lg flex-1 flex flex-col">
//                 <div
//                   className="flex-1 overflow-y-auto overflow-x-scroll min-h-0"
//                   ref={tableContainerRef}
//                 >
//                   <DndContext
//                     sensors={sensors}
//                     collisionDetection={closestCenter}
//                     onDragStart={handleDragStart}
//                     onDragEnd={handleDragEnd}
//                   >
//                     <div className="inline-block min-w-max">
//                       <div>
//                         {/* Header rows */}
//                         <RecordTableHeader
//                           isMergedMode={isMergedMode}
//                           hierarchyGroups={hierarchyGroups}
//                           displayedFields={displayedFields}
//                           columnWidths={columnWidths}
//                           selectedRecords={selectedRecords}
//                           paginatedRecords={paginatedRecords}
//                           setSelectedRecords={setSelectedRecords}
//                           recordSortField={recordSortField}
//                           recordSortOrder={recordSortOrder}
//                           activeFieldFilters={activeFieldFilters}
//                           handleResizeStart={handleResizeStart}
//                           handleOpenAdvancedFilterForColumn={
//                             handleOpenAdvancedFilterForColumn
//                           }
//                           canBulkDelete={canDeleteAny}
//                           onSort={handleColumnSort}
//                           // ✅ Proper bulk delete that opens popup
//                           onDeleteSelected={() => {
//                             if (selectedRecords.size > 0) {
//                               setBulkDeleteOpen(true);
//                             }
//                           }}
//                         />

//                         {/* Data Rows */}
//                         {paginatedRecords.length === 0 ? (
//                           <div className="flex items-center justify-center py-12 text-gray-500">
//                             <p className="text-sm font-medium">
//                               No records found
//                             </p>
//                           </div>
//                         ) : (
//                           <>
//                             {paginatedRecords.map((record, rowIndex) => {
//                               const canEditThisRecord = canEditRecord(record);
//                               const canDeleteThisRecord =
//                                 canDeleteRecord(record);
//                               return (
//                                 <div
//                                   key={record.id}
//                                   className="flex hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all duration-200 min-w-max border-b border-gray-200 last:border-b-0"
//                                 >
//                                   {/* Checkbox */}
//                                   <div className="w-10 h-8 border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
//                                     <Checkbox
//                                       checked={selectedRecords.has(record.id)}
//                                       onCheckedChange={(c) => {
//                                         const newSel = new Set(selectedRecords);
//                                         c
//                                           ? newSel.add(record.id)
//                                           : newSel.delete(record.id);
//                                         setSelectedRecords(newSel);
//                                       }}
//                                       className="h-4 w-4"
//                                     />
//                                   </div>

//                                   {/* Row number */}
//                                   <div className="w-12 h-8 border-r border-gray-200 bg-gray-50 flex items-center justify-center text-xs font-semibold text-gray-700 flex-shrink-0">
//                                     {startIdx + rowIndex + 1}
//                                   </div>

//                                   {/* Row actions */}
//                                   <div className="w-20 sm:w-24 h-8 border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
//                                     <DropdownMenu>
//                                       <DropdownMenuTrigger asChild>
//                                         <Button
//                                           variant="ghost"
//                                           className="h-6 w-6 p-0 hover:bg-gray-200 rounded"
//                                         >
//                                           <MoreHorizontal className="h-4 w-4" />
//                                         </Button>
//                                       </DropdownMenuTrigger>
//                                       <DropdownMenuContent
//                                         align="end"
//                                         className="w-44"
//                                       >
//                                         <DropdownMenuLabel className="text-xs font-bold">
//                                           Actions
//                                         </DropdownMenuLabel>
//                                         <DropdownMenuSeparator />
//                                         <DropdownMenuItem
//                                           className="text-xs cursor-pointer"
//                                           onClick={() =>
//                                             handleViewDetails(record)
//                                           }
//                                         >
//                                           <Eye className="h-4 w-4 mr-2" /> View
//                                           Details
//                                         </DropdownMenuItem>
//                                         <DropdownMenuItem
//                                           className={cn(
//                                             "text-xs cursor-pointer",
//                                             !canEditThisRecord &&
//                                             "text-gray-400 opacity-50",
//                                           )}
//                                           onClick={() => {
//                                             if (canEditThisRecord) {
//                                               setEditingRecord(record);
//                                               setEditRecordOpen(true);
//                                             }
//                                           }}
//                                           disabled={!canEditThisRecord}
//                                         >
//                                           <Pencil className="h-4 w-4 mr-2" />{" "}
//                                           Edit Record
//                                         </DropdownMenuItem>
//                                         <DropdownMenuItem
//                                           className={cn(
//                                             "text-xs text-red-600 cursor-pointer",
//                                             !canDeleteThisRecord &&
//                                             "text-gray-400 opacity-50",
//                                           )}
//                                           onClick={() =>
//                                             handleOpenDeleteConfirm(record)
//                                           }
//                                           disabled={!canDeleteThisRecord}
//                                         >
//                                           <Trash2 className="h-4 w-4 mr-2" />{" "}
//                                           Delete Record
//                                         </DropdownMenuItem>
//                                       </DropdownMenuContent>
//                                     </DropdownMenu>
//                                   </div>

//                                   {/* Data cells following hierarchy */}
//                                   {hierarchyGroups.flatMap((formGroup) => [
//                                     ...formGroup.directSections.flatMap((sec) =>
//                                       sec.fields.map((fieldDef) => (
//                                         <RecordCell
//                                           key={`${record.id}-${fieldDef.id}`}
//                                           record={record}
//                                           fieldDef={fieldDef}
//                                           fieldData={getFieldData(
//                                             record,
//                                             fieldDef,
//                                           )}
//                                           pendingChange={pendingChanges.get(
//                                             `${record.id}-${fieldDef.id}`,
//                                           )}
//                                           editingCell={editingCell}
//                                           expandedCells={expandedCells}
//                                           columnWidth={
//                                             columnWidths.get(fieldDef.id) || 192
//                                           }
//                                           isWrapTextEnabled={isWrapTextEnabled}
//                                           editMode={editMode}
//                                           canEdit={canEditThisRecord}
//                                           selectedCell={selectedCell}
//                                           focusedCell={focusedCell}
//                                           comments={comments}
//                                           getConditionalStyle={
//                                             getConditionalStyle
//                                           }
//                                           handleCellPointerDown={
//                                             handleCellPointerDown
//                                           }
//                                           renderFieldEditor={renderFieldEditor}
//                                           onCellClick={handleCellClick}
//                                           onContextMenu={handleCellContextMenu}
//                                           onPreviewClick={handlePreviewClick}
//                                           onCommentClick={handleCommentClick}
//                                           toggleCellExpansion={
//                                             toggleCellExpansion
//                                           }
//                                         />
//                                       )),
//                                     ),
//                                     ...formGroup.subforms.flatMap((sf) =>
//                                       sf.sections.flatMap((sec) =>
//                                         sec.fields.map((fieldDef) => (
//                                           <RecordCell
//                                             key={`${record.id}-${fieldDef.id}`}
//                                             record={record}
//                                             fieldDef={fieldDef}
//                                             fieldData={getFieldData(
//                                               record,
//                                               fieldDef,
//                                             )}
//                                             pendingChange={pendingChanges.get(
//                                               `${record.id}-${fieldDef.id}`,
//                                             )}
//                                             editingCell={editingCell}
//                                             expandedCells={expandedCells}
//                                             columnWidth={
//                                               columnWidths.get(fieldDef.id) ||
//                                               192
//                                             }
//                                             isWrapTextEnabled={
//                                               isWrapTextEnabled
//                                             }
//                                             editMode={editMode}
//                                             canEdit={canEditThisRecord}
//                                             selectedCell={selectedCell}
//                                             focusedCell={focusedCell}
//                                             comments={comments}
//                                             getConditionalStyle={
//                                               getConditionalStyle
//                                             }
//                                             handleCellPointerDown={
//                                               handleCellPointerDown
//                                             }
//                                             renderFieldEditor={
//                                               renderFieldEditor
//                                             }
//                                             onCellClick={handleCellClick}
//                                             onContextMenu={
//                                               handleCellContextMenu
//                                             }
//                                             onPreviewClick={handlePreviewClick}
//                                             onCommentClick={handleCommentClick}
//                                             toggleCellExpansion={
//                                               toggleCellExpansion
//                                             }
//                                           />
//                                         )),
//                                       ),
//                                     ),
//                                   ])}
//                                 </div>
//                               );
//                             })}

//                             {/* Dummy rows for filling space */}
//                             {Array.from({ length: numDummyRows }).map(
//                               (_, i) => (
//                                 <div
//                                   key={`dummy-${i}`}
//                                   className="flex h-8 border-b border-gray-200 bg-white min-w-max last:border-b-0"
//                                 >
//                                   <div className="w-10 border-r border-gray-200 flex-shrink-0" />
//                                   <div className="w-12 border-r border-gray-200 flex-shrink-0" />
//                                   <div className="w-20 sm:w-24 border-r border-gray-200 flex-shrink-0" />
//                                   {displayedFields.map((field) => (
//                                     <div
//                                       key={field.id}
//                                       className="border-r border-gray-200 bg-white px-3 flex-shrink-0"
//                                       style={{
//                                         width: `${columnWidths.get(field.id) || 192}px`,
//                                       }}
//                                     />
//                                   ))}
//                                 </div>
//                               ),
//                             )}
//                           </>
//                         )}
//                       </div>
//                     </div>

//                     <DragOverlay>
//                       {activeDragId ? (
//                         <div className="bg-white shadow-2xl border-2 border-blue-500 rounded-lg px-4 py-2 opacity-90 font-medium">
//                           {orderedFields.find((f) => f.id === activeDragId)
//                             ?.label || "Column"}
//                         </div>
//                       ) : null}
//                     </DragOverlay>
//                   </DndContext>
//                 </div>

//                 {/* Tab bar */}
//                 <div className="border-t border-gray-300 bg-gray-50 px-4 pt-2 flex items-center gap-1 overflow-x-auto">
//                   <button
//                     onClick={() => setActiveTab("merged")}
//                     className={cn(
//                       "px-5 py-1 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap",
//                       activeTab === "merged"
//                         ? "bg-white text-blue-700 border-t-2 border-l border-r border-blue-500 shadow-sm -mt-px"
//                         : "text-gray-600 hover:text-gray-900 hover:bg-gray-200",
//                     )}
//                   >
//                     Merged Data
//                   </button>
//                   {allModuleForms.map((form) => (
//                     <button
//                       key={form.id}
//                       onClick={() => setActiveTab(form.id)}
//                       className={cn(
//                         "px-5 py-1 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap",
//                         activeTab === form.id
//                           ? "bg-white text-blue-700 border-t-2 border-l border-r border-blue-500 shadow-sm -mt-px"
//                           : "text-gray-600 hover:text-gray-900 hover:bg-gray-200",
//                       )}
//                     >
//                       {form.name}
//                     </button>
//                   ))}
//                 </div>
//               </div>
//             </CardContent>
//           </Card>

//           {/* Manage Columns Dialog */}
//           <Dialog
//             open={isManageColumnsOpen}
//             onOpenChange={setIsManageColumnsOpen}
//           >
//             <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
//               <DialogHeader>
//                 <DialogTitle>Manage Columns</DialogTitle>
//                 <DialogDescription>
//                   Select and reorder visible columns
//                 </DialogDescription>
//               </DialogHeader>
//               <div className="space-y-4 py-4">
//                 {/* Select All row */}
//                 <div className="flex items-center justify-between border-b pb-3">
//                   <div className="flex items-center gap-2">
//                     <Checkbox
//                       id="select-all-columns"
//                       checked={allFieldsVisible}
//                       onCheckedChange={toggleAllFieldsVisibility}
//                     />
//                     <label
//                       htmlFor="select-all-columns"
//                       className="text-sm font-medium cursor-pointer select-none"
//                     >
//                       {allFieldsVisible ? "Deselect All" : "Select All"}
//                     </label>
//                   </div>
//                   <span className="text-xs text-muted-foreground">
//                     {visibleFields.size} / {orderedFields.length} visible
//                   </span>
//                 </div>

//                 <DndContext
//                   sensors={sensors}
//                   collisionDetection={closestCenter}
//                   onDragEnd={(e) => {
//                     if (e.over && e.active.id !== e.over.id) {
//                       setOrderedFields((items) => {
//                         const oldIndex = items.findIndex(
//                           (f) => f.id === e.active.id,
//                         );
//                         const newIndex = items.findIndex(
//                           (f) => f.id === e.over!.id,
//                         );
//                         return arrayMove(items, oldIndex, newIndex);
//                       });
//                     }
//                   }}
//                 >
//                   <SortableContext
//                     items={orderedFields.map((f) => f.id)}
//                     strategy={verticalListSortingStrategy}
//                   >
//                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                       {orderedFields.map((field) => (
//                         <SortableColumnItem
//                           key={field.id}
//                           field={field}
//                           isChecked={visibleFields.has(field.id)}
//                           onToggle={() => toggleFieldVisibility(field.id)}
//                           isMergedMode={isMergedMode}
//                           getFieldIcon={getFieldIcon}
//                         />
//                       ))}
//                     </div>
//                   </SortableContext>
//                 </DndContext>
//               </div>
//               <DialogFooter>
//                 <Button onClick={() => setIsManageColumnsOpen(false)}>
//                   Apply Changes
//                 </Button>
//               </DialogFooter>
//             </DialogContent>
//           </Dialog>

//           {/* Bulk Delete Confirmation Popup */}
//           <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
//             <DialogContent>
//               <DialogHeader>
//                 <DialogTitle>Delete Selected Records</DialogTitle>
//                 <DialogDescription className="text-base">
//                   Are you sure you want to permanently delete{" "}
//                   <span className="font-semibold text-red-600">
//                     {selectedRecords.size}
//                   </span>{" "}
//                   selected record(s)?
//                   <br />
//                   This action cannot be undone.
//                 </DialogDescription>
//               </DialogHeader>

//               <DialogFooter>
//                 <Button
//                   variant="outline"
//                   onClick={() => setBulkDeleteOpen(false)}
//                 >
//                   Cancel
//                 </Button>

//                 <Button
//                   variant="destructive"
//                   onClick={async () => {
//                     const recordIds = Array.from(selectedRecords);
//                     setBulkDeleteOpen(false);
//                     setSelectedRecords(new Set());

//                     if (onBulkDeleteRecords) {
//                       await onBulkDeleteRecords(recordIds);
//                     } else {
//                       // Fallback: sequential delete
//                       for (const recordId of recordIds) {
//                         const record = formRecords.find((r) => r.id === recordId);
//                         if (!record) continue;
//                         try {
//                           await onDeleteRecord(record);
//                         } catch (error) {
//                           console.error(`Failed to delete record ${recordId}:`, error);
//                         }
//                       }
//                     }
//                   }}
//                 >
//                   Yes, Delete {selectedRecords.size} Records
//                 </Button>
//               </DialogFooter>
//             </DialogContent>
//           </Dialog>

//           {/* Subform Preview Modal */}
//           <SubformPreviewModal
//             isOpen={previewData.isOpen}
//             onClose={() =>
//               setPreviewData((prev) => ({ ...prev, isOpen: false }))
//             }
//             rows={previewData.rows}
//             title={previewData.title}
//             fieldDefinitions={previewData.fieldDefinitions}
//             formFieldsWithSections={formFieldsWithSections}
//           />

//           {/* Delete Confirmation Dialog */}
//           <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
//             <DialogContent>
//               <DialogHeader>
//                 <DialogTitle>Confirm Delete</DialogTitle>
//                 <DialogDescription>
//                   This action cannot be undone.
//                 </DialogDescription>
//               </DialogHeader>
//               <DialogFooter>
//                 <Button
//                   variant="outline"
//                   onClick={() => setDeleteConfirmOpen(false)}
//                 >
//                   Cancel
//                 </Button>
//                 <Button variant="destructive" onClick={handleConfirmDelete}>
//                   Delete
//                 </Button>
//               </DialogFooter>
//             </DialogContent>
//           </Dialog>

//           {/* Comments Dialog */}
//           <Dialog
//             open={!!activeCommentCell}
//             onOpenChange={() => setActiveCommentCell(null)}
//           >
//             <DialogContent className="max-w-md">
//               <DialogHeader>
//                 <DialogTitle>Comments</DialogTitle>
//               </DialogHeader>
//               <div className="max-h-60 overflow-y-auto space-y-3">
//                 {comments.get(activeCommentCell || "")?.map((c) => {
//                   const isOwner = c.author === currentUserName;
//                   const isEditing = editingCommentId === c.id;
//                   return (
//                     <div
//                       key={c.id}
//                       className="p-3 border border-gray-200 rounded-lg relative group/comment"
//                     >
//                       {isOwner && !isEditing && (
//                         <div className="absolute top-2 right-2 opacity-0 group-hover/comment:opacity-100 transition-opacity flex gap-1">
//                           <button
//                             onClick={() => startEditComment(c)}
//                             className="bg-blue-500 hover:bg-blue-600 text-white rounded-full p-1 text-xs"
//                             title="Edit comment"
//                           >
//                             <Pencil className="h-3 w-3" />
//                           </button>
//                           <button
//                             onClick={() => deleteComment(c.id)}
//                             className="bg-red-500 hover:bg-red-600 text-white rounded-full p-1 text-xs"
//                             title="Delete comment"
//                           >
//                             <Trash2 className="h-3 w-3" />
//                           </button>
//                         </div>
//                       )}
//                       <div className="flex items-center justify-between">
//                         <span className="font-medium text-sm">{c.author}</span>
//                         <span className="text-xs text-gray-500">
//                           {new Date(c.timestamp).toLocaleString()}
//                         </span>
//                       </div>
//                       {isEditing ? (
//                         <div className="mt-1 space-y-2">
//                           <Input
//                             value={editingCommentText}
//                             onChange={(e) => setEditingCommentText(e.target.value)}
//                             className="w-full text-sm"
//                           />
//                           <div className="flex gap-2">
//                             <Button size="sm" onClick={saveEditComment}>
//                               Save
//                             </Button>
//                             <Button size="sm" variant="outline" onClick={cancelEditComment}>
//                               Cancel
//                             </Button>
//                           </div>
//                         </div>
//                       ) : (
//                         <p className="text-sm mt-1">{c.text}</p>
//                       )}
//                     </div>
//                   );
//                 }) || <p className="text-sm text-gray-500">No comments yet.</p>}
//               </div>
//               <div className="mt-4">
//                 <Input
//                   value={newComment}
//                   onChange={(e) => setNewComment(e.target.value)}
//                   placeholder="Add a comment..."
//                   className="w-full"
//                 />
//               </div>
//               <DialogFooter>
//                 <Button onClick={addComment}>Add Comment</Button>
//               </DialogFooter>
//             </DialogContent>
//           </Dialog>

//           {/* View Details — opens the public form dialog in view-only mode */}
//           {viewDetailsOpen && selectedRecord && (() => {
//             const plainData = flattenRecordData(selectedRecord.recordData);
//             return (
//               <PublicFormDialog
//                 formId={selectedRecord.formId}
//                 isOpen={viewDetailsOpen}
//                 onClose={() => setViewDetailsOpen(false)}
//                 initialRecordData={plainData}
//                 forceViewOnly
//               />
//             );
//           })()}

//           {/* Edit Record — opens the public form dialog in editable mode */}
//           {editRecordOpen && editingRecord && (() => {
//             const plainData = flattenRecordData(editingRecord.recordData);
//             return (
//               <PublicFormDialog
//                 formId={editingRecord.formId}
//                 isOpen={editRecordOpen}
//                 onClose={() => setEditRecordOpen(false)}
//                 initialRecordData={plainData}
//                 editingRecordId={editingRecord.id}
//               />
//             );
//           })()}
//         </div>
//       </div>

//       {/* Save Filter Dialog */}
//       <Dialog open={saveFilterDialogOpen} onOpenChange={(open) => {
//         if (!isSavingFilter) setSaveFilterDialogOpen(open);
//       }}>
//         <DialogContent className="sm:max-w-[400px]">
//           <DialogHeader>
//             <DialogTitle className="text-sm">Save Current Filter</DialogTitle>
//             <DialogDescription className="text-xs text-gray-500">
//               Give this filter a name to quickly apply it later.
//               {activeFieldFilters.length > 0 && (
//                 <span className="block mt-1 text-indigo-600 font-medium">
//                   {activeFieldFilters.length} active filter{activeFieldFilters.length > 1 ? "s" : ""} will be saved.
//                 </span>
//               )}
//             </DialogDescription>
//           </DialogHeader>
//           <Input
//             placeholder="e.g. High priority leads, Active customers..."
//             value={saveFilterName}
//             onChange={(e) => setSaveFilterName(e.target.value)}
//             className="h-9 text-sm"
//             onKeyDown={(e) => {
//               if (e.key === "Enter" && saveFilterName.trim() && !isSavingFilter) {
//                 handleConfirmSaveFilter();
//               }
//             }}
//             disabled={isSavingFilter}
//             autoFocus
//           />
//           <DialogFooter>
//             <Button
//               variant="outline"
//               size="sm"
//               onClick={() => setSaveFilterDialogOpen(false)}
//               disabled={isSavingFilter}
//             >
//               Cancel
//             </Button>
//             <Button
//               size="sm"
//               onClick={handleConfirmSaveFilter}
//               disabled={!saveFilterName.trim() || isSavingFilter}
//             >
//               {isSavingFilter && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
//               {isSavingFilter ? "Saving..." : "Save Filter"}
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </TooltipProvider>
//   );
// };

// export default RecordsDisplay;


"use client";

import React, { useCallback, useEffect } from "react";
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
import { Eye, Pencil, Trash2, MoreHorizontal, Loader2, User, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DndContext, closestCenter, DragOverlay } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import AdvancedFilterSidebar from "./AdvancedFilterSidebar";
import { PublicFormDialog } from "@/components/public-form-dialog";
import { SubformPreviewModal } from "./SubformPreviewModal";
import { SortableColumnItem } from "./SortableColumnItem";
import { RecordTableToolbar } from "./RecordTableToolbar";
import { RecordTableHeader } from "./RecordTableHeader";
import { RecordCell } from "./RecordCell";
import { isImageUrl, isImageField } from "@/lib/utils/fieldUtils";
import { useRecordsDisplay } from "@/hooks/use-records-display";
import { LookupField } from "@/components/forms/lookup-field";
import {
  useCreateSavedFilterMutation,
} from "@/lib/api/saved-filters";
import type {
  EnhancedFormRecord,
  FormFieldWithSection,
  EditingCell,
  PendingChange,
  FieldFilter,
  User,
  Permission,
} from "@/types/records";
import type { Form } from "@/types/forms";

// Re-export FieldFilter so existing consumers of this module are not broken
export type { FieldFilter };

interface RecordsDisplayProps {
  allModuleForms: Form[];
  formRecords: EnhancedFormRecord[];
  formFieldsWithSections: FormFieldWithSection[];
  recordSearchQuery: string;
  selectedFormFilter: string;
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
  setSelectedFormFilter: (filter: string) => void;
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
  onBulkDeleteRecords?: (recordIds: string[]) => Promise<void>;
  onViewDetails: (record: EnhancedFormRecord) => void;
  permissions?: Permission[];
  isAdmin?: boolean;
  users?: User[];
}

/**
 * Flatten structured or legacy recordData into a plain { fieldId: value } map.
 */
function flattenRecordData(recordData: Record<string, any> | null | undefined): Record<string, any> {
  if (!recordData) return {};
  const plain: Record<string, any> = {};
  if (recordData.sections && typeof recordData.sections === "object") {
    for (const section of Object.values(recordData.sections) as any[]) {
      const fields = section?.fields;
      if (fields && typeof fields === "object") {
        for (const [fieldId, val] of Object.entries(fields)) {
          plain[fieldId] = val && typeof val === "object" && "value" in val ? val.value : val;
        }
      }
    }
  }
  if (recordData.subforms && typeof recordData.subforms === "object") {
    for (const subform of Object.values(recordData.subforms) as any[]) {
      const fields = subform?.fields;
      if (fields && typeof fields === "object") {
        for (const [fieldId, val] of Object.entries(fields)) {
          plain[fieldId] = val && typeof val === "object" && "value" in val ? val.value : val;
        }
      }
    }
  }
  const structuredKeys = new Set(["formId", "formName", "sections", "subforms", "metadata"]);
  for (const [key, entry] of Object.entries(recordData)) {
    if (structuredKeys.has(key)) continue;
    if (plain[key] !== undefined) continue;
    plain[key] = entry && typeof entry === "object" && "value" in entry ? entry.value : entry;
  }
  return plain;
}

// Audit field definitions
const AUDIT_FIELDS: FormFieldWithSection[] = [
  {
    id: "__createdAt",
    label: "Created At",
    type: "datetime",
    sectionId: null,
    originalId: null,
    isSystem: true,
  },
  {
    id: "__createdBy",
    label: "Created By",
    type: "user",
    sectionId: null,
    originalId: null,
    isSystem: true,
  },
  {
    id: "__updatedAt",
    label: "Updated At",
    type: "datetime",
    sectionId: null,
    originalId: null,
    isSystem: true,
  },
  {
    id: "__updatedBy",
    label: "Updated By",
    type: "user",
    sectionId: null,
    originalId: null,
    isSystem: true,
  },
];

// Helper: Always show actual user name, never raw user ID
const getUserDisplayName = (users: User[], userId?: string | null): string => {
  if (!userId) return "—";
  const user = users.find((u) => u.id === userId);
  if (!user) return "Unknown User";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.email || user.username || "Unknown User";
};

const formatDateTime = (dateValue: any): string => {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// ============== MAIN COMPONENT ==============
const RecordsDisplay: React.FC<RecordsDisplayProps> = ({
  allModuleForms,
  formRecords,
  formFieldsWithSections,
  recordSearchQuery,
  selectedFormFilter,
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
  setSelectedFormFilter,
  setRecordsPerPage,
  setCurrentPage,
  setSelectedRecords,
  setRecordSortField,
  setRecordSortOrder,
  getFieldIcon,
  getEditModeInfo,
  toggleEditMode,
  saveAllPendingChanges,
  discardAllPendingChanges,
  setEditingCell,
  setPendingChanges,
  setFormRecords,
  onEditRecord,
  onDeleteRecord,
  onBulkDeleteRecords,
  onViewDetails,
  permissions = [],
  isAdmin = false,
  users = [],
}) => {
  const {
    tableContainerRef,
    viewDetailsOpen,
    setViewDetailsOpen,
    selectedRecord,
    columnWidths,
    expandedCells,
    expandedSubforms,
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
    previewData,
    setPreviewData,
    orderedFields,
    setOrderedFields,
    visibleFields,
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
    conditionalRules,
    setConditionalRules,
    enhancedFormFields,
    isMergedMode,
    populatedRecordsWithPending,
    paginatedRecords,
    startIdx,
    hierarchyGroups,
    canEditRecord,
    canDeleteRecord,
    canDeleteAny,
    getFieldData,
    getConditionalStyle,
    recalculateFormulasForRecord,
    handleResizeStart,
    toggleCellExpansion,
    toggleSubformExpansion,
    toggleFieldVisibility,
    toggleAllFieldsVisibility,
    allFieldsVisible,
    handleCellPointerDown,
    handleOpenAdvancedFilterForColumn,
    handleOpenDeleteConfirm,
    handleConfirmDelete,
    handleViewDetails,
    addComment,
    deleteComment,
    editingCommentId,
    editingCommentText,
    setEditingCommentText,
    startEditComment,
    saveEditComment,
    cancelEditComment,
    currentUserName,
    sensors,
    handleDragStart,
    handleDragEnd,
  } = useRecordsDisplay({
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
  });

  // Persist showAuditFields using localStorage so it survives page refresh
  const [showAuditFields, setShowAuditFields] = React.useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showAuditFields");
      return saved === "true";
    }
    return false;
  });

  // Save to localStorage whenever showAuditFields changes
  useEffect(() => {
    localStorage.setItem("showAuditFields", showAuditFields.toString());
  }, [showAuditFields]);

  // Regular fields only (for Manage Columns dialog)
  const allDisplayableFields = React.useMemo(() => {
    return orderedFields.length > 0 ? orderedFields : formFieldsWithSections;
  }, [orderedFields, formFieldsWithSections]);

  // Combined fields for HEADER, DATA ROWS, and DUMMY ROWS
  const allFieldsForTable = React.useMemo(() => {
    const regularFields = orderedFields.length > 0 ? orderedFields : formFieldsWithSections;
    return showAuditFields ? [...regularFields, ...AUDIT_FIELDS] : regularFields;
  }, [orderedFields, formFieldsWithSections, showAuditFields]);

  const moduleId = allModuleForms[0]?.moduleId || allModuleForms[0]?.id || "";

  const [createSavedFilter, { isLoading: isSavingFilter }] = useCreateSavedFilterMutation();

  const [saveFilterDialogOpen, setSaveFilterDialogOpen] = React.useState(false);
  const [saveFilterName, setSaveFilterName] = React.useState("");

  const handleToolbarSaveFilter = useCallback(() => {
    setSaveFilterName("");
    setSaveFilterDialogOpen(true);
  }, []);

  const handleConfirmSaveFilter = useCallback(async () => {
    if (!saveFilterName.trim() || !moduleId || activeFieldFilters.length === 0) return;
    try {
      await createSavedFilter({
        name: saveFilterName.trim(),
        moduleId,
        filters: activeFieldFilters,
      }).unwrap();
      setSaveFilterDialogOpen(false);
      setSaveFilterName("");
    } catch (err) {
      console.error("Failed to save filter:", err);
    }
  }, [saveFilterName, moduleId, activeFieldFilters, createSavedFilter]);

  const handleCellClick = useCallback(
    (cellKey: string) => {
      setSelectedCell(cellKey);
      setFocusedCell(cellKey);
    },
    [setSelectedCell, setFocusedCell],
  );

  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [editRecordOpen, setEditRecordOpen] = React.useState(false);
  const [editingRecord, setEditingRecord] = React.useState<EnhancedFormRecord | null>(null);

  const handleCellContextMenu = useCallback(
    (cellKey: string) => {
      setFocusedCell(cellKey);
      setActiveCommentCell(cellKey);
    },
    [setFocusedCell, setActiveCommentCell],
  );

  const handlePreviewClick = useCallback(
    (rows: any[], title: string, fieldDefinitions?: { id: string; label: string; type: string }[]) => {
      setPreviewData({ isOpen: true, rows, title, fieldDefinitions });
    },
    [setPreviewData],
  );

  const handleColumnSort = useCallback(
    (fieldId: string) => {
      if (recordSortField === fieldId) {
        if (recordSortOrder === "asc") {
          setRecordSortOrder("desc");
        } else {
          setRecordSortField("");
        }
      } else {
        setRecordSortField(fieldId);
        setRecordSortOrder("asc");
      }
    },
    [recordSortField, recordSortOrder, setRecordSortField, setRecordSortOrder],
  );

  const handleCommentClick = useCallback(
    (cellKey: string) => {
      setActiveCommentCell(cellKey);
    },
    [setActiveCommentCell],
  );

  // renderFieldEditor
  const renderFieldEditor = (
    record: EnhancedFormRecord,
    fieldDef: FormFieldWithSection,
    actualValue: any,
    displayText: string,
  ) => {
    if (fieldDef.id?.startsWith("__")) {
      let displayValue = "—";
      if (fieldDef.id === "__createdAt") {
        displayValue = formatDateTime(record.createdAt || record.submittedAt);
      }
      if (fieldDef.id === "__updatedAt") {
        displayValue = formatDateTime(record.updatedAt);
      }
      if (fieldDef.id === "__createdBy") {
        displayValue = getUserDisplayName(users, record.userId || record.submittedBy);
      }
      if (fieldDef.id === "__updatedBy") {
        displayValue = getUserDisplayName(users, record.userId);
      }
      return (
        <Input
          value={displayValue}
          disabled
          className="h-7 text-[10px] sm:text-xs p-1 bg-gray-100 cursor-not-allowed"
        />
      );
    }

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

    if (fieldDef.type === "formula" && fieldDef.properties?.formulaConfig) {
      return (
        <Input
          value={displayText}
          readOnly
          disabled
          className="h-7 text-[10px] sm:text-xs p-1 bg-gray-100 cursor-not-allowed font-medium"
        />
      );
    }

    const handleAutoSave = () => {
      const pendingKey = `${record.id}-${fieldDef.id}`;
      const pendingChangeObj: PendingChange = pendingChanges.get(pendingKey) ?? {
        recordId: actualRecordId,
        fieldId: fieldDef.id,
        originalFieldId: originalFieldId,
        value: currentValue,
        originalValue,
        fieldType: fieldDef.type,
        fieldLabel: fieldDef.label,
        sectionId: fieldDef.sectionId,
      };

      if (
        pendingChangeObj.value === pendingChangeObj.originalValue ||
        (pendingChangeObj.value === originalValue && !pendingChanges.has(pendingKey))
      ) {
        setEditingCell(null);
        return;
      }

      const tempRecord: EnhancedFormRecord = {
        ...record,
        processedData: record.processedData.map((pd) =>
          pd.fieldId === fieldDef.id ||
            pd.fieldId === fieldDef.originalId ||
            (pd.fieldLabel === fieldDef.label && pd.sectionId === fieldDef.sectionId)
            ? { ...pd, value: pendingChangeObj.value }
            : pd,
        ),
      };

      const { updatedProcessedData } = recalculateFormulasForRecord(tempRecord, new Set());
      const saveMap = new Map<string, PendingChange>([[pendingKey, pendingChangeObj]]);

      enhancedFormFields
        .filter((f) => f.type === "formula" && f.properties?.formulaConfig)
        .forEach((formulaField) => {
          const recalcPd = updatedProcessedData.find(
            (p) =>
              p.fieldId === formulaField.id ||
              p.fieldId === formulaField.originalId ||
              (p.fieldLabel === formulaField.label && p.sectionId === formulaField.sectionId)
          );
          if (!recalcPd) return;

          const existingPd = record.processedData.find(
            (p) =>
              p.fieldId === formulaField.id ||
              p.fieldId === formulaField.originalId ||
              (p.fieldLabel === formulaField.label && p.sectionId === formulaField.sectionId)
          );
          const oldValue = existingPd?.value ?? "";
          const newValue = recalcPd.value;
          const formulaKey = `${record.id}-${formulaField.id}`;

          saveMap.set(formulaKey, {
            recordId: record.id,
            fieldId: formulaField.id,
            originalFieldId: formulaField.originalId || formulaField.id,
            value: newValue,
            originalValue: oldValue,
            fieldType: "formula",
            fieldLabel: formulaField.label,
            sectionId: formulaField.sectionId,
          });
        });

      saveAllPendingChanges(saveMap);
      setEditingCell(null);
    };

    if (!["lookup", "dropdown", "select"].includes(fieldDef.type)) {
      let editValue = currentValue ?? "";
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
              const parts = newRawValue.split(",").map((p) => p.trim()).filter(Boolean);
              finalValue = {
                line1: parts[0] || "",
                line2: parts[1] || "",
                city: parts[2] || "",
                state: parts[3] || "",
                postal: parts[4] || "",
                country: parts[5] || "",
              };
              if (Object.values(finalValue).every((v) => !v)) finalValue = {};
            }

            const currentRecord = populatedRecordsWithPending.find(
              (r: { id: string }) => r.id === record.id
            );
            if (!currentRecord) return;

            const newPending = new Map(pendingChanges);
            newPending.set(`${currentRecord.id}-${fieldDef.id}`, {
              recordId: actualRecordId,
              fieldId: fieldDef.id,
              originalFieldId: originalFieldId,
              value: finalValue,
              originalValue,
              fieldType: fieldDef.type,
              fieldLabel: fieldDef.label,
              sectionId: fieldDef.sectionId,
            });

            const tempRecordForFormula: EnhancedFormRecord = {
              ...currentRecord,
              processedData: currentRecord.processedData.map((pd) => {
                if (
                  pd.fieldId === fieldDef.id ||
                  pd.fieldId === fieldDef.originalId ||
                  (pd.fieldLabel === fieldDef.label && pd.sectionId === fieldDef.sectionId)
                ) {
                  return { ...pd, value: finalValue };
                }
                for (const [key, change] of newPending) {
                  if (!key.startsWith(`${currentRecord.id}-`)) continue;
                  if (
                    pd.fieldId === change.fieldId ||
                    pd.fieldId === change.originalFieldId ||
                    (pd.fieldLabel === change.fieldLabel && pd.sectionId === change.sectionId)
                  ) {
                    return { ...pd, value: change.value };
                  }
                }
                return pd;
              }),
            };

            const { updatedProcessedData } = recalculateFormulasForRecord(tempRecordForFormula, new Set());

            updatedProcessedData.forEach((pd) => {
              if (pd.fieldType === "formula") {
                const oldPd = currentRecord.processedData.find(
                  (p) => p.fieldId === pd.fieldId || (p.fieldLabel === pd.fieldLabel && p.sectionId === pd.sectionId)
                );
                const oldValue = oldPd?.value ?? "";
                if (oldValue !== pd.value) {
                  let formulaField = enhancedFormFields.find(
                    (f) =>
                      f.type === "formula" &&
                      (f.id === pd.fieldId ||
                        f.originalId === pd.fieldId ||
                        (f.label === pd.fieldLabel && f.sectionId === pd.sectionId))
                  );
                  if (!formulaField && pd.fieldLabel) {
                    formulaField = enhancedFormFields.find(
                      (f) => f.type === "formula" && f.label === pd.fieldLabel && f.sectionId === pd.sectionId
                    );
                  }
                  if (formulaField) {
                    const formulaKey = `${currentRecord.id}-${formulaField.id}`;
                    newPending.set(formulaKey, {
                      recordId: currentRecord.id,
                      fieldId: formulaField.id,
                      originalFieldId: formulaField.originalId || formulaField.id,
                      value: pd.value,
                      originalValue: oldValue,
                      fieldType: "formula",
                      fieldLabel: pd.fieldLabel || formulaField.label,
                      sectionId: formulaField.sectionId,
                    });
                  }
                }
              }
            });

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

    const fd = fieldDef as any;

    if (fieldDef.type === "lookup" && fieldDef.lookup?.sourceId) {
      const depConfig = fd.lookup?.dependency;
      let parentVal: string | undefined;

      if (depConfig?.parentFieldLabel || fd.isDependent) {
        let parentFieldDef: any = null;
        if (fd.parentFieldId) {
          parentFieldDef = enhancedFormFields.find(
            (f: any) => f.id === fd.parentFieldId || f.originalId === fd.parentFieldId
          );
        }
        if (!parentFieldDef && depConfig?.parentFieldLabel) {
          parentFieldDef = enhancedFormFields.find(
            (f: any) => f.label === depConfig.parentFieldLabel && f.id !== fieldDef.id
          );
        }
        if (parentFieldDef) {
          const parentPending = pendingChanges.get(`${record.id}-${parentFieldDef.id}`);
          if (parentPending) {
            parentVal = parentPending.value != null ? String(parentPending.value) : undefined;
          } else if (record.processedData) {
            const parentPd = record.processedData.find(
              (pd: any) =>
                pd.fieldId === (parentFieldDef.originalId || parentFieldDef.id) ||
                pd.fieldLabel === parentFieldDef.label
            );
            parentVal = parentPd?.value != null ? String(parentPd.value) : undefined;
          }
        }
        if (parentVal === undefined && depConfig?.parentFieldLabel && record.processedData) {
          const parentPd = record.processedData.find(
            (pd: any) => pd.fieldLabel === depConfig.parentFieldLabel
          );
          parentVal = parentPd?.value != null ? String(parentPd.value) : undefined;
        }
      }

      return (
        <div
          className="w-full"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <LookupField
            field={{
              id: fieldDef.originalId || fieldDef.id,
              label: fieldDef.label,
              type: fieldDef.type,
              placeholder: fieldDef.placeholder,
              description: fieldDef.description,
              validation: fieldDef.validation || {},
              lookup: { ...fieldDef.lookup, allowCustomValues: false },
            }}
            value={currentValue}
            onChange={(newValue) => {
              const change: PendingChange = {
                recordId: actualRecordId,
                fieldId: fieldDef.id,
                originalFieldId: originalFieldId,
                value: newValue,
                originalValue,
                fieldType: fieldDef.type,
                fieldLabel: fieldDef.label,
                sectionId: fieldDef.sectionId,
              };
              const newPending = new Map(pendingChanges);
              newPending.set(`${record.id}-${fieldDef.id}`, change);

              enhancedFormFields.forEach((childField: any) => {
                if (
                  childField.id !== fieldDef.id &&
                  ((childField.isDependent &&
                    childField.parentFieldId === (fieldDef.originalId || fieldDef.id)) ||
                    childField.lookup?.dependency?.parentFieldLabel === fieldDef.label)
                ) {
                  const childChange: PendingChange = {
                    recordId: actualRecordId,
                    fieldId: childField.id,
                    originalFieldId: childField.originalId || childField.id,
                    value: null,
                    originalValue: "",
                    fieldType: childField.type,
                    fieldLabel: childField.label,
                    sectionId: childField.sectionId,
                  };
                  newPending.set(`${record.id}-${childField.id}`, childChange);
                }
              });

              setPendingChanges(newPending);
              saveAllPendingChanges(new Map([[`${record.id}-${fieldDef.id}`, change]]));
            }}
            parentValue={parentVal}
          />
        </div>
      );
    }

    let normalised: { value: string; label: string }[] = [];
    if (fd.isDependent && fd.parentFieldId && fd.dependentGroups?.length) {
      const parentFieldDef = enhancedFormFields.find(
        (f: any) =>
          f.id === fd.parentFieldId || f.originalId === fd.parentFieldId
      );
      const parentLabel = parentFieldDef?.label;
      const parentPd = record.processedData.find(
        (pd) =>
          pd.fieldId === fd.parentFieldId ||
          (parentLabel && pd.fieldLabel === parentLabel) ||
          (fd.parentFieldId && pd.fieldId.endsWith(fd.parentFieldId))
      );
      const parentVal = parentPd?.value != null ? String(parentPd.value) : "";
      const matchingGroup = (fd.dependentGroups as any[]).find(
        (g) => String(g.parentValue) === parentVal
      );
      if (matchingGroup?.options?.length) {
        normalised = matchingGroup.options.map((opt: any) => ({
          value: opt.value ?? opt.id ?? opt,
          label: opt.label ?? opt.name ?? opt,
        }));
      }
    } else {
      const rawOptions = fieldDef.options ?? [];
      normalised = rawOptions.map((opt: any) => ({
        value: opt.value ?? opt.id ?? opt,
        label: opt.label ?? opt.name ?? opt,
      }));
    }

    return (
      <Select
        value={currentValue?.toString() ?? ""}
        onValueChange={(newValue) => {
          const change: PendingChange = {
            recordId: actualRecordId,
            fieldId: fieldDef.id,
            originalFieldId: originalFieldId,
            value: newValue,
            originalValue,
            fieldType: fieldDef.type,
            fieldLabel: fieldDef.label,
            sectionId: fieldDef.sectionId,
          };
          const newPending = new Map(pendingChanges);
          newPending.set(`${record.id}-${fieldDef.id}`, change);

          const tempRecordForFormula: EnhancedFormRecord = {
            ...record,
            processedData: record.processedData.map((pd) => {
              if (
                pd.fieldId === fieldDef.id ||
                pd.fieldId === fieldDef.originalId ||
                (pd.fieldLabel === fieldDef.label && pd.sectionId === fieldDef.sectionId)
              ) {
                return { ...pd, value: newValue };
              }
              for (const [key, chg] of newPending) {
                if (!key.startsWith(`${record.id}-`)) continue;
                if (
                  pd.fieldId === chg.fieldId ||
                  pd.fieldId === chg.originalFieldId ||
                  (pd.fieldLabel === chg.fieldLabel && pd.sectionId === chg.sectionId)
                ) {
                  return { ...pd, value: chg.value };
                }
              }
              return pd;
            }),
          };

          const { updatedProcessedData } = recalculateFormulasForRecord(tempRecordForFormula, new Set());

          updatedProcessedData.forEach((pd) => {
            if (pd.fieldType === "formula") {
              const oldPd = record.processedData.find(
                (p) => p.fieldId === pd.fieldId || (p.fieldLabel === pd.fieldLabel && p.sectionId === pd.sectionId)
              );
              const oldValue = oldPd?.value ?? "";
              if (oldValue !== pd.value) {
                let formulaField = enhancedFormFields.find(
                  (f) =>
                    f.type === "formula" &&
                    (f.id === pd.fieldId ||
                      f.originalId === pd.fieldId ||
                      (f.label === pd.fieldLabel && f.sectionId === pd.sectionId))
                );
                if (!formulaField && pd.fieldLabel) {
                  formulaField = enhancedFormFields.find(
                    (f) => f.type === "formula" && f.label === pd.fieldLabel && f.sectionId === pd.sectionId
                  );
                }
                if (formulaField) {
                  const formulaKey = `${record.id}-${formulaField.id}`;
                  newPending.set(formulaKey, {
                    recordId: record.id,
                    fieldId: formulaField.id,
                    originalFieldId: formulaField.originalId || formulaField.id,
                    value: pd.value,
                    originalValue: oldValue,
                    fieldType: "formula",
                    fieldLabel: pd.fieldLabel || formulaField.label,
                    sectionId: formulaField.sectionId,
                  });
                }
              }
            }
          });

          setPendingChanges(newPending);
          saveAllPendingChanges(newPending);
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

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 bg-gray-50 overflow-x-hidden overflow-y-hidden">
        <AdvancedFilterSidebar
          isOpen={isFilterSidebarOpen}
          onClose={() => setIsFilterSidebarOpen(false)}
          fields={allDisplayableFields}
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
          records={formRecords}
        />

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <Card className="border-none rounded-none shadow-none bg-transparent overflow-hidden flex-1 flex flex-col">
            <CardContent className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
              <RecordTableToolbar
                isFilterSidebarOpen={isFilterSidebarOpen}
                setIsFilterSidebarOpen={setIsFilterSidebarOpen}
                activeFieldFilters={activeFieldFilters}
                recordSearchQuery={recordSearchQuery}
                setRecordSearchQuery={setRecordSearchQuery}
                recordsPerPage={recordsPerPage}
                setRecordsPerPage={setRecordsPerPage}
                conditionalRules={conditionalRules}
                setConditionalRules={setConditionalRules}
                formFieldsWithSections={formFieldsWithSections}
                isWrapTextEnabled={isWrapTextEnabled}
                setIsWrapTextEnabled={setIsWrapTextEnabled}
                setIsManageColumnsOpen={setIsManageColumnsOpen}
                recordSortField={recordSortField}
                recordSortOrder={recordSortOrder}
                setRecordSortField={setRecordSortField}
                setRecordSortOrder={setRecordSortOrder}
                onSaveFilter={handleToolbarSaveFilter}
                canSaveFilter={activeFieldFilters.length > 0 && !!moduleId}
                moduleId={moduleId || undefined}
                onApplySavedFilter={(filters) => {
                  setActiveFieldFilters(filters);
                  setCurrentPage(1);
                }}
              />

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
                        <RecordTableHeader
                          isMergedMode={isMergedMode}
                          hierarchyGroups={hierarchyGroups}
                          displayedFields={allFieldsForTable}
                          columnWidths={columnWidths}
                          selectedRecords={selectedRecords}
                          paginatedRecords={paginatedRecords}
                          setSelectedRecords={setSelectedRecords}
                          recordSortField={recordSortField}
                          recordSortOrder={recordSortOrder}
                          activeFieldFilters={activeFieldFilters}
                          handleResizeStart={handleResizeStart}
                          handleOpenAdvancedFilterForColumn={handleOpenAdvancedFilterForColumn}
                          canBulkDelete={canDeleteAny}
                          onSort={handleColumnSort}
                          onDeleteSelected={() => {
                            if (selectedRecords.size > 0) {
                              setBulkDeleteOpen(true);
                            }
                          }}
                          showAuditFields={showAuditFields}
                          auditFields={AUDIT_FIELDS}
                        />

                        {paginatedRecords.length === 0 ? (
                          <div className="flex items-center justify-center py-12 text-gray-500">
                            <p className="text-sm font-medium">No records found</p>
                          </div>
                        ) : (
                          <>
                            {paginatedRecords.map((record, rowIndex) => {
                              const canEditThisRecord = canEditRecord(record);
                              const canDeleteThisRecord = canDeleteRecord(record);

                              return (
                                <div
                                  key={record.id}
                                  className="flex items-stretch hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all duration-200 min-w-max border-b border-gray-200 last:border-b-0"
                                >
                                  <div className="w-10 min-h-[32px] border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
                                    <Checkbox
                                      checked={selectedRecords.has(record.id)}
                                      onCheckedChange={(c) => {
                                        const newSel = new Set(selectedRecords);
                                        c ? newSel.add(record.id) : newSel.delete(record.id);
                                        setSelectedRecords(newSel);
                                      }}
                                      className="h-4 w-4"
                                    />
                                  </div>
                                  <div className="w-12 min-h-[32px] border-r border-gray-200 bg-gray-50 flex items-center justify-center text-xs font-semibold text-gray-700 flex-shrink-0">
                                    {startIdx + rowIndex + 1}
                                  </div>
                                  <div className="w-20 sm:w-24 min-h-[32px] border-r border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-gray-200 rounded">
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuLabel className="text-xs font-bold">Actions</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleViewDetails(record)}>
                                          <Eye className="h-4 w-4 mr-2" /> View Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className={cn("text-xs cursor-pointer", !canEditThisRecord && "text-gray-400 opacity-50")}
                                          onClick={() => {
                                            if (canEditThisRecord) {
                                              setEditingRecord(record);
                                              setEditRecordOpen(true);
                                            }
                                          }}
                                          disabled={!canEditThisRecord}
                                        >
                                          <Pencil className="h-4 w-4 mr-2" /> Edit Record
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className={cn("text-xs text-red-600 cursor-pointer", !canDeleteThisRecord && "text-gray-400 opacity-50")}
                                          onClick={() => handleOpenDeleteConfirm(record)}
                                          disabled={!canDeleteThisRecord}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" /> Delete Record
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  {/* Regular Fields */}
                                  {hierarchyGroups.flatMap((formGroup) => [
                                    ...formGroup.directSections.flatMap((sec) =>
                                      sec.fields.map((fieldDef) => (
                                        <RecordCell
                                          key={`${record.id}-${fieldDef.id}`}
                                          record={record}
                                          fieldDef={fieldDef}
                                          fieldData={getFieldData(record, fieldDef)}
                                          pendingChange={pendingChanges.get(`${record.id}-${fieldDef.id}`)}
                                          editingCell={editingCell}
                                          expandedCells={expandedCells}
                                          expandedSubforms={expandedSubforms}
                                          columnWidth={columnWidths.get(fieldDef.id) || 192}
                                          isWrapTextEnabled={isWrapTextEnabled}
                                          editMode={editMode}
                                          canEdit={canEditThisRecord}
                                          selectedCell={selectedCell}
                                          focusedCell={focusedCell}
                                          comments={comments}
                                          getConditionalStyle={getConditionalStyle}
                                          handleCellPointerDown={handleCellPointerDown}
                                          renderFieldEditor={renderFieldEditor}
                                          onCellClick={handleCellClick}
                                          onContextMenu={handleCellContextMenu}
                                          onPreviewClick={handlePreviewClick}
                                          onCommentClick={handleCommentClick}
                                          toggleCellExpansion={toggleCellExpansion}
                                          toggleSubformExpansion={toggleSubformExpansion}
                                        />
                                      ))
                                    ),
                                    ...formGroup.subforms.flatMap((sf) =>
                                      sf.sections.flatMap((sec) =>
                                        sec.fields.map((fieldDef) => (
                                          <RecordCell
                                            key={`${record.id}-${fieldDef.id}`}
                                            record={record}
                                            fieldDef={fieldDef}
                                            fieldData={getFieldData(record, fieldDef)}
                                            pendingChange={pendingChanges.get(`${record.id}-${fieldDef.id}`)}
                                            editingCell={editingCell}
                                            expandedCells={expandedCells}
                                            expandedSubforms={expandedSubforms}
                                            columnWidth={columnWidths.get(fieldDef.id) || 192}
                                            isWrapTextEnabled={isWrapTextEnabled}
                                            editMode={editMode}
                                            canEdit={canEditThisRecord}
                                            selectedCell={selectedCell}
                                            focusedCell={focusedCell}
                                            comments={comments}
                                            getConditionalStyle={getConditionalStyle}
                                            handleCellPointerDown={handleCellPointerDown}
                                            renderFieldEditor={renderFieldEditor}
                                            onCellClick={handleCellClick}
                                            onContextMenu={handleCellContextMenu}
                                            onPreviewClick={handlePreviewClick}
                                            onCommentClick={handleCommentClick}
                                            toggleCellExpansion={toggleCellExpansion}
                                            toggleSubformExpansion={toggleSubformExpansion}
                                          />
                                        ))
                                      )
                                    ),
                                  ])}

                                  {/* Audit Fields */}
                                  {showAuditFields && AUDIT_FIELDS.map((auditField) => {
                                    let value: any = "—";
                                    if (auditField.id === "__createdAt") value = record.createdAt || record.submittedAt;
                                    else if (auditField.id === "__createdBy") value = record.userId || record.submittedBy;
                                    else if (auditField.id === "__updatedAt") value = record.updatedAt;
                                    else if (auditField.id === "__updatedBy") value = record.userId;

                                    let displayText = value;
                                    if (auditField.id.includes("At")) {
                                      displayText = formatDateTime(value);
                                    } else if (auditField.id.includes("By")) {
                                      displayText = getUserDisplayName(users, value);
                                    }

                                    return (
                                      <RecordCell
                                        key={`${record.id}-${auditField.id}`}
                                        record={record}
                                        fieldDef={auditField as any}
                                        fieldData={{ value: displayText, fieldId: auditField.id, fieldLabel: auditField.label }}
                                        pendingChange={null}
                                        editingCell={null}
                                        expandedCells={expandedCells}
                                        expandedSubforms={expandedSubforms}
                                        columnWidth={columnWidths.get(auditField.id) || 192}
                                        isWrapTextEnabled={isWrapTextEnabled}
                                        editMode={editMode}
                                        canEdit={false}
                                        selectedCell={selectedCell}
                                        focusedCell={focusedCell}
                                        comments={comments}
                                        getConditionalStyle={getConditionalStyle}
                                        handleCellPointerDown={handleCellPointerDown}
                                        renderFieldEditor={renderFieldEditor}
                                        onCellClick={handleCellClick}
                                        onContextMenu={handleCellContextMenu}
                                        onPreviewClick={handlePreviewClick}
                                        onCommentClick={handleCommentClick}
                                        toggleCellExpansion={toggleCellExpansion}
                                        toggleSubformExpansion={toggleSubformExpansion}
                                      />
                                    );
                                  })}
                                </div>
                              );
                            })}

                            {/* Dummy Rows */}
                            {Array.from({ length: numDummyRows }).map((_, i) => (
                              <div
                                key={`dummy-${i}`}
                                className="flex h-8 border-b border-gray-200 bg-white min-w-max last:border-b-0"
                              >
                                <div className="w-10 border-r border-gray-200 flex-shrink-0" />
                                <div className="w-12 border-r border-gray-200 flex-shrink-0" />
                                <div className="w-20 sm:w-24 border-r border-gray-200 flex-shrink-0" />
                                {allFieldsForTable.map((field) => (
                                  <div
                                    key={field.id}
                                    className="border-r border-gray-200 bg-white px-3 flex-shrink-0"
                                    style={{ width: `${columnWidths.get(field.id) || 192}px` }}
                                  />
                                ))}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>

                    <DragOverlay>
                      {activeDragId ? (
                        <div className="bg-white shadow-2xl border-2 border-blue-500 rounded-lg px-4 py-2 opacity-90 font-medium">
                          {allDisplayableFields.find((f) => f.id === activeDragId)?.label || "Column"}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                </div>

                <div className="border-t border-gray-300 bg-gray-50 px-4 pt-2 flex items-center gap-1 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab("merged")}
                    className={cn(
                      "px-5 py-1 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap",
                      activeTab === "merged"
                        ? "bg-white text-blue-700 border-t-2 border-l border-r border-blue-500 shadow-sm -mt-px"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                    )}
                  >
                    Merged Data
                  </button>
                  {allModuleForms.map((form) => (
                    <button
                      key={form.id}
                      onClick={() => setActiveTab(form.id)}
                      className={cn(
                        "px-5 py-1 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap",
                        activeTab === form.id
                          ? "bg-white text-blue-700 border-t-2 border-l border-r border-blue-500 shadow-sm -mt-px"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
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
          <Dialog open={isManageColumnsOpen} onOpenChange={setIsManageColumnsOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Manage Columns</DialogTitle>
                <DialogDescription>Select and reorder visible columns</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all-columns"
                      checked={allFieldsVisible}
                      onCheckedChange={toggleAllFieldsVisibility}
                    />
                    <label htmlFor="select-all-columns" className="text-sm font-medium cursor-pointer select-none">
                      {allFieldsVisible ? "Deselect All" : "Select All"}
                    </label>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {visibleFields.size} / {allDisplayableFields.length} visible
                  </span>
                </div>

                <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <Checkbox
                    id="show-audit-fields"
                    checked={showAuditFields}
                    onCheckedChange={(checked) => setShowAuditFields(!!checked)}
                  />
                  <label
                    htmlFor="show-audit-fields"
                    className="text-sm font-medium cursor-pointer select-none"
                  >
                    Show Audit Fields (Created At, Created By, Updated At, Updated By)
                  </label>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => {
                    if (e.over && e.active.id !== e.over.id) {
                      setOrderedFields((items) => {
                        const oldIndex = items.findIndex((f) => f.id === e.active.id);
                        const newIndex = items.findIndex((f) => f.id === e.over!.id);
                        return arrayMove(items, oldIndex, newIndex);
                      });
                    }
                  }}
                >
                  <SortableContext items={allDisplayableFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {allDisplayableFields.map((field) => (
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
                <Button onClick={() => setIsManageColumnsOpen(false)}>Apply Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Bulk Delete Dialog */}
          <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Selected Records</DialogTitle>
                <DialogDescription className="text-base">
                  Are you sure you want to permanently delete{" "}
                  <span className="font-semibold text-red-600">{selectedRecords.size}</span> selected record(s)?
                  <br />
                  This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    const recordIds = Array.from(selectedRecords);
                    setBulkDeleteOpen(false);
                    setSelectedRecords(new Set());
                    if (onBulkDeleteRecords) {
                      await onBulkDeleteRecords(recordIds);
                    } else {
                      for (const recordId of recordIds) {
                        const record = formRecords.find((r) => r.id === recordId);
                        if (!record) continue;
                        try {
                          await onDeleteRecord(record);
                        } catch (error) {
                          console.error(`Failed to delete record ${recordId}:`, error);
                        }
                      }
                    }
                  }}
                >
                  Yes, Delete {selectedRecords.size} Records
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <SubformPreviewModal
            isOpen={previewData.isOpen}
            onClose={() => setPreviewData((prev) => ({ ...prev, isOpen: false }))}
            rows={previewData.rows}
            title={previewData.title}
            fieldDefinitions={previewData.fieldDefinitions}
            formFieldsWithSections={formFieldsWithSections}
          />

          <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogDescription>This action cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleConfirmDelete}>
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Comments Dialog */}
          <Dialog open={!!activeCommentCell} onOpenChange={() => setActiveCommentCell(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Comments</DialogTitle>
              </DialogHeader>
              <div className="max-h-60 overflow-y-auto space-y-3">
                {comments.get(activeCommentCell || "")?.map((c) => {
                  const isOwner = c.author === currentUserName;
                  const isEditing = editingCommentId === c.id;
                  return (
                    <div key={c.id} className="p-3 border border-gray-200 rounded-lg relative group/comment">
                      {isOwner && !isEditing && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover/comment:opacity-100 transition-opacity flex gap-1">
                          <button
                            onClick={() => startEditComment(c)}
                            className="bg-blue-500 hover:bg-blue-600 text-white rounded-full p-1 text-xs"
                            title="Edit comment"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="bg-red-500 hover:bg-red-600 text-white rounded-full p-1 text-xs"
                            title="Delete comment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{c.author}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(c.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {isEditing ? (
                        <div className="mt-1 space-y-2">
                          <Input
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            className="w-full text-sm"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveEditComment}>
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditComment}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm mt-1">{c.text}</p>
                      )}
                    </div>
                  );
                }) || <p className="text-sm text-gray-500">No comments yet.</p>}
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

          {/* View Details Dialog */}
          {viewDetailsOpen && selectedRecord && (() => {
            const plainData = flattenRecordData(selectedRecord.recordData);
            const createdByName = getUserDisplayName(users, selectedRecord.userId || selectedRecord.submittedBy);
            const updatedByName = getUserDisplayName(users, selectedRecord.userId);
            return (
              <PublicFormDialog
                formId={selectedRecord.formId}
                isOpen={viewDetailsOpen}
                onClose={() => setViewDetailsOpen(false)}
                initialRecordData={plainData}
                forceViewOnly
              >
                <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Audit Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Created By</p>
                      <p className="font-medium flex items-center gap-2">
                        <User className="h-4 w-4" /> {createdByName}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Created At</p>
                      <p className="font-medium">{formatDateTime(selectedRecord.createdAt || selectedRecord.submittedAt)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Last Updated By</p>
                      <p className="font-medium flex items-center gap-2">
                        <User className="h-4 w-4" /> {updatedByName}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Last Updated At</p>
                      <p className="font-medium">{formatDateTime(selectedRecord.updatedAt)}</p>
                    </div>
                  </div>
                </div>
              </PublicFormDialog>
            );
          })()}

          {/* Edit Record Dialog */}
          {editRecordOpen && editingRecord && (() => {
            const plainData = flattenRecordData(editingRecord.recordData);
            return (
              <PublicFormDialog
                formId={editingRecord.formId}
                isOpen={editRecordOpen}
                onClose={() => setEditRecordOpen(false)}
                initialRecordData={plainData}
                editingRecordId={editingRecord.id}
              />
            );
          })()}

        </div>
      </div>

      {/* Save Filter Dialog */}
      <Dialog open={saveFilterDialogOpen} onOpenChange={(open) => {
        if (!isSavingFilter) setSaveFilterDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Save Current Filter</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Give this filter a name to quickly apply it later.
              {activeFieldFilters.length > 0 && (
                <span className="block mt-1 text-indigo-600 font-medium">
                  {activeFieldFilters.length} active filter{activeFieldFilters.length > 1 ? "s" : ""} will be saved.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. High priority leads, Active customers..."
            value={saveFilterName}
            onChange={(e) => setSaveFilterName(e.target.value)}
            className="h-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && saveFilterName.trim() && !isSavingFilter) {
                handleConfirmSaveFilter();
              }
            }}
            disabled={isSavingFilter}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveFilterDialogOpen(false)}
              disabled={isSavingFilter}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmSaveFilter}
              disabled={!saveFilterName.trim() || isSavingFilter}
            >
              {isSavingFilter && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {isSavingFilter ? "Saving..." : "Save Filter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default RecordsDisplay;