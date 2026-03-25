"use client";
import { useEffect, useState, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  useSortable,
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DndContext, closestCenter } from "@dnd-kit/core";   // ← added DndContext & closestCenter
import { arrayMove } from "@dnd-kit/sortable";               // ← added arrayMove
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  MoreHorizontal,
  Trash2,
  ChevronDown,
  ChevronRight,
  Settings,
  Lock,
  Copy,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from "lucide-react";
import FieldSettings from "@/components/form-builder/field-settings";
import type { FormField, Subform } from "@/types/form-builder";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateFieldMutation,
  useDeleteSubformMutation,
  useUpdateSubformMutation,
  useLazyGetFormFieldsQuery,
  useLazyGetFieldPermissionQuery,
  useUpdateFieldPermissionMutation,
} from "@/lib/api/forms";

interface PermissionDefinition {
  id: string;
  name: string;
  category: string;
  resource: string;
}
interface RolePermission {
  id: string;
  name: string;
  permission: string;
}
interface SubformComponentProps {
  subform: Subform & { fields: FormField[] };
  onUpdateSubform: (updates: Partial<Subform>) => void;
  onDeleteSubform: () => void;
  onUpdateField: (fieldId: string, updates: Partial<FormField>) => Promise<void>;
  onDeleteField: (fieldId: string) => void;
  onCopyField?: (field: FormField) => void;
  formId: string;
}

// ── Inline editable text component ──────────────────────────────────────────
interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void> | void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

function InlineEdit({ value, onSave, className = "", inputClassName = "", placeholder = "Enter name..." }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync if parent value changes while not editing
  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
    // Focus after state update
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className={`bg-white border border-[#515ada] rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-[#515ada]/30 text-[#374151] ${saving ? "opacity-60" : ""} ${inputClassName}`}
        style={{ minWidth: 80 }}
      />
    );
  }

  return (
    <span
      title="Click to edit"
      onClick={startEditing}
      className={`cursor-pointer hover:bg-slate-100 rounded px-1 -mx-1 transition-colors duration-150 ${className}`}
    >
      {value || <span className="text-muted-foreground italic">{placeholder}</span>}
    </span>
  );
}
// ────────────────────────────────────────────────────────────────────────────

export default function SubformComponent({
  subform,
  onUpdateSubform,
  onDeleteSubform,
  onUpdateField,
  onDeleteField,
  onCopyField,
  formId,
}: SubformComponentProps) {
  const [isExpanded, setIsExpanded] = useState(!subform.collapsed ?? true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSubformSettings, setShowSubformSettings] = useState(false);

  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  // Local state for editing conditional visibility
  const [localConditional, setLocalConditional] = useState<Subform["conditional"] | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { toast } = useToast();

  const [createField] = useCreateFieldMutation();
  const [deleteSubform] = useDeleteSubformMutation();
  const [updateSubform] = useUpdateSubformMutation();
  const [triggerGetFormFields] = useLazyGetFormFieldsQuery();

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `subform-dropzone-${subform.id}`,
    data: {
      isSubformDropzone: true,
      type: "SubformDropzone",
      subform: subform,
      subformId: subform.id,
    },
  });

  // Debug: component mount / major prop change
  useEffect(() => {
    console.log("[SubformComponent] Rendered / props changed", {
      subformId: subform.id,
      subformName: subform.name,
      hasConditional: !!subform.conditional,
      conditional: subform.conditional,
      fieldsCount: subform.fields?.length ?? 0,
    });
  }, [subform]);

  // Load main form fields when visibility settings dialog is opened
  useEffect(() => {
    if (showSubformSettings && formId) {
      console.log("[Subform Visibility] Dialog opened → fetching parent form fields", { formId });
      const fetchFormFields = async () => {
        setFieldsLoading(true);
        setFieldsError(null);
        try {
          const result = await triggerGetFormFields(formId).unwrap();
          const data = result;
          const allFields = Array.isArray(data) ? data : data.data || data.fields || [];
          // Only show fields belonging to THIS form, not all forms in the module
          const fields = allFields.filter((f: any) => !f.formId || f.formId === formId);
          setFormFields(fields);
        } catch (err: any) {
          console.error("[Subform Visibility] Failed to load parent fields", err);
          setFieldsError("Could not load available fields. Try again.");
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to load fields for conditional visibility.",
          });
        } finally {
          setFieldsLoading(false);
        }
      };
      fetchFormFields();
    }
  }, [showSubformSettings, formId, toast, triggerGetFormFields]);

  // Sync local conditional state when dialog visibility changes
  useEffect(() => {
    if (showSubformSettings) {
      console.log("[Subform Visibility] Syncing local conditional state from props", {
        previousLocal: localConditional,
        newFromProps: subform.conditional,
      });
      setLocalConditional(subform.conditional ?? null);
      setHasChanges(false);
    }
  }, [showSubformSettings, subform.conditional]);

  const addField = async (type: string) => {
    try {
      const payload = {
        subformId: subform.id,
        type,
        label: `${type === 'textarea' ? 'Multi-Line' : 'Single Line'} ${subform.fields.length + 1}`,
        order: subform.fields.length,
      };
      const result = await createField(payload).unwrap();
      onUpdateSubform({ fields: [...subform.fields, result.data] });
      toast({ title: "Field added" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add field" });
    }
  };

  const handleDeleteSubform = async () => {
    setIsDeleting(true);
    try {
      await deleteSubform(subform.id).unwrap();
      toast({
        title: "Subform deleted",
        description: "The subform and all nested content have been removed.",
      });
      onDeleteSubform();
    } catch (err: any) {
      console.error("[Subform Delete]", err);
      toast({
        variant: "destructive",
        title: "Deletion failed",
        description: err.data?.error || err.message || "Could not delete subform. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // ── Save subform name inline ─────────────────────────────────────────────
  const handleSaveSubformName = async (newName: string) => {
    try {
      await updateSubform({ subformId: subform.id, body: { name: newName } }).unwrap();
      onUpdateSubform({ name: newName });
      toast({ title: "Subform renamed", description: `Renamed to "${newName}"` });
    } catch (err: any) {
      console.error("[Subform Rename]", err);
      toast({
        variant: "destructive",
        title: "Rename failed",
        description: err.data?.error || err.message || "Could not rename subform. Please try again.",
      });
      throw err; // re-throw so InlineEdit knows to revert
    }
  };
  // ────────────────────────────────────────────────────────────────────────

  const sortableIds = subform.fields.map((f) => f.id);

  // ── Handle drag end → reorder fields and update parent ──────────────────────
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = subform.fields.findIndex((f) => f.id === active.id);
      const newIndex = subform.fields.findIndex((f) => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newFields = arrayMove(subform.fields, oldIndex, newIndex);

        // Update parent component with new order
        onUpdateSubform({ fields: newFields });

        // Optional: you can also persist the order to backend here
        // e.g. send PATCH request with new order indices
      }
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          {/* ── Inline-editable subform name ── */}
          <InlineEdit
            value={subform.name}
            onSave={handleSaveSubformName}
            className="text-base font-semibold text-[#374151]"
            inputClassName="text-base font-semibold"
            placeholder="Subform name"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowSubformSettings(true)}>
              <Settings className="mr-2 h-4 w-4" /> Visibility Settings
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete subform
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && (
        <div
          className={`border rounded-[4px] overflow-hidden shadow-sm transition-all duration-200 ${isOver ? "border-blue-400 bg-blue-50/50 ring-2 ring-blue-200" : "border-slate-300 bg-white"
            }`}
        >
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div
              ref={setDroppableRef}
              className="overflow-x-auto overflow-y-hidden"
              style={{ scrollbarWidth: "thin" }}
            >
              <div className="inline-flex w-[20rem]">
                <div className="flex border-b border-slate-200">
                  <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
                    {subform.fields.map((field) => (
                      <TabularFieldHeader
                        key={field.id}
                        field={field}
                        onUpdate={onUpdateField}
                        onDelete={() => onDeleteField(field.id)}
                        onCopy={() => onCopyField?.(field)}
                      />
                    ))}
                  </SortableContext>
                  <div className="flex items-center justify-center min-w-[140px] border-l border-slate-200 bg-white p-4 h-[90px]">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="link" className="text-[#515ada] font-normal hover:no-underline">
                          Add Field
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => addField("text")}>Single Line</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addField("textarea")}>Multi-Line</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addField("number")}>Number</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="flex min-w-full h-12 bg-white">
                  {subform.fields.map((f) => (
                    <div key={f.id} className="min-w-[280px] border-r border-slate-100" />
                  ))}
                  <div className="min-w-[140px]" />
                </div>
              </div>
            </div>
          </DndContext>
        </div>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subform</DialogTitle>
            <DialogDescription className="pt-2">
              Are you sure you want to delete <span className="font-semibold text-foreground">"{subform.name}"</span>?<br />
              <span className="text-destructive font-medium">
                This will permanently delete the subform and <strong>all nested fields and child subforms</strong>.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSubform}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Subform"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── VISIBILITY SETTINGS DIALOG ── */}
      <Dialog open={showSubformSettings} onOpenChange={setShowSubformSettings}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Visibility Settings — {subform.name}
            </DialogTitle>
            <DialogDescription>
              Show or hide this subform based on the value of a field in the main form.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Enable Conditional Visibility</Label>
                <p className="text-sm text-muted-foreground">
                  Control visibility based on another field's value
                </p>
              </div>
              <Switch
                checked={!!localConditional}
                onCheckedChange={(enabled) => {
                  console.log("[Subform Visibility] Enable toggle changed →", enabled ? "ON" : "OFF");
                  if (enabled) {
                    setLocalConditional({
                      type: "show",
                      parentFieldId: "",
                      value: "",
                    });
                  } else {
                    setLocalConditional(null);
                  }
                  setHasChanges(true);
                }}
              />
            </div>

            {localConditional && (
              <div className="pl-6 border-l-2 border-muted space-y-5">
                {/* Depends on field */}
                <div className="space-y-2">
                  <Label>Depends on field</Label>

                  {fieldsLoading ? (
                    <div className="flex items-center gap-2 py-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Loading form fields...</span>
                    </div>
                  ) : fieldsError ? (
                    <div className="text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {fieldsError}
                    </div>
                  ) : formFields.length === 0 ? (
                    <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded">
                      No fields found in the main form yet.
                    </div>
                  ) : (
                    <Select
                      value={localConditional.parentFieldId || ""}
                      onValueChange={(val) => {
                        console.log("[Subform Visibility] Parent field selected →", val);
                        setLocalConditional((prev) => ({
                          ...prev!,
                          parentFieldId: val,
                          value: "", // reset value when parent changes
                        }));
                        setHasChanges(true);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a field from the main form" />
                      </SelectTrigger>
                      <SelectContent>
                        {formFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.label || "Unnamed"} <span className="text-xs text-muted-foreground">({f.type})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Action: Show / Hide */}
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select
                    value={localConditional.type}
                    onValueChange={(val) => {
                      console.log("[Subform Visibility] Action changed →", val);
                      setLocalConditional((prev) => ({
                        ...prev!,
                        type: val as "show" | "hide",
                      }));
                      setHasChanges(true);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="show">Show this subform</SelectItem>
                      <SelectItem value="hide">Hide this subform</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Trigger value */}
                <div className="space-y-2">
                  <Label>Trigger value</Label>

                  {(() => {
                    const parent = formFields.find((f) => f.id === localConditional.parentFieldId);
                    const options = parent?.options ?? [];

                    console.log("[Subform Visibility] Rendering trigger value input", {
                      parentId: localConditional.parentFieldId,
                      parentLabel: parent?.label,
                      hasOptions: options.length > 0,
                      optionCount: options.length,
                    });

                    if (options.length > 0) {
                      return (
                        <Select
                          value={localConditional.value || ""}
                          onValueChange={(val) => {
                            console.log("[Subform Visibility] Trigger value (dropdown) selected →", val);
                            setLocalConditional((prev) => ({ ...prev!, value: val }));
                            setHasChanges(true);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose value that triggers the action" />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((opt) => (
                              <SelectItem key={opt.value || opt.label} value={opt.value || opt.label}>
                                {opt.label}
                                {opt.value && opt.value !== opt.label && (
                                  <span className="text-xs text-muted-foreground ml-1">({opt.value})</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    }

                    return (
                      <Input
                        value={localConditional.value || ""}
                        onChange={(e) => {
                          console.log("[Subform Visibility] Trigger value (free text) changed →", e.target.value);
                          setLocalConditional((prev) => ({ ...prev!, value: e.target.value }));
                          setHasChanges(true);
                        }}
                        placeholder="e.g. Yes, Active, 1, Rajasthan, true"
                      />
                    );
                  })()}

                  <p className="text-xs text-muted-foreground">
                    The subform will {localConditional.type === "show" ? "appear" : "be hidden"} when the field equals this value.
                  </p>
                </div>

                {/* Preview / current rule */}
                {localConditional.parentFieldId && localConditional.value && (
                  <div className="mt-3 p-3 bg-muted/50 rounded border text-sm">
                    <strong>Current rule:</strong><br />
                    This subform will be <strong>{localConditional.type === "show" ? "shown" : "hidden"}</strong> when{" "}
                    <em>{formFields.find((f) => f.id === localConditional.parentFieldId)?.label || "selected field"}</em> ={" "}
                    <strong>"{localConditional.value}"</strong>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-3 sm:gap-4">
            <Button
              variant="outline"
              onClick={() => {
                console.log("[Subform Visibility] Cancel clicked → discarding changes");
                setShowSubformSettings(false);
                setLocalConditional(subform.conditional ?? null);
                setHasChanges(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                console.log("[Subform Visibility] SAVE clicked → preparing to send to API", {
                  subformId: subform.id,
                  conditional: localConditional ?? null,
                });

                try {
                  const result = await updateSubform({
                    subformId: subform.id,
                    body: { conditional: localConditional ?? null },
                  }).unwrap();
                  console.log("[Subform Visibility] API save successful → server returned:", result);

                  // Update parent component state (optimistic / sync)
                  onUpdateSubform({
                    conditional: localConditional ?? undefined,
                  });

                  toast({
                    title: "Saved",
                    description: "Subform visibility settings updated.",
                  });
                } catch (err: any) {
                  console.error("[Subform Visibility] Failed to save conditional visibility:", err);
                  toast({
                    variant: "destructive",
                    title: "Save failed",
                    description: err.message || "Could not save visibility settings. Please try again.",
                  });
                } finally {
                  setHasChanges(false);
                  setShowSubformSettings(false);
                }
              }}
              disabled={!hasChanges}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .overflow-x-auto::-webkit-scrollbar {
          height: 8px;
        }
        .overflow-x-auto::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        .overflow-x-auto::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 4px;
        }
        .overflow-x-auto::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
        .overflow-x-auto {
          scrollbar-width: thin;
          scrollbar-color: #94a3b8 #f1f5f9;
        }
      `}</style>
    </div>
  );
}

function TabularFieldHeader({ field, onUpdate, onDelete, onCopy }: any) {
  const [showSettings, setShowSettings] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionDefinition[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [hasLoadedPermissions, setHasLoadedPermissions] = useState(false);

  const [triggerGetFieldPermission] = useLazyGetFieldPermissionQuery();

  useEffect(() => {
    if (showPermissions && !hasLoadedPermissions) {
      const fetchPermissions = async () => {
        setPermissionsLoading(true);
        try {
          const data = await triggerGetFieldPermission(field.id).unwrap();
          setPermissions(data.data?.profiles ?? data.profiles ?? []);
          setAvailablePermissions(data.data?.availablePermissions ?? data.availablePermissions ?? []);
          setHasLoadedPermissions(true);
        } catch (err) {
          toast({ variant: "destructive", title: "Error", description: "Failed to load permissions" });
        } finally {
          setPermissionsLoading(false);
        }
      };
      fetchPermissions();
    }
  }, [showPermissions, hasLoadedPermissions, field.id, toast, triggerGetFieldPermission]);

  const [updateFieldPermission] = useUpdateFieldPermissionMutation();

  const handlePermissionChange = async (roleId: string, permissionId: string) => {
    try {
      await updateFieldPermission({ fieldId: field.id, body: { roleId, permissionId } }).unwrap();
      setPermissions((prev) =>
        prev.map((p) => (p.id === roleId ? { ...p, permission: permissionId } : p)),
      );
      toast({ title: "Success", description: "Permission updated" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Save failed" });
    }
  };

  // ── Save field label inline ────────────────────────────────────────────────
  const handleSaveFieldLabel = async (newLabel: string) => {
    try {
      await onUpdate(field.id, { label: newLabel });
      toast({ title: "Field renamed", description: `Renamed to "${newLabel}"` });
    } catch (err: any) {
      console.error("[Field Rename]", err);
      toast({
        variant: "destructive",
        title: "Rename failed",
        description: err?.message || "Could not rename field. Please try again.",
      });
      throw err; // re-throw so InlineEdit knows to revert
    }
  };
  // ────────────────────────────────────────────────────────────────────────────

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: {
      type: "Field",
      field: field,
    },
  });

  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1 };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`min-w-[280px] p-4 bg-[#f8f9fb] border-r border-slate-200 h-[90px] flex flex-col justify-between group cursor-move ${isDragging ? "opacity-40" : ""
          }`}
      >
        <div className="flex justify-between items-start">
          {/* ── Inline-editable field label ──
              Stop drag listeners on the label area so clicking to edit
              doesn't accidentally start a drag. */}
          <span
            className="font-medium text-[#374151] text-[15px] truncate pr-2 flex-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <InlineEdit
              value={field.label}
              onSave={handleSaveFieldLabel}
              className="font-medium text-[#374151] text-[15px]"
              inputClassName="text-[15px] font-medium w-full"
              placeholder="Field label"
            />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-400 opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowSettings(true)}>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowPermissions(true)}>
                <Lock className="mr-2 h-4 w-4" /> Permissions
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopy}>
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="text-[#a1b0cb] text-[13px]">
          {field.type === "textarea" ? "Multi-Line" : "Single Line"}
        </div>
      </div>

      {showSettings && (
        <FieldSettings
          field={field}
          open={showSettings}
          onOpenChange={setShowSettings}
          onUpdate={(updates) => onUpdate(field.id, updates)}
        />
      )}

      <Dialog open={showPermissions} onOpenChange={setShowPermissions}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Permissions — {field.label}
            </DialogTitle>
          </DialogHeader>
          {permissionsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-2 py-4 max-h-[50vh] overflow-y-auto">
              {permissions.map((role) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between gap-4 p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <span className="font-medium">{role.name}</span>
                  <Select
                    value={role.permission}
                    onValueChange={(v) => handlePermissionChange(role.id, v)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select Access" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">No access (Hidden)</SelectItem>
                      {availablePermissions.map((perm) => (
                        <SelectItem key={perm.id} value={perm.id}>
                          {perm.name.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissions(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}