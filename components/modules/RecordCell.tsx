"use client";
import React, { memo } from "react";
import { ChevronDown, ChevronUp, MessageSquare, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { isImageUrl, isImageField } from "@/lib/utils/fieldUtils";
import type {
  EnhancedFormRecord,
  FormFieldWithSection,
  ProcessedFieldData,
  EditingCell,
  PendingChange,
  Comment,
} from "@/types/records";

export interface RecordCellProps {
  record: EnhancedFormRecord;
  fieldDef: FormFieldWithSection;
  fieldData: ProcessedFieldData | undefined;
  pendingChange: PendingChange | undefined;
  editingCell: EditingCell | null;
  expandedCells: Set<string>;
  columnWidth: number;
  isWrapTextEnabled: boolean;
  editMode: "locked" | "single-click" | "double-click";
  selectedCell: string | null;
  focusedCell: string | null;
  comments: Map<string, Comment[]>;
  getConditionalStyle: (
    fieldDef: FormFieldWithSection,
    value: any,
    displayText: string,
  ) => React.CSSProperties;
  handleCellPointerDown: (
    e: React.PointerEvent<HTMLDivElement>,
    record: EnhancedFormRecord,
    fieldDef: FormFieldWithSection,
  ) => void;
  renderFieldEditor: (
    record: EnhancedFormRecord,
    fieldDef: FormFieldWithSection,
    actualValue: any,
    displayText: string,
  ) => React.ReactNode;
  onCellClick: (cellKey: string) => void;
  onContextMenu: (cellKey: string) => void;
  onPreviewClick: (
    rows: any[],
    title: string,
    fieldDefinitions?: { id: string; label: string; type: string }[],
  ) => void;
  onCommentClick: (cellKey: string) => void;
  toggleCellExpansion: (cellKey: string) => void;
}

export const RecordCell = memo(function RecordCell({
  record,
  fieldDef,
  fieldData,
  pendingChange,
  editingCell,
  expandedCells,
  columnWidth,
  isWrapTextEnabled,
  editMode,
  selectedCell,
  focusedCell,
  comments,
  getConditionalStyle,
  handleCellPointerDown,
  renderFieldEditor,
  onCellClick,
  onContextMenu,
  onPreviewClick,
  onCommentClick,
  toggleCellExpansion,
}: RecordCellProps) {
  const actualValue = pendingChange ? pendingChange.value : fieldData?.value ?? null;
  const displayText = pendingChange
    ? String(pendingChange.value ?? "")
    : fieldData?.displayValue ?? "";
  const cellKey = `${record.id}-${fieldDef.id}`;
  const isEditing =
    editingCell?.recordId === record.id && editingCell?.fieldId === fieldDef.id;
  const isExpanded = expandedCells.has(cellKey);
  const hasImages = Array.isArray(actualValue)
    ? actualValue.some(isImageUrl)
    : isImageUrl(actualValue);
  const isImageColumn = isImageField(fieldDef.label) || hasImages;
  const hasComments = (comments.get(cellKey) || []).length > 0;
  const isDynamicRows =
    fieldDef.id.startsWith("_dynamicRows_") && Array.isArray(actualValue);

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
        focusedCell === cellKey && !isEditing && "ring-1 ring-blue-300 ring-inset",
      )}
      style={{ width: `${columnWidth}px`, boxShadow: "inset -1px 0 0 0 #e5e7eb" }}
      onClick={() => {
        if (!isEditing && editMode !== "locked" && !isImageColumn) {
          onCellClick(cellKey);
        }
      }}
      onPointerDown={(e) => handleCellPointerDown(e, record, fieldDef)}
      onContextMenu={(e) => {
        if (!isImageColumn) {
          e.preventDefault();
          onContextMenu(cellKey);
        }
      }}
    >
      <div
        className={cn(
          "w-full h-full flex items-center",
          isWrapTextEnabled || isExpanded ? "items-start py-2" : "",
        )}
      >
        {isEditing ? (
          renderFieldEditor(record, fieldDef, actualValue, displayText)
        ) : isImageColumn ? (
          <div className="flex items-center gap-2 flex-wrap py-1">
            {Array.isArray(actualValue) ? (
              actualValue
                .filter(isImageUrl)
                .slice(0, 3)
                .map((url: string, idx: number) => (
                  <img
                    key={idx}
                    src={url || "/placeholder.svg"}
                    alt="Field data"
                    className="h-7 w-7 object-cover rounded border border-gray-300"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ))
            ) : isImageUrl(actualValue) ? (
              <img
                src={actualValue || "/placeholder.svg"}
                alt="Field data"
                className="h-7 w-7 object-cover rounded border border-gray-300"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            ) : (
              <span className="text-xs text-gray-400">No image</span>
            )}
          </div>
        ) : isDynamicRows ? (
          <div
            className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              onPreviewClick(
                actualValue,
                fieldDef.label,
                fieldData?.fieldDefinitions,
              );
            }}
          >
            <div className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <Layers className="h-3 w-3" /> {actualValue.length}
            </div>
            <span className="text-gray-400 text-xs truncate max-w-[120px] italic">
              {displayText || "Click to view"}
            </span>
          </div>
        ) : (
          <div className="relative group w-full h-full">
            <div
              className={cn(
                "w-full text-sm text-gray-700 leading-tight py-2 uppercase-data",
                isWrapTextEnabled || isExpanded
                  ? "whitespace-normal break-words"
                  : "whitespace-nowrap overflow-hidden text-ellipsis",
              )}
              style={getConditionalStyle(fieldDef, actualValue, displayText)}
              title={displayText}
            >
              {(displayText ?? "") === "" ? "NaN" : displayText}
            </div>
            {!isWrapTextEnabled && displayText && displayText.length > 40 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCellExpansion(cellKey);
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
              onCommentClick(cellKey);
            }}
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
});
