"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { isImageField } from "@/lib/utils/fieldUtils";
import type { FormFieldWithSection, FieldFilter } from "@/types/records";

interface SortableColumnHeaderProps {
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
}

export function SortableColumnHeader({
  field,
  columnWidths,
  handleResizeStart,
  isMergedMode,
  getFieldIcon,
  recordSortField,
  recordSortOrder,
  activeFieldFilters,
  handleOpenAdvancedFilterForColumn,
}: SortableColumnHeaderProps) {
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

  const tooltipParts: string[] = [];
  if (isMergedMode && field.formName) tooltipParts.push(field.formName);
  if (field.subformTitle) tooltipParts.push(field.subformTitle);
  if (field.sectionTitle && field.sectionTitle !== "Default Section") {
    tooltipParts.push(field.sectionTitle);
  }
  tooltipParts.push(field.label);
  const tooltipText = tooltipParts.filter(Boolean).join(" → ");

  const hasFilter = activeFieldFilters.some((f) => f.fieldId === field.id);

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
      {/* Drag handle — covers most of the header */}
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
          </div>
        </div>

        {/* Filter button */}
        {!isImageField(field.label) && (
          <div className="flex items-center gap-1 flex-shrink-0 relative z-20">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200",
                hasFilter
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
                className={cn("h-3.5 w-3.5", hasFilter ? "text-white" : "text-gray-500")}
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

      {/* Resize handle */}
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
}
