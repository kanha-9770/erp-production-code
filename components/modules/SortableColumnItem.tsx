"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FormFieldWithSection } from "@/types/records";

interface SortableColumnItemProps {
  field: FormFieldWithSection;
  isChecked: boolean;
  onToggle: () => void;
  isMergedMode: boolean;
  getFieldIcon: (type: string) => any;
}

export function SortableColumnItem({
  field,
  isChecked,
  onToggle,
  isMergedMode,
  getFieldIcon,
}: SortableColumnItemProps) {
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
}
