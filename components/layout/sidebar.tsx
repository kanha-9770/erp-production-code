"use client";

import type React from "react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Home,
  Target,
  Users,
  Building2,
  Briefcase,
  TrendingUp,
  FileText,
  Megaphone,
  Wrench,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  Search,
  Folder,
  BarChart3,
  Settings,
  Database,
  Activity,
  Sparkles,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useGetUserQuery } from "@/lib/api/auth";
import { NotificationBell } from "@/components/layout/notification-bell";

import { useOptimisticModules } from "@/hooks/useOptimisticModules";
import { usePermissionContext } from "@/context/PermissionContext";
import { useRouteAccess } from "@/hooks/use-route-access";

interface FormModule {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  path?: string;
  parentId?: string | null;
  level: number;
  sort_order?: number;
  module_type?: string;
  children?: FormModule[];
  forms?: { id: string; name: string; isPublished: boolean }[];
}

type ViewType =
  | "modules"
  | "reports"
  | "analytics"
  | "activities"
  | "tasks"
  | "projects"
  | "deals"
  | "documents"
  | "calendar"
  | "notifications"
  | "settings"
  | "ai";

const getModuleIcon = (iconName?: string, moduleType?: string) => {
  const iconMap: Record<string, React.ComponentType<any>> = {
    home: Home,
    users: Users,
    "file-text": FileText,
    settings: Settings,
    database: Database,
    activity: Activity,
    folder: Folder,
    building2: Building2,
    target: Target,
    briefcase: Briefcase,
    "trending-up": TrendingUp,
    megaphone: Megaphone,
    wrench: Wrench,
    "check-square": CheckSquare,
  };

  if (iconName && iconMap[iconName]) return iconMap[iconName];

  switch (moduleType) {
    case "user":
      return Users;
    case "form":
      return FileText;
    case "data":
      return Database;
    default:
      return Folder;
  }
};

interface CrmSidebarProps {
  onViewChange?: (view: ViewType) => void;
  onMobileClose?: () => void;
}

const ACCENT = "#5a4d96";
const ACCENT_HOVER = "#6b5da8";

export function CrmSidebar({ onViewChange, onMobileClose }: CrmSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const { data: userData, isLoading: isUserLoading } = useGetUserQuery();

  const isAdmin = userData?.user?.isAdmin ?? false;

  const { canAccess } = useRouteAccess();

  const canManageModules = canAccess("/admin/modules");

  const organizationId = userData?.user?.organization?.id ?? null;

  const { modules, isLoading, error, createModuleOptimistic } =
    useOptimisticModules(organizationId);

  const { hasPermission: checkPermission } = usePermissionContext();

  const [view, setView] = useState<ViewType>("modules");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // The configured Payroll setup tells us under which module the Payroll
  // route should be nested. Fetched once on mount; safe to leave null until
  // it arrives — the synthetic node is appended only when this is set.
  const [payrollAnchorModuleId, setPayrollAnchorModuleId] = useState<string | null>(null);
  const canAccessPayroll = canAccess("/payroll");

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moduleData, setModuleData] = useState({
    name: "",
    description: "",
    parentId: "",
  });

  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Resize logic — unchanged
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX - 48;
      if (newWidth >= 200 && newWidth <= 360) setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    document.body.style.userSelect = isResizing ? "none" : "";
    return () => {
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // One-shot fetch of the payroll anchor (the top-level module that owns the
  // configured Employee form). Skipped entirely when the user has no payroll
  // route access. Failures are silent — they just mean Payroll won't appear
  // in the tree, which is also the correct behaviour for "not configured yet".
  useEffect(() => {
    if (!canAccessPayroll) {
      setPayrollAnchorModuleId(null);
      return;
    }
    let cancelled = false;
    fetch("/api/payroll/setup", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.success) return;
        setPayrollAnchorModuleId(j.anchorModuleId ?? null);
      })
      .catch(() => {
        /* sidebar still works without the anchor */
      });
    return () => {
      cancelled = true;
    };
  }, [canAccessPayroll]);

  const generatePath = (module: FormModule): string => {
    const slug = module.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `/${slug || "module"}`;
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  // Synthetic system-route nodes (e.g. Payroll) carry their target path on
  // a `system_route` property. They are leaves — never expand, never have
  // children — and route to a fixed URL instead of /<slug>/<id>.
  const isSystemRouteNode = (module: FormModule): boolean =>
    module.module_type === "system-route";

  const getSystemRoute = (module: FormModule): string | null =>
    (module as any).system_route ?? null;

  const isModuleActive = (module: FormModule): boolean => {
    if (!pathname) return false;
    if (isSystemRouteNode(module)) {
      const route = getSystemRoute(module);
      if (!route) return false;
      return pathname === route || pathname.startsWith(`${route}/`);
    }
    const target = `${generatePath(module)}/${module.id}`;
    return pathname === target || pathname.startsWith(`${target}/`);
  };

  const handleModuleClick = (module: FormModule) => {
    if (isSystemRouteNode(module)) {
      const route = getSystemRoute(module);
      if (route) router.push(route);
      onMobileClose?.();
      return;
    }
    const hasChildren = !!module.children?.length;
    const hasForms = !!module.forms?.length;

    // Modules with no forms are pure containers — the module page would
    // render an empty record list, so we just toggle expand/collapse to
    // reveal sub-modules instead. If there are no children either, the
    // click is a no-op so users aren't dropped onto a dead screen.
    if (!hasForms) {
      if (hasChildren) toggleModule(module.id);
      return;
    }

    const basePath = generatePath(module);
    router.push(`${basePath}/${module.id}`);
    if (hasChildren) toggleModule(module.id);
    onMobileClose?.();
  };

  const renderModule = (module: FormModule, depth = 0) => {
    const isSystemRoute = isSystemRouteNode(module);
    const IconComponent = isSystemRoute
      ? Wallet
      : getModuleIcon(undefined, module.module_type);
    // System-route nodes are always leaves.
    const hasChildren = !isSystemRoute && !!module.children?.length;
    const isExpanded = expandedModules.has(module.id);
    const isActive = isModuleActive(module);

    return (
      <div key={module.id} className="w-full">
        <button
          onClick={(e) => {
            if (hasChildren) e.preventDefault();
            handleModuleClick(module);
          }}
          className={cn(
            "group relative flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-all duration-150",
            "outline-none focus-visible:ring-2 focus-visible:ring-[#5a4d96]/40",
            isActive
              ? "bg-[#5a4d96]/10 text-[#5a4d96] font-semibold"
              : "text-gray-700 hover:bg-white/70 hover:text-gray-900",
          )}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {/* Active accent bar */}
          {isActive && (
            <span
              aria-hidden
              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
              style={{ backgroundColor: ACCENT }}
            />
          )}

          <IconComponent
            className={cn(
              "h-[18px] w-[18px] flex-shrink-0 transition-colors",
              isActive ? "text-[#5a4d96]" : "text-gray-500 group-hover:text-gray-700",
            )}
          />

          <span className="truncate flex-1 text-left">{module.name}</span>

          {hasChildren && (
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200",
                isExpanded && "rotate-90",
                isActive ? "text-[#5a4d96]" : "text-gray-400 group-hover:text-gray-600",
              )}
            />
          )}
        </button>

        {hasChildren && isExpanded && (
          <div
            className="ml-[18px] mt-0.5 space-y-0.5 border-l border-black/10 pl-1"
          >
            {module.children!.map((child) => renderModule(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const moduleTree = useMemo(() => {
    const moduleMap = new Map<
      string,
      FormModule & { children: FormModule[] }
    >();

    const sourceModules = modules as unknown as FormModule[];

    sourceModules.forEach((m) => {
      moduleMap.set(m.id, { ...m, children: m.children ?? [] });
    });

    const roots: (FormModule & { children: FormModule[] })[] = [];

    sourceModules.forEach((m) => {
      const node = moduleMap.get(m.id)!;
      if (m.parentId && moduleMap.has(m.parentId)) {
        moduleMap.get(m.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    type ModuleNode = FormModule & { children: ModuleNode[] };

    const sortModules = (items: ModuleNode[]): ModuleNode[] => {
      return [...items]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((item) => ({
          ...item,
          children: item.children.length > 0 ? sortModules(item.children) : item.children,
        }));
    };

    const filterByPermission = (items: ModuleNode[]): ModuleNode[] => {
      if (isAdmin) return items;
      return items
        .map((mod) => {
          const filteredChildren = filterByPermission(mod.children);
          const hasAccess = checkPermission("VIEW", mod.id);
          if (hasAccess || filteredChildren.length > 0) {
            return { ...mod, children: filteredChildren };
          }
          return null;
        })
        .filter(Boolean) as ModuleNode[];
    };

    const filtered = filterByPermission(sortModules(roots as ModuleNode[]));

    // Resolve the anchor module under which the Payroll route should live.
    // Preference order:
    //   1. anchorModuleId from /api/payroll/setup (top-level ancestor of the
    //      configured Employee form's module).
    //   2. The level-0 module the user named "HR" / "Human Resources" — so
    //      Payroll still appears the first time they open the sidebar after
    //      cloning HR but before saving a payroll setup.
    let anchorId: string | null = payrollAnchorModuleId;
    if (!anchorId) {
      const hrRoot = filtered.find(
        (m) => !m.parentId && /^hr$|^human resources?$/i.test(m.name),
      );
      anchorId = hrRoot?.id ?? null;
    }

    // Inject the Payroll synthetic leaf as the last child of its anchor.
    const injectSystemRoutes = (items: ModuleNode[]): ModuleNode[] =>
      items.map((node) => {
        const kids =
          node.children.length > 0
            ? injectSystemRoutes(node.children)
            : [];
        if (
          canAccessPayroll &&
          anchorId &&
          node.id === anchorId
        ) {
          kids.push({
            id: "__sys_payroll__",
            name: "Payroll",
            parentId: node.id,
            level: (node.level ?? 0) + 1,
            module_type: "system-route",
            sort_order: Number.MAX_SAFE_INTEGER,
            children: [],
            // Carries the fixed target route for the renderer. Read by
            // getSystemRoute() above.
            ...({ system_route: "/payroll" } as any),
          } as ModuleNode);
        }
        return { ...node, children: kids };
      });

    return injectSystemRoutes(filtered);
  }, [modules, isAdmin, checkPermission, payrollAnchorModuleId, canAccessPayroll]);

  // Real client-side search across the (already-filtered) tree.
  // A node matches if its name matches the query OR any descendant does;
  // matching nodes are auto-expanded so the user sees the hit.
  const filteredTree = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return moduleTree;

    type Node = FormModule & { children: Node[] };
    const visit = (items: Node[]): Node[] =>
      items
        .map((item) => {
          const childMatches = visit((item.children as Node[]) ?? []);
          const selfMatches = item.name.toLowerCase().includes(q);
          if (selfMatches || childMatches.length > 0) {
            return { ...item, children: childMatches } as Node;
          }
          return null;
        })
        .filter(Boolean) as Node[];

    return visit(moduleTree as Node[]);
  }, [moduleTree, searchQuery]);

  // Auto-expand all matches when actively searching.
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const ids = new Set<string>();
    const walk = (items: any[]) => {
      for (const it of items) {
        if (it.children?.length) {
          ids.add(it.id);
          walk(it.children);
        }
      }
    };
    walk(filteredTree as any);
    setExpandedModules((prev) => new Set([...Array.from(prev), ...Array.from(ids)]));
  }, [searchQuery, filteredTree]);

  const handleCreateModule = async () => {
    if (!moduleData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Module name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!organizationId) {
      toast({
        title: "Error",
        description: "Organization not loaded yet. Please wait or refresh.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await createModuleOptimistic({
        name: moduleData.name.trim(),
        description: moduleData.description || "",
        parentId: moduleData.parentId || null,
        organizationId: organizationId,
      });

      toast({
        title: "Success",
        description: "Module created successfully",
      });

      setIsCreateDialogOpen(false);
      setModuleData({ name: "", description: "", parentId: "" });
    } catch (err: any) {
      console.error("Create module failed:", err);
      toast({
        title: "Creation failed",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const allIconButtons: {
    icon: any;
    view?: ViewType;
    route?: string;
    label: string;
    requireAdmin?: boolean;
  }[] = [
      { icon: Folder, view: "modules", label: "Modules" },
      { icon: BarChart3, view: "reports", label: "Reports" },
      { icon: Sparkles, route: "/chatbot", label: "AI Chatbot" },
      { icon: Settings, route: "/settings", label: "Settings" },
    ];

  const iconButtons = allIconButtons.filter((btn) =>
    btn.route ? canAccess(btn.route) : true,
  );

  const userName = userData?.user
    ? userData.user.first_name || userData.user.last_name
      ? `${userData.user.first_name ?? ""} ${userData.user.last_name ?? ""}`.trim()
      : userData.user.username ?? userData.user.email ?? "Workspace"
    : "Workspace";
  const userEmail = userData?.user?.email ?? "";
  const userInitial =
    userData?.user?.first_name?.charAt(0)?.toUpperCase() ||
    userData?.user?.email?.charAt(0)?.toUpperCase() ||
    "W";

  const viewTitle =
    view === "modules" ? "Workspace" : view.charAt(0).toUpperCase() + view.slice(1);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full md:h-screen bg-gray-200 text-black relative">
        {/* ── Icon rail ───────────────────────────────────────────── */}
        <div
          className="flex w-12 flex-col items-center gap-1.5 py-3"
          style={{ backgroundColor: "black" }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  router.push("/");
                  onMobileClose?.();
                }}
                aria-label="Home"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors"
              >
                <Home className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>Home</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setIsCollapsed(false);
                  setView("modules");
                  onViewChange?.("modules");
                  // small timeout to let panel expand before focusing
                  setTimeout(() => searchInputRef.current?.focus(), 80);
                }}
                aria-label="Search modules"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/90 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>Search</TooltipContent>
          </Tooltip>

          <div className="my-1 h-px w-6 bg-white/10" />

          {iconButtons.map((btn, i) => {
            const Icon = btn.icon;
            const isActive = btn.route
              ? pathname === btn.route
              : view === btn.view;

            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();

                      if (btn.route) {
                        router.push(btn.route);
                      } else if (btn.view) {
                        setView(btn.view);
                        onViewChange?.(btn.view);
                      }

                      if (btn.view === "ai") setIsCollapsed(true);
                      else if (isCollapsed) setIsCollapsed(false);

                      onMobileClose?.();
                    }}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      isActive
                        ? "text-white"
                        : "text-white/90 hover:text-white hover:bg-white/10",
                    )}
                    style={isActive ? { backgroundColor: ACCENT } : undefined}
                    aria-label={btn.label}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute -left-[2px] top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-white"
                      />
                    )}
                    <Icon className="h-[18px] w-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>{btn.label}</TooltipContent>
              </Tooltip>
            );
          })}

          <div className="flex-1" />

          {/* Collapse toggle moved to the rail bottom — no more floating button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setIsCollapsed((c) => !c)}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-[18px] w-[18px]" />
                ) : (
                  <ChevronLeft className="h-[18px] w-[18px]" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {isCollapsed ? "Expand" : "Collapse"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── Main panel ──────────────────────────────────────────── */}
        <div
          ref={sidebarRef}
          className="relative flex flex-col transition-all duration-300"
          style={{
            width: isCollapsed ? 0 : sidebarWidth,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between gap-2 px-4 pt-4 pb-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold tracking-tight text-gray-900">
                {viewTitle}
              </h2>
            </div>
            <div className="flex items-center gap-0.5">
              {canManageModules && view === "modules" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setIsCreateDialogOpen(true)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-black/5 hover:text-gray-900 transition-colors disabled:opacity-40"
                      disabled={isUserLoading}
                      aria-label="Create new module"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New module</TooltipContent>
                </Tooltip>
              )}
              {onMobileClose && (
                <button
                  onClick={onMobileClose}
                  className="md:hidden flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-black/5 hover:text-gray-900 transition-colors"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          {view === "modules" && (
            <div className="px-3 pb-3">
              <div className="relative group">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 group-focus-within:text-[#5a4d96] transition-colors" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search modules"
                  className={cn(
                    "h-8 pl-8 pr-12 text-sm bg-white/80 border border-black/10 rounded-md",
                    "shadow-none focus-visible:ring-2 focus-visible:ring-[#5a4d96]/30 focus-visible:border-[#5a4d96]/50",
                    "placeholder:text-gray-400",
                  )}
                />
                {searchQuery ? (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-black/5"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden md:inline-flex pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-5 select-none items-center gap-0.5 rounded border border-black/10 bg-white/80 px-1.5 font-mono text-[10px] font-medium text-gray-500">
                    /
                  </kbd>
                )}
              </div>
            </div>
          )}

          {/* Section label */}
          {view === "modules" && (
            <div className="px-4 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                Workspace
              </span>
            </div>
          )}

          {/* Content */}
          <div className="sidebar-scroll flex-1 overflow-y-auto px-2 pb-3">
            {view === "modules" ? (
              <>
                {isLoading ? (
                  <div className="space-y-2 px-1 py-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full rounded-md bg-black/5" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="mx-1 rounded-md bg-red-50 p-3 text-xs text-red-700">
                    Failed to load modules
                  </div>
                ) : modules.length === 0 ? (
                  <div className="mx-1 rounded-md border border-dashed border-black/10 bg-white/40 px-3 py-6 text-center text-xs text-gray-500">
                    No modules yet
                    {canManageModules && (
                      <button
                        onClick={() => setIsCreateDialogOpen(true)}
                        className="mt-2 block w-full text-[12px] font-medium text-[#5a4d96] hover:text-[#6b5da8]"
                      >
                        + Create your first module
                      </button>
                    )}
                  </div>
                ) : filteredTree.length === 0 ? (
                  <div className="mx-1 mt-2 rounded-md border border-dashed border-black/10 bg-white/40 px-3 py-4 text-center text-xs text-gray-500">
                    No matches for "{searchQuery}"
                  </div>
                ) : (
                  <nav className="space-y-0.5 px-1">
                    {filteredTree.map((m) => renderModule(m, 0))}
                  </nav>
                )}
              </>
            ) : (
              <div className="mx-1 mt-2 rounded-md border border-dashed border-black/10 bg-white/40 px-3 py-6 text-center text-xs text-gray-500">
                {viewTitle} view coming soon
              </div>
            )}
          </div>

          {/* User area */}
          {canAccess("/profile") && (
            <div className="border-t border-black/10 px-2 py-2 flex items-center gap-1">
              <Link href="/profile" className="flex-1 min-w-0">
                <button className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-black/5 transition-colors group">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold text-white shrink-0 ring-1 ring-black/5"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {userInitial}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[13px] font-medium text-gray-900 truncate leading-tight">
                      {userName}
                    </div>
                    {userEmail && (
                      <div className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">
                        {userEmail}
                      </div>
                    )}
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0 group-hover:text-gray-600 transition-colors" />
                </button>
              </Link>
              <div className="shrink-0 pr-1">
                <NotificationBell />
              </div>
            </div>
          )}

          {/* Resize handle — desktop only */}
          {!isCollapsed && (
            <div
              ref={resizeRef}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
              className="hidden md:block absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#5a4d96]/40 transition-colors"
            />
          )}
        </div>

        {/* ── Create-module dialog (preserved) ─────────────────────── */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent
            className={cn(
              "max-w-[90vw] sm:max-w-[420px] md:max-w-[480px] lg:max-w-[500px]",
              "max-h-[92vh] overflow-y-auto",
              "p-4 sm:p-5 md:p-6",
              "bg-white border border-black/10 shadow-xl rounded-lg sm:rounded-xl",
              "transition-all duration-200",
            )}
          >
            <DialogHeader className="mb-4 sm:mb-5">
              <DialogTitle className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900">
                Create New Module
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-gray-600 mt-1">
                Add a new module to organize your workspace content.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 sm:space-y-5 py-1 sm:py-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="module-name"
                  className="text-sm font-medium text-gray-700"
                >
                  Module Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="module-name"
                  value={moduleData.name}
                  onChange={(e) =>
                    setModuleData({ ...moduleData, name: e.target.value })
                  }
                  placeholder="e.g. Customers, Inventory"
                  className={cn(
                    "h-9 sm:h-10 text-sm focus:ring-2 focus:ring-[#5a4d96]/40 focus:border-[#5a4d96] transition-all",
                    !moduleData.name.trim() &&
                    "border-red-400 focus:border-red-500 focus:ring-red-500",
                  )}
                  autoFocus
                />
                {!moduleData.name.trim() && (
                  <p className="text-xs text-red-600 mt-1">
                    Module name is required
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="module-description"
                  className="text-sm font-medium text-gray-700"
                >
                  Description (optional)
                </Label>
                <Textarea
                  id="module-description"
                  value={moduleData.description}
                  onChange={(e) =>
                    setModuleData({ ...moduleData, description: e.target.value })
                  }
                  placeholder="Brief description..."
                  rows={2}
                  className="min-h-[70px] sm:min-h-[90px] text-sm focus:ring-2 focus:ring-[#5a4d96]/40 focus:border-[#5a4d96] resize-y transition-all"
                />
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateModule();
              }}
            >
              <DialogFooter className="mt-5 sm:mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-black/10">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isSubmitting}
                  className="h-9 sm:h-10 px-4 sm:px-5 text-sm"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={isSubmitting || !moduleData.name.trim()}
                  className={cn(
                    "h-9 sm:h-10 px-4 sm:px-6 text-sm font-medium text-white",
                    "shadow-sm hover:shadow transition-all",
                  )}
                  style={{ backgroundColor: ACCENT }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      ACCENT_HOVER)
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      ACCENT)
                  }
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
