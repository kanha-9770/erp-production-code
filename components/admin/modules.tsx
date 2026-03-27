"use client";

import React, { useEffect, useState } from "react";
import NextLink from "next/link";

// ── Icons ───────────────────────────────────────────────────────
import {
  Loader2,
  Plus,
  Table,
  Grid,
  List,
  Edit,
  Trash2,
  FolderPlus,
  Settings,
  Globe,
  ExternalLink,
  Eye,
  FileText,
  Info,
  ChevronRight,
  Lock,
  Menu,
  X,
} from "lucide-react";

// ── shadcn/ui components ────────────────────────────────────────
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Custom hooks & context ──────────────────────────────────────
import { useOptimisticModules } from "@/hooks/useOptimisticModules";
import { useToast } from "@/hooks/use-toast";
import {
  usePermissionContext,
  PermissionGate,
} from "@/context/PermissionContext";

// ── Sidebar component ───────────────────────────────────────────
import ModuleSidebar from "@/components/modules/moduleSidebar";
import { PublicFormDialog } from "@/components/public-form-dialog";
import { useGetUserQuery } from "@/lib/api/auth";

// ── Types ───────────────────────────────────────────────────────
interface FormModule {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  children?: FormModule[];
  forms?: Form[];
}

interface Form {
  id: string;
  name: string;
  description?: string;
  moduleId: string;
  isPublished: boolean;
  updatedAt: string;
  sections: any[];
}

interface ParentModuleOption {
  id: string;
  name: string;
  level: number;
}

interface DeleteConfirmationItem {
  type: "module" | "form";
  id: string;
  name: string;
  moduleId?: string;
}

// ──────────────────────────────────────────────────────────────────
export default function ModuleDashboard() {
  const { toast } = useToast();
  const { hasPermission, isLoading: permissionsLoading } =
    usePermissionContext();

  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const {
    modules,
    isLoading: modulesLoading,
    moveFormOptimistic,
    moveModuleOptimistic,
    publishFormOptimistic,
    deleteFormOptimistic,
    createFormOptimistic,
    updateFormOptimistic,
    createModuleOptimistic,
    updateModuleOptimistic,
    deleteModuleOptimistic,
  } = useOptimisticModules(organizationId);

  // ── Combined loading state ──────────────────────────────────────
  const isInitializing =
    !organizationId || modulesLoading || permissionsLoading;

  // ── State ───────────────────────────────────────────────────────
  const [filteredModules, setFilteredModules] = useState<FormModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<FormModule | null>(null);
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSubmoduleDialogOpen, setIsSubmoduleDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<FormModule | null>(null);
  const [parentModuleForSubmodule, setParentModuleForSubmodule] =
    useState<FormModule | null>(null);

  const [moduleData, setModuleData] = useState({
    name: "",
    description: "",
    parentId: "",
  });

  const [isCreateFormDialogOpen, setIsCreateFormDialogOpen] = useState(false);
  const [isEditFormDialogOpen, setIsEditFormDialogOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });

  const [viewMode, setViewMode] = useState<"table" | "grid" | "list">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [availableParents, setAvailableParents] = useState<
    ParentModuleOption[]
  >([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation dialog state
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [itemToDelete, setItemToDelete] =
    useState<DeleteConfirmationItem | null>(null);

  const [moduleCount, setModuleCount] = useState(0);

  // Mobile sidebar drawer
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // View/Fill form dialog
  const [viewFormId, setViewFormId] = useState<string | null>(null);

  // ── Fetch organization via RTK Query ──────────────────────────────
  const { data: authMeData, error: authMeError } = useGetUserQuery();

  useEffect(() => {
    if (authMeData) {
      if (authMeData.success && authMeData.user?.organization?.id) {
        setOrganizationId(authMeData.user.organization.id);
      } else {
        toast({
          title: "Error",
          description: "Failed to load organization",
          variant: "destructive",
        });
      }
    }
    if (authMeError) {
      toast({
        title: "Error",
        description: "Network error while loading organization",
        variant: "destructive",
      });
    }
  }, [authMeData, authMeError]);

  // ── Auto-select newly created module ─────────────────────────────
  useEffect(() => {
    if (modules.length > moduleCount) {
      setSelectedModule(modules[modules.length - 1]);
      setModuleCount(modules.length);
    }
  }, [modules, moduleCount]);

  // ── Build parent options & initial auto-select ───────────────────
  useEffect(() => {
    const flatten = (mods: FormModule[], level = 0): ParentModuleOption[] => {
      let opts: ParentModuleOption[] = [];
      mods.forEach((m) => {
        opts.push({ id: m.id, name: m.name, level });
        if (m.children?.length) opts.push(...flatten(m.children, level + 1));
      });
      return opts;
    };

    setAvailableParents(flatten(modules));

    if (modules.length > 0 && !selectedModule) {
      setSelectedModule(modules[0]);
    }
  }, [modules, selectedModule]);

  // ── Filtering & Sorting ─────────────────────────────────────────
  useEffect(() => {
    let result = [...modules];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const filterRecursive = (items: FormModule[]): FormModule[] =>
        items
          .filter((m) => m.name.toLowerCase().includes(q))
          .map((m) => ({
            ...m,
            children: m.children ? filterRecursive(m.children) : [],
          }))
          .filter(
            (m) => m.name.toLowerCase().includes(q) || m.children?.length,
          );

      result = filterRecursive(modules);
    }

    const sortRecursive = (items: FormModule[]): FormModule[] =>
      [...items]
        .sort((a, b) =>
          sortOrder === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name),
        )
        .map((m) => ({
          ...m,
          children: m.children ? sortRecursive(m.children) : [],
        }));

    setFilteredModules(sortRecursive(result));
  }, [modules, searchQuery, sortOrder]);

  // ── Helpers ─────────────────────────────────────────────────────
  const findModuleById = (
    id: string,
    list: FormModule[],
  ): FormModule | null => {
    for (const m of list) {
      if (m.id === id) return m;
      if (m.children) {
        const found = findModuleById(id, m.children);
        if (found) return found;
      }
    }
    return null;
  };

  const collectFormsRecursive = (mod: FormModule | null): Form[] => {
    if (!mod) return [];
    let forms: Form[] = [...(mod.forms || [])];
    if (mod.children?.length) {
      mod.children.forEach((child) => {
        forms = [...forms, ...collectFormsRecursive(child)];
      });
    }
    return forms;
  };

  const getPathToModule = (mod: FormModule | null): FormModule[] => {
    if (!mod) return [];
    const path = [mod];
    let current = mod;
    while (current.parentId) {
      const parent = findModuleById(current.parentId, modules);
      if (!parent) break;
      path.unshift(parent);
      current = parent;
    }
    return path;
  };

  const can = (perm: string, modId?: string | null, formId?: string | null) =>
    !permissionsLoading && hasPermission(perm, modId, formId);

  // ── Module Actions ──────────────────────────────────────────────
  const handleCreateModule = async () => {
    if (!can("create", selectedModule?.id)) {
      toast({
        title: "Access Denied",
        description: "No permission to create modules",
        variant: "destructive",
      });
      return;
    }
    if (!moduleData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createModuleOptimistic({
        name: moduleData.name,
        description: moduleData.description,
        parentId: moduleData.parentId || null,
        organizationId,
      });
      toast({ title: "Success", description: "Module created" });
      setIsCreateDialogOpen(false);
      setIsSubmoduleDialogOpen(false);
      setModuleData({ name: "", description: "", parentId: "" });
      setParentModuleForSubmodule(null);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditModule = async () => {
    if (!editingModule) return;
    if (!can("update", editingModule.id)) {
      toast({
        title: "Access Denied",
        description: "No permission to edit",
        variant: "destructive",
      });
      return;
    }
    if (!moduleData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await updateModuleOptimistic(editingModule.id, {
        name: moduleData.name,
        description: moduleData.description,
        parentId: moduleData.parentId || null,
      });

      if (selectedModule?.id === editingModule.id) {
        setSelectedModule({
          ...selectedModule,
          name: moduleData.name,
          description: moduleData.description,
        });
      }

      toast({ title: "Success", description: "Module updated" });
      setIsEditDialogOpen(false);
      setEditingModule(null);
      setModuleData({ name: "", description: "", parentId: "" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Update failed",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteModule = async (id: string) => {
    if (selectedModule?.id === id) {
      setSelectedModule(null);
      setSelectedForm(null);
    }

    const moduleToDelete = findModuleById(id, modules);
    if (moduleToDelete) {
      const allForms = collectFormsRecursive(moduleToDelete);
      if (allForms.length > 0) {
        try {
          await Promise.all(
            allForms.map((form) =>
              deleteFormOptimistic(form.id).catch((err) => {
                console.error(`Failed to delete form ${form.id}`, err);
                return null;
              }),
            ),
          );
        } catch (err) {
          console.error("Some form deletions failed", err);
        }
      }
    }

    try {
      await deleteModuleOptimistic(id);
      toast({
        title: "Success",
        description: "Module and all its forms deleted",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Delete failed",
        variant: "destructive",
      });
    }
  };

  // ── Form Actions ────────────────────────────────────────────────
  const handleCreateForm = async () => {
    if (!selectedModule || !can("create", selectedModule.id)) {
      toast({
        title: "Access Denied",
        description: "Cannot create form here",
        variant: "destructive",
      });
      return;
    }
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createFormOptimistic(selectedModule.id, formData);

      // IMPORTANT FIX: Immediately update selectedModule to show new form
      if (selectedModule) {
        const newForm: Form = {
          id: `temp-${Date.now()}`,
          name: formData.name,
          description: formData.description,
          moduleId: selectedModule.id,
          isPublished: false,
          updatedAt: new Date().toISOString(),
          sections: [],
        };

        setSelectedModule({
          ...selectedModule,
          forms: [...(selectedModule.forms || []), newForm],
        });
      }

      toast({ title: "Success", description: "Form created" });
      setIsCreateFormDialogOpen(false);
      setFormData({ name: "", description: "" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditForm = async () => {
    if (!editingForm || !can("update", editingForm.moduleId, editingForm.id)) {
      toast({
        title: "Access Denied",
        description: "No permission to edit form",
        variant: "destructive",
      });
      return;
    }
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await updateFormOptimistic(
        editingForm.id,
        editingForm.moduleId,
        formData,
      );
      toast({ title: "Success", description: "Form updated" });
      setIsEditFormDialogOpen(false);
      setEditingForm(null);
      setFormData({ name: "", description: "" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Update failed",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==================== FIXED DELETE FORM FUNCTION ====================
  const handleDeleteForm = async (formId: string, moduleId?: string) => {
    try {
      await deleteFormOptimistic(formId);

      // IMPORTANT FIX: Immediately remove the deleted form from selectedModule
      if (selectedModule && selectedModule.id === (moduleId || selectedModule.id)) {
        setSelectedModule({
          ...selectedModule,
          forms: (selectedModule.forms || []).filter((f) => f.id !== formId),
        });
      }

      toast({ title: "Success", description: "Form deleted" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Delete failed",
        variant: "destructive",
      });
    }
  };
  // =================================================================

  const handlePublishForm = async (form: Form) => {
    if (!can("publish", form.moduleId, form.id)) {
      toast({
        title: "Access Denied",
        description: "No permission to publish",
        variant: "destructive",
      });
      return;
    }

    try {
      await publishFormOptimistic(form.id, form.isPublished);
      toast({
        title: "Success",
        description: `Form ${form.isPublished ? "unpublished" : "published"}`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Action failed",
        variant: "destructive",
      });
    }
  };

  // ── Delete confirmation helpers ─────────────────────────────────
  const openDeleteConfirmation = (
    type: "module" | "form",
    id: string,
    name: string,
    moduleId?: string,
  ) => {
    let hasPermission = false;
    if (type === "module") {
      hasPermission = can("delete", id);
    } else {
      const mid = moduleId || selectedModule?.id;
      hasPermission = !!mid && can("delete", mid, id);
    }

    if (!hasPermission) {
      toast({
        title: "Access Denied",
        description: "No permission to delete",
        variant: "destructive",
      });
      return;
    }

    setItemToDelete({ type, id, name, moduleId });
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsConfirmDeleteOpen(false);

    if (itemToDelete.type === "module") {
      await handleDeleteModule(itemToDelete.id);
    } else {
      await handleDeleteForm(itemToDelete.id, itemToDelete.moduleId);
    }

    setItemToDelete(null);
  };

  // ── Dialog open helpers ─────────────────────────────────────────
  const openEditModule = (mod: FormModule) => {
    if (!can("update", mod.id)) {
      toast({
        title: "Access Denied",
        description: "Cannot edit this module",
        variant: "destructive",
      });
      return;
    }
    setEditingModule(mod);
    setModuleData({
      name: mod.name,
      description: mod.description || "",
      parentId: mod.parentId || "",
    });
    setIsEditDialogOpen(true);
  };

  const openSubmodule = (mod: FormModule) => {
    if (!can("create", mod.id)) {
      toast({
        title: "Access Denied",
        description: "Cannot create submodule here",
        variant: "destructive",
      });
      return;
    }
    setParentModuleForSubmodule(mod);
    setModuleData({ name: "", description: "", parentId: mod.id });
    setIsSubmoduleDialogOpen(true);
  };

  const openEditForm = (form: Form) => {
    if (!can("update", form.moduleId, form.id)) {
      toast({
        title: "Access Denied",
        description: "Cannot edit this form",
        variant: "destructive",
      });
      return;
    }
    setEditingForm(form);
    setFormData({ name: form.name, description: form.description || "" });
    setIsEditFormDialogOpen(true);
  };

  // ── Loading Screen ──────────────────────────────────────────────
  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-5">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
          <div className="text-center">
            <p className="text-lg font-medium text-gray-700">
              {permissionsLoading
                ? "Checking your permissions..."
                : !organizationId
                  ? "Connecting to your workspace..."
                  : "Loading your modules and forms..."}
            </p>
            <p className="text-sm text-gray-500 mt-1">Please wait a moment</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm flex-shrink-0 sticky top-0 z-30">
        <div className="container px-4 py-3 md:px-6 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </Button>

            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                Modules & Forms
              </h1>
              <p className="text-xs md:text-sm text-gray-600 hidden sm:block">
                Manage your structure
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as any)}
              className="hidden sm:block"
            >
              <TabsList className="bg-gray-100 scale-90 md:scale-100">
                <TabsTrigger value="table">
                  <Table className="mr-1 md:mr-2 h-4 w-4" /> Table
                </TabsTrigger>
                <TabsTrigger value="grid">
                  <Grid className="mr-1 md:mr-2 h-4 w-4" /> Grid
                </TabsTrigger>
                <TabsTrigger value="list">
                  <List className="mr-1 md:mr-2 h-4 w-4" /> List
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <PermissionGate permission="create">
              <Button size="sm" className="md:size-default" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-1 md:mr-2 h-4 w-4" /> New Module
              </Button>
            </PermissionGate>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile Sidebar Drawer */}
        <div
          className={`fixed inset-0 z-50 md:hidden transition-opacity duration-300 ${isMobileSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div
            className={`absolute left-0 top-0 h-full w-72 md:w-80 bg-white transform transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Menu</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileSidebarOpen(false)}
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            <div className="overflow-y-auto h-[calc(100%-4rem)]">
              <ModuleSidebar
                filteredModules={filteredModules}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                selectedModule={selectedModule}
                setSelectedModule={(mod) => {
                  setSelectedModule(mod);
                  setIsMobileSidebarOpen(false);
                }}
                setSelectedForm={setSelectedForm}
                openSubmoduleDialog={openSubmodule}
                openEditDialog={openEditModule}
                onMoveForm={(formId, targetModuleId) => {
                  if (targetModuleId && can("update", targetModuleId, formId)) {
                    moveFormOptimistic(formId, targetModuleId);
                  }
                }}
                onMoveModule={(moduleId, newParentId) => {
                  if (newParentId !== moduleId && can("update", moduleId)) {
                    moveModuleOptimistic(moduleId, newParentId);
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden md:block md:w-72 lg:w-80 flex-shrink-0 border-r bg-white overflow-y-auto">
          <ModuleSidebar
            filteredModules={filteredModules}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            selectedModule={selectedModule}
            setSelectedModule={setSelectedModule}
            setSelectedForm={setSelectedForm}
            openSubmoduleDialog={openSubmodule}
            openEditDialog={openEditModule}
            onMoveForm={(formId, targetModuleId) => {
              if (targetModuleId && can("update", targetModuleId, formId)) {
                moveFormOptimistic(formId, targetModuleId);
              }
            }}
            onMoveModule={(moduleId, newParentId) => {
              if (newParentId !== moduleId && can("update", moduleId)) {
                moveModuleOptimistic(moduleId, newParentId);
              }
            }}
          />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {selectedModule ? (
            <div className="space-y-5 md:space-y-6">
              {/* Breadcrumb */}
              <div className="flex items-center text-xs sm:text-sm text-gray-600 overflow-x-auto pb-1">
                <button
                  onClick={() => setSelectedModule(null)}
                  className="hover:text-gray-900 whitespace-nowrap"
                >
                  Modules
                </button>
                {getPathToModule(selectedModule).map((m, i, arr) => (
                  <React.Fragment key={m.id}>
                    <ChevronRight className="mx-1 h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                    <button
                      onClick={() => setSelectedModule(m)}
                      className={`whitespace-nowrap ${i === arr.length - 1
                        ? "font-semibold text-gray-900"
                        : "hover:text-gray-900"
                        }`}
                    >
                      {m.name}
                    </button>
                  </React.Fragment>
                ))}
                {selectedForm && (
                  <>
                    <ChevronRight className="mx-1 h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 whitespace-nowrap">
                      {selectedForm.name}
                    </span>
                  </>
                )}
              </div>

              {/* Module Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl sm:text-3xl font-bold">
                    {selectedModule.name}
                  </h2>
                  {selectedModule.description && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs sm:max-w-sm">
                            {selectedModule.description}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <PermissionGate
                    permission="create"
                    moduleId={selectedModule.id}
                  >
                    <Button variant="outline" size="sm" onClick={() => openSubmodule(selectedModule)}>
                      <FolderPlus className="mr-1.5 h-4 w-4" /> Submodule
                    </Button>
                  </PermissionGate>

                  <PermissionGate
                    permission="update"
                    moduleId={selectedModule.id}
                  >
                    <Button variant="outline" size="sm" onClick={() => openEditModule(selectedModule)}>
                      <Edit className="mr-1.5 h-4 w-4" /> Edit
                    </Button>
                  </PermissionGate>

                  <PermissionGate
                    permission="delete"
                    moduleId={selectedModule.id}
                  >
                    <Button variant="outline" size="sm" onClick={() => openDeleteConfirmation("module", selectedModule.id, selectedModule.name)}>
                      <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                    </Button>
                  </PermissionGate>

                  <PermissionGate
                    permissions={["manage", "read"]}
                    moduleId={selectedModule.id}
                  >
                    <Button asChild size="sm">
                      <NextLink href={`/modules/${selectedModule.id}`}>
                        <Settings className="mr-1.5 h-4 w-4" /> Manage
                      </NextLink>
                    </Button>
                  </PermissionGate>
                </div>
              </div>

              {/* Forms Section */}
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="p-4 sm:p-5 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold">
                    Forms ({selectedModule.forms?.length || 0})
                  </h3>

                  <PermissionGate
                    permission="create"
                    moduleId={selectedModule.id}
                  >
                    <Button size="sm" onClick={() => setIsCreateFormDialogOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" /> New Form
                    </Button>
                  </PermissionGate>
                </div>

                {!selectedModule.forms?.length ? (
                  <div className="py-12 sm:py-16 text-center text-gray-500">
                    <FileText className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mb-4" />
                    <p className="text-base sm:text-lg font-medium">No forms yet</p>
                    <p className="mt-2 text-sm sm:text-base">
                      Create your first form in this module
                    </p>
                  </div>
                ) : viewMode === "table" ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                            Description
                          </th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                            Updated
                          </th>
                          <th className="px-3 sm:px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedModule.forms.map((form) => (
                          <tr key={form.id} className="hover:bg-gray-50">
                            <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2 sm:gap-3">
                                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 flex-shrink-0" />
                                <span className="font-medium text-gray-900 text-sm sm:text-base">
                                  {form.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-3 sm:py-4 text-gray-600 text-sm hidden sm:table-cell max-w-xs truncate">
                              {form.description || "\u2014"}
                            </td>
                            <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                              {form.isPublished ? (
                                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs sm:text-sm">
                                  Published
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs sm:text-sm">
                                  Draft
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500 hidden md:table-cell">
                              {new Date(form.updatedAt).toLocaleDateString()}
                            </td>
                            <td className="px-2 sm:px-4 py-3 sm:py-4 text-right">
                              <div className="flex items-center justify-end gap-0.5 flex-nowrap -mr-1.5">
                                {can("read", selectedModule.id, form.id) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="View / Fill"
                                    onClick={() => setViewFormId(form.id)}
                                  >
                                    <Eye className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}

                                {can("update", selectedModule.id, form.id) && (
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="Edit Builder"
                                  >
                                    <NextLink href={`/builder/${form.id}`}>
                                      <Edit className="h-4 w-4 text-blue-600" />
                                    </NextLink>
                                  </Button>
                                )}

                                {form.isPublished &&
                                  can("read", selectedModule.id, form.id) && (
                                    <Button
                                      asChild
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      title="Open Published Form"
                                    >
                                      <NextLink
                                        href={`/form/${form.id}`}
                                        target="_blank"
                                      >
                                        <ExternalLink className="h-4 w-4 text-green-600" />
                                      </NextLink>
                                    </Button>
                                  )}

                                {can("publish", selectedModule.id, form.id) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handlePublishForm(form)}
                                    title={
                                      form.isPublished ? "Unpublish" : "Publish"
                                    }
                                  >
                                    <Globe className="h-4 w-4 text-purple-600" />
                                  </Button>
                                )}

                                {can("update", selectedModule.id, form.id) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => openEditForm(form)}
                                    title="Edit Details"
                                  >
                                    <Settings className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}

                                {can("delete", selectedModule.id, form.id) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() =>
                                      openDeleteConfirmation(
                                        "form",
                                        form.id,
                                        form.name,
                                        form.moduleId,
                                      )
                                    }
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-500">
                    Grid / List view coming soon...
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 px-4 text-center py-12">
              Select a module from the sidebar to view its forms
            </div>
          )}
        </main>
      </div>

      {/* Create Module Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Module</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateModule();
            }}
          >
            <div className="space-y-4 py-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={moduleData.name}
                  onChange={(e) =>
                    setModuleData((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="Module name"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={moduleData.description}
                  onChange={(e) =>
                    setModuleData((s) => ({ ...s, description: e.target.value }))
                  }
                  placeholder="Optional description"
                />
              </div>
              <div>
                <Label>Parent</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={moduleData.parentId}
                  onChange={(e) =>
                    setModuleData((s) => ({ ...s, parentId: e.target.value }))
                  }
                >
                  <option value="">Top level</option>
                  {availableParents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {"  ".repeat(p.level)} {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Module Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Module</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEditModule();
            }}
          >
            <div className="space-y-4 py-4">
            <div>
              <Label>Name</Label>
              <Input
                value={moduleData.name}
                onChange={(e) =>
                  setModuleData((s) => ({ ...s, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={moduleData.description}
                onChange={(e) =>
                  setModuleData((s) => ({ ...s, description: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Parent</Label>
              <select
                className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={moduleData.parentId}
                onChange={(e) =>
                  setModuleData((s) => ({ ...s, parentId: e.target.value }))
                }
              >
                <option value="">Top level</option>
                {availableParents
                  .filter((p) => p.id !== editingModule?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {"  ".repeat(p.level)} {p.name}
                    </option>
                  ))}
              </select>
            </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Submodule Dialog */}
      <Dialog
        open={isSubmoduleDialogOpen}
        onOpenChange={setIsSubmoduleDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Submodule</DialogTitle>
            <DialogDescription>
              Under: {parentModuleForSubmodule?.name}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateModule();
            }}
          >
            <div className="space-y-4 py-4">
            <div>
              <Label>Name</Label>
              <Input
                value={moduleData.name}
                onChange={(e) =>
                  setModuleData((s) => ({ ...s, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={moduleData.description}
                onChange={(e) =>
                  setModuleData((s) => ({ ...s, description: e.target.value }))
                }
              />
            </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsSubmoduleDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Form Dialog */}
      <Dialog
        open={isCreateFormDialogOpen}
        onOpenChange={setIsCreateFormDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Form</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateForm();
            }}
          >
            <div className="space-y-4 py-4">
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData((s) => ({ ...s, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((s) => ({ ...s, description: e.target.value }))
                }
              />
            </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsCreateFormDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Form
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Form Dialog */}
      <Dialog
        open={isEditFormDialogOpen}
        onOpenChange={setIsEditFormDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Form</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEditForm();
            }}
          >
            <div className="space-y-4 py-4">
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData((s) => ({ ...s, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((s) => ({ ...s, description: e.target.value }))
                }
              />
            </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsEditFormDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View / Fill Form Dialog */}
      <PublicFormDialog
        formId={viewFormId}
        isOpen={!!viewFormId}
        onClose={() => setViewFormId(null)}
        allowAdminPreview
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={isConfirmDeleteOpen}
        onOpenChange={(open) => {
          setIsConfirmDeleteOpen(open);
          if (!open) setItemToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              {itemToDelete && (
                <>
                  Are you sure you want to permanently delete the{" "}
                  <span className="font-semibold text-foreground">
                    {itemToDelete.type}
                  </span>{" "}
                  <span className="font-semibold text-foreground">
                    "{itemToDelete.name}"
                  </span>
                  ?
                  {itemToDelete.type === "module" && (
                    <>
                      {" "}
                      This will also delete{" "}
                      <strong>
                        all forms inside it (including submodules)
                      </strong>
                      .
                    </>
                  )}
                  <br />
                  This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmDelete();
            }}
          >
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsConfirmDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" type="submit">
                Yes, Delete
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}