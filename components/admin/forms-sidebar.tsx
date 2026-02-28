"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Search,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "../ui/card";

interface Form {
  id: string;
  name: string;
  description?: string;
  isEmployeeForm?: boolean;
  isUserForm?: boolean;
  moduleId: string;
}

interface Module {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  level: number;
  forms: Form[];
  children: Module[];
}

interface FormsSidebarProps {
  // searchTerm: string;
  onFormSelect: (formId: string, moduleId: string, submoduleId?: string) => void;
  selectedForm: string | null;
  loading?: boolean;
}

export function FormsSidebar({
  // searchTerm,
  onFormSelect,
  selectedForm,
  loading = false,
}: FormsSidebarProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [localSearch, setLocalSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/modules-permission");
        const result = await response.json();
        if (result.success) {
          setModules(result.data);
          // Auto-expand all modules on first load
          const allIds = new Set<string>();
          result.data.forEach((m: Module) => {
            allIds.add(m.id);
            m.children?.forEach((c: Module) => allIds.add(c.id));
          });
          setExpandedModules(allIds);
        }
      } catch (e) {
        console.error("[Sidebar] Failed to fetch modules:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchModules();
  }, []);

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
      return next;
    });
  };

  const effectiveSearch = (localSearch).trim().toLowerCase();

  const filterForms = (forms: Form[]) => {
    if (!effectiveSearch) return forms;
    return forms.filter((f) => f.name.toLowerCase().includes(effectiveSearch));
  };

  const hasMatchingForms = (module: Module): boolean => {
    if (filterForms(module.forms || []).length > 0) return true;
    return (module.children || []).some(hasMatchingForms);
  };

  if (isLoading || loading) {
    return (
      <Card className="border shadow-sm h-full flex flex-col">
        {/* Keep header area so layout doesn't jump */}
        <div className="p-3 border-b bg-muted/40">
          <div className="h-9 bg-muted/60 rounded animate-pulse" />
        </div>

        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-pulse" />
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="text-sm font-medium">Loading modules...</p>
          </div>
        </div>
      </Card>
    );
  }

  const filteredModules = modules.filter(hasMatchingForms);

  return (
    <Card className="border shadow-sm overflow-hidden h-full flex flex-col ">
      {/* Search Header */}
      <div className="p-3 border-b bg-muted/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search forms..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9 h-9 text-sm focus-visible:ring-primary/70"
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredModules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center">
              <AlertCircle className="h-10 w-10 mb-3 opacity-70" />
              <p className="text-sm font-medium">
                {effectiveSearch ? "No matching forms" : "No modules available"}
              </p>
              {effectiveSearch && (
                <p className="text-xs mt-1">Try a different search term</p>
              )}
            </div>
          ) : (
            filteredModules.map((module) => (
              <Collapsible
                key={module.id}
                open={expandedModules.has(module.id)}
                onOpenChange={() => toggleModule(module.id)}
              >
                {/* Module Row */}
                <CollapsibleTrigger className="flex items-center gap-2.5 w-full p-2.5 rounded-md hover:bg-muted/70 text-left transition-colors">
                  {expandedModules.has(module.id) ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}

                  {expandedModules.has(module.id) ? (
                    <FolderOpen className="h-4.5 w-4.5 shrink-0 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Folder className="h-4.5 w-4.5 shrink-0 text-blue-600 dark:text-blue-400" />
                  )}

                  <span className="text-sm font-medium truncate flex-1">
                    {module.name}
                  </span>

                  <Badge variant="secondary" className="text-xs px-2 py-0">
                    {(module.forms?.length || 0) +
                      module.children.reduce((sum, c) => sum + (c.forms?.length || 0), 0)}
                  </Badge>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="ml-6 pb-1">
                    {/* Forms in this module */}
                    {filterForms(module.forms || []).map((form) => (
                      <button
                        key={form.id}
                        onClick={() => onFormSelect(form.id, module.id)}
                        className={cn(
                          "flex items-center gap-2.5 w-full p-2 pl-3 rounded-md text-sm hover:bg-muted/60 transition-colors",
                          selectedForm === form.id &&
                          "bg-primary/10 text-primary font-medium border-l-2 border-primary pl-[10px]"
                        )}
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{form.name}</span>
                      </button>
                    ))}

                    {/* Submodules */}
                    {module.children
                      .filter(hasMatchingForms)
                      .map((sub) => (
                        <Collapsible
                          key={sub.id}
                          open={expandedModules.has(sub.id)}
                          onOpenChange={() => toggleModule(sub.id)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 pl-2 rounded-md hover:bg-muted/60 text-left transition-colors">
                            {expandedModules.has(sub.id) ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <Folder className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                            <span className="text-sm truncate flex-1">{sub.name}</span>
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {sub.forms?.length || 0}
                            </Badge>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            {filterForms(sub.forms || []).map((form) => (
                              <button
                                key={form.id}
                                onClick={() => onFormSelect(form.id, module.id, sub.id)}
                                className={cn(
                                  "flex items-center gap-2.5 w-full p-2 pl-8 rounded-md text-sm hover:bg-muted/60 transition-colors",
                                  selectedForm === form.id &&
                                  "bg-primary/10 text-primary font-medium border-l-2 border-primary pl-[28px]"
                                )}
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{form.name}</span>
                              </button>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}