'use client';

import React from "react";
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
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Eye,
  Trash2,
  ChevronDown,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ViewDetailsModal from "./viewDetailsModal";
import {
  EnhancedFormRecord,
  FormFieldWithSection,
  EditingCell,
  PendingChange,
  FieldFilter,
} from "./types";

interface RecordsTableProps {
  paginatedRecords: EnhancedFormRecord[];
  displayedFields: FormFieldWithSection[];
  selectedRecords: Set<string>;
  setSelectedRecords: (records: Set<string>) => void;
  editingCell: EditingCell | null;
  setEditingCell: (cell: EditingCell | null) => void;
  pendingChanges: Map<string, PendingChange>;
  setPendingChanges: (changes: Map<string, PendingChange>) => void;
  savingChanges: boolean;
  editMode: "locked" | "single-click" | "double-click";
  recordSortField: string;
  recordSortOrder: "asc" | "desc";
  setRecordSortField: (field: string) => void;
  setRecordSortOrder: (order: "asc" | "desc") => void;
  getFieldIcon: (fieldType: string) => any;
  getFieldData: (record: EnhancedFormRecord, fieldDef: FormFieldWithSection) => any;
  renderFieldEditor: (record: EnhancedFormRecord, fieldDef: FormFieldWithSection, value: any, displayText: string) => React.ReactNode;
  getConditionalStyle: (fieldDef: FormFieldWithSection, value: any, displayText: string) => React.CSSProperties;
  handleDoubleClick: (record: EnhancedFormRecord, fieldDef: FormFieldWithSection) => void;
  handleResizeStart: (e: React.MouseEvent, fieldId: string, currentWidth: number) => void;
  columnWidths: Map<string, number>;
  setColumnWidths: (widths: Map<string, number>) => void;
  expandedCells: Set<string>;
  setExpandedCells: (cells: Set<string>) => void;
  isWrapTextEnabled: boolean;
  isMergedMode: boolean;
  activeFieldFilters: FieldFilter[];
  handleOpenAdvancedFilterForColumn: (fieldId: string) => void;
  saveAllPendingChanges: (changesToSave?: Map<string, PendingChange>) => Promise<void>;
  discardAllPendingChanges: () => void;
  onViewDetails: (record: EnhancedFormRecord) => void;
  onDeleteRecord: (record: EnhancedFormRecord) => Promise<void>;
  onEditRecord: (record: EnhancedFormRecord) => void;
  hasPermissionForForm: (formId: string, permName: string) => boolean;
  canDeleteRecord: (record: EnhancedFormRecord) => boolean;
  orderedFields: FormFieldWithSection[];
  setOrderedFields: (fields: FormFieldWithSection[]) => void;
  visibleFields: Set<string>;
  setVisibleFields: (fields: Set<string>) => void;
  formFieldsWithSections: FormFieldWithSection[];
  numDummyRows: number;
  setFormRecords: (records: EnhancedFormRecord[]) => void;
}

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
  handleResizeStart: (e: React.MouseEvent, fieldId: string, currentWidth: number) => void;
  isMergedMode: boolean;
  getFieldIcon: (fieldType: string) => any;
  recordSortField: string;
  recordSortOrder: "asc" | "desc";
  activeFieldFilters: FieldFilter[];
  handleOpenAdvancedFilterForColumn: (fieldId: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const columnWidth = columnWidths.get(field.id) || 192;
  const style = transform
    ? { transform: CSS.Transform.toString(transform), transition, zIndex: 9999, opacity: isDragging ? 0.95 : 1 }
    : { transition };

  const tooltipParts = [];
  if (isMergedMode && field.formName) tooltipParts.push(field.formName);
  if (field.sectionTitle && field.sectionTitle !== "Default Section") tooltipParts.push(field.sectionTitle);
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
        "hover:bg-slate-200"
      )}
    >
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute inset-y-0 left-0 w-[calc(100%-90px)] cursor-grab active:cursor-grabbing z-10"
      />
      {isDragging && <div className="absolute inset-0 bg-white rounded-lg shadow-2xl border-2 border-blue-500 pointer-events-none z-30" />}
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
            <span className="truncate text-xs font-bold text-gray-900">{field.label}</span>
            {recordSortField === field.id &&
              (recordSortOrder === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 flex-shrink-0" />
              ))}
            {(isMergedMode || (field.sectionTitle && field.sectionTitle !== "Default Section")) && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-0.5 hover:bg-gray-200/50 rounded cursor-pointer" type="button">
                    <ChevronDown className="h-3.5 w-3.5 text-gray-500 hover:text-gray-700" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="text-xs max-w-xs">{tooltipText}</PopoverContent>
              </Popover>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 relative z-20">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200",
              activeFieldFilters.some((f) => f.fieldId === field.id)
                ? "opacity-100 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-md"
                : "hover:bg-blue-50 hover:shadow-sm"
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenAdvancedFilterForColumn(field.id);
            }}
            title="Filter this column"
          >
            <svg className={cn("h-3.5 w-3.5", activeFieldFilters.some((f) => f.fieldId === field.id) ? "text-white" : "text-gray-500")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
          </Button>
        </div>
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

function SortableColumnItem({
  field,
  isChecked,
  onToggle,
  isMergedMode,
  getFieldIcon,
}: {
  field: FormFieldWithSection;
  isChecked: boolean;
  onToggle: () => void;
  isMergedMode: boolean;
  getFieldIcon: (type: string) => any;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all",
        isDragging && "shadow-lg z-50 bg-white"
      )}
    >
      <Checkbox id={field.id} checked={isChecked} onCheckedChange={onToggle} />
      <label htmlFor={field.id} className="flex-1 text-sm font-medium cursor-pointer select-none">
        <div className="flex items-center gap-2">
          {React.createElement(getFieldIcon(field.type), {
            className: "h-4 w-4 text-gray-600",
          })}
          <span>{field.label}</span>
        </div>
        {isMergedMode && <div className="text-xs text-gray-500 mt-1">{field.formName} • {field.sectionTitle}</div>}
      </label>
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>
    </div>
  );
}

const isImageUrl = (val: any): boolean => {
  if (typeof val !== "string") return false;
  return val.startsWith("http") && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(val);
};

const isImageField = (label: string): boolean => {
  const lowerLabel = label.toLowerCase();
  return lowerLabel.includes("image") || lowerLabel.includes("photo") || lowerLabel.includes("camera");
};

export const RecordsTable: React.FC<RecordsTableProps> = ({
  paginatedRecords,
  displayedFields,
  selectedRecords,
  setSelectedRecords,
  editingCell,
  setEditingCell,
  pendingChanges,
  setPendingChanges,
  savingChanges,
  editMode,
  recordSortField,
  recordSortOrder,
  setRecordSortField,
  setRecordSortOrder,
  getFieldIcon,
  getFieldData,
  renderFieldEditor,
  getConditionalStyle,
  handleDoubleClick,
  handleResizeStart,
  columnWidths,
  setColumnWidths,
  expandedCells,
  setExpandedCells,
  isWrapTextEnabled,
  isMergedMode,
  activeFieldFilters,
  handleOpenAdvancedFilterForColumn,
  saveAllPendingChanges,
  discardAllPendingChanges,
  onViewDetails,
  onDeleteRecord,
  onEditRecord,
  hasPermissionForForm,
  canDeleteRecord,
  orderedFields,
  setOrderedFields,
  visibleFields,
  setVisibleFields,
  formFieldsWithSections,
  numDummyRows,
  setFormRecords,
}) => {
  const [viewDetailsOpen, setViewDetailsOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<EnhancedFormRecord | null>(null);
  const [isManageColumnsOpen, setIsManageColumnsOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [recordToDelete, setRecordToDelete] = React.useState<EnhancedFormRecord | null>(null);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => setActiveDragId(event.active.id as string);

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

  const toggleCellExpansion = (cellKey: string) => {
    setExpandedCells((prev) => {
      const updated = new Set(prev);
      updated.has(cellKey) ? updated.delete(cellKey) : updated.add(cellKey);
      return updated;
    });
  };

  return (
    <>
      {/* Manage Columns Dialog */}
      <Dialog open={isManageColumnsOpen} onOpenChange={setIsManageColumnsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Columns</DialogTitle>
            <DialogDescription>Drag to reorder columns and toggle visibility</DialogDescription>
          </DialogHeader>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {orderedFields.map((field) => (
                  <SortableColumnItem key={field.id} field={field} isChecked={visibleFields.has(field.id)} onToggle={() => toggleFieldVisibility(field.id)} isMergedMode={isMergedMode} getFieldIcon={getFieldIcon} />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>{activeDragId ? <div className="bg-blue-100 p-3 rounded shadow-lg">Dragging...</div> : null}</DragOverlay>
          </DndContext>
          <DialogFooter>
            <Button onClick={() => setIsManageColumnsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete this record? This action cannot be undone.</DialogDescription>
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

      {/* View Details Modal */}
      {selectedRecord && <ViewDetailsModal record={selectedRecord} isOpen={viewDetailsOpen} onClose={() => setViewDetailsOpen(false)} />}

      {/* Table Container */}
      <div className="flex-1 overflow-hidden border border-gray-300 rounded-lg bg-white">
        <div className="h-full flex flex-col">
          {/* Table Header */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={displayedFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="flex border-b border-gray-300">
                <div className="w-12 border-r border-gray-300 bg-slate-100 flex items-center justify-center flex-shrink-0 h-10">
                  <Checkbox checked={selectedRecords.size === paginatedRecords.length && paginatedRecords.length > 0} onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedRecords(new Set(paginatedRecords.map((r) => r.id)));
                    } else {
                      setSelectedRecords(new Set());
                    }
                  }} />
                </div>
                {displayedFields.map((field) => (
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
                    handleOpenAdvancedFilterForColumn={handleOpenAdvancedFilterForColumn}
                  />
                ))}
                <div className="w-16 border-r border-gray-300 bg-slate-100 flex-shrink-0" />
              </div>
            </SortableContext>
            <DragOverlay>{activeDragId ? <div className="bg-blue-100 p-2 rounded shadow-lg text-sm">Moving column...</div> : null}</DragOverlay>
          </DndContext>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto">
            {paginatedRecords.map((record) => (
              <div key={record.id} className="flex border-b border-gray-200 hover:bg-blue-50 transition-colors">
                <div className="w-12 border-r border-gray-300 flex items-center justify-center flex-shrink-0 h-9">
                  <Checkbox checked={selectedRecords.has(record.id)} onCheckedChange={(checked) => {
                    const newSet = new Set(selectedRecords);
                    if (checked) {
                      newSet.add(record.id);
                    } else {
                      newSet.delete(record.id);
                    }
                    setSelectedRecords(newSet);
                  }} />
                </div>
                {displayedFields.map((field) => {
                  const fieldData = getFieldData(record, field);
                  const cellKey = `${record.id}-${field.id}`;
                  const isExpanded = expandedCells.has(cellKey);
                  const columnWidth = columnWidths.get(field.id) || 192;
                  const value = fieldData?.value ?? "";
                  const displayText = fieldData?.displayValue ?? "";
                  const isEditing = editingCell?.recordId === record.id && editingCell?.fieldId === field.id;

                  return (
                    <div
                      key={cellKey}
                      style={{ width: `${columnWidth}px`, boxSizing: "border-box" }}
                      className="border-r border-gray-300 p-1 flex items-center overflow-hidden flex-shrink-0 h-9 relative group cursor-cell"
                      onDoubleClick={() => handleDoubleClick(record, field)}
                    >
                      {isEditing ? (
                        <div className="w-full">{renderFieldEditor(record, field, value, displayText)}</div>
                      ) : (
                        <div className="w-full flex items-center justify-between gap-1 min-w-0">
                          <div
                            className={cn("text-[10px] sm:text-xs truncate flex-1", isWrapTextEnabled && "whitespace-normal break-words")}
                            style={getConditionalStyle(field, value, displayText)}
                          >
                            {displayText || "—"}
                          </div>
                          {!isImageField(field.label) && displayText.length > 20 && (
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100" onClick={() => toggleCellExpansion(cellKey)}>
                              {isExpanded ? "−" : "+"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="w-16 border-r border-gray-300 flex items-center justify-center gap-1 flex-shrink-0 h-9">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewDetails(record)}>
                        <Eye className="h-3.5 w-3.5 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEditRecord(record)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenDeleteConfirm(record)} className="text-red-600">
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
            {Array.from({ length: numDummyRows }).map((_, i) => (
              <div key={`dummy-${i}`} className="flex border-b border-gray-200 h-9">
                <div className="w-12 border-r border-gray-300 flex-shrink-0" />
                {displayedFields.map((field) => {
                  const columnWidth = columnWidths.get(field.id) || 192;
                  return <div key={`${field.id}-dummy`} style={{ width: `${columnWidth}px` }} className="border-r border-gray-300 flex-shrink-0" />;
                })}
                <div className="w-16 border-r border-gray-300 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
