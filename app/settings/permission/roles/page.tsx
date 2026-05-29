"use client";

/**
 * /settings/permission/roles
 *
 * Two top-level tabs:
 *   • By Role     — new role-centric workflow:
 *                   - Searchable role list (with user + permission counts)
 *                   - Selected role's detail panel with Permissions + Users tabs
 *                   - Per-user override sheet with tri-state (inherit/grant/deny)
 *
 *   • By Resource — the existing forms / sections / fields / routes / static
 *                   pages matrices, preserved unchanged for power-user flows.
 *
 * Responsive:
 *   ≥ lg : side-by-side panes.
 *   < lg : stacked role list → tap a role to slide in a detail Sheet.
 *
 * Performance:
 *   - One batched fetch for roles + counts.
 *   - One batched fetch per role for users + override counts.
 *   - One batched fetch for the user-permission-matrix when the sheet opens.
 *   - All three back the cache-friendly endpoints in /api/roles and
 *     /api/users.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormsSidebar } from "@/components/admin/forms-sidebar";
import { FormsPermissionMatrix } from "@/components/admin/forms-permission-matrix";
import { SectionsPermissionMatrix } from "@/components/admin/sections-permission-matrix";
import { FieldsPermissionMatrix } from "@/components/admin/fields-permission-matrix";
import { RoutePermissionMatrix } from "@/components/admin/route-permission-matrix";
import { StaticPagesRolesMatrix } from "@/components/admin/static-pages-roles-matrix";
import { useModules } from "@/hooks/use-modules";
import type { FormSelection } from "@/types/permissions";
import { GripVertical, Globe, Layers, Shield, Users as UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ByRoleView } from "@/components/admin/permission-page/by-role-view";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 240;
const SIDEBAR_STORAGE_KEY = "roles-permissions:sidebar-width";

export default function RolesPermissionsPage() {
  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
      <PageHeader />

      <Tabs defaultValue="by-role">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="by-role" className="gap-1.5 flex-1 sm:flex-none">
            <UsersIcon className="h-3.5 w-3.5" />
            By Role
          </TabsTrigger>
          <TabsTrigger value="by-resource" className="gap-1.5 flex-1 sm:flex-none">
            <Layers className="h-3.5 w-3.5" />
            By Resource
          </TabsTrigger>
        </TabsList>

        <TabsContent value="by-role" className="mt-3 sm:mt-4">
          <ByRoleView
            renderPermissionsSlot={(role) => (
              <ByRolePermissions roleId={role.id} roleName={role.name} />
            )}
          />
        </TabsContent>

        <TabsContent value="by-resource" className="mt-3 sm:mt-4">
          <ByResourceView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Shield className="h-4.5 w-4.5" />
      </div>
      <div>
        <h1 className="text-lg sm:text-xl font-semibold leading-tight">
          Roles & Permissions
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-tight">
          Manage who can see and do what in your organization.
        </p>
      </div>
    </div>
  );
}

/**
 * Inside the By Role view's Permissions tab. For now we point the admin at
 * the By Resource view for the actual matrix editing — the new view's role
 * detail focuses on the Users tab as the highest-value addition. A second
 * pass can introduce a single-role matrix here without touching the rest.
 */
function ByRolePermissions({
  roleId,
  roleName,
}: {
  roleId: string;
  roleName: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              Edit {roleName}'s permissions
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Permission matrices live in the <b>By Resource</b> tab — pick a
              form there to see every role's grants in one place. Use the{" "}
              <b>Users</b> tab here to drill into individual users and apply
              per-user overrides (grant or deny) that take precedence over
              the role's defaults.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── By Resource view — original page content, preserved ─────────────────────

function ByResourceView() {
  const [formSelection, setFormSelection] = useState<FormSelection | null>(null);
  const [routeSelection, setRouteSelection] = useState<string | null>(null);
  const [bulkPagesView, setBulkPagesView] = useState(true);
  const { modules, loading, error } = useModules();
  const unsavedChangesRef = useRef(false);

  const guardSwitch = useCallback(() => {
    if (
      unsavedChangesRef.current &&
      !window.confirm(
        "You have unsaved permission changes. Switch and discard them?",
      )
    ) {
      return false;
    }
    return true;
  }, []);

  const handleFormSelect = useCallback(
    (formId: string, moduleId: string, submoduleId?: string) => {
      if (!guardSwitch()) return;
      setRouteSelection(null);
      setBulkPagesView(false);
      setFormSelection({ formId, moduleId, submoduleId: submoduleId ?? null });
    },
    [guardSwitch],
  );

  const handleRouteSelect = useCallback(
    (path: string) => {
      if (!guardSwitch()) return;
      setFormSelection(null);
      setBulkPagesView(false);
      setRouteSelection(path);
    },
    [guardSwitch],
  );

  const handleShowBulkPages = useCallback(() => {
    if (!guardSwitch()) return;
    setFormSelection(null);
    setRouteSelection(null);
    setBulkPagesView(true);
  }, [guardSwitch]);

  // ── Resizable sidebar (lg+ only) ──────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) {
        setSidebarWidth(n);
      }
    }
  }, []);

  const sidebarWidthRef = useRef(sidebarWidth);
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
    if (containerRef.current) {
      containerRef.current.style.setProperty(
        "--sidebar-w",
        `${sidebarWidth}px`,
      );
    }
  }, [sidebarWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current || !containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const next = Math.min(
        SIDEBAR_MAX,
        Math.max(SIDEBAR_MIN, e.clientX - rect.left),
      );
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        window.localStorage.setItem(
          SIDEBAR_STORAGE_KEY,
          String(sidebarWidthRef.current),
        );
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const resetWidth = () => {
    setSidebarWidth(SIDEBAR_DEFAULT);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(SIDEBAR_DEFAULT));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive text-sm">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      <div
        ref={containerRef}
        className="flex flex-col items-stretch gap-3 lg:flex-row lg:gap-0"
      >
        <div className="w-full lg:sticky lg:top-3 lg:h-[calc(100vh-9rem)] lg:w-[var(--sidebar-w,240px)] lg:shrink-0 lg:self-start">
          <FormsSidebar
            modules={modules}
            loading={loading}
            onFormSelect={handleFormSelect}
            selectedForm={formSelection?.formId ?? null}
            selectedRoute={routeSelection}
            onRouteSelect={handleRouteSelect}
          />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          tabIndex={0}
          onMouseDown={startResize}
          onDoubleClick={resetWidth}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              setSidebarWidth((w) => Math.max(SIDEBAR_MIN, w - 16));
            } else if (e.key === "ArrowRight") {
              setSidebarWidth((w) => Math.min(SIDEBAR_MAX, w + 16));
            } else if (e.key === "Home") {
              setSidebarWidth(SIDEBAR_MIN);
            } else if (e.key === "End") {
              setSidebarWidth(SIDEBAR_MAX);
            } else if (e.key === "Enter" || e.key === " ") {
              resetWidth();
            }
          }}
          className={cn(
            "group relative hidden cursor-col-resize self-stretch lg:sticky lg:top-3 lg:flex lg:h-[calc(100vh-9rem)] lg:w-1.5 lg:items-center lg:justify-center lg:mx-1.5",
            "before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors",
            "hover:before:bg-primary focus-visible:outline-none focus-visible:before:bg-primary",
            isResizing && "before:bg-primary",
          )}
          title="Drag to resize · double-click to reset"
        >
          <div
            className={cn(
              "z-10 flex h-8 w-3.5 items-center justify-center rounded-sm border bg-background text-muted-foreground shadow-sm transition-all",
              "group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground",
              isResizing && "border-primary bg-primary text-primary-foreground",
            )}
          >
            <GripVertical className="h-3 w-3" />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3 lg:pl-3 lg:flex lg:flex-col lg:h-[calc(100vh-9rem)]">
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button
              size="sm"
              variant={bulkPagesView ? "default" : "outline"}
              onClick={handleShowBulkPages}
              className="gap-1.5"
            >
              <Layers className="h-4 w-4" />
              All static pages × roles
            </Button>
          </div>

          {bulkPagesView ? (
            <div className="lg:flex-1 lg:min-h-0">
              <StaticPagesRolesMatrix />
            </div>
          ) : routeSelection ? (
            <RoutePermissionMatrix path={routeSelection} />
          ) : formSelection ? (
            <>
              <FormsPermissionMatrix
                modules={modules}
                selectedForm={formSelection.formId}
                unsavedChangesRef={unsavedChangesRef}
              />
              <SectionsPermissionMatrix
                selectedFormId={formSelection.formId}
              />
              <FieldsPermissionMatrix
                selectedFormId={formSelection.formId}
              />
            </>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Globe className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">
                  Pick a form or system page from the sidebar
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
