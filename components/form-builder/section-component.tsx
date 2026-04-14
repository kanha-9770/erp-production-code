"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useCreateFieldMutation } from "@/lib/api/forms";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  GripVertical,
  MoreHorizontal,
  Settings,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Plus,
  Check,
  X,
  Edit3,
  Loader2,
  AlertTriangle,
  Type,
  List,
  Calendar,
  Mail,
  Phone,
  FileText,
} from "lucide-react";

import FieldComponent from "./field-component";
import SectionSettings from "./section-settings";

import type { FormSection, FormField } from "@/types/form-builder";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SectionComponentProps {
  section: FormSection;
  onUpdateSection: (updates: Partial<FormSection>) => void;
  onDeleteSection: () => Promise<void>;
  onUpdateField: (
    fieldId: string,
    updates: Partial<FormField>,
  ) => Promise<void>;
  onDeleteField: (fieldId: string) => void;
  isOverlay?: boolean;
  isDeleting?: boolean;
  formId: string;
  isExternalDragging?: boolean;
}

export default function SectionComponent({
  section,
  onUpdateSection,
  onDeleteSection,
  onUpdateField,
  onDeleteField,
  isOverlay = false,
  isDeleting = false,
  formId,
  isExternalDragging = false,
}: SectionComponentProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(section.title);

  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [createFieldMutation] = useCreateFieldMutation();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: section.id,
    data: { type: "Section", section },
    disabled: isOverlay || isEditingTitle || isDeleting || showDeleteDialog || showSettings,
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `section-dropzone-${section.id}`,
    data: { type: "Section", isSectionDropzone: true, sectionId: section.id },
  });

  const borderRadiusMap: Record<string, string> = {
    none: "0px",
    sm: "0.125rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
  };

  const paddingMap: Record<string, string> = {
    none: "0px",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  };

  const sectionStyling = section.styling || {};

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.82 : isDeleting ? 0.38 : 1,
    ...(sectionStyling.backgroundColor && { backgroundColor: sectionStyling.backgroundColor }),
    ...(sectionStyling.borderColor && { borderColor: sectionStyling.borderColor }),
    ...(sectionStyling.borderRadius && { borderRadius: borderRadiusMap[sectionStyling.borderRadius] || sectionStyling.borderRadius }),
    ...(sectionStyling.padding && { padding: paddingMap[sectionStyling.padding] || sectionStyling.padding }),
  };

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    setEditTitle(section.title);
  }, [section.title]);

  const handleTitleSave = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== section.title) {
      onUpdateSection({ title: trimmed });
    }
    setIsEditingTitle(false);
  };

  const createField = async (type: string) => {
    try {
      const maxOrder = Math.max(...section.fields.map((f) => f.order ?? 0), -1);
      const order = maxOrder + 1;

      const payload = {
        sectionId: section.id,
        type,
        label: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        placeholder: "",
        description: "",
        defaultValue: "",
        options: ["select", "radio", "checkbox"].includes(type)
          ? ["Option 1", "Option 2"]
          : [],
        validation: {},
        visible: true,
        readonly: false,
        width: "full",
        order,
      };

      const result = await createFieldMutation(payload).unwrap();

      const newField: FormField = {
        ...result.data,
        conditional: null,
        styling: null,
        properties: null,
        formula: null,
        rollup: null,
        lookup: null,
      };

      onUpdateSection({
        fields: [...section.fields, newField],
      });
      toast({ title: "Success", description: `Created ${type} field` });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Could not create field",
      });
    }
  };

  const duplicateField = async (original: FormField) => {
    const tempId = `temp_${uuidv4()}`;
    try {
      const newLabel = `${original.label} (copy)`;

      const maxOrder = Math.max(...section.fields.map((f) => f.order ?? 0), -1);
      const newOrder = maxOrder + 1;

      const duplicated: FormField = {
        ...original,
        id: tempId,
        label: newLabel,
        order: newOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Snapshot the fields BEFORE adding the optimistic entry
      const fieldsBeforeDuplicate = [...section.fields];

      onUpdateSection({
        fields: [...fieldsBeforeDuplicate, duplicated],
      });

      const res = await createFieldMutation({
        sectionId: section.id,
        type: original.type,
        label: newLabel,
        placeholder: original.placeholder,
        description: original.description,
        defaultValue: original.defaultValue,
        options: original.options,
        validation: original.validation,
        visible: original.visible,
        readonly: original.readonly,
        width: original.width,
        order: newOrder,
        lookup: original.lookup,
        formula: original.formula,
        conditional: original.conditional,
        styling: original.styling,
        properties: original.properties,
        rollup: original.rollup,
      }).unwrap();

      // Use the snapshot + duplicated with real ID to avoid stale closure
      const realId = res.data?.id ?? tempId;
      onUpdateSection({
        fields: [...fieldsBeforeDuplicate, { ...duplicated, id: realId }],
      });
      toast({ title: "Success", description: `Duplicated: ${newLabel}` });
    } catch (error: any) {
      // Rollback: remove the optimistic temp field on failure
      onUpdateSection({
        fields: section.fields.filter((f) => f.id !== tempId),
      });
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to duplicate field",
      });
    }
  };

  const getColumnClass = () => {
    const map = {
      1: "grid-cols-1",
      2: "grid-cols-1 md:grid-cols-2",
      3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
    } as const;
    return map[section.columns as keyof typeof map] ?? "grid-cols-1";
  };

  if (!section.visible) {
    return (
      <Card
        className="border-2 border-dashed bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer p-8 text-center"
        onClick={() => onUpdateSection({ visible: true })}
      >
        <CardContent className="p-8 text-center space-y-3">
          <EyeOff className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="font-medium">Hidden Section: {section.title}</h3>
          <p className="text-sm text-muted-foreground">{section.title}</p>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent">
            <Eye className="h-4 w-4" />
            Show section
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isOverlay) {
    return (
      <Card className="border-blue-400 bg-blue-50/70 shadow-xl scale-105 p-6">
        <div className="flex items-center gap-3">
          <GripVertical className="h-5 w-5 text-blue-600" />
          <div>
            <h3 className="font-semibold">{section.title}</h3>
            <div className="flex gap-2 text-xs mt-1">
              <Badge variant="outline">{section.fields.length} fields</Badge>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (isDeleting) {
    return (
      <Card className="bg-red-50/60 border-red-200 opacity-70 pointer-events-none">
        <CardContent className="p-10 text-center">
          <Loader2 className="h-9 w-9 animate-spin mx-auto text-red-600 mb-4" />
          <p className="font-medium text-red-800">
            Deleting "{section.title}"…
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card
        ref={setNodeRef}
        style={style}
        className={`group border transition-all duration-200 ${isDragging
            ? "shadow-2xl scale-[1.015] rotate-[0.5deg] border-blue-400 bg-blue-50/30 z-50"
            : "hover:shadow-md hover:border-gray-300"
          }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {!isEditingTitle && (
                <div
                  {...attributes}
                  {...listeners}
                  className={`
                    p-1.5 rounded opacity-0 group-hover:opacity-100 transition
                    ${isDragging
                      ? "bg-blue-600 text-white"
                      : "hover:bg-gray-200"
                    }
                  `}
                >
                  <GripVertical className="h-5 w-5" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={inputRef}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleTitleSave();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setIsEditingTitle(false);
                        }
                      }}
                      className="text-lg font-semibold"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleTitleSave}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setIsEditingTitle(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <h3
                    className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors inline-flex items-center gap-1.5"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    {section.title}
                    <Edit3 className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60" />
                  </h3>
                )}
                {section.description && !isEditingTitle && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {section.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {section.collapsible && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    onUpdateSection({ collapsed: !section.collapsed })
                  }
                >
                  {section.collapsed ? <ChevronDown /> : <ChevronUp />}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4.5 w-4.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    <Settings className="mr-2 h-4 w-4" /> Section settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      onUpdateSection({ visible: !section.visible })
                    }
                  >
                    {section.visible ? "Hide section" : "Show section"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      onUpdateSection({ collapsible: !section.collapsible })
                    }
                  >
                    {section.collapsible ? "Disable" : "Enable"} collapsible
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => createField("text")}>
                    <Type className="mr-2 h-4 w-4" /> Text field
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => createField("textarea")}>
                    <FileText className="mr-2 h-4 w-4" /> Textarea
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => createField("select")}>
                    <List className="mr-2 h-4 w-4" /> Select / Dropdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => createField("date")}>
                    <Calendar className="mr-2 h-4 w-4" /> Date picker
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => createField("email")}>
                    <Mail className="mr-2 h-4 w-4" /> Email
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => createField("phone")}>
                    <Phone className="mr-2 h-4 w-4" /> Phone
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete section…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        {(!section.collapsible || !section.collapsed) && (
          <CardContent className="pt-1 pb-6">
            <div
              ref={setDroppableRef}
              className={`min-h-[160px] rounded-lg border-2 border-dashed transition-all duration-200 ${isOver
                  ? "border-blue-500 bg-blue-50/60 shadow-inner ring-2 ring-blue-200/50"
                  : isExternalDragging
                    ? "border-blue-300/60 bg-blue-50/20"
                    : "border-muted-foreground/30"
                }`}
            >
              {section.fields.length > 0 ? (
                <SortableContext
                  items={section.fields.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className={`grid gap-5 p-4 ${getColumnClass()}`}>
                    {section.fields.map((field) => (
                      <FieldComponent
                        key={field.id}
                        field={field}
                        onUpdate={onUpdateField}
                        onDelete={() => onDeleteField(field.id)}
                        onCopy={duplicateField}
                        formId={formId}
                      />
                    ))}
                  </div>
                </SortableContext>
              ) : (
                <div className={`flex flex-col items-center justify-center min-h-[140px] transition-all duration-200 ${isOver
                    ? "text-blue-600"
                    : isExternalDragging
                      ? "text-blue-400"
                      : "text-muted-foreground"
                  }`}>
                  <Plus className={`h-8 w-8 mb-2 transition-transform duration-200 ${isOver ? "scale-125" : ""}`} />
                  <p className="text-sm font-medium">{isOver ? "Drop here" : "Empty section"}</p>
                  <p className="text-xs mt-1">{isOver ? "Release to add field" : "Drag & drop fields here"}</p>
                </div>
              )}
            </div>

          </CardContent>
        )}
      </Card>

      {showSettings && (
        <SectionSettings
          section={section}
          open={showSettings}
          onOpenChange={setShowSettings}
          onUpdate={onUpdateSection}
          formId={formId}
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Section
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-3 space-y-4">
              <p>
                Are you sure you want to <strong>permanently delete</strong>{" "}
                section
                <br />
                <span className="font-medium text-foreground">
                  "{section.title}"
                </span>
                ?
              </p>

              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-sm">
                <p className="font-medium mb-2">This will delete:</p>
                <ul className="list-disc list-inside space-y-1 text-destructive/90">
                  <li>The section and all its settings</li>
                  <li>
                    {section.fields.length} direct field
                    {section.fields.length !== 1 ? "s" : ""}
                  </li>
                  <li>All associated records and relations</li>
                </ul>
              </div>

              <p className="font-medium text-destructive">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={onDeleteSection}
            >
              Delete Section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
