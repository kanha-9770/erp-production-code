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
  Clock,
  Edit3,
  CalendarDays,
  Inbox,
  CalendarHeart,
  Package,
  Smartphone,
  Network,
  List,
  UserPlus,
  Coins,
  Receipt,
  Banknote,
  Trophy,
  Shield,
  ScrollText,
  FileSignature,
  Boxes,
  User,
  Bot,
  Briefcase as BriefcaseIcon,
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
import { AttendanceWidget } from "@/components/attendance/attendance-widget";

import { useOptimisticModules } from "@/hooks/useOptimisticModules";
import { usePermissionContext } from "@/context/PermissionContext";
import { useRouteAccess } from "@/hooks/use-route-access";
import { STATIC_PAGES, type StaticPage } from "@/lib/static-pages";

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

// ─── Static-page injection ────────────────────────────────────────────────
// Static pages (Leave / Attendance / Payroll / Holidays / etc.) are anchored
// under tenant-configured dynamic modules. The mapping is loaded from
// /api/static-page-anchors and applied at tree-build time as synthetic
// `system-route` leaves attached to each anchor module.
//
// Pages with no anchor are simply absent from the sidebar — they remain URL-
// accessible to anyone the route-permission system grants. Admins set
// placement at /settings/permission/static-pages.
//
// Defined outside the component so the function's referential identity is
// stable across renders.

function syntheticIdFor(prefix: string, key: string) {
  return `__sys__${prefix}__${key.replace(/[^a-z0-9]+/gi, "_")}`;
}

export interface AnchorRecord {
  path: string;
  moduleId: string;
  sortOrder: number;
}

/**
 * Builds a `Map<moduleId, leafNode[]>` of system-route leaves that should be
 * injected as children of each anchor module. Filters by the per-leaf
 * canAccess gate and the registry's adminOnly hint so non-admins don't see
 * dead-ends.
 */
function buildAnchorChildrenMap(args: {
  anchors: AnchorRecord[];
  isAdmin: boolean;
  canAccess: (path: string) => boolean;
}): Map<string, any[]> {
  const { anchors, isAdmin, canAccess } = args;
  const byPath = new Map<string, StaticPage>();
  for (const p of STATIC_PAGES) byPath.set(p.path, p);

  const result = new Map<string, any[]>();
  // Stable order: respect the admin-configured sortOrder when set, otherwise
  // fall back to the registry order (StaticPage's order in STATIC_PAGES).
  const ordered = [...anchors].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.path.localeCompare(b.path);
  });

  for (const a of ordered) {
    const meta = byPath.get(a.path);
    if (!meta) continue; // anchor references a path that's no longer in the registry
    if (meta.adminOnly && !isAdmin) continue;
    if (!canAccess(meta.path)) continue;

    const node = {
      id: syntheticIdFor("page", meta.path),
      name: meta.label,
      parentId: a.moduleId,
      level: 1, // depth is recomputed by the renderer based on parent
      sort_order: a.sortOrder,
      module_type: "system-route" as const,
      children: [],
      system_route: meta.path,
      system_icon: meta.icon,
    };

    const list = result.get(a.moduleId) ?? [];
    list.push(node);
    result.set(a.moduleId, list);
  }
  return result;
}

// Resolve a Lucide component for a static-page icon name. Centralised so
// adding new pages to lib/static-pages.ts only needs an entry here, not a
// new branch in renderModule's switch.
function staticPageIcon(name?: string) {
  switch (name) {
    case "clock":
      return Clock;
    case "edit":
      return Edit3;
    case "users":
      return Users;
    case "settings":
      return Settings;
    case "calendar":
      return CalendarDays;
    case "calendar-heart":
      return CalendarHeart;
    case "inbox":
      return Inbox;
    case "wallet":
      return Wallet;
    case "user":
      return User;
    case "sparkles":
      return Sparkles;
    case "shield":
      return Shield;
    case "package":
      return Package;
    case "smartphone":
      return Smartphone;
    case "target":
      return Target;
    case "trending-up":
      return TrendingUp;
    // Real Estate group icons
    case "building2":
      return Building2;
    case "network":
      return Network;
    case "list":
      return List;
    case "user-plus":
      return UserPlus;
    case "coins":
      return Coins;
    case "file-text":
      return FileText;
    case "receipt":
      return Receipt;
    case "banknote":
      return Banknote;
    case "trophy":
      return Trophy;
    case "activity":
      return Activity;
    // HR / Inventory / Misc
    case "briefcase":
      return BriefcaseIcon;
    case "megaphone":
      return Megaphone;
    case "file-signature":
      return FileSignature;
    case "scroll-text":
      return ScrollText;
    case "boxes":
      return Boxes;
    case "plus":
      return Plus;
    case "bot":
      return Bot;
    default:
      return Folder;
  }
}

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

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moduleData, setModuleData] = useState({
    name: "",
    description: "",
    parentId: "",
  });

  // Static-page anchors — admin-configured "page → module" mapping. Refetched
  // when the user changes (admin flag affects adminOnly pages) AND on every
  // navigation, so leaving the static-pages config page or the attendance
  // integrations card picks up the new anchor set without a hard reload. The
  // server also auto-derives anchors from attendance config form bindings, so
  // a fresh fetch here surfaces those without admin involvement.
  const [staticAnchors, setStaticAnchors] = useState<AnchorRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/static-page-anchors", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.success) return;
        setStaticAnchors(
          (j.anchors ?? []).map((a: any) => ({
            path: a.path,
            moduleId: a.moduleId,
            sortOrder: a.sortOrder ?? 0,
          })),
        );
      })
      .catch(() => {
        /* silent — sidebar stays functional without anchors */
      });
    return () => {
      cancelled = true;
    };
  }, [userData?.user?.id, isAdmin, pathname]);

  // Real-estate-agent-only detection. A user whose ONLY unit assignment is
  // the auto-provisioned "Real Estate Agent" role gets a stripped-down
  // sidebar — they only see the Real Estate module and no attendance
  // widget, since those workflows don't apply to a referral-onboarded agent.
  // Admins always see everything (regardless of role labels).
  const isRebmOnlyAgent = useMemo(() => {
    if (isAdmin) return false;
    const ua = (userData?.user as any)?.unitAssignments;
    if (!Array.isArray(ua) || ua.length === 0) return false;
    return ua.every((a: any) => a?.role?.name === "Real Estate Agent");
  }, [isAdmin, userData]);

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

  // Synthetic system-route nodes (e.g. Payroll, My Attendance) carry their
  // target path on a `system_route` property. They are leaves — never
  // expand — and route to a fixed URL instead of /<slug>/<id>.
  const isSystemRouteNode = (module: FormModule): boolean =>
    module.module_type === "system-route";

  // System-folder nodes are synthetic parents (e.g. the "Attendance"
  // group). They carry their own children but no link of their own;
  // clicking just toggles expansion.
  const isSystemFolderNode = (module: FormModule): boolean =>
    module.module_type === "system-folder";

  const getSystemRoute = (module: FormModule): string | null =>
    (module as any).system_route ?? null;

  // The Payroll parent module is a pure container: clicking it should
  // only expand/collapse its children, never push to the records page.
  // Matched by name (case-insensitive) so both "Payroll" and "PayRoll"
  // qualify; the system-route child of the same name is handled earlier
  // in handleModuleClick and is unaffected.
  const isPayrollContainer = (module: FormModule): boolean =>
    !isSystemRouteNode(module) &&
    (module.name ?? "").trim().toLowerCase() === "payroll";

  const isModuleActive = (module: FormModule): boolean => {
    if (!pathname) return false;
    if (isSystemRouteNode(module)) {
      const route = getSystemRoute(module);
      if (!route) return false;
      return pathname === route || pathname.startsWith(`${route}/`);
    }
    if (isSystemFolderNode(module)) {
      // Folder is "active" when any of its children would be active.
      // We don't recurse deeper than 1 level — synthetic folders are flat.
      return (module.children ?? []).some((c) => isModuleActive(c));
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
    if (isSystemFolderNode(module)) {
      if (module.children?.length) toggleModule(module.id);
      return;
    }
    // Payroll-only: clicking the Payroll parent never opens its records
    // page — it just toggles the children list.
    if (isPayrollContainer(module)) {
      if (module.children?.length) toggleModule(module.id);
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

  // Indentation strategy:
  //   - Linear 14px / level for depths 0–4 (most common case).
  //   - Soft-capped at 6px / level beyond depth 4 so a 7-deep tree doesn't
  //     squeeze the label down to nothing in a 220px sidebar.
  //   - Hard cap at 96px total left-pad — past that we still mark the row
  //     with a depth badge so users know they're deep without losing the row.
  //   - Children no longer wrap in their own indented div with a left
  //     border. Instead each row draws its own vertical guide rails as
  //     absolute-positioned 1px columns. This keeps indentation a single
  //     source-of-truth (the button's padding-left) and prevents the
  //     "double indentation" that compounded when wrapper margin + button
  //     padding both shifted the row.
  const computeIndent = (depth: number) => {
    const base = 8;
    const cheap = Math.min(depth, 4) * 14;
    const overflow = Math.max(0, depth - 4) * 6;
    return Math.min(base + cheap + overflow, 8 + 96);
  };

  const renderModule = (module: FormModule, depth = 0) => {
    const isSystemRoute = isSystemRouteNode(module);
    const isSystemFolder = isSystemFolderNode(module);
    // System nodes pick an icon by id so each one looks distinct.
    // Adding a new system route → add a case here.
    // Icon resolution for system routes:
    //   1. If the synthetic node carries a `system_icon` (the registry's icon
    //      name), use the centralised mapper. New pages register an icon name
    //      in lib/static-pages.ts and don't need a switch case here.
    //   2. Other synthetic folders/routes fall back to the folder icon.
    //   3. Form-builder modules fall through to getModuleIcon().
    const systemIconName = (module as any).system_icon as string | undefined;
    const IconComponent =
      isSystemRoute && systemIconName
        ? staticPageIcon(systemIconName)
        : isSystemRoute || isSystemFolder
          ? Folder
          : getModuleIcon(undefined, module.module_type);
    const hasChildren = !isSystemRoute && !!module.children?.length;
    const isExpanded = expandedModules.has(module.id);
    const isActive = isModuleActive(module);

    const indent = computeIndent(depth);
    const isDeep = depth >= 4; // deep rows get smaller icon + tighter gap
    const iconSize = isDeep ? 15 : 18;

    // Guide rails: one thin vertical line per ancestor level. They sit
    // behind the label so the eye can follow which parent a deep row hangs
    // off of without needing nested wrappers.
    const guideRails: React.ReactElement[] = [];
    for (let i = 1; i <= depth; i++) {
      // Match the column the parent's icon centre would occupy at depth i-1.
      const left = computeIndent(i - 1) + 6;
      guideRails.push(
        <span
          key={`rail-${i}`}
          aria-hidden
          className="absolute top-0 bottom-0 w-px bg-black/10 pointer-events-none"
          style={{ left }}
        />,
      );
    }

    const button = (
      <button
        onClick={(e) => {
          if (hasChildren) e.preventDefault();
          handleModuleClick(module);
        }}
        className={cn(
          "group relative flex w-full items-center rounded-md py-1.5 text-sm transition-all duration-150",
          "outline-none focus-visible:ring-2 focus-visible:ring-[#5a4d96]/40",
          isDeep ? "gap-1.5" : "gap-2",
          isActive
            ? "bg-[#5a4d96]/10 dark:bg-[#5a4d96]/20 text-[#5a4d96] dark:text-[#b8aef0] font-semibold"
            : "text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-100",
        )}
        style={{ paddingLeft: indent, paddingRight: 8 }}
        title={undefined /* handled by Tooltip wrapper below */}
      >
        {guideRails}

        {/* Active accent bar — anchored to the row's leading edge regardless
            of depth so it's always visible. */}
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
            style={{ backgroundColor: ACCENT }}
          />
        )}

        <IconComponent
          className={cn(
            "flex-shrink-0 transition-colors",
            isActive ? "text-[#5a4d96] dark:text-[#b8aef0]" : "text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200",
          )}
          style={{ height: iconSize, width: iconSize }}
        />

        {/* min-w-0 is crucial for `truncate` to clip inside a flex parent. */}
        <span className="truncate flex-1 min-w-0 text-left">{module.name}</span>

        {hasChildren && (
          <ChevronRight
            className={cn(
              "flex-shrink-0 transition-transform duration-200",
              isDeep ? "h-3 w-3" : "h-3.5 w-3.5",
              isExpanded && "rotate-90",
              isActive ? "text-[#5a4d96] dark:text-[#b8aef0]" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300",
            )}
          />
        )}
      </button>
    );

    return (
      <div key={module.id} className="w-full">
        {/* Tooltip shows the full name on hover — invaluable when the label
            truncates because of deep indentation or a narrow sidebar. */}
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" align="start" className="max-w-[280px]">
            <span className="text-xs">{module.name}</span>
          </TooltipContent>
        </Tooltip>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
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

    // Inject admin-configured static-page leaves under their anchor modules.
    // Done BEFORE filtering so the per-leaf canAccess gate can keep a host
    // module visible (via the "any child has access" branch) even when the
    // user has no VIEW permission on the module itself.
    const anchorChildrenByModule = buildAnchorChildrenMap({
      anchors: staticAnchors,
      isAdmin,
      canAccess,
    });

    const injectAnchorLeaves = (items: ModuleNode[]): ModuleNode[] =>
      items.map((node) => {
        const recursedChildren = injectAnchorLeaves(node.children);
        const extra = anchorChildrenByModule.get(node.id);
        const children = extra
          ? [...recursedChildren, ...(extra as unknown as ModuleNode[])]
          : recursedChildren;
        return { ...node, children };
      });

    const filterByPermission = (items: ModuleNode[]): ModuleNode[] => {
      if (isAdmin) return items;
      return items
        .map((mod) => {
          // Synthetic system-route leaves are gated by the route-permission
          // resolver — passing canAccess at injection time is enough; the
          // VIEW-permission check below doesn't apply to them.
          if (mod.module_type === "system-route") return mod;

          const filteredChildren = filterByPermission(mod.children);
          const hasAccess = checkPermission("VIEW", mod.id);
          if (hasAccess || filteredChildren.length > 0) {
            return { ...mod, children: filteredChildren };
          }
          return null;
        })
        .filter(Boolean) as ModuleNode[];
    };

    // Real-estate-only users see ONLY the Real Estate module. We identify
    // it the same way the auto-expand effect does: a top-level module whose
    // subtree contains at least one `/real-estate*` system-route leaf.
    // Everything else (HR, Sales, CRM, attendance anchors, etc.) is hidden.
    const filterForRebmAgent = (items: ModuleNode[]): ModuleNode[] => {
      if (!isRebmOnlyAgent) return items;
      const hasRebmLeaf = (n: ModuleNode): boolean => {
        const route = (n as any).system_route;
        if (n.module_type === "system-route" && typeof route === "string" && route.startsWith("/real-estate")) {
          return true;
        }
        return (n.children ?? []).some(hasRebmLeaf);
      };
      return items.filter(hasRebmLeaf);
    };

    const sorted = sortModules(roots as ModuleNode[]);
    const withAnchors = injectAnchorLeaves(sorted);
    return filterForRebmAgent(filterByPermission(withAnchors));
  }, [modules, isAdmin, checkPermission, canAccess, staticAnchors, isRebmOnlyAgent]);

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

  // ── Context-aware auto-expand ──────────────────────────────────────────
  // 1. Whenever the URL changes, expand every ancestor of the system-route
  //    leaf that matches the current pathname. This is the "open the
  //    folder that contains the page I'm looking at" UX win every sidebar
  //    should have.
  //
  // 2. If the signed-in user's roles are ONLY the auto-provisioned
  //    "Real Estate Agent" role (i.e. they were onboarded via referral
  //    and have nothing else), force-expand the Real Estate module on
  //    first render so they don't land on an empty-looking sidebar.
  //    This effect is intentionally additive — it never collapses a
  //    group the user is already viewing.
  //
  //    (`isRebmOnlyAgent` is defined earlier — it's also used to gate the
  //    module-tree filter and the attendance widget, so it has to be in
  //    scope before `moduleTree` builds.)
  const autoExpandedForRebmRef = useRef(false);
  useEffect(() => {
    if (moduleTree.length === 0) return;

    const toExpand = new Set<string>();

    // (1) Find a system-route leaf whose `system_route` is a prefix of
    //     the current pathname. The leaf's parent (and grandparents) get
    //     expanded so the leaf is reachable on screen.
    const ancestorsByLeaf = new Map<string, string[]>();
    const walk = (items: any[], ancestors: string[]) => {
      for (const it of items) {
        const nextAncestors = it.children?.length
          ? [...ancestors, it.id]
          : ancestors;
        if (it.module_type === "system-route" && it.system_route) {
          ancestorsByLeaf.set(it.system_route, ancestors);
        }
        if (it.children?.length) walk(it.children, nextAncestors);
      }
    };
    walk(moduleTree as any, []);

    // Longest-prefix match — `/real-estate/my-team` should pick the
    // `/real-estate/my-team` leaf over the bare `/real-estate` dashboard.
    let bestPath: string | null = null;
    for (const route of ancestorsByLeaf.keys()) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        if (!bestPath || route.length > bestPath.length) bestPath = route;
      }
    }
    if (bestPath) {
      for (const id of ancestorsByLeaf.get(bestPath)!) toExpand.add(id);
    }

    // (2) MLM-agent first-load expansion of Real Estate.
    if (isRebmOnlyAgent && !autoExpandedForRebmRef.current) {
      const findRebmModule = (items: any[]): string | null => {
        for (const m of items) {
          const childIsRebm = m.children?.some(
            (c: any) =>
              c.module_type === "system-route" &&
              typeof c.system_route === "string" &&
              c.system_route.startsWith("/real-estate"),
          );
          if (childIsRebm) return m.id;
          if (m.children?.length) {
            const inner = findRebmModule(m.children);
            if (inner) return inner;
          }
        }
        return null;
      };
      const rebmId = findRebmModule(moduleTree as any);
      if (rebmId) {
        toExpand.add(rebmId);
        autoExpandedForRebmRef.current = true;
      }
    }

    if (toExpand.size > 0) {
      setExpandedModules((prev) => {
        // Only update if we'd actually add something — avoids a render loop.
        let changed = false;
        for (const id of toExpand) {
          if (!prev.has(id)) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
        return new Set([...Array.from(prev), ...Array.from(toExpand)]);
      });
    }
  }, [moduleTree, pathname, isRebmOnlyAgent]);

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
      <div className="flex h-full md:h-screen bg-gray-200 dark:bg-gray-900 text-black dark:text-gray-100 relative">
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
              <h2 className="truncate text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                {viewTitle}
              </h2>
            </div>
            <div className="flex items-center gap-0.5">
              {canManageModules && view === "modules" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setIsCreateDialogOpen(true)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-40"
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
                  className="md:hidden flex h-7 w-7 items-center justify-center rounded-md text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
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
                    "h-8 pl-8 pr-12 text-sm bg-white/80 dark:bg-gray-800/80 dark:text-gray-100 border border-black/10 dark:border-white/10 rounded-md",
                    "shadow-none focus-visible:ring-2 focus-visible:ring-[#5a4d96]/30 focus-visible:border-[#5a4d96]/50",
                    "placeholder:text-gray-400 dark:placeholder:text-gray-500",
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
                  <kbd className="hidden md:inline-flex pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-5 select-none items-center gap-0.5 rounded border border-black/10 dark:border-white/10 bg-white/80 dark:bg-gray-800/80 px-1.5 font-mono text-[10px] font-medium text-gray-500 dark:text-gray-400">
                    /
                  </kbd>
                )}
              </div>
            </div>
          )}

          {/* Section label */}
          {view === "modules" && (
            <div className="px-4 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Workspace
              </span>
            </div>
          )}

          {/* Content — overflow-x-hidden so a runaway-long label or extreme
              nesting can never leak past the sidebar's right edge and create
              an awkward horizontal scrollbar at the page level. */}
          <div className="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3">
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
                  <div className="mx-1 rounded-md border border-dashed border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/5 px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
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
                  <div className="mx-1 mt-2 rounded-md border border-dashed border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/5 px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                    No matches for "{searchQuery}"
                  </div>
                ) : (
                  <nav className="space-y-0.5 px-1 min-w-0">
                    {filteredTree.map((m) => renderModule(m, 0))}
                  </nav>
                )}
              </>
            ) : (
              <div className="mx-1 mt-2 rounded-md border border-dashed border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/5 px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                {viewTitle} view coming soon
              </div>
            )}
          </div>

          {/* Attendance widget — pinned just above the user area so the
              live working timer is always in the user's peripheral vision.
              Hides itself when the user is unauthenticated, and is also
              hidden for real-estate-only agents (referral-onboarded MLM
              users), since check-in/out doesn't apply to that workflow. */}
          {!!userData?.user && !isRebmOnlyAgent && (
            <div className="border-t border-black/10 dark:border-white/10 px-2 py-2">
              <AttendanceWidget />
            </div>
          )}

          {/* User area */}
          {canAccess("/profile") && (
            <div className="border-t border-black/10 dark:border-white/10 px-2 py-2 flex items-center gap-1">
              <Link href="/profile" className="flex-1 min-w-0">
                <button className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors group">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold text-white shrink-0 ring-1 ring-black/5 dark:ring-white/10"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {userInitial}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">
                      {userName}
                    </div>
                    {userEmail && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">
                        {userEmail}
                      </div>
                    )}
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
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
