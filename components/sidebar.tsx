// "use client";

// import type React from "react";
// import { useState, useRef, useEffect, useMemo } from "react";
// import { useRouter, usePathname } from "next/navigation";
// import {
//   Home,
//   Target,
//   Users,
//   Building2,
//   Briefcase,
//   TrendingUp,
//   FileText,
//   Megaphone,
//   Calendar,
//   Wrench,
//   CheckSquare,
//   ChevronDown,
//   ChevronRight,
//   ChevronLeft,
//   Plus,
//   Sliders,
//   X,
//   Search,
//   Folder,
//   BarChart3,
//   Clock,
//   FileCheck,
//   Bell,
//   Settings,
//   LayoutGrid,
//   Zap,
//   Database,
//   Activity,
//   Sparkles,
//   Trash,
// } from "lucide-react";
// import { cn } from "@/lib/utils";
// import { Input } from "@/components/ui/input";
// import Link from "next/link";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { Button } from "@/components/ui/button";
// import { Label } from "@/components/ui/label";
// import { Textarea } from "@/components/ui/textarea";
// import { useToast } from "@/hooks/use-toast";
// import { Loader2 } from "lucide-react";
// import { useGetUserQuery } from "@/lib/api/auth";

// import { useOptimisticModules } from "@/hooks/useOptimisticModules";
// // import { usePermissionContext } from "@/context/PermissionContext"; // ← uncomment when ready

// interface FormModule {
//   id: string;
//   name: string;
//   description?: string;
//   icon?: string;
//   color?: string;
//   path?: string;
//   parentId?: string | null;
//   level: number;
//   sort_order?: number;
//   module_type?: string;
//   children?: FormModule[];
// }

// type ViewType =
//   | "modules"
//   | "reports"
//   | "analytics"
//   | "activities"
//   | "tasks"
//   | "projects"
//   | "deals"
//   | "documents"
//   | "calendar"
//   | "notifications"
//   | "settings"
//   | "ai";

// const getModuleIcon = (iconName?: string, moduleType?: string) => {
//   const iconMap: Record<string, React.ComponentType<any>> = {
//     home: Home,
//     users: Users,
//     "file-text": FileText,
//     settings: Settings,
//     database: Database,
//     activity: Activity,
//     folder: Folder,
//     building2: Building2,
//     target: Target,
//     briefcase: Briefcase,
//     "trending-up": TrendingUp,
//     megaphone: Megaphone,
//     wrench: Wrench,
//     "check-square": CheckSquare,
//   };

//   if (iconName && iconMap[iconName]) return iconMap[iconName];

//   switch (moduleType) {
//     case "user":
//       return Users;
//     case "form":
//       return FileText;
//     case "data":
//       return Database;
//     default:
//       return Folder;
//   }
// };

// interface CrmSidebarProps {
//   onViewChange?: (view: ViewType) => void;
//   onMobileClose?: () => void;
// }

// export function CrmSidebar({ onViewChange, onMobileClose }: CrmSidebarProps) {
//   const router = useRouter();
//   const pathname = usePathname();
//   const { toast } = useToast();

//   const { data: userData, isLoading: isUserLoading } = useGetUserQuery();

//   // Now it's safe to use userData
//   const isAdmin =
//     userData?.user?.unitAssignments?.some(
//       (ua: any) => ua.role?.name?.toUpperCase() === "ADMIN",
//     ) ?? false;

//   const [organizationId, setOrganizationId] = useState<string | null>(null);

//   useEffect(() => {
//     const fetchOrg = async () => {
//       try {
//         const res = await fetch("/api/auth/me");
//         const data = await res.json();
//         if (data?.success && data.user?.organization?.id) {
//           setOrganizationId(data.user.organization.id);
//         }
//       } catch (err) {
//         console.error("Failed to load organization", err);
//       }
//     };
//     fetchOrg();
//   }, []);

//   const { modules, isLoading, error, createModuleOptimistic } =
//     useOptimisticModules(organizationId);

//   // Temporary placeholder - replace with real context when ready
//   const hasPermission = (_action: string, _id: string, _extra: any | null) =>
//     true;

//   const [view, setView] = useState<ViewType>("modules");
//   const [isCollapsed, setIsCollapsed] = useState(false);
//   const [sidebarWidth, setSidebarWidth] = useState(250);
//   const [isResizing, setIsResizing] = useState(false);
//   const [expandedModules, setExpandedModules] = useState<Set<string>>(
//     new Set(),
//   );

//   const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [moduleData, setModuleData] = useState({
//     name: "",
//     description: "",
//     parentId: "",
//   });

//   const sidebarRef = useRef<HTMLDivElement>(null);
//   const resizeRef = useRef<HTMLDivElement>(null);

//   // Resize logic
//   useEffect(() => {
//     const handleMouseMove = (e: MouseEvent) => {
//       if (!isResizing) return;
//       const newWidth = e.clientX - 48;
//       if (newWidth >= 180 && newWidth <= 300) setSidebarWidth(newWidth);
//     };

//     const handleMouseUp = () => setIsResizing(false);

//     if (isResizing) {
//       document.addEventListener("mousemove", handleMouseMove);
//       document.addEventListener("mouseup", handleMouseUp);
//     }

//     return () => {
//       document.removeEventListener("mousemove", handleMouseMove);
//       document.removeEventListener("mouseup", handleMouseUp);
//     };
//   }, [isResizing]);

//   useEffect(() => {
//     document.body.style.userSelect = isResizing ? "none" : "";
//     return () => {
//       document.body.style.userSelect = "";
//     };
//   }, [isResizing]);

//   const generatePath = (module: FormModule): string => {
//     const slug = module.name
//       .toLowerCase()
//       .trim()
//       .replace(/[^a-z0-9\s-]/g, "")
//       .replace(/\s+/g, "-")
//       .replace(/-+/g, "-")
//       .replace(/^-+|-+$/g, "");
//     return `/${slug || "module"}`;
//   };

//   const toggleModule = (moduleId: string) => {
//     setExpandedModules((prev) => {
//       const next = new Set(prev);
//       if (next.has(moduleId)) next.delete(moduleId);
//       else next.add(moduleId);
//       return next;
//     });
//   };

//   const handleModuleClick = (module: FormModule) => {
//     const hasChildren = !!module.children?.length;
//     const basePath = generatePath(module);
//     router.push(`${basePath}/${module.id}`);
//     if (hasChildren) toggleModule(module.id);
//   };

//   const renderModule = (module: FormModule, depth = 0) => {
//     const IconComponent = getModuleIcon(undefined, module.module_type);
//     const hasChildren = !!module.children?.length;
//     const isExpanded = expandedModules.has(module.id);

//     return (
//       <div key={module.id} className="w-full">
//         <button
//           onClick={(e) => {
//             if (hasChildren) e.preventDefault();
//             handleModuleClick(module);
//           }}
//           className={cn(
//             "group relative flex w-full items-center rounded-lg px-3 py-2 text-sm text-black hover:bg-black hover:text-white transition-colors",
//           )}
//           style={{ paddingLeft: `${depth * 16 + 12}px` }}
//         >
//           <div className="flex min-w-0 flex-1 items-center">
//             {hasChildren && (
//               <div className="mr-2 flex-shrink-0">
//                 {isExpanded ? (
//                   <ChevronDown className="h-4 w-4" />
//                 ) : (
//                   <ChevronRight className="h-4 w-4" />
//                 )}
//               </div>
//             )}
//             <IconComponent className="mr-3 h-5 w-5 flex-shrink-0" />
//             <span className="truncate font-medium uppercase">
//               {module.name.toUpperCase()}
//             </span>
//           </div>
//         </button>

//         {hasChildren && isExpanded && (
//           <div className="mt-1 space-y-1">
//             {module.children!.map((child) => renderModule(child, depth + 1))}
//           </div>
//         )}
//       </div>
//     );
//   };

//   const moduleTree = useMemo(() => {
//     const moduleMap = new Map<
//       string,
//       FormModule & { children: FormModule[] }
//     >();

//     modules.forEach((m: FormModule) => {
//       moduleMap.set(m.id, { ...m, children: m.children ?? [] }); // ← fix children undefined
//     });

//     const roots: (FormModule & { children: FormModule[] })[] = [];

//     modules.forEach((m: FormModule) => {
//       const node = moduleMap.get(m.id)!;
//       if (m.parentId && moduleMap.has(m.parentId)) {
//         moduleMap.get(m.parentId)!.children.push(node);
//       } else {
//         roots.push(node);
//       }
//     });

//     const sortModules = (items: typeof roots) => {
//       items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
//       items.forEach((item) => {
//         if (item.children.length > 0) sortModules(item.children);
//       });
//       return items;
//     };

//     return sortModules(roots);
//   }, [modules]);

//   // ─── Only one create handler ────────────────────────────────────────
//   const handleCreateModule = async () => {
//     if (!moduleData.name.trim()) {
//       toast({
//         title: "Validation Error",
//         description: "Module name is required.",
//         variant: "destructive",
//       });
//       return;
//     }

//     if (!organizationId) {
//       toast({
//         title: "Error",
//         description: "Organization not loaded yet. Please wait or refresh.",
//         variant: "destructive",
//       });
//       return;
//     }

//     setIsSubmitting(true);

//     try {
//       await createModuleOptimistic({
//         name: moduleData.name.trim(),
//         description: moduleData.description || "",
//         parentId: moduleData.parentId || null,
//         organizationId: organizationId,
//       });

//       toast({
//         title: "Success",
//         description: "Module created successfully",
//       });

//       setIsCreateDialogOpen(false);
//       setModuleData({ name: "", description: "", parentId: "" });
//     } catch (err: any) {
//       console.error("Create module failed:", err);
//       toast({
//         title: "Creation failed",
//         description: err?.message || "Something went wrong. Please try again.",
//         variant: "destructive",
//       });
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   const iconButtons: {
//     icon: any;
//     view?: ViewType;
//     route?: string;
//     label: string;
//   }[] = [
//     { icon: Folder, view: "modules", label: "Modules" },
//     { icon: BarChart3, view: "reports", label: "Reports" },
//     { icon: Clock, view: "activities", label: "Activities" },
//     { icon: FileCheck, view: "tasks", label: "Tasks" },
//     { icon: Briefcase, view: "deals", label: "Deals" },
//     { icon: Target, view: "projects", label: "Projects" },
//     { icon: Zap, view: "analytics", label: "Analytics" },
//     { icon: FileText, view: "documents", label: "Documents" },
//     { icon: Calendar, view: "calendar", label: "Calendar" },
//     { icon: Bell, view: "notifications", label: "Notifications" },
//     { icon: Settings, route: "/settings", label: "Settings" },
//     { icon: Sparkles, route: "/admin/chatbot", label: "AI Assistant" },
//   ];

//   return (
//     <div className="flex h-full md:h-screen bg-gray-200 text-black">
//       {/* Left icon bar */}
//       <div
//         className="flex w-12 flex-col items-center gap-4 py-4"
//         style={{ backgroundColor: "black" }}
//       >
//         <button
//           onClick={(e) => {
//             e.stopPropagation();
//             e.preventDefault();
//             router.push("/");
//             onMobileClose?.();
//           }}
//           title="Home"
//           className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800"
//         >
//           <Home className="h-5 w-5 text-white" />
//         </button>

//         <button
//           className="flex h-8 w-8 items-center justify-center rounded-lg"
//           style={{ backgroundColor: "#5a4d96" }}
//         >
//           <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white">
//             <svg viewBox="0 0 24 24" className="h-4 w-4" fill="black">
//               <path d="M18 3a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3h12z" />
//             </svg>
//           </div>
//         </button>

//         {iconButtons.map((btn, i) => {
//           const Icon = btn.icon;
//           const isActive = btn.route
//             ? pathname === btn.route
//             : view === btn.view;

//           return (
//             <button
//               key={i}
//               onClick={(e) => {
//                 e.stopPropagation();
//                 e.preventDefault();

//                 if (btn.route) {
//                   router.push(btn.route);
//                 } else if (btn.view) {
//                   setView(btn.view);
//                   onViewChange?.(btn.view);
//                 }

//                 if (btn.view === "ai") setIsCollapsed(true);
//                 else if (isCollapsed) setIsCollapsed(false);

//                 onMobileClose?.();
//               }}
              
//               className={cn(
//                 "flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800 transition-colors",
//                 isActive && "bg-[#5a4d96]",
//               )}
//               title={btn.label}
//             >
//               <Icon className="h-5 w-5 text-white" />
//             </button>
//           );
//         })}

//         <div className="flex-1" />

//         <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800">
//           <LayoutGrid className="h-5 w-5 text-white" />
//         </button>
//       </div>

//       {/* Main sidebar */}
//       <div
//         ref={sidebarRef}
//         className="relative z-10 flex flex-col transition-all duration-300"
//         style={{
//           width: isCollapsed ? 0 : sidebarWidth,
//           minWidth: isCollapsed ? 0 : sidebarWidth,
//           maxWidth: isCollapsed ? 0 : sidebarWidth,
//           overflow: "visible",
//         }}
//       >
//         {/* Header */}
//         <div
//           className="flex items-center justify-between border-b px-4 py-3"
//           style={{ borderColor: "#5a4d96" }}
//         >
//           <div className="flex items-center gap-2">
//             <h2 className="whitespace-nowrap text-base font-semibold">
//               {view === "modules"
//                 ? "Modules"
//                 : view.charAt(0).toUpperCase() + view.slice(1)}
//             </h2>
//             <Sliders className="h-4 w-4" />
//           </div>
//           <div className="flex items-center gap-1">
//             {isAdmin && (
//               <button
//                 onClick={() => setIsCreateDialogOpen(true)}
//                 className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black hover:text-white transition-colors"
//                 title="Create new module"
//                 disabled={isUserLoading}
//               >
//                 <Plus className="h-5 w-5" />
//               </button>
//             )}
//             {/* Close button — only visible on mobile */}
//             {onMobileClose && (
//               <button
//                 onClick={onMobileClose}
//                 className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black hover:text-white transition-colors"
//                 title="Close menu"
//               >
//                 <X className="h-5 w-5" />
//               </button>
//             )}
//           </div>
//         </div>

//         {/* Search */}
//         <div className="px-4 py-3">
//           <div className="relative">
//             <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" />
//             <Input
//               placeholder="Search modules..."
//               className="h-9 border-0 pl-9 text-sm"
//             />
//           </div>
//         </div>

//         {/* Content */}
//         <div className="flex-1 overflow-y-auto px-3 pb-3 r">
//           {view === "modules" ? (
//             <>
//               {isLoading ? (
//                 <div className="flex justify-center py-8">
//                   <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
//                 </div>
//               ) : error ? (
//                 <div className="rounded bg-red-100/30 p-4 text-sm text-red-800">
//                   Failed to load modules
//                 </div>
//               ) : modules.length === 0 ? (
//                 <div className="py-4 text-center text-sm text-gray-500">
//                   No modules yet
//                 </div>
//               ) : (
//                 <nav className="space-y-1">
//                   {moduleTree.map((m) => renderModule(m, 0))}
//                 </nav>
//               )}
//             </>
//           ) : (
//             <div className="p-4 text-sm text-gray-500">
//               {view} view coming soon...
//             </div>
//           )}
//         </div>

//         {/* User area – simplified (remove userData dependency) */}
//         <Link href="/profile">
//           <div
//             className="border-t px-3 py-3 relative"
//             style={{ borderColor: "#5a4d96" }}
//           >
//             <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-black hover:text-white hover:bg-black transition-colors group">
//               <div className="flex items-center gap-2">
//                 <div className="w-5 h-5 rounded bg-[#5a4d96] flex items-center justify-center text-xs font-semibold text-white">
//                   {userData?.user?.first_name?.charAt(0)?.toUpperCase() || "CT"}
//                 </div>
//                 <span className="text-sm font-medium text-black group-hover:text-white">
//                   {userData?.user
//                     ? userData.user.first_name || userData.user.last_name
//                       ? `${userData.user.first_name ?? ""} ${
//                           userData.user.last_name ?? ""
//                         }`.trim()
//                       : (userData.user.username ??
//                         userData.user.email ??
//                         "CRM Teamspace")
//                     : "CRM Teamspace"}
//                 </span>
//               </div>
//               <ChevronDown className="w-4 h-4" />
//             </button>
//             <div className="absolute bottom-3 left-7 w-5 h-5 rounded-full bg-[#5a4d96] flex items-center justify-center">
//               <span className="text-xs font-semibold text-white">1</span>
//             </div>
//           </div>
//         </Link>

//         {/* Resize handle — desktop only */}
//         {!isCollapsed && (
//           <div
//             ref={resizeRef}
//             onMouseDown={(e) => {
//               e.preventDefault();
//               setIsResizing(true);
//             }}
//             className="hidden md:block absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/40"
//           />
//         )}
//       </div>

//       {/* Collapse toggle — desktop only */}
//       <button
//         onClick={() => setIsCollapsed(!isCollapsed)}
//         className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-[99999] h-6 w-6 items-center justify-center rounded-full bg-[#5a4d96] text-white hover:bg-[#6b5da8]"
//         style={{ 
//           left: isCollapsed ? "48px" : `${48 + sidebarWidth}px`, 
//         }}
//       >
//         {isCollapsed ? (
//           <ChevronRight className="h-4 w-4" />
//         ) : (
//           <ChevronLeft className="h-4 w-4" />
//         )}
//       </button>

//       {/* Create dialog */}
//       <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
//         <DialogContent
//           className={cn(
//             // Mobile-first: smaller & narrower on phones
//             "max-w-[90vw] sm:max-w-[420px] md:max-w-[480px] lg:max-w-[500px]",
//             "max-h-[92vh] overflow-y-auto",
//             "p-4 sm:p-5 md:p-6",
//             "bg-white border border-slate-200 shadow-xl rounded-lg sm:rounded-xl",
//             "transition-all duration-200",
//           )}
//         >
//           <DialogHeader className="mb-4 sm:mb-5">
//             <DialogTitle className="text-lg sm:text-xl md:text-2xl font-semibold text-slate-900">
//               Create New Module
//             </DialogTitle>
//             <DialogDescription className="text-xs sm:text-sm text-slate-600 mt-1">
//               Add a new module to organize your workspace content.
//             </DialogDescription>
//           </DialogHeader>

//           <div className="space-y-4 sm:space-y-5 py-1 sm:py-2">
//             {/* Module Name */}
//             <div className="space-y-1.5">
//               <Label
//                 htmlFor="module-name"
//                 className="text-sm font-medium text-slate-700"
//               >
//                 Module Name <span className="text-red-500">*</span>
//               </Label>
//               <Input
//                 id="module-name"
//                 value={moduleData.name}
//                 onChange={(e) =>
//                   setModuleData({ ...moduleData, name: e.target.value })
//                 }
//                 placeholder="e.g. Customers, Inventory"
//                 className={cn(
//                   "h-9 sm:h-10 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all",
//                   !moduleData.name.trim() &&
//                     "border-red-400 focus:border-red-500 focus:ring-red-500",
//                 )}
//                 autoFocus
//               />
//               {!moduleData.name.trim() && (
//                 <p className="text-xs text-red-600 mt-1">
//                   Module name is required
//                 </p>
//               )}
//             </div>

//             {/* Description */}
//             <div className="space-y-1.5">
//               <Label
//                 htmlFor="module-description"
//                 className="text-sm font-medium text-slate-700"
//               >
//                 Description (optional)
//               </Label>
//               <Textarea
//                 id="module-description"
//                 value={moduleData.description}
//                 onChange={(e) =>
//                   setModuleData({ ...moduleData, description: e.target.value })
//                 }
//                 placeholder="Brief description..."
//                 rows={2}
//                 className="min-h-[70px] sm:min-h-[90px] text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y transition-all"
//               />
//             </div>
//           </div>

//           <DialogFooter className="mt-5 sm:mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-slate-200">
//             <Button
//               type="button"
//               variant="outline"
//               onClick={() => setIsCreateDialogOpen(false)}
//               disabled={isSubmitting}
//               className="h-9 sm:h-10 px-4 sm:px-5 text-sm"
//             >
//               Cancel
//             </Button>

//             <Button
//               onClick={handleCreateModule}
//               disabled={isSubmitting || !moduleData.name.trim()}
//               className={cn(
//                 "h-9 sm:h-10 px-4 sm:px-6 text-sm font-medium",
//                 "bg-indigo-600 hover:bg-indigo-700",
//                 "shadow-sm hover:shadow transition-all",
//               )}
//             >
//               {isSubmitting && (
//                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//               )}
//               Create
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }


// "use client";

// import type React from "react";
// import { useState, useRef, useEffect, useMemo } from "react";
// import { useRouter, usePathname } from "next/navigation";
// import {
//   Home,
//   Target,
//   Users,
//   Building2,
//   Briefcase,
//   TrendingUp,
//   FileText,
//   Megaphone,
//   Calendar,
//   Wrench,
//   CheckSquare,
//   ChevronDown,
//   ChevronRight,
//   ChevronLeft,
//   Plus,
//   Sliders,
//   Search,
//   Folder,
//   BarChart3,
//   Clock,
//   FileCheck,
//   Bell,
//   Settings,
//   LayoutGrid,
//   Zap,
//   Database,
//   Activity,
//   Sparkles,
//   Trash,
// } from "lucide-react";
// import { cn } from "@/lib/utils";
// import { Input } from "@/components/ui/input";
// import Link from "next/link";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { Button } from "@/components/ui/button";
// import { Label } from "@/components/ui/label";
// import { Textarea } from "@/components/ui/textarea";
// import { useToast } from "@/hooks/use-toast";
// import { Loader2 } from "lucide-react";
// import { useGetUserQuery } from "@/lib/api/auth";

// import { useOptimisticModules } from "@/hooks/useOptimisticModules";
// // import { usePermissionContext } from "@/context/PermissionContext"; // ← uncomment when ready

// interface FormModule {
//   id: string;
//   name: string;
//   description?: string;
//   icon?: string;
//   color?: string;
//   path?: string;
//   parentId?: string | null;
//   level: number;
//   sort_order?: number;
//   module_type?: string;
//   children?: FormModule[];
// }

// type ViewType =
//   | "modules"
//   | "reports"
//   | "analytics"
//   | "activities"
//   | "tasks"
//   | "projects"
//   | "deals"
//   | "documents"
//   | "calendar"
//   | "notifications"
//   | "settings"
//   | "ai";

// const getModuleIcon = (iconName?: string, moduleType?: string) => {
//   const iconMap: Record<string, React.ComponentType<any>> = {
//     home: Home,
//     users: Users,
//     "file-text": FileText,
//     settings: Settings,
//     database: Database,
//     activity: Activity,
//     folder: Folder,
//     building2: Building2,
//     target: Target,
//     briefcase: Briefcase,
//     "trending-up": TrendingUp,
//     megaphone: Megaphone,
//     wrench: Wrench,
//     "check-square": CheckSquare,
//   };

//   if (iconName && iconMap[iconName]) return iconMap[iconName];

//   switch (moduleType) {
//     case "user": return Users;
//     case "form": return FileText;
//     case "data": return Database;
//     default: return Folder;
//   }
// };

// interface CrmSidebarProps {
//   onViewChange?: (view: ViewType) => void;
// }

// export function CrmSidebar({ onViewChange }: CrmSidebarProps) {
//   const router = useRouter();
//   const pathname = usePathname();
//   const { toast } = useToast();

//   const { data: userData, isLoading: isUserLoading } = useGetUserQuery();

//   // Now it's safe to use userData
//   const isAdmin = userData?.user?.unitAssignments?.some(
//     (ua: any) => ua.role?.name?.toUpperCase() === "ADMIN"
//   ) ?? false;

//   const [organizationId, setOrganizationId] = useState<string | null>(null);


//   useEffect(() => {
//     const fetchOrg = async () => {
//       try {
//         const res = await fetch("/api/auth/me");
//         const data = await res.json();
//         if (data?.success && data.user?.organization?.id) {
//           setOrganizationId(data.user.organization.id);
//         }
//       } catch (err) {
//         console.error("Failed to load organization", err);
//       }
//     };
//     fetchOrg();
//   }, []);


//   const {
//     modules,
//     isLoading,
//     error,
//     createModuleOptimistic,
//   } = useOptimisticModules(organizationId);

//   // Temporary placeholder - replace with real context when ready
//   const hasPermission = (_action: string, _id: string, _extra: any | null) => true;

//   const [view, setView] = useState<ViewType>("modules");
//   const [isCollapsed, setIsCollapsed] = useState(false);
//   const [sidebarWidth, setSidebarWidth] = useState(250);
//   const [isResizing, setIsResizing] = useState(false);
//   const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

//   const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [moduleData, setModuleData] = useState({
//     name: "",
//     description: "",
//     parentId: "",
//   });

//   const sidebarRef = useRef<HTMLDivElement>(null);
//   const resizeRef = useRef<HTMLDivElement>(null);

//   // Resize logic
//   useEffect(() => {
//     const handleMouseMove = (e: MouseEvent) => {
//       if (!isResizing) return;
//       const newWidth = e.clientX - 48;
//       if (newWidth >= 180 && newWidth <= 300) setSidebarWidth(newWidth);
//     };

//     const handleMouseUp = () => setIsResizing(false);

//     if (isResizing) {
//       document.addEventListener("mousemove", handleMouseMove);
//       document.addEventListener("mouseup", handleMouseUp);
//     }

//     return () => {
//       document.removeEventListener("mousemove", handleMouseMove);
//       document.removeEventListener("mouseup", handleMouseUp);
//     };
//   }, [isResizing]);

//   useEffect(() => {
//     document.body.style.userSelect = isResizing ? "none" : "";
//     return () => { document.body.style.userSelect = ""; };
//   }, [isResizing]);

//   const generatePath = (module: FormModule): string => {
//     const slug = module.name
//       .toLowerCase()
//       .trim()
//       .replace(/[^a-z0-9\s-]/g, "")
//       .replace(/\s+/g, "-")
//       .replace(/-+/g, "-")
//       .replace(/^-+|-+$/g, "");
//     return `/${slug || "module"}`;
//   };

//   const toggleModule = (moduleId: string) => {
//     setExpandedModules((prev) => {
//       const next = new Set(prev);
//       if (next.has(moduleId)) next.delete(moduleId);
//       else next.add(moduleId);
//       return next;
//     });
//   };

//   const handleModuleClick = (module: FormModule) => {
//     const hasChildren = !!module.children?.length;
//     const basePath = generatePath(module);
//     router.push(`${basePath}/${module.id}`);
//     if (hasChildren) toggleModule(module.id);
//   };

//   const renderModule = (module: FormModule, depth = 0) => {
//     const IconComponent = getModuleIcon(undefined, module.module_type);
//     const hasChildren = !!module.children?.length;
//     const isExpanded = expandedModules.has(module.id);

//     return (
//       <div key={module.id} className="w-full">
//         <button
//           onClick={(e) => {
//             if (hasChildren) e.preventDefault();
//             handleModuleClick(module);
//           }}
//           className={cn(
//             "group relative flex w-full items-center rounded-lg px-3 py-2 text-sm text-black hover:bg-black hover:text-white transition-colors"
//           )}
//           style={{ paddingLeft: `${depth * 16 + 12}px` }}
//         >
//           <div className="flex min-w-0 flex-1 items-center">
//             {hasChildren && (
//               <div className="mr-2 flex-shrink-0">
//                 {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
//               </div>
//             )}
//             <IconComponent className="mr-3 h-5 w-5 flex-shrink-0" />
//             <span className="truncate font-medium uppercase">{module.name.toUpperCase()}</span>
//           </div>


//         </button>

//         {hasChildren && isExpanded && (
//           <div className="mt-1 space-y-1">
//             {module.children!.map((child) => renderModule(child, depth + 1))}
//           </div>
//         )}
//       </div>
//     );
//   };

//   const moduleTree = useMemo(() => {
//     const moduleMap = new Map<string, FormModule & { children: FormModule[] }>();

//     modules.forEach((m: FormModule) => {
//       moduleMap.set(m.id, { ...m, children: m.children ?? [] }); // ← fix children undefined
//     });

//     const roots: (FormModule & { children: FormModule[] })[] = [];

//     modules.forEach((m: FormModule) => {
//       const node = moduleMap.get(m.id)!;
//       if (m.parentId && moduleMap.has(m.parentId)) {
//         moduleMap.get(m.parentId)!.children.push(node);
//       } else {
//         roots.push(node);
//       }
//     });

//     const sortModules = (items: typeof roots) => {
//       items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
//       items.forEach((item) => {
//         if (item.children.length > 0) sortModules(item.children);
//       });
//       return items;
//     };

//     return sortModules(roots);
//   }, [modules]);

//   // ─── Only one create handler ────────────────────────────────────────
//   const handleCreateModule = async () => {
//     if (!moduleData.name.trim()) {
//       toast({
//         title: "Validation Error",
//         description: "Module name is required.",
//         variant: "destructive",
//       });
//       return;
//     }

//     if (!organizationId) {
//       toast({
//         title: "Error",
//         description: "Organization not loaded yet. Please wait or refresh.",
//         variant: "destructive",
//       });
//       return;
//     }

//     setIsSubmitting(true);

//     try {
//       await createModuleOptimistic({
//         name: moduleData.name.trim(),
//         description: moduleData.description || "",
//         parentId: moduleData.parentId || null,
//         organizationId: organizationId,
//       });

//       toast({
//         title: "Success",
//         description: "Module created successfully",
//       });

//       setIsCreateDialogOpen(false);
//       setModuleData({ name: "", description: "", parentId: "" });
//     } catch (err: any) {
//       console.error("Create module failed:", err);
//       toast({
//         title: "Creation failed",
//         description: err?.message || "Something went wrong. Please try again.",
//         variant: "destructive",
//       });
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   const iconButtons: { icon: any; view?: ViewType; route?: string; label: string }[] = [
//     { icon: Folder, view: "modules", label: "Modules" },
//     { icon: BarChart3, view: "reports", label: "Reports" },
//     { icon: Clock, view: "activities", label: "Activities" },
//     { icon: FileCheck, view: "tasks", label: "Tasks" },
//     { icon: Briefcase, view: "deals", label: "Deals" },
//     { icon: Target, view: "projects", label: "Projects" },
//     { icon: Zap, view: "analytics", label: "Analytics" },
//     { icon: FileText, view: "documents", label: "Documents" },
//     { icon: Calendar, view: "calendar", label: "Calendar" },
//     { icon: Bell, view: "notifications", label: "Notifications" },
//     { icon: Settings, route: "/settings", label: "Settings" },
//     { icon: Sparkles, route: "/admin/chatbot", label: "AI Assistant" },
//   ];

//   return (
//     <div className="flex h-screen bg-gray-200 text-black">
//       {/* Left icon bar */}
//       <div className="flex w-12 flex-col items-center gap-4 py-4" style={{ backgroundColor: "black" }}>
//         <button onClick={() => router.push("/")} title="Home" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800">
//           <Home className="h-5 w-5 text-white" />
//         </button>

//         <button className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#5a4d96" }}>
//           <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white">
//             <svg viewBox="0 0 24 24" className="h-4 w-4" fill="black">
//               <path d="M18 3a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3h12z" />
//             </svg>
//           </div>
//         </button>

//         {iconButtons.map((btn, i) => {
//           const Icon = btn.icon;
//           const isActive = btn.route ? pathname === btn.route : view === btn.view;

//           return (
//             <button
//               key={i}
//               onClick={() => {
//                 if (btn.route) {
//                   router.push(btn.route);
//                 } else if (btn.view) {
//                   setView(btn.view);
//                   onViewChange?.(btn.view);
//                 }
//                 if (btn.view === "ai") setIsCollapsed(true);
//                 else if (isCollapsed) setIsCollapsed(false);
//               }}
//               className={cn(
//                 "flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800 transition-colors",
//                 isActive && "bg-[#5a4d96]"
//               )}
//               title={btn.label}
//             >
//               <Icon className="h-5 w-5 text-white" />
//             </button>
//           );
//         })}

//         <div className="flex-1" />

//         <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800">
//           <LayoutGrid className="h-5 w-5 text-white" />
//         </button>
//       </div>

//       {/* Main sidebar */}
//       <div
//         ref={sidebarRef}
//         className="relative flex flex-col transition-all duration-300"
//         style={{
//           width: isCollapsed ? 0 : sidebarWidth,
//           minWidth: isCollapsed ? 0 : sidebarWidth,
//           maxWidth: isCollapsed ? 0 : sidebarWidth,
//           overflow: "hidden",
//         }}
//       >
//         {/* Header */}
//         <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#5a4d96" }}>
//           <div className="flex items-center gap-2">
//             <h2 className="whitespace-nowrap text-base font-semibold">
//               {view === "modules" ? "Modules" : view.charAt(0).toUpperCase() + view.slice(1)}
//             </h2>
//             <Sliders className="h-4 w-4" />
//           </div>
//           {isAdmin && (
//             <button
//               onClick={() => setIsCreateDialogOpen(true)}
//               className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black hover:text-white transition-colors"
//               title="Create new module"
//               disabled={isUserLoading} // optional: disable while loading user
//             >
//               <Plus className="h-5 w-5" />
//             </button>
//           )}
//         </div>

//         {/* Search */}
//         <div className="px-4 py-3">
//           <div className="relative">
//             <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" />
//             <Input placeholder="Search modules..." className="h-9 border-0 pl-9 text-sm" />
//           </div>
//         </div>

//         {/* Content */}
//         <div className="flex-1 overflow-y-auto px-3 pb-3">
//           {view === "modules" ? (
//             <>
//               {isLoading ? (
//                 <div className="flex justify-center py-8">
//                   <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
//                 </div>
//               ) : error ? (
//                 <div className="rounded bg-red-100/30 p-4 text-sm text-red-800">Failed to load modules</div>
//               ) : modules.length === 0 ? (
//                 <div className="py-4 text-center text-sm text-gray-500">No modules yet</div>
//               ) : (
//                 <nav className="space-y-1">{moduleTree.map((m) => renderModule(m, 0))}</nav>
//               )}
//             </>
//           ) : (
//             <div className="p-4 text-sm text-gray-500">{view} view coming soon...</div>
//           )}
//         </div>

//         {/* User area – simplified (remove userData dependency) */}
//         <Link href="/profile">
//           <div
//             className="border-t px-3 py-3 relative"
//             style={{ borderColor: "#5a4d96" }}
//           >
//             <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-black hover:text-white hover:bg-black transition-colors group">
//               <div className="flex items-center gap-2">
//                 <div className="w-5 h-5 rounded bg-[#5a4d96] flex items-center justify-center text-xs font-semibold text-white">
//                   {userData?.user?.first_name?.charAt(0)?.toUpperCase() || "CT"}
//                 </div>
//                 <span className="text-sm font-medium text-black group-hover:text-white">
//                   {userData?.user
//                     ? userData.user.first_name || userData.user.last_name
//                       ? `${userData.user.first_name ?? ""} ${userData.user.last_name ?? ""
//                         }`.trim()
//                       : userData.user.username ??
//                       userData.user.email ??
//                       "CRM Teamspace"
//                     : "CRM Teamspace"}
//                 </span>
//               </div>
//               <ChevronDown className="w-4 h-4" />
//             </button>
//             <div className="absolute bottom-3 left-7 w-5 h-5 rounded-full bg-[#5a4d96] flex items-center justify-center">
//               <span className="text-xs font-semibold text-white">1</span>
//             </div>
//           </div>
//         </Link>

//         {/* Resize handle */}
//         {!isCollapsed && (
//           <div
//             ref={resizeRef}
//             onMouseDown={(e) => {
//               e.preventDefault();
//               setIsResizing(true);
//             }}
//             className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/40"
//           />
//         )}
//       </div>

//       {/* Collapse toggle */}
//       <button
//         onClick={() => setIsCollapsed(!isCollapsed)}
//         className="absolute bottom-4 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#5a4d96] text-white hover:bg-[#6b5da8]"
//         style={{ left: isCollapsed ? "48px" : `${48 + sidebarWidth - 3}px` }}
//       >
//         {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
//       </button>

//       {/* Create dialog */}
//       <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
//         <DialogContent>
//           <DialogHeader>
//             <DialogTitle>Create New Module</DialogTitle>
//             <DialogDescription>Add a new module to your workspace.</DialogDescription>
//           </DialogHeader>
//           <div className="space-y-4 py-4">
//             <div>
//               <Label>Module Name</Label>
//               <Input
//                 value={moduleData.name}
//                 onChange={(e) => setModuleData({ ...moduleData, name: e.target.value })}
//                 placeholder="e.g. Customers, Inventory"
//               />
//             </div>
//             <div>
//               <Label>Description (optional)</Label>
//               <Textarea
//                 value={moduleData.description}
//                 onChange={(e) => setModuleData({ ...moduleData, description: e.target.value })}
//                 placeholder="Brief description..."
//                 rows={3}
//               />
//             </div>
//           </div>
//           <DialogFooter>
//             <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
//               Cancel
//             </Button>
//             <Button
//               onClick={handleCreateModule}
//               disabled={isSubmitting || !moduleData.name.trim()}
//             >
//               {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
//               Create
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }

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
  Calendar,
  Wrench,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Plus,
  Sliders,
  Search,
  Folder,
  BarChart3,
  Clock,
  FileCheck,
  Bell,
  Settings,
  LayoutGrid,
  Zap,
  Database,
  Activity,
  Sparkles,
  Trash,
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
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useGetUserQuery } from "@/lib/api/auth";

import { useOptimisticModules } from "@/hooks/useOptimisticModules";
// import { usePermissionContext } from "@/context/PermissionContext"; // ← uncomment when ready

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
    case "user": return Users;
    case "form": return FileText;
    case "data": return Database;
    default: return Folder;
  }
};

interface CrmSidebarProps {
  onViewChange?: (view: ViewType) => void;
}

export function CrmSidebar({ onViewChange }: CrmSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const { data: userData, isLoading: isUserLoading } = useGetUserQuery();

  // Now it's safe to use userData
  const isAdmin = userData?.user?.unitAssignments?.some(
    (ua: any) => ua.role?.name?.toUpperCase() === "ADMIN"
  ) ?? false;

  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data?.success && data.user?.organization?.id) {
          setOrganizationId(data.user.organization.id);
        }
      } catch (err) {
        console.error("Failed to load organization", err);
      }
    };
    fetchOrg();
  }, []);

  const {
    modules,
    isLoading,
    error,
    createModuleOptimistic,
  } = useOptimisticModules(organizationId);

  // Temporary placeholder - replace with real context when ready
  const hasPermission = (_action: string, _id: string, _extra: any | null) => true;

  const [view, setView] = useState<ViewType>("modules");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moduleData, setModuleData] = useState({
    name: "",
    description: "",
    parentId: "",
  });

  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Resize logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX - 48;
      if (newWidth >= 180 && newWidth <= 300) setSidebarWidth(newWidth);
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
    return () => { document.body.style.userSelect = ""; };
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

  const handleModuleClick = (module: FormModule) => {
    const hasChildren = !!module.children?.length;
    const basePath = generatePath(module);
    router.push(`${basePath}/${module.id}`);
    if (hasChildren) toggleModule(module.id);
  };

  const renderModule = (module: FormModule, depth = 0) => {
    const IconComponent = getModuleIcon(undefined, module.module_type);
    const hasChildren = !!module.children?.length;
    const isExpanded = expandedModules.has(module.id);

    return (
      <div key={module.id} className="w-full">
        <button
          onClick={(e) => {
            if (hasChildren) e.preventDefault();
            handleModuleClick(module);
          }}
          className={cn(
            "group relative flex w-full items-center rounded-lg px-3 py-2 text-sm text-black hover:bg-black hover:text-white transition-colors"
          )}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          <div className="flex min-w-0 flex-1 items-center">
            {hasChildren && (
              <div className="mr-2 flex-shrink-0">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            )}
            <IconComponent className="mr-3 h-5 w-5 flex-shrink-0" />
            <span className="truncate font-medium uppercase">{module.name.toUpperCase()}</span>
          </div>
        </button>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {module.children!.map((child) => renderModule(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const moduleTree = useMemo(() => {
    const moduleMap = new Map<string, FormModule & { children: FormModule[] }>();

    modules.forEach((m: FormModule) => {
      moduleMap.set(m.id, { ...m, children: m.children ?? [] });
    });

    const roots: (FormModule & { children: FormModule[] })[] = [];

    modules.forEach((m: FormModule) => {
      const node = moduleMap.get(m.id)!;
      if (m.parentId && moduleMap.has(m.parentId)) {
        moduleMap.get(m.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortModules = (items: typeof roots) => {
      items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      items.forEach((item) => {
        if (item.children.length > 0) sortModules(item.children);
      });
      return items;
    };

    return sortModules(roots);
  }, [modules]);

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

  const iconButtons: { icon: any; view?: ViewType; route?: string; label: string }[] = [
    { icon: Folder, view: "modules", label: "Modules" },
    { icon: BarChart3, view: "reports", label: "Reports" },
    { icon: Clock, view: "activities", label: "Activities" },
    { icon: FileCheck, view: "tasks", label: "Tasks" },
    { icon: Briefcase, view: "deals", label: "Deals" },
    { icon: Target, view: "projects", label: "Projects" },
    { icon: Zap, view: "analytics", label: "Analytics" },
    { icon: FileText, view: "documents", label: "Documents" },
    { icon: Calendar, view: "calendar", label: "Calendar" },
    { icon: Bell, view: "notifications", label: "Notifications" },
    { icon: Settings, route: "/settings", label: "Settings" },
    { icon: Sparkles, route: "/admin/chatbot", label: "AI Assistant" },
  ];

  return (
    <div className="flex h-screen bg-gray-200 text-black">
      {/* Left icon bar – always on top */}
      <div 
        className="flex w-12 flex-col items-center gap-4 py-4 z-[60]" 
        style={{ backgroundColor: "black" }}
      >
        <button onClick={() => router.push("/")} title="Home" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800">
          <Home className="h-5 w-5 text-white" />
        </button>

        <button className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "#5a4d96" }}>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="black">
              <path d="M18 3a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3h12z" />
            </svg>
          </div>
        </button>

        {iconButtons.map((btn, i) => {
          const Icon = btn.icon;
          const isActive = btn.route ? pathname === btn.route : view === btn.view;

          return (
            <button
              key={i}
              onClick={() => {
                if (btn.route) {
                  router.push(btn.route);
                } else if (btn.view) {
                  setView(btn.view);
                  onViewChange?.(btn.view);
                }
                if (btn.view === "ai") setIsCollapsed(true);
                else if (isCollapsed) setIsCollapsed(false);
              }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800 transition-colors",
                isActive && "bg-[#5a4d96]"
              )}
              title={btn.label}
            >
              <Icon className="h-5 w-5 text-white" />
            </button>
          );
        })}

        <div className="flex-1" />

        <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800">
          <LayoutGrid className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Main sidebar – pushed behind when collapsed */}
      <div
        ref={sidebarRef}
        className={cn(
          "relative flex flex-col transition-all duration-300",
          isCollapsed && "z-[-10] pointer-events-none"
        )}
        style={{
          width: isCollapsed ? 0 : sidebarWidth,
          minWidth: isCollapsed ? 0 : sidebarWidth,
          maxWidth: isCollapsed ? 0 : sidebarWidth,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#5a4d96" }}>
          <div className="flex items-center gap-2">
            <h2 className="whitespace-nowrap text-base font-semibold">
              {view === "modules" ? "Modules" : view.charAt(0).toUpperCase() + view.slice(1)}
            </h2>
            <Sliders className="h-4 w-4" />
          </div>
          {isAdmin && (
            <button
              onClick={() => setIsCreateDialogOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black hover:text-white transition-colors"
              title="Create new module"
              disabled={isUserLoading}
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" />
            <Input placeholder="Search modules..." className="h-9 border-0 pl-9 text-sm" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {view === "modules" ? (
            <>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : error ? (
                <div className="rounded bg-red-100/30 p-4 text-sm text-red-800">Failed to load modules</div>
              ) : modules.length === 0 ? (
                <div className="py-4 text-center text-sm text-gray-500">No modules yet</div>
              ) : (
                <nav className="space-y-1">{moduleTree.map((m) => renderModule(m, 0))}</nav>
              )}
            </>
          ) : (
            <div className="p-4 text-sm text-gray-500">{view} view coming soon...</div>
          )}
        </div>

        {/* User area */}
        <Link href="/profile">
          <div
            className="border-t px-3 py-3 relative"
            style={{ borderColor: "#5a4d96" }}
          >
            <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-black hover:text-white hover:bg-black transition-colors group">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#5a4d96] flex items-center justify-center text-xs font-semibold text-white">
                  {userData?.user?.first_name?.charAt(0)?.toUpperCase() || "CT"}
                </div>
                <span className="text-sm font-medium text-black group-hover:text-white">
                  {userData?.user
                    ? userData.user.first_name || userData.user.last_name
                      ? `${userData.user.first_name ?? ""} ${userData.user.last_name ?? ""}`.trim()
                      : userData.user.username ??
                        userData.user.email ??
                        "CRM Teamspace"
                    : "CRM Teamspace"}
                </span>
              </div>
              <ChevronDown className="w-4 h-4" />
            </button>
            <div className="absolute bottom-3 left-7 w-5 h-5 rounded-full bg-[#5a4d96] flex items-center justify-center">
              <span className="text-xs font-semibold text-white">1</span>
            </div>
          </div>
        </Link>

        {/* Resize handle */}
        {!isCollapsed && (
          <div
            ref={resizeRef}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/40"
          />
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute bottom-4 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#5a4d96] text-white hover:bg-[#6b5da8]"
        style={{ left: isCollapsed ? "48px" : `${48 + sidebarWidth - 3}px` }}
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Create dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Module</DialogTitle>
            <DialogDescription>Add a new module to your workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Module Name</Label>
              <Input
                value={moduleData.name}
                onChange={(e) => setModuleData({ ...moduleData, name: e.target.value })}
                placeholder="e.g. Customers, Inventory"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={moduleData.description}
                onChange={(e) => setModuleData({ ...moduleData, description: e.target.value })}
                placeholder="Brief description..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateModule}
              disabled={isSubmitting || !moduleData.name.trim()}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}