"use client";
import { useEffect, useState, createContext, useContext } from "react";
import { useParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  closestCorners,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import FormCanvas from "@/components/form-canvas";
import ResizableSidebar from "@/components/resizable-sidebar";
import FieldPalette, {
  PaletteItemDragOverlay,
  type fieldTypes,
} from "@/components/field-palette";
import PublishFormDialog from "@/components/publish-form-dialog";
import LookupConfigurationDialog from "@/components/lookup-configuration-dialog";
import UserFormSettingsDialog from "@/components/user-form-settings-dialog";
import type { Form, FormField, Subform } from "@/types/item-types";
import {
  Save,
  ArrowLeft,
  Loader2,
  Share2,
  Users,
  Settings,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { v4 as uuidv4 } from "uuid";
import type { FormulaConfig } from "@/components/formula-builder";
import FormulaConfigurationDialog from "@/components/FormulaConfigurationDialog";
import ResourcePermissionDialog from "@/components/resource-permission-dialog";

// Enhanced interface for subform hierarchy tracking
interface SubformHierarchy {
  id: string;
  name: string;
  path: string;
  level: number;
  parentPath?: string;
  sectionId: string;
  parentSubformId?: string;
  children: SubformHierarchy[];
}

interface FormBuilderContextType {
  openPermissionDialog: (resource: {
    type: "form" | "section" | "subform" | "field";
    id: string;
  }) => void;
}

const FormBuilderContext = createContext<FormBuilderContextType | undefined>(
  undefined,
);

export function useFormBuilderContext() {
  const context = useContext(FormBuilderContext);
  if (!context)
    throw new Error(
      "useFormBuilderContext must be used within FormBuilderPage",
    );
  return context;
}

export default function FormBuilderPage() {
  const params = useParams();
  const formId = params.formId as string;
  const { toast } = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [isLookupDialogOpen, setIsLookupDialogOpen] = useState(false);
  const [isUserFormSettingsOpen, setIsUserFormSettingsOpen] = useState(false);
  const [isFormulaDialogOpen, setIsFormulaDialogOpen] = useState(false);
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<{
    type: string;
    id: string;
  } | null>(null);
  const [pendingLookupSectionId, setPendingLookupSectionId] = useState<
    string | undefined
  >(undefined);
  const [pendingLookupSubformId, setPendingLookupSubformId] = useState<
    string | undefined
  >(undefined);
  const [pendingFormulaFieldId, setPendingFormulaFieldId] = useState<
    string | null
  >(null);
  const [activePaletteItem, setActivePaletteItem] = useState<
    (typeof fieldTypes)[0] | null
  >(null);
  const [subformHierarchyMap, setSubformHierarchyMap] = useState<
    Map<string, SubformHierarchy>
  >(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const openPermissionDialog = (resource: { type: string; id: string }) => {
    setSelectedResource(resource);
    setIsPermissionDialogOpen(true);
  };

  useEffect(() => {
    if (formId) {
      fetchForm();
    }
  }, [formId]);

  // Build hierarchical path map for all top-level subforms in form
  const buildSubformHierarchyMap = (
    form: Form,
  ): Map<string, SubformHierarchy> => {
    const hierarchyMap = new Map<string, SubformHierarchy>();

    const processSubforms = (
      subforms: Subform[],
      formId: string,
      parentPath = "",
      level = 0,
    ): SubformHierarchy[] => {
      return subforms.map((subform, index) => {
        const currentPath = parentPath
          ? `${parentPath}.${index + 1}`
          : `${index + 1}`;
        const hierarchy: SubformHierarchy = {
          id: subform.id,
          name: subform.name,
          path: currentPath,
          level,
          parentPath: parentPath || undefined,
          sectionId: formId, // Store formId in sectionId field for compatibility
          parentSubformId: subform.parentSubformId ?? undefined,
          children: [],
        };

        if (subform.childSubforms && subform.childSubforms.length > 0) {
          hierarchy.children = processSubforms(
            subform.childSubforms,
            formId,
            currentPath,
            level + 1,
          );
        }

        hierarchyMap.set(subform.id, hierarchy);
        return hierarchy;
      });
    };

    // Process top-level subforms from the form
    if (form.subforms && form.subforms.length > 0) {
      processSubforms(form.subforms, form.id);
    }

    return hierarchyMap;
  };

  const getSubformPath = (subformId: string): string => {
    const hierarchy = subformHierarchyMap.get(subformId);
    return hierarchy?.path || "";
  };

  const getFullSubformPath = (subformId: string): string => {
    if (!form) return "";

    const hierarchy = subformHierarchyMap.get(subformId);
    if (!hierarchy) return "";

    const section = form.sections.find((s: { id: string; }) => s.id === hierarchy.sectionId);
    const sectionName = section?.title || "Unknown Section";

    return `${sectionName} → ${hierarchy.path}`;
  };

  const getParentChildDisplay = (subformId: string): string => {
    const hierarchy = subformHierarchyMap.get(subformId);
    if (!hierarchy) return "";

    if (hierarchy.parentPath) {
      return `Parent: ${hierarchy.parentPath} → Current: ${hierarchy.path}`;
    }

    return `Root Level: ${hierarchy.path}`;
  };

  const getAncestorPaths = (subformId: string): string[] => {
    const hierarchy = subformHierarchyMap.get(subformId);
    if (!hierarchy) return [];

    const ancestors: string[] = [];
    let currentPath = hierarchy.parentPath;

    while (currentPath) {
      ancestors.unshift(currentPath);
      let parentHierarchy = Array.from(subformHierarchyMap.values()).find(
        (h) => h.path === currentPath,
      );
      currentPath = parentHierarchy?.parentPath;
    }

    return ancestors;
  };

  const fetchForm = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/forms/${formId}`);
      if (!response.ok) throw new Error("Failed to fetch form");

      const result = await response.json();
      if (result.success) {
        setForm(result.data);
        const hierarchyMap = buildSubformHierarchyMap(result.data);
        setSubformHierarchyMap(hierarchyMap);
      } else {
        throw new Error(result.error || "Failed to fetch form");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const optimisticFormUpdate = (updatedForm: Form) => {
    setForm(updatedForm);
    const hierarchyMap = buildSubformHierarchyMap(updatedForm);
    setSubformHierarchyMap(hierarchyMap);
  };

  const handleFormUpdate = (updatedForm: Form) => {
    optimisticFormUpdate(updatedForm);
  };

  const handleFormPublished = (updatedForm: Form) => {
    optimisticFormUpdate(updatedForm);
  };

  const handleUserFormSettingsUpdate = async (
    isUserForm: boolean,
    isEmployeeForm: boolean,
  ) => {
    if (!form) return;

    try {
      const response = await fetch(`/api/forms/${formId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          isUserForm,
          isEmployeeForm,
        }),
      });

      if (!response.ok) throw new Error("Failed to update form settings");
      const result = await response.json();
      if (result.success) {
        optimisticFormUpdate(result.data);
        toast({
          title: "Success",
          description: isUserForm
            ? "Form marked as user form"
            : isEmployeeForm
              ? "Form marked as employee form"
              : "Form marked as regular form",
        });
      } else {
        throw new Error(result.error || "Failed to update form settings");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === "PaletteField") {
      setActivePaletteItem(event.active.data.current.fieldData);
    } else {
      setActivePaletteItem(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActivePaletteItem(null);

    if (!over) return;

    if (active.data.current?.type === "PaletteField") {
      const fieldType = active.data.current.fieldType as string;
      let sectionId: string | undefined = undefined;
      let subformId: string | undefined = undefined;
      let insertIndex = 0;

      if (over.data.current?.isSectionDropzone) {
        sectionId = over.data.current.sectionId;
        const section = form?.sections.find((s: { id: string | undefined; }) => s.id === sectionId);
        if (section) {
          insertIndex = section.fields.length;
        }
      } else if (over.data.current?.isSubformDropzone || over.data.current?.type === "SubformDropzone") {
        const targetSubform = over.data.current.subform;
        if (targetSubform) {
          subformId = targetSubform.id;
          sectionId = targetSubform.sectionId; // May be undefined for top-level
          const allItems = [
            ...(targetSubform.fields || []),
            ...(targetSubform.childSubforms || []),
          ];
          insertIndex = allItems.length;
        }
      } else if (over.data.current?.type === "Field") {
        sectionId = over.data.current?.field?.sectionId;
        subformId = over.data.current?.field?.subformId;
        const itemId = over.data.current?.field?.id;

        if (subformId) {
          // Field is inside a subform
          const findSubform = (subforms: Subform[]): Subform | undefined => {
            for (const sf of subforms) {
              if (sf.id === subformId) return sf;
              if (sf.childSubforms) {
                const found = findSubform(sf.childSubforms);
                if (found) return found;
              }
            }
            return undefined;
          };

          let targetSubform: Subform | undefined;
          if (form?.subforms) {
            targetSubform = findSubform(form.subforms);
          }
          if (!targetSubform && form?.sections) {
            for (const section of form.sections) {
              if (section.subforms) {  // Only check if subforms exist
                targetSubform = findSubform(section.subforms);
                if (targetSubform) {
                  sectionId = section.id;
                  break;
                }
              }
            }
          }

          if (targetSubform) {
            const allItems = [
              ...(targetSubform.fields || []).sort((a: { order: number; }, b: { order: number; }) => a.order - b.order),
              ...(targetSubform.childSubforms || []).sort((a: { order: number; }, b: { order: number; }) => a.order - b.order),
            ];
            insertIndex = allItems.findIndex((i) => i.id === itemId);
            if (insertIndex === -1) insertIndex = allItems.length;

            const activeCenter = active.rect.current.translated
              ? active.rect.current.translated.top + active.rect.current.translated.height / 2
              : 0;
            const overCenter = over.rect.top + over.rect.height / 2;
            const isAfter = activeCenter > overCenter;
            insertIndex += isAfter ? 1 : 0;
          }
        } else if (sectionId) {
          // Field is in a section
          const section = form?.sections.find((s: { id: string | undefined; }) => s.id === sectionId);
          if (section) {
            const sortedFields = [...(section.fields || [])].sort((a, b) => a.order - b.order);
            insertIndex = sortedFields.findIndex((f) => f.id === itemId);
            if (insertIndex === -1) insertIndex = sortedFields.length;

            const activeCenter = active.rect.current.translated
              ? active.rect.current.translated.top + active.rect.current.translated.height / 2
              : 0;
            const overCenter = over.rect.top + over.rect.height / 2;
            const isAfter = activeCenter > overCenter;
            insertIndex += isAfter ? 1 : 0;
          }
        }
      } else if (over.data.current?.type === "Subform") {
        const targetSubform = over.data.current.subform;
        if (targetSubform) {
          subformId = targetSubform.id;
          sectionId = targetSubform.sectionId;
          const allItems = [
            ...(targetSubform.fields || []),
            ...(targetSubform.childSubforms || []),
          ];
          insertIndex = allItems.length;
        }
      } else {
        return;
      }

      if (!sectionId && !subformId) return;

      if (fieldType === "subform") {
        await createSubform(sectionId, subformId);
      } else if (fieldType === "lookup") {
        setPendingLookupSectionId(sectionId);
        setPendingLookupSubformId(subformId);
        setIsLookupDialogOpen(true);
      } else {
        await createSingleField(fieldType, sectionId, subformId, insertIndex);
      }
    } else if (active.data.current?.type === "Field") {
      const activeField = active.data.current.field as FormField;

      let targetSectionId: string | undefined;
      let targetSubformId: string | undefined;
      let targetIndex = 0;

      if (over.data.current?.isSectionDropzone) {
        targetSectionId = over.data.current.sectionId;
        const targetSection = form?.sections.find((s: { id: string | undefined; }) => s.id === targetSectionId);
        if (targetSection) {
          targetIndex = targetSection.fields.length;
        }
      } else if (over.data.current?.isSubformDropzone || over.data.current?.type === "SubformDropzone") {
        const targetSubform = over.data.current.subform;
        if (targetSubform) {
          targetSectionId = targetSubform.sectionId;
          targetSubformId = targetSubform.id;
          const allItems = [
            ...(targetSubform.fields || []),
            ...(targetSubform.childSubforms || []),
          ];
          targetIndex = allItems.length;
        }
      } else if (
        over.data.current?.type === "Field" ||
        over.data.current?.type === "Subform"
      ) {
        targetSectionId =
          over.data.current?.field?.sectionId ||
          over.data.current?.subform?.sectionId;
        targetSubformId =
          over.data.current?.field?.subformId || over.data.current?.subform?.id;
        const itemId =
          over.data.current?.field?.id || over.data.current?.subform?.id;

        if (targetSubformId) {
          const findSubformAndIndex = (subforms: Subform[]): { subform: Subform; index: number } | null => {
            for (const sf of subforms) {
              if (sf.id === targetSubformId) {
                const allItems = [
                  ...(sf.fields || []).sort((a: { order: number; }, b: { order: number; }) => a.order - b.order),
                  ...(sf.childSubforms || []).sort((a: { order: number; }, b: { order: number; }) => a.order - b.order),
                ];
                const idx = allItems.findIndex((i) => i.id === itemId);
                return { subform: sf, index: idx === -1 ? allItems.length : idx };
              }
              if (sf.childSubforms) {
                const found = findSubformAndIndex(sf.childSubforms);
                if (found) return found;
              }
            }
            return null;
          };

          let targetData: { subform: Subform; index: number } | null = null;

          if (form?.subforms) {
            targetData = findSubformAndIndex(form.subforms);
          }

          if (!targetData && form?.sections) {
            for (const section of form.sections) {
              if (section.subforms) {
                targetData = findSubformAndIndex(section.subforms);
                if (targetData) {
                  targetSectionId = section.id;
                  break;
                }
              }
            }
          }

          if (targetData) {
            targetIndex = targetData.index;

            const activeCenter = active.rect.current.translated
              ? active.rect.current.translated.top + active.rect.current.translated.height / 2
              : 0;
            const overCenter = over.rect.top + over.rect.height / 2;
            const isAfter = activeCenter > overCenter;
            targetIndex += isAfter ? 1 : 0;
          }
        } else if (targetSectionId) {
          const targetSection = form?.sections.find((s: { id: string | undefined; }) => s.id === targetSectionId);
          if (targetSection) {
            const sortedFields = [...(targetSection.fields || [])].sort((a, b) => a.order - b.order);
            targetIndex = sortedFields.findIndex((f) => f.id === itemId);
            if (targetIndex === -1) targetIndex = sortedFields.length;

            const activeCenter = active.rect.current.translated
              ? active.rect.current.translated.top + active.rect.current.translated.height / 2
              : 0;
            const overCenter = over.rect.top + over.rect.height / 2;
            const isAfter = activeCenter > overCenter;
            targetIndex += isAfter ? 1 : 0;
          }
        }
      } else {
        return;
      }

      if (!targetSectionId && !targetSubformId) return;

      const sourceSectionId = activeField.sectionId;
      const sourceSubformId = activeField.subformId;

      if (
        sourceSectionId === targetSectionId &&
        sourceSubformId === targetSubformId
      ) {
        handleReorderItem(event);
      } else {
        await moveFieldToSection(
          activeField,
          targetSectionId,
          targetSubformId,
          targetIndex,
        );
      }
    } else if (active.data.current?.type === "Subform") {
      handleReorderItem(event);
    } else if (active.data.current?.type === "Section") {
      handleReorderSection(event);
    }
  };

  const createSingleField = async (
    fieldType: string,
    sectionId: string | undefined,
    subformId: string | undefined,
    insertionIndex: number,
  ) => {
    if (!form) return;

    try {
      const tempId = `temp_${uuidv4()}`;
      const newField: FormField = {
        id: tempId,
        sectionId: subformId ? undefined : sectionId,
        subformId: subformId ?? undefined,
        type: fieldType,
        label: `New ${fieldType.charAt(0).toUpperCase() + fieldType.slice(1)}`,
        placeholder: "",
        description: "",
        defaultValue: "",
        value: "",
        options: [],
        validation: {},
        visible: true,
        readonly: false,
        width: "full",
        order: insertionIndex,
        conditional: null,
        styling: null,
        properties: null,
        rollup: null,
        lookup: null,
        formula: null,
      } as unknown as FormField;

      const updatedForm = JSON.parse(JSON.stringify(form)); // Deep clone to avoid mutation issues

      if (subformId) {
        const addToSubform = (subforms: Subform[]): boolean => {
          for (const subform of subforms) {
            if (subform.id === subformId) {
              subform.fields = subform.fields || [];
              subform.fields.splice(insertionIndex, 0, newField);
              subform.fields.forEach((f: { order: any; }, idx: any) => (f.order = idx));
              return true;
            }
            if (subform.childSubforms && addToSubform(subform.childSubforms)) {
              return true;
            }
          }
          return false;
        };

        let added = false;
        if (sectionId) {
          for (const section of updatedForm.sections) {
            if (section.id === sectionId && addToSubform(section.subforms || [])) {
              added = true;
              break;
            }
          }
        }
        if (!added) {
          added = addToSubform(updatedForm.subforms || []);
        }
        if (!added) return;
      } else if (sectionId) {
        const section = updatedForm.sections.find((s: any) => s.id === sectionId);
        if (section) {
          section.fields = section.fields || [];
          section.fields.splice(insertionIndex, 0, newField);
          section.fields.forEach((f: any, idx: number) => (f.order = idx));
        }
      }

      optimisticFormUpdate(updatedForm);

      const fieldData = { ...newField, id: undefined };
      const response = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fieldData),
      });

      if (!response.ok) throw new Error("Failed to create field");

      const result = await response.json();
      if (result.success) {
        const updateFields = (subforms: Subform[]): Subform[] =>
          subforms.map((sub) => {
            if (sub.id === subformId) {
              return {
                ...sub,
                fields: sub.fields.map((f: any) =>
                  f.id === tempId ? { ...f, id: result.data.id } : f
                ),
              };
            }
            if (sub.childSubforms) {
              return {
                ...sub,
                childSubforms: updateFields(sub.childSubforms),
              };
            }
            return sub;
          });

        let finalForm = { ...updatedForm };

        if (subformId) {
          if (sectionId) {
            finalForm.sections = finalForm.sections.map((s: any) => {
              if (s.id === sectionId) {
                return { ...s, subforms: updateFields(s.subforms || []) };
              }
              return s;
            });
          } else {
            finalForm.subforms = updateFields(finalForm.subforms || []);
          }
        } else {
          finalForm.sections = finalForm.sections.map((s: any) => {
            if (s.id === sectionId) {
              return {
                ...s,
                fields: s.fields.map((f: any) =>
                  f.id === tempId ? { ...f, id: result.data.id } : f
                ),
              };
            }
            return s;
          });
        }

        optimisticFormUpdate(finalForm);

        if (fieldType === "formula") {
          setPendingFormulaFieldId(result.data.id);
          setIsFormulaDialogOpen(true);
        } else {
          toast({
            title: "Success",
            description: `${fieldType.charAt(0).toUpperCase() + fieldType.slice(1)} field added successfully`,
          });
        }
      } else {
        throw new Error(result.error || "Failed to create field");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create field",
        variant: "destructive",
      });
    }
  };

  const handleFormulaSave = async (config: FormulaConfig, fieldId: string) => {
    try {
      await fetch(`/api/fields/${fieldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: config.fieldLabel,
          formula: {
            expression: config.expression,
            returnType: config.returnType,
            blankPreference: config.blankPreference,
          },
          decimalPlaces: config.decimalPlaces,
        }),
      });

      toast({
        title: "Success",
        description: "Formula field configured successfully",
      });

      setIsFormulaDialogOpen(false);
      setPendingFormulaFieldId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save formula",
        variant: "destructive",
      });
    }
  };

  const createSubform = async (
    sectionId: string | undefined,
    parentSubformId: string | undefined,
  ) => {
    if (!form) return;

    try {
      const tempId = `temp_${uuidv4()}`;
      let nextPath = "1";
      let level = 1;

      if (parentSubformId) {
        const parentHierarchy = subformHierarchyMap.get(parentSubformId);
        if (parentHierarchy) {
          nextPath = `${parentHierarchy.path}.${parentHierarchy.children.length + 1}`;
          level = parentHierarchy.level + 1;
        }
      } else {
        const section = form.sections.find((s: { id: string | undefined; }) => s.id === sectionId);
        if (section) {
          nextPath = `${(section.subforms || []).filter((sub: { parentSubformId: any; }) => !sub.parentSubformId).length + 1}`;
        }
      }

      const newSubform: Subform = {
        id: tempId,
        formId: form.id,
        parentSubformId: parentSubformId ?? undefined,
        name: `Subform ${nextPath}`,
        order: parentSubformId
          ? 0
          : (form.subforms || []).filter((s: { parentSubformId: any; }) => !s.parentSubformId).length || 0,
        columns: 1,
        visible: true,
        collapsible: true,
        collapsed: false,
        fields: [],
        childSubforms: [],
        level,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedForm = JSON.parse(JSON.stringify(form));

      if (parentSubformId) {
        const addToSubform = (subforms: Subform[]): boolean => {
          for (const subform of subforms) {
            if (subform.id === parentSubformId) {
              subform.childSubforms = subform.childSubforms || [];
              subform.childSubforms.push(newSubform);
              return true;
            }
            if (subform.childSubforms && addToSubform(subform.childSubforms)) {
              return true;
            }
          }
          return false;
        };

        let added = false;
        if (sectionId) {
          for (const section of updatedForm.sections) {
            if (section.id === sectionId && addToSubform(section.subforms || [])) {
              added = true;
              break;
            }
          }
        }
        if (!added) {
          added = addToSubform(updatedForm.subforms || []);
        }
        if (!added) return;
      } else if (sectionId) {
        const section = updatedForm.sections.find((s: any) => s.id === sectionId);
        if (section) {
          section.subforms = section.subforms || [];
          section.subforms.push(newSubform);
        }
      } else {
        updatedForm.subforms = updatedForm.subforms || [];
        updatedForm.subforms.push(newSubform);
      }

      optimisticFormUpdate(updatedForm);

      const subformData = { ...newSubform, id: undefined };
      const response = await fetch("/api/subforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subformData),
      });

      if (!response.ok) throw new Error("Failed to create subform");

      const result = await response.json();
      if (result.success) {
        const updateSubforms = (subforms: Subform[]): Subform[] =>
          subforms.map((sub) => {
            if (sub.id === tempId) {
              return { ...sub, id: result.data.id };
            }
            if (sub.id === parentSubformId && sub.childSubforms) {
              return {
                ...sub,
                childSubforms: sub.childSubforms.map((child: { id: string; }) =>
                  child.id === tempId ? { ...child, id: result.data.id } : child
                ),
              };
            }
            if (sub.childSubforms) {
              return {
                ...sub,
                childSubforms: updateSubforms(sub.childSubforms),
              };
            }
            return sub;
          });

        let finalForm = { ...updatedForm };

        if (parentSubformId) {
          if (sectionId) {
            finalForm.sections = finalForm.sections.map((s: any) => {
              if (s.id === sectionId) {
                return { ...s, subforms: updateSubforms(s.subforms || []) };
              }
              return s;
            });
          } else {
            finalForm.subforms = updateSubforms(finalForm.subforms || []);
          }
        } else if (sectionId) {
          finalForm.sections = finalForm.sections.map((s: any) => {
            if (s.id === sectionId) {
              return { ...s, subforms: updateSubforms(s.subforms || []) };
            }
            return s;
          });
        } else {
          finalForm.subforms = updateSubforms(finalForm.subforms || []);
        }

        optimisticFormUpdate(finalForm);

        toast({
          title: "Success",
          description: `Subform ${nextPath} created successfully`,
        });
      } else {
        throw new Error(result.error || "Failed to create subform");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReorderItem = (event: DragEndEvent) => {
    if (!form) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeContainer = active.data.current?.sortable?.containerId;
    const overContainer = over.data.current?.sortable?.containerId;

    if (activeContainer !== overContainer) return;

    const sectionId = activeContainer;
    const section = form.sections.find((s: { id: any; }) => s.id === sectionId);
    if (!section) return;

    // Only reordering fields (no subforms inside section)
    const sortedFields = [...(section.fields || [])].sort((a, b) => a.order - b.order);
    const oldIndex = sortedFields.findIndex((i) => i.id === active.id);
    let newIndex = sortedFields.findIndex((i) => i.id === over.id);

    const activeCenter = active.rect.current.translated
      ? active.rect.current.translated.top + active.rect.current.translated.height / 2
      : 0;
    const overCenter = over.rect.top + over.rect.height / 2;
    const isAfter = activeCenter > overCenter;
    newIndex += isAfter ? 1 : 0;

    const newFields = arrayMove(sortedFields, oldIndex, newIndex);
    newFields.forEach((f, idx) => (f.order = idx));

    const updatedSections = form.sections.map((s: { id: any; }) =>
      s.id === sectionId ? { ...s, fields: newFields } : s
    );

    optimisticFormUpdate({ ...form, sections: updatedSections });

    newFields.forEach((f) =>
      fetch(`/api/fields/${f.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: f.order }),
      })
    );
  };

  const handleReorderSection = (event: DragEndEvent) => {
    if (!form) return;

    const { active, over } = event;
    if (!over) return;

    const oldIndex = form.sections.findIndex((s: { id: UniqueIdentifier; }) => s.id === active.id);
    const newIndex = form.sections.findIndex((s: { id: UniqueIdentifier; }) => s.id === over.id);

    const newSections = arrayMove(form.sections, oldIndex, newIndex);
    newSections.forEach((s, index) => (s.order = index));

    optimisticFormUpdate({ ...form, sections: newSections });

    newSections.forEach((s) =>
      fetch(`/api/sections/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: s.order }),
      })
    );
  };

  const handleLookupFieldsConfirm = async (
    lookupFields: Partial<FormField>[],
  ) => {
    if (!form || (!pendingLookupSectionId && !pendingLookupSubformId)) return;

    try {
      const updatedForm = JSON.parse(JSON.stringify(form));
      const createdFieldIds: string[] = [];

      for (const fieldData of lookupFields) {
        const response = await fetch("/api/fields", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionId: pendingLookupSubformId ? undefined : pendingLookupSectionId,
            subformId: pendingLookupSubformId,
            type: fieldData.type,
            label: fieldData.label,
            placeholder: fieldData.placeholder,
            description: fieldData.description,
            defaultValue: fieldData.defaultValue,
            options: fieldData.options,
            validation: fieldData.validation,
            visible: fieldData.visible,
            readonly: fieldData.readonly,
            width: fieldData.width,
            order: fieldData.order,
            lookup: fieldData.lookup,
          }),
        });

        if (!response.ok) throw new Error("Failed to create lookup field");
        const result = await response.json();
        if (!result.success)
          throw new Error(result.error || "Failed to create field");

        const savedFieldId = result.data.id;
        createdFieldIds.push(savedFieldId);

        const fullField: FormField = {
          id: savedFieldId,
          sectionId: pendingLookupSubformId ? undefined : pendingLookupSectionId,
          subformId: pendingLookupSubformId,
          type: fieldData.type as any,
          label: fieldData.label || "Untitled",
          placeholder: fieldData.placeholder || "",
          description: fieldData.description || "",
          defaultValue: fieldData.defaultValue || "",
          value: "",
          options: fieldData.options || [],
          validation: fieldData.validation || { required: false },
          visible: true,
          readonly: false,
          width: fieldData.width || "full",
          order: fieldData.order ?? 999,
          lookup: fieldData.lookup || null,
          formula: null,
          conditional: null,
          styling: null,
          properties: null,
          rollup: null,
        };

        if (pendingLookupSubformId) {
          const addToSubform = (subforms: Subform[]): boolean => {
            for (const subform of subforms) {
              if (subform.id === pendingLookupSubformId) {
                subform.fields = subform.fields || [];
                subform.fields.push(fullField);
                subform.fields.sort((a: { order: number; }, b: { order: number; }) => a.order - b.order);
                subform.fields.forEach((f: { order: any; }, i: any) => (f.order = i));
                return true;
              }
              if (subform.childSubforms && addToSubform(subform.childSubforms))
                return true;
            }
            return false;
          };

          let added = false;
          if (pendingLookupSectionId) {
            updatedForm.sections.forEach((section: any) => {
              if (section.id === pendingLookupSectionId) {
                added = addToSubform(section.subforms || []);
              }
            });
          } else {
            added = addToSubform(updatedForm.subforms || []);
          }
          if (!added) throw new Error("Failed to add to subform");
        } else {
          const section = updatedForm.sections.find(
            (s: any) => s.id === pendingLookupSectionId,
          );
          if (section) {
            section.fields = section.fields || [];
            section.fields.push(fullField);
            section.fields.sort((a: { order: number; }, b: { order: number; }) => a.order - b.order);
            section.fields.forEach((f: any, i: number) => (f.order = i));
          }
        }
      }

      optimisticFormUpdate(updatedForm);

      toast({
        title: "Success",
        description: `${lookupFields.length} lookup field${lookupFields.length > 1 ? "s" : ""} added successfully`,
      });

      setPendingLookupSectionId(undefined);
      setPendingLookupSubformId(undefined);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create lookup fields",
        variant: "destructive",
      });
      fetchForm();
    }
  };

  const saveForm = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const formToSave = {
        name: form.name,
        description: form.description,
        settings: form.settings,
        isUserForm: form.isUserForm,
        isEmployeeForm: form.isEmployeeForm,
      };
      const response = await fetch(`/api/forms/${formId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToSave),
      });

      if (!response.ok) throw new Error("Failed to save form");

      const result = await response.json();
      if (result.success) {
        toast({ title: "Success", description: "Form saved successfully" });
      } else {
        throw new Error(result.error || "Failed to save form");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const moveFieldToSection = async (
    field: FormField,
    targetSectionId: string | undefined,
    targetSubformId: string | undefined,
    targetIndex: number,
  ) => {
    if (!form) return;

    try {
      const updatedForm = JSON.parse(JSON.stringify(form));

      // Remove from source
      const sourceSectionId = field.sectionId;
      const sourceSubformId = field.subformId;

      if (sourceSubformId) {
        const removeFromSubform = (subforms: Subform[]): boolean => {
          for (const subform of subforms) {
            if (subform.id === sourceSubformId) {
              subform.fields = (subform.fields || []).filter((f: { id: any; }) => f.id !== field.id);
              subform.fields.forEach((f: { order: any; }, idx: any) => (f.order = idx));
              return true;
            }
            if (subform.childSubforms && removeFromSubform(subform.childSubforms)) {
              return true;
            }
          }
          return false;
        };

        let removed = false;
        if (sourceSectionId) {
          for (const section of updatedForm.sections) {
            if (removeFromSubform(section.subforms || [])) {
              removed = true;
              break;
            }
          }
        }
        if (!removed) {
          removeFromSubform(updatedForm.subforms || []);
        }
      } else if (sourceSectionId) {
        const sourceSection = updatedForm.sections.find((s: any) => s.id === sourceSectionId);
        if (sourceSection) {
          sourceSection.fields = (sourceSection.fields || []).filter((f: any) => f.id !== field.id);
          sourceSection.fields.forEach((f: any, idx: number) => (f.order = idx));
        }
      }

      // Add to target
      const movedField = {
        ...field,
        sectionId: targetSubformId ? undefined : targetSectionId,
        subformId: targetSubformId,
        order: targetIndex,
      };

      if (targetSubformId) {
        const addToSubform = (subforms: Subform[]): boolean => {
          for (const subform of subforms) {
            if (subform.id === targetSubformId) {
              subform.fields = subform.fields || [];
              subform.fields.splice(targetIndex, 0, movedField);
              subform.fields.forEach((f: { order: any; }, idx: any) => (f.order = idx));
              return true;
            }
            if (subform.childSubforms && addToSubform(subform.childSubforms)) {
              return true;
            }
          }
          return false;
        };

        let added = false;
        if (targetSectionId) {
          for (const section of updatedForm.sections) {
            if (section.id === targetSectionId && addToSubform(section.subforms || [])) {
              added = true;
              break;
            }
          }
        }
        if (!added) {
          added = addToSubform(updatedForm.subforms || []);
        }
        if (!added) return;
      } else if (targetSectionId) {
        const targetSection = updatedForm.sections.find((s: any) => s.id === targetSectionId);
        if (targetSection) {
          targetSection.fields = targetSection.fields || [];
          targetSection.fields.splice(targetIndex, 0, movedField);
          targetSection.fields.forEach((f: any, idx: number) => (f.order = idx));
        }
      }

      optimisticFormUpdate(updatedForm);

      const response = await fetch(`/api/fields/${field.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: targetSubformId ? null : targetSectionId,
          subformId: targetSubformId || null,
          order: movedField.order,
        }),
      });

      if (!response.ok) throw new Error("Failed to move field");

      toast({
        title: "Success",
        description: `Field moved successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      fetchForm();
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex h-screen items-center justify-center text-center">
        <div>
          <h2 className="text-2xl font-bold">Form Not Found</h2>
          <p className="text-muted-foreground">
            The requested form could not be loaded.
          </p>
          <Link href="/">
            <Button variant="outline" className="mt-4 bg-transparent">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <FormBuilderContext.Provider value={{ openPermissionDialog }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex h-screen bg-gray-50 font-sans">
          <aside className="w-max flex-shrink-0 border-r bg-white">
            <ResizableSidebar defaultWidth={288} collapsedWidth={120}>
              <FieldPalette />
            </ResizableSidebar>
          </aside>
          <div className="flex flex-1 flex-col">
            <header className="flex h-10.5 flex-shrink-0 items-center justify-between border-b bg-white px-4">
              <div className="flex items-center gap-4">
                <Link href={`/modules/${form.moduleId}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Back to module"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </Link>
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-semibold">{form.name}</h1>
                      {form.isUserForm && (
                        <Badge
                          variant="secondary"
                          className="bg-blue-100 text-blue-800 border-blue-200 w-max h-6 px-4"
                        >
                          <Users className="w-3 h-3 mr-1" />
                          User Form
                        </Badge>
                      )}
                      {form.isEmployeeForm && (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 border-green-200 w-max h-6 px-4"
                        >
                          <UserCheck className="w-3 h-3 mr-1" />
                          Employee Form
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsUserFormSettingsOpen(true)}
                  className="text-xs h-8"
                >
                  <Settings className="mr-2 h-3 w-3" />
                  Form Settings
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPublishDialogOpen(true)}
                  className="text-xs h-8"
                >
                  <Share2 className="mr-2 h-3 w-3" /> Publish
                </Button>
                <Button
                  onClick={saveForm}
                  disabled={saving}
                  className="text-xs h-8"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-3 w-3" />
                  )}
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </header>
            <main className="flex-1 overflow-y-auto">
              <FormCanvas
                form={form}
                onFormUpdate={handleFormUpdate}
                subformHierarchyMap={subformHierarchyMap}
                getSubformPath={getSubformPath}
                getFullSubformPath={getFullSubformPath}
                getParentChildDisplay={getParentChildDisplay}
                getAncestorPaths={getAncestorPaths}
              />
            </main>
          </div>
        </div>
        {
          typeof window !== "undefined" &&
          createPortal(
            <DragOverlay style={{ zIndex: 10000 }}>
              {activePaletteItem && (
                <PaletteItemDragOverlay fieldType={activePaletteItem} />
              )}
            </DragOverlay>,
            document.body,
          )
        }
        <PublishFormDialog
          form={form}
          open={isPublishDialogOpen}
          onOpenChange={setIsPublishDialogOpen}
          onFormPublished={handleFormPublished}
        />
        <LookupConfigurationDialog
          open={isLookupDialogOpen}
          onOpenChange={setIsLookupDialogOpen}
          onConfirm={handleLookupFieldsConfirm}
          sectionId={pendingLookupSectionId || ""}
          subformId={pendingLookupSubformId}
        />
        <UserFormSettingsDialog
          form={form}
          open={isUserFormSettingsOpen}
          onOpenChange={setIsUserFormSettingsOpen}
          onUpdate={handleUserFormSettingsUpdate}
        />
        <FormulaConfigurationDialog
          open={isFormulaDialogOpen}
          onOpenChange={setIsFormulaDialogOpen}
          formId={formId}
          fieldId={pendingFormulaFieldId || ""}
          fieldLabel={
            (() => {
              if (!pendingFormulaFieldId || !form) return "Formula";
              const findField = (fields: FormField[]): string | null => {
                for (const f of fields) {
                  if (f.id === pendingFormulaFieldId) return f.label;
                }
                return null;
              };
              for (const s of form.sections) {
                const label = findField(s.fields);
                if (label) return label;
              }
              const searchSubforms = (subs: Subform[]): string | null => {
                for (const sf of subs) {
                  const label = findField(sf.fields);
                  if (label) return label;
                  if (sf.childSubforms) {
                    const found = searchSubforms(sf.childSubforms);
                    if (found) return found;
                  }
                }
                return null;
              };
              return searchSubforms(form.subforms || []) || "Formula";
            })()
          }
          onSave={handleFormulaSave}
        />
        <ResourcePermissionDialog
          open={isPermissionDialogOpen}
          onOpenChange={setIsPermissionDialogOpen}
          resource={selectedResource}
        />
      </DndContext >
    </FormBuilderContext.Provider >
  );
}
