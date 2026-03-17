"use client";
import { useState, useRef, useEffect, useMemo } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  Layers,
  Lock,
  Type,
  List,
  Calendar,
  Mail,
  Phone,
  FileText,
  ShieldCheck,
} from "lucide-react";

import FieldComponent from "./field-component";
import SectionSettings from "./section-settings";

import type { FormSection, FormField } from "@/types/item-types";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// --- UPDATED TYPES ---
interface PermissionDefinition {
  id: string;
  name: string;
  category: string;
  resource: string;
}

interface RolePermission {
  id: string; // roleId
  name: string; // roleName
  permission: string; // The ID from PermissionDefinition or "NONE"
}

interface SectionComponentProps {
  section: FormSection;
  onUpdateSection: (updates: Partial<FormSection>) => void;
  onDeleteSection: () => Promise<void>;
  onUpdateField: (
    fieldId: string,
    updates: Partial<FormField>,
  ) => Promise<void>;
  onDeleteField: (fieldId: string) => void;
  onAddSubform?: (sectionId: string) => void; // ← NEW PROP
  isOverlay?: boolean;
  isDeleting?: boolean;
  formId: string;
}

export default function SectionComponent({
  section,
  onUpdateSection,
  onDeleteSection,
  onUpdateField,
  onDeleteField,
  onAddSubform,
  isOverlay = false,
  isDeleting = false,
  formId,
}: SectionComponentProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(section.title);

  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<
    PermissionDefinition[]
  >([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [hasLoadedPermissions, setHasLoadedPermissions] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
    disabled: isOverlay || isEditingTitle || isDeleting,
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `section-dropzone-${section.id}`,
    data: { type: "Section", isSectionDropzone: true, sectionId: section.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.82 : isDeleting ? 0.38 : 1,
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

  useEffect(() => {
    if (showPermissionsDialog && !hasLoadedPermissions) {
      const fetchPermissions = async () => {
        setPermissionsLoading(true);
        try {
          const res = await fetch(`/api/permissions/section/${section.id}`);
          if (!res.ok) throw new Error("Failed to load permissions");
          const data = await res.json();
          setPermissions(data.profiles ?? []);
          setAvailablePermissions(data.availablePermissions ?? []);
          setHasLoadedPermissions(true);
        } catch (err) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load section permissions",
          });
        } finally {
          setPermissionsLoading(false);
        }
      };
      fetchPermissions();
    }
  }, [showPermissionsDialog, hasLoadedPermissions, section.id, toast]);

  const handlePermissionChange = async (
    roleId: string,
    permissionId: string,
  ) => {
    try {
      const res = await fetch(`/api/permissions/section/${section.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, permissionId }),
      });

      if (!res.ok) throw new Error("Failed to save");

      setPermissions((prev) =>
        prev.map((p) =>
          p.id === roleId ? { ...p, permission: permissionId } : p,
        ),
      );

      toast({ title: "Success", description: "Permission saved to database" });
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update permission in database",
      });
    }
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

      const res = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Create field failed");

      const { data } = await res.json();
      const newField: FormField = {
        ...data,
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
    try {
      const tempId = `temp_${uuidv4()}`;
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

      onUpdateSection({
        fields: [...section.fields, duplicated],
      });

      const res = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (!res.ok) throw new Error("Failed to duplicate field");
      const { data } = await res.json();

      onUpdateSection({
        fields: section.fields.map((f) =>
          f.id === tempId ? { ...f, id: data.id } : f,
        ),
      });
      toast({ title: "Success", description: `Duplicated: ${newLabel}` });
    } catch (error: any) {
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
        className={`group border transition-all duration-200 ${
          isDragging
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
                    ${
                      isDragging
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPermissionsDialog(true)}
              >
                <Lock className="h-4 w-4" />
              </Button>
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
                  <DropdownMenuItem
                    onClick={() => setShowPermissionsDialog(true)}
                  >
                    <Lock className="mr-2 h-4 w-4" /> Permissions
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
                  <DropdownMenuItem onClick={() => onAddSubform?.(section.id)}>
                    <Layers className="mr-2 h-4 w-4" /> Add Subform here
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
              className={`min-h-[160px] rounded-lg border-2 border-dashed transition-all ${
                isOver
                  ? "border-primary bg-primary/5"
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
                <div className="flex flex-col items-center justify-center min-h-[180px] text-muted-foreground">
                  <Plus className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm font-medium">Empty section</p>
                  <p className="text-xs mt-1">Drag & drop fields here</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => onAddSubform?.(section.id)}
              >
                <Layers className="h-4 w-4" />
                Add Subform under this section
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Dialog
        open={showPermissionsDialog}
        onOpenChange={setShowPermissionsDialog}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Section Permissions — {section.title}
            </DialogTitle>
          </DialogHeader>

          {permissionsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : permissions.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No roles found in your organization
            </div>
          ) : (
            <div className="space-y-2.5 py-4 max-h-[55vh] overflow-y-auto pr-1">
              {permissions
                .filter((role) => {
                  const nameLower = (role.name || "").toLowerCase();
                  return (
                    nameLower !== "admin" &&
                    nameLower !== "administrator" &&
                    !nameLower.includes("admin")
                  );
                })
                .map((role) => (
                  <div
                    key={role.id}
                    className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-md hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">{role.name}</span>
                    <Select
                      value={role.permission ?? "NONE"}
                      onValueChange={(v) => handlePermissionChange(role.id, v)}
                    >
                      <SelectTrigger className="w-52 h-9">
                        <SelectValue placeholder="Select Access" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="NONE"
                          className="text-muted-foreground italic"
                        >
                          View
                        </SelectItem>
                        <DropdownMenuSeparator />
                        {availablePermissions.map((perm) => (
                          <SelectItem key={perm.id} value={perm.id}>
                            <div className="flex flex-col items-start">
                              <span className="font-medium text-sm">
                                {perm.name.replace(/_/g, " ")}
                              </span>
                              <span className="text-[10px] text-muted-foreground opacity-70 uppercase tracking-tighter">
                                {perm.category} • {perm.resource}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHasLoadedPermissions(false)}
              className="text-xs opacity-50 hover:opacity-100"
            >
              Force Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowPermissionsDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showSettings && (
        <SectionSettings
          section={section}
          open={showSettings}
          onOpenChange={setShowSettings}
          onUpdate={onUpdateSection}
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
