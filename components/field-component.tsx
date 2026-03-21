"use client";
import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
  GripVertical,
  MoreHorizontal,
  Settings,
  Trash2,
  EyeOff,
  Star,
  Copy,
  Upload,
  Calculator,
  Lock,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { FormField, FieldOption } from "@/types/form-builder";
import { LookupField } from "@/components/lookup-field";
import FieldSettings from "@/components/field-settings";
import FormulaConfigurationDialog from "@/components/FormulaConfigurationDialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLazyGetFieldPermissionQuery, useUpdateFieldPermissionMutation } from "@/lib/api/forms";

// --- PERMISSION TYPES ---
interface PermissionDefinition {
  id: string;
  name: string;
  category: string;
  resource: string;
}

interface RolePermission {
  id: string;     // roleId
  name: string;   // roleName
  permission: string; // The ID from PermissionDefinition or "NONE"
}

interface FieldComponentProps {
  field: FormField;
  isOverlay?: boolean;
  isInSubform?: boolean;
  onUpdate: (fieldId: string, updates: Partial<FormField>) => Promise<void>;
  onDelete: (fieldId: string) => void;
  onCopy: (field: FormField) => void;
  formId: string;
}

export default function FieldComponent({
  field,
  isOverlay = false,
  isInSubform = false,
  onUpdate,
  onDelete,
  onCopy,
  formId,
}: FieldComponentProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editLabel, setEditLabel] = useState(field.label);
  const [isUpdating, setIsUpdating] = useState(false);
  const [previewValue, setPreviewValue] = useState<any>(
    field?.defaultValue || "",
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // --- DYNAMIC PERMISSION STATES ---
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<
    PermissionDefinition[]
  >([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [hasLoadedPermissions, setHasLoadedPermissions] = useState(false);

  const labelInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [triggerGetFieldPermission] = useLazyGetFieldPermissionQuery();
  const [updateFieldPermission] = useUpdateFieldPermissionMutation();

  // ==================== FORM ID: PROP FIRST → URL FALLBACK ====================
  const params = useParams();

  const getFormIdFromUrl = (): string => {
    if (!params) return "";

    const keys = ["formId", "id", "slug", "form_id"];
    for (const key of keys) {
      const val = params[key];
      if (val) return Array.isArray(val) ? val[0] : String(val);
    }

    const segments = window.location.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  };

  const effectiveFormId = formId && formId.trim() !== ""
    ? formId
    : getFormIdFromUrl();
  // =========================================================================

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: field.id,
    data: {
      type: "Field",
      field,
      sortable: {
        containerId: field.subformId || field.sectionId,
      },
    },
    disabled: isOverlay || showSettings || isEditingLabel,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  useEffect(() => {
    if (isEditingLabel && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [isEditingLabel]);

  // Geolocation handling
  useEffect(() => {
    if (field.type === "location" && !previewValue) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const locationString = `${latitude}, ${longitude}`;
            setPreviewValue(locationString);
            onUpdate(field.id, { defaultValue: locationString }).catch(
              (error) => {
                console.error("[Field] Error updating location:", error);
              },
            );
          },
          (error) => {
            console.error("[Field] Geolocation error:", error);
            setPreviewValue("Location unavailable");
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
      }
    }
  }, [field.type, field.id, previewValue, onUpdate]);

  // --- FETCH PERMISSIONS ---
  useEffect(() => {
    if (showPermissionsDialog && !hasLoadedPermissions) {
      const fetchPermissions = async () => {
        setPermissionsLoading(true);
        try {
          const data = await triggerGetFieldPermission(field.id).unwrap();

          setPermissions(data.profiles ?? []);
          setAvailablePermissions(data.availablePermissions ?? []);
          setHasLoadedPermissions(true);
        } catch (err) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load field permissions",
          });
        } finally {
          setPermissionsLoading(false);
        }
      };
      fetchPermissions();
    }
  }, [showPermissionsDialog, hasLoadedPermissions, field.id, toast]);

  // --- HANDLE PERMISSION CHANGE ---
  const handlePermissionChange = async (
    roleId: string,
    permissionId: string,
  ) => {
    try {
      await updateFieldPermission({
        fieldId: field.id,
        body: { roleId, permissionId },
      }).unwrap();

      setPermissions((prev) =>
        prev.map((p) =>
          p.id === roleId ? { ...p, permission: permissionId } : p
        )
      );

      toast({
        title: "Success",
        description: "Field permission updated",
      });
    } catch (err: any) {
      console.error("Permission save failed:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to update permission",
      });
    }
  };

  if (!field) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4 text-center">
          <p className="text-red-600 text-sm">Error: Field data is missing</p>
        </CardContent>
      </Card>
    );
  }

  const getFieldTypeDisplay = (): string => {
    const typeMap: Record<string, string> = {
      text: "Text",
      textarea: "Text Area",
      number: "Number",
      email: "Email",
      tel: "Phone",
      url: "URL",
      date: "Date",
      time: "Time",
      datetime: "Date/Time",
      checkbox: "Checkbox",
      switch: "Switch",
      radio: "Radio Buttons",
      select: "Dropdown",
      "multi-select": "Multi Select",
      slider: "Slider",
      rating: "Rating",
      file: "File Upload",
      image: "Image",
      signature: "Signature",
      camera: "Camera",
      location: "Location",
      lookup: "Lookup",
      password: "Password",
      hidden: "Hidden",
      formula: "Formula",
      rollup: "Rollup",
      subform: "Subform",
      "auto-number": "Auto Number",
      "rich-text": "Rich Text",
      currency: "Currency",
      decimal: "Decimal",
      percent: "Percent",
    };
    return typeMap[field.type] || field.type;
  };

  const handleLabelChange = async (newLabel: string) => {
    if (newLabel.trim() && newLabel !== field.label) {
      setIsUpdating(true);
      try {
        await onUpdate(field.id, { label: newLabel.trim() });
        setIsEditingLabel(false);
        toast({ title: "Success", description: "Field label updated" });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to update label",
          variant: "destructive",
        });
      } finally {
        setIsUpdating(false);
      }
    } else {
      setIsEditingLabel(false);
      setEditLabel(field.label);
    }
  };

  const handleUpdateField = async (updates: Partial<FormField>) => {
    try {
      const completeUpdates = {
        ...updates,
        sectionId: updates.sectionId ?? field.sectionId,
        subformId: updates.subformId ?? field.subformId,
        type: updates.type ?? field.type,
        label: updates.label ?? field.label,
      };
      await onUpdate(field.id, completeUpdates);
      setShowSettings(false);
      toast({ title: "Success", description: `Field updated successfully` });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Update failed",
        variant: "destructive",
      });
    }
  };

  const handleFormulaSave = (config: any, savedFieldId: string) => {
    onUpdate(savedFieldId, {
      label: config.fieldLabel,
      formula: {
        expression: config.expression,
        returnType: config.returnType,
        blankPreference: config.blankPreference,
        decimalPlaces: config.decimalPlaces,
        visibleInForm: config.visibleInForm ?? true,
      },
      decimalPlaces: config.decimalPlaces,
      properties: {
        ...field.properties,
        formulaConfig: config,
      },
    })
      .then(() => {
        setShowSettings(false);
        toast({ title: "Success", description: "Formula saved" });
      })
      .catch(() =>
        toast({
          title: "Error",
          description: "Formula save failed",
          variant: "destructive",
        }),
      );
  };

  const renderFieldPreview = () => {
    const options = Array.isArray(field.options) ? field.options : [];
    const lookupFieldData = {
      id: field.id,
      label: field.label,
      type: field.type,
      placeholder: field.placeholder || undefined,
      description: field.description || undefined,
      validation: field.validation || { required: false },
      lookup: field.lookup || undefined,
    };

    if (["image", "file", "signature", "camera"].includes(field.type)) {
      const isImage =
        previewValue && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(previewValue);
      const isPdfOrDoc =
        previewValue && /\.(pdf|doc|docx|xls|xlsx)$/i.test(previewValue);

      return (
        <div className="space-y-4">
          {previewValue ? (
            <div className="relative rounded-lg border-2 border-dashed border-gray-300 p-4 bg-gray-50">
              {isImage ? (
                <img
                  src={previewValue || "/placeholder.svg"}
                  alt="Preview"
                  className="max-h-64 w-full object-contain rounded"
                />
              ) : isPdfOrDoc ? (
                <div className="flex items-center gap-2 text-blue-600 font-medium">
                  <Upload className="h-5 w-5" />
                  View File
                </div>
              ) : (
                <p className="text-gray-600 text-sm">
                  File: {previewValue.split("/").pop()}
                </p>
              )}
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50">
              <p className="text-sm text-gray-500 font-medium">
                Upload disabled in editor
              </p>
            </div>
          )}
        </div>
      );
    }

    switch (field.type) {
      case "text":
      case "email":
      case "number":
      case "tel":
      case "url":
      case "password":
        return (
          <Input
            type={field.type}
            placeholder={field.placeholder || ""}
            disabled
            className="bg-gray-50"
          />
        );
      case "textarea":
      case "rich-text":
        return (
          <Textarea
            placeholder={field.placeholder || ""}
            rows={field.properties?.rows || 3}
            disabled
            className="bg-gray-50"
          />
        );
      case "date":
      case "time":
      case "datetime":
        return (
          <Input
            type={field.type === "datetime" ? "datetime-local" : field.type}
            disabled
            className="bg-gray-50"
          />
        );
      case "checkbox":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox checked={previewValue} disabled />
            <Label className="text-sm">{field.label}</Label>
          </div>
        );
      case "switch":
        return (
          <div className="flex items-center space-x-2">
            <Switch checked={previewValue} disabled />
            <Label className="text-sm">{field.label}</Label>
          </div>
        );
      case "radio":
        return (
          <RadioGroup value={previewValue} disabled>
            {options.map((opt: FieldOption) => (
              <div key={opt.id} className="flex items-center space-x-2">
                <RadioGroupItem value={opt.value} disabled />
                <Label className="text-sm">{opt.label}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      case "select":
      case "multi-select":
        return (
          <Select disabled>
            <SelectTrigger className="bg-gray-50">
              <SelectValue
                placeholder={field.placeholder || "Select an option"}
              />
            </SelectTrigger>
          </Select>
        );
      case "slider":
        return (
          <Slider
            value={[field.validation?.min || 0]}
            max={field.validation?.max || 100}
            disabled
            className="w-full"
          />
        );
      case "rating":
        return (
          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4, 5].map((r) => (
              <Star key={r} className="h-5 w-5 text-gray-300" />
            ))}
          </div>
        );
      case "lookup":
        return (
          <LookupField
            field={lookupFieldData}
            value={previewValue}
            onChange={() => { }}
            disabled={true}
          />
        );
      case "formula":
        return (
          <div
            className={cn("p-4 rounded-lg border-2 bg-blue-50 border-blue-300")}
          >
            <div className="flex items-start gap-3">
              <Calculator className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-blue-600">
                  Formula Expression
                </p>
                <p className="text-sm font-mono p-2 rounded bg-white border border-blue-200 mt-1">
                  {field.formula?.expression || "(no formula)"}
                </p>
              </div>
            </div>
          </div>
        );
      case "hidden":
        return (
          <div className="flex items-center space-x-2 p-3 rounded border-dashed border-2 bg-gray-100 border-gray-300">
            <EyeOff className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-500">
              Hidden Field
            </span>
          </div>
        );
      case "address": {
        const subfields = field.properties?.subfields || [
          { key: "line1", label: "Address Line 1", placeholder: "Street address", required: true },
          { key: "line2", label: "Address Line 2", placeholder: "Apt / Floor / Suite", required: false },
          { key: "city", label: "City", placeholder: "City", required: true },
          { key: "state", label: "State", placeholder: "State / Province", required: true },
          { key: "postal", label: "Zip / Postal Code", placeholder: "Pincode / Zip", required: true },
          { key: "country", label: "Country", type: "select", required: true },
        ];

        const mockValue: Record<string, string> = {
          line1: "Street address, house no.",
          line2: "Apartment, suite, floor",
          city: "Enter City",
          state: "Enter State",
          postal: "Enter Postal Code ",
          country: "Select Country",
        };

        return (
          <div className="space-y-4 p-4 border border-gray-300 rounded-md bg-gray-50/70">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subfields.map((sub: any) => {
                if (!sub) return null;
                const val = mockValue[sub.key] || "";

                if (sub.type === "select") {
                  return (
                    <div key={sub.key} className="space-y-1.5">
                      <Label className="text-sm font-medium">
                        {sub.label}
                        {sub.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <Select disabled>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder={val || sub.placeholder || "Select..."} />
                        </SelectTrigger>
                      </Select>
                    </div>
                  );
                }

                return (
                  <div key={sub.key} className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      {sub.label}
                      {sub.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <Input
                      placeholder={sub.placeholder}
                      value={val}
                      disabled
                      className="bg-white"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
      default:
        return (
          <Input
            placeholder={field.placeholder || ""}
            disabled
            className="bg-gray-50"
          />
        );
    }
  };

  const getCardStyles = () => {
    return isInSubform
      ? `group relative transition-all duration-200 border-l-4 border-l-purple-400 ${isDragging
        ? "shadow-2xl scale-105 bg-purple-100"
        : "hover:shadow-md bg-purple-50/50"
      }`
      : `group relative transition-all duration-200 ${isDragging
        ? "shadow-2xl scale-105 border-blue-400 bg-blue-50"
        : "hover:shadow-md"
      }`;
  };

  return (
    <>
      <Card ref={setNodeRef} style={style} className={getCardStyles()}>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <GripVertical className="h-5 w-5" />
            </div>

            <div className="flex-1 min-w-0">
              {isEditingLabel ? (
                <Input
                  ref={labelInputRef}
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={() => handleLabelChange(editLabel)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleLabelChange(editLabel)
                  }
                  className="h-8 text-sm"
                />
              ) : (
                <div
                  className="space-y-1 cursor-pointer"
                  onClick={() => setIsEditingLabel(true)}
                >
                  <p
                    className={cn(
                      "text-sm font-medium",
                      isInSubform && "text-purple-800",
                    )}
                  >
                    {field.label}{" "}
                    {field.validation?.required && (
                      <span className="text-red-500">*</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getFieldTypeDisplay()}
                  </p>
                </div>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onCopy(field)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowPermissionsDialog(true)}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Permissions
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {field.type !== "checkbox" &&
            field.type !== "switch" &&
            field.type !== "hidden" &&
            renderFieldPreview()}
          {["checkbox", "switch", "hidden"].includes(field.type) &&
            renderFieldPreview()}
        </CardContent>
      </Card>

      {/* --- FIELD PERMISSIONS DIALOG --- */}
      <Dialog
        open={showPermissionsDialog}
        onOpenChange={setShowPermissionsDialog}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Field Permissions — {field.label}
            </DialogTitle>
          </DialogHeader>

          {permissionsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : permissions.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No roles found
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
                        <SelectValue placeholder="Select permission..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="NONE"
                          className="text-muted-foreground italic"
                        >
                          No access (Hidden)
                        </SelectItem>

                        <DropdownMenuSeparator />

                        {availablePermissions.map((perm) => (
                          <SelectItem key={perm.id} value={perm.id}>
                            <div className="flex flex-col items-start">
                              <span className="font-medium text-sm">
                                {perm.name.replace(/_/g, " ")}
                              </span>
                              <span className="text-[10px] text-muted-foreground opacity-70 uppercase">
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

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Field</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{field.label}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(field.id);
                setIsDeleteDialogOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialogs */}
      {showSettings &&
        (field.type === "formula" ? (
          <FormulaConfigurationDialog
            open={showSettings}
            onOpenChange={setShowSettings}
            formId={effectiveFormId}
            fieldId={field.id}
            fieldLabel={field.label}
            initialConfig={field.properties?.formulaConfig as FormulaConfig | undefined}
            onSave={handleFormulaSave}
          />
        ) : (
          <FieldSettings
            field={field}
            open={showSettings}
            onOpenChange={setShowSettings}
            onUpdate={handleUpdateField}
          />
        ))}
    </>
  );
}