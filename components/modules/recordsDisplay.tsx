"use client";
import React, { useCallback } from "react";
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
import { Eye, Trash2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import AdvancedFilterSidebar from "./AdvancedFilterSidebar";
import { DynamicDataPreviewModal2 } from "../DynamicDataPreviewModal";
import { SubformPreviewModal } from "./SubformPreviewModal";
import { SortableColumnItem } from "./SortableColumnItem";
import { RecordTableToolbar } from "./RecordTableToolbar";
import { RecordTableHeader } from "./RecordTableHeader";
import { RecordCell } from "./RecordCell";
import { isImageUrl, isImageField } from "@/lib/utils/fieldUtils";
import { useRecordsDisplay } from "@/hooks/use-records-display";

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
  setCurrentPage,
  setSelectedRecords,
  getFieldIcon,
  saveAllPendingChanges,
  setEditingCell,
  setPendingChanges,
  onDeleteRecord,
  onViewDetails,
  permissions = [],
  isAdmin = false,
  users = [],
}) => {
  // ── Hook ─────────────────────────────────────────────────────────────────────
  const {
    tableContainerRef,
    viewDetailsOpen, setViewDetailsOpen,
    selectedRecord,
    columnWidths,
    expandedCells,
    numDummyRows,
    isFilterSidebarOpen, setIsFilterSidebarOpen,
    activeFieldFilters, setActiveFieldFilters,
    selectedFieldForAdvancedFilter,
    columnSearchFieldId, setColumnSearchFieldId,
    columnSearchValue, setColumnSearchValue,
    activeDragId,
    deleteConfirmOpen, setDeleteConfirmOpen,
    previewData, setPreviewData,
    orderedFields, setOrderedFields,
    visibleFields,
    isManageColumnsOpen, setIsManageColumnsOpen,
    isWrapTextEnabled, setIsWrapTextEnabled,
    activeTab, setActiveTab,
    focusedCell, setFocusedCell,
    selectedCell, setSelectedCell,
    comments, setComments,
    activeCommentCell, setActiveCommentCell,
    newComment, setNewComment,
    confirmDeleteCommentId,
    conditionalRules, setConditionalRules,
    enhancedFormFields,
    isMergedMode,
    populatedRecordsWithPending,
    paginatedRecords,
    startIdx,
    displayedFields,
    hierarchyGroups,
    canEditRecord, canDeleteRecord,
    getFieldData, getConditionalStyle, recalculateFormulasForRecord,
    handleResizeStart, toggleCellExpansion, toggleFieldVisibility,
    handleCellPointerDown, handleOpenAdvancedFilterForColumn,
    handleOpenDeleteConfirm, handleConfirmDelete, handleViewDetails,
    addComment, requestDeleteComment, cancelDeleteComment,
    sensors, handleDragStart, handleDragEnd,
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

  // ── Cell event callbacks ──────────────────────────────────────────────────────
  const handleCellClick = useCallback((cellKey: string) => {
    setSelectedCell(cellKey);
    setFocusedCell(cellKey);
  }, [setSelectedCell, setFocusedCell]);

  const handleCellContextMenu = useCallback((cellKey: string) => {
    setFocusedCell(cellKey);
    setActiveCommentCell(cellKey);
  }, [setFocusedCell, setActiveCommentCell]);

  const handlePreviewClick = useCallback(
    (rows: any[], title: string, fieldDefinitions?: { id: string; label: string; type: string }[]) => {
      setPreviewData({ isOpen: true, rows, title, fieldDefinitions });
    },
    [setPreviewData],
  );

  const handleCommentClick = useCallback((cellKey: string) => {
    setActiveCommentCell(cellKey);
  }, [setActiveCommentCell]);

  // ── renderFieldEditor — keeps inline so it can close over hook state ─────────
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

      if (!pendingChange) {
        setEditingCell(null);
        return;
      }

      // ── Step 1: build a record with the new value baked into processedData ──
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

          const existingPd = record.processedData.find(
            (p) =>
              p.fieldId === formulaField.id ||
              p.fieldId === formulaField.originalId ||
              p.fieldLabel === formulaField.label,
          );

          const oldValue = existingPd?.value ?? "";
          const newValue = recalcPd.value;

          console.log(`[AutoSave] formula "${formulaField.label}" — old="${oldValue}" new="${newValue}" changed=${String(oldValue) !== String(newValue)}`);

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

      // ── Special case: Address field ──
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
              const parts = newRawValue
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
              finalValue = {
                line1: parts[0] || "",
                line2: parts[1] || "",
                city: parts[2] || "",
                state: parts[3] || "",
                postal: parts[4] || "",
                country: parts[5] || "",
              };
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

  // ============== RENDER ==============

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-gray-50 overflow-x-hidden overflow-y-hidden">
        {/* Advanced Filter Sidebar */}
        <AdvancedFilterSidebar
          isOpen={isFilterSidebarOpen}
          onClose={() => setIsFilterSidebarOpen(false)}
          fields={orderedFields.length > 0 ? orderedFields : formFieldsWithSections}
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

              {/* Toolbar */}
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
                        {/* Header rows */}
                        <RecordTableHeader
                          isMergedMode={isMergedMode}
                          hierarchyGroups={hierarchyGroups}
                          displayedFields={displayedFields}
                          columnWidths={columnWidths}
                          selectedRecords={selectedRecords}
                          paginatedRecords={paginatedRecords}
                          setSelectedRecords={setSelectedRecords}
                          recordSortField={recordSortField}
                          recordSortOrder={recordSortOrder}
                          activeFieldFilters={activeFieldFilters}
                          handleResizeStart={handleResizeStart}
                          handleOpenAdvancedFilterForColumn={handleOpenAdvancedFilterForColumn}
                        />

                        {/* Data Rows */}
                        {paginatedRecords.length === 0 ? (
                          <div className="flex items-center justify-center py-12 text-gray-500">
                            <p className="text-sm font-medium">No records found</p>
                          </div>
                        ) : (
                          <>
                            {paginatedRecords.map((record, rowIndex) => {
                              const canDeleteThisRecord = canDeleteRecord(record);
                              return (
                                <div
                                  key={record.id}
                                  className="flex hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all duration-200 min-w-max border-b border-gray-200 last:border-b-0"
                                >
                                  {/* Checkbox */}
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

                                  {/* Row number */}
                                  <div className="w-12 h-9 border-r border-gray-200 bg-gray-50 flex items-center justify-center text-xs font-semibold text-gray-700 flex-shrink-0">
                                    {startIdx + rowIndex + 1}
                                  </div>

                                  {/* Row actions */}
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
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuLabel className="text-xs font-bold">
                                          Actions
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-xs cursor-pointer"
                                          onClick={() => handleViewDetails(record)}
                                        >
                                          <Eye className="h-4 w-4 mr-2" /> View Details
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className={cn(
                                            "text-xs text-red-600 cursor-pointer",
                                            !canDeleteThisRecord && "text-gray-400 opacity-50",
                                          )}
                                          onClick={() => handleOpenDeleteConfirm(record)}
                                          disabled={!canDeleteThisRecord}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" /> Delete Record
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  {/* Data cells following hierarchy */}
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
                                          columnWidth={columnWidths.get(fieldDef.id) || 192}
                                          isWrapTextEnabled={isWrapTextEnabled}
                                          editMode={editMode}
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
                                        />
                                      )),
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
                                            columnWidth={columnWidths.get(fieldDef.id) || 192}
                                            isWrapTextEnabled={isWrapTextEnabled}
                                            editMode={editMode}
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
                                          />
                                        )),
                                      ),
                                    ),
                                  ])}
                                </div>
                              );
                            })}

                            {/* Dummy rows for filling space */}
                            {Array.from({ length: numDummyRows }).map((_, i) => (
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
                          {orderedFields.find((f) => f.id === activeDragId)?.label || "Column"}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                </div>

                {/* Tab bar */}
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
          <Dialog open={isManageColumnsOpen} onOpenChange={setIsManageColumnsOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Manage Columns</DialogTitle>
                <DialogDescription>Select and reorder visible columns</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
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
                <Button onClick={() => setIsManageColumnsOpen(false)}>Apply Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Subform Preview Modal */}
          <SubformPreviewModal
            isOpen={previewData.isOpen}
            onClose={() => setPreviewData((prev) => ({ ...prev, isOpen: false }))}
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
                      ×
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

          {/* View Details Modal */}
          {viewDetailsOpen && selectedRecord && (
            <DynamicDataPreviewModal2
              isOpen={viewDetailsOpen}
              onClose={() => setViewDetailsOpen(false)}
              rows={[selectedRecord]}
              title={selectedRecord.title || "Record Details"}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default RecordsDisplay;
