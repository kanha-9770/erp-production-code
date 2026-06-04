"use client";

/**
 * RoleHierarchy — the reusable Role Hierarchy canvas chart (the one previously
 * locked inside RoleManagementSheet), now embeddable anywhere inline.
 *
 * Renders the role tree (RoleChartNode) on a pan/zoom canvas with device
 * preview + fullscreen, a "New Role" button, and click-to-edit / hover add /
 * delete via the role context. Self-contained: brings its own RoleProvider and
 * the RoleFormModal edit dialog.
 *
 * Drop <RoleHierarchy /> into settings, departments, a dashboard, etc.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useRoles, RoleProvider } from "@/context/role-context";
import { useCanvasTransform } from "@/hooks/use-canvas-transform";
import { RoleChartNode } from "./role-tree-node";
import { RoleFormModal } from "./role-form-modal";
import { RoleTable } from "./role-table";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Plus,
  ZoomIn,
  ZoomOut,
  Target,
  Smartphone,
  Tablet,
  Monitor,
  Maximize2,
  Minimize2,
  Move,
  Network,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/role";

type HierarchyView = "tree" | "tabular";

type ViewMode = "mobile" | "tablet" | "desktop";

const VIEW_WIDTHS: Record<ViewMode, string> = {
  mobile: "420px",
  tablet: "780px",
  desktop: "100%",
};

interface RoleHierarchyProps {
  title?: string;
  addLabel?: string;
}

export function RoleHierarchy({
  title = "Role Hierarchy",
  addLabel = "New Role",
}: RoleHierarchyProps) {
  return (
    <RoleProvider>
      <RoleHierarchyInner title={title} addLabel={addLabel} />
      <RoleFormModal />
    </RoleProvider>
  );
}

function RoleHierarchyInner({ title, addLabel }: Required<RoleHierarchyProps>) {
  const { dispatch } = useRoles();
  const [view, setView] = useState<HierarchyView>("tree");

  const createRoot = () =>
    dispatch({
      type: "SELECT_ROLE",
      payload: {
        role: {
          id: "new",
          name: "",
          description: "",
          shareDataWithPeers: false,
          isAdmin: false,
          level: 0,
          children: [],
          parentId: undefined,
        } as unknown as Role,
      },
    });

  const switcher = (
    <div className="inline-flex shrink-0 rounded-lg border bg-background p-0.5">
      <ViewButton
        active={view === "tree"}
        onClick={() => setView("tree")}
        icon={<Network className="h-3.5 w-3.5" />}
        label="Tree"
      />
      <ViewButton
        active={view === "tabular"}
        onClick={() => setView("tabular")}
        icon={<Table2 className="h-3.5 w-3.5" />}
        label="Tabular"
      />
    </div>
  );

  if (view === "tree") {
    return <RoleTreeCanvas title={title} addLabel={addLabel} switcher={switcher} />;
  }

  // Tabular view
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-4 py-2.5 border-b bg-muted/20">
        <span className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-600" />
          <span className="text-sm sm:text-base font-bold text-foreground">
            {title}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 sm:h-9 px-3 sm:px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-sm"
            onClick={createRoot}
          >
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{addLabel}</span>
          </Button>
          {switcher}
        </div>
      </div>
      <RoleTable />
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function RoleTreeCanvas({
  title,
  addLabel,
  switcher,
}: Required<RoleHierarchyProps> & { switcher?: React.ReactNode }) {
  const { state, dispatch } = useRoles();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");
  const [showPanHint, setShowPanHint] = useState(true);
  const stageRef = React.useRef<HTMLDivElement>(null);

  const {
    transform,
    setTransform,
    isPanning,
    containerRef,
    handleMouseDown,
    attachWheelListener,
    zoomIn,
    zoomOut,
  } = useCanvasTransform({ initialScale: 0.8, maxScale: 2.5 });

  // Center the hierarchy: measure the stage's unscaled width (padding is
  // symmetric, so its center is the tree's center) and translate accordingly.
  const centerStage = useCallback(
    (scaleOverride?: number) => {
      const container = containerRef.current;
      if (!container) return;
      const cw = container.clientWidth;
      const scale = scaleOverride ?? (window.innerWidth < 640 ? 0.55 : 0.75);
      if (viewMode !== "desktop") {
        setTransform({ x: 0, y: 48, scale });
        return;
      }
      const stageW = stageRef.current?.scrollWidth ?? 0;
      setTransform({
        x: Math.round(cw / 2 - (stageW / 2) * scale),
        y: 48,
        scale,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewMode],
  );

  useEffect(() => {
    const t = setTimeout(() => centerStage(), 180);
    const onResize = () => centerStage();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [centerStage, viewMode, isFullscreen, state.roles, state.expandedNodes]);

  useEffect(() => attachWheelListener(), [attachWheelListener]);

  useEffect(() => {
    if (isPanning) setShowPanHint(false);
  }, [isPanning]);

  const isMobile = viewMode === "mobile";
  const isTablet = viewMode === "tablet";

  const createRoot = () =>
    dispatch({
      type: "SELECT_ROLE",
      payload: {
        role: {
          id: "new",
          name: "",
          description: "",
          shareDataWithPeers: false,
          isAdmin: false,
          level: 0,
          children: [],
          parentId: undefined,
        } as unknown as Role,
      },
    });

  return (
    <div
      className={cn(
        "flex flex-col w-full transition-all duration-500 ease-in-out",
        isFullscreen
          ? "fixed inset-0 z-[100] bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm p-3 sm:p-5 md:p-6"
          : "relative h-[78vh] sm:h-[82vh] md:h-[85vh] lg:h-[88vh]",
      )}
    >
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 px-3 sm:px-4 py-2.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10 mb-3 sm:mb-4">
        {/* Left: title + New Role */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              {title}
            </span>
          </span>
          <Button
            size="sm"
            className="h-8 sm:h-9 px-3 sm:px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-sm"
            onClick={createRoot}
          >
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{addLabel}</span>
          </Button>
        </div>

        {/* Right: view switch / zoom / device / fullscreen */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {switcher}
          <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={zoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-10 text-center text-xs font-bold text-slate-700 dark:text-slate-300">
              {Math.round(transform.scale * 100)}%
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={zoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 hidden sm:flex"
              onClick={() => centerStage()}
              title="Center view"
            >
              <Target className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex bg-slate-100/80 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {(["mobile", "tablet", "desktop"] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "ghost"}
                size="icon"
                className={cn(
                  "h-8 w-8 sm:h-9 sm:w-9",
                  viewMode === mode && "bg-white dark:bg-slate-700 shadow-sm",
                )}
                onClick={() => setViewMode(mode)}
                title={`View as ${mode}`}
              >
                {mode === "mobile" && <Smartphone className="h-4 w-4" />}
                {mode === "tablet" && <Tablet className="h-4 w-4" />}
                {mode === "desktop" && <Monitor className="h-4 w-4" />}
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown as unknown as React.TouchEventHandler<HTMLDivElement>}
        className={cn(
          "flex-1 relative overflow-hidden bg-slate-50/70 dark:bg-slate-950/40 rounded-xl sm:rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-inner select-none",
          isPanning ? "cursor-grabbing" : "cursor-grab",
          "pt-14 sm:pt-16",
        )}
        style={{
          backgroundImage: `radial-gradient(#cbd5e1 0.8px, transparent 0.8px)`,
          backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
          backgroundPosition: `${transform.x}px ${transform.y}px`,
        }}
      >
        {showPanHint && !isFullscreen && state.roles.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
            <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm px-4 py-2.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 animate-pulse">
              <Move className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Drag to pan • Pinch / wheel to zoom
              </span>
            </div>
          </div>
        )}

        {state.roles.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-8 sm:p-10 text-center max-w-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-purple-100 mx-auto mb-4">
                <Shield className="h-7 w-7 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                No roles yet
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Create your first role to start building the hierarchy.
              </p>
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white px-6"
                onClick={createRoot}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create First Role
              </Button>
            </div>
          </div>
        ) : (
          <div
            ref={stageRef}
            className={cn(
              "absolute origin-top-left will-change-transform",
              viewMode !== "desktop" &&
                cn(
                  "border-4 sm:border-8 border-slate-800/90 dark:border-slate-300/80 rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-950 shadow-2xl overflow-hidden",
                  isMobile && "border-opacity-80 rounded-xl",
                  isTablet && "border-opacity-85 rounded-2xl",
                ),
            )}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              width: viewMode === "desktop" ? "auto" : VIEW_WIDTHS[viewMode],
              left: viewMode === "desktop" ? 0 : "50%",
              transformOrigin: viewMode === "desktop" ? "top left" : "top center",
              transition: isPanning ? "none" : "transform 0.12s ease-out",
            }}
          >
            <div
              className={cn(
                "min-w-max flex justify-center",
                isMobile
                  ? "p-12 sm:p-16"
                  : isTablet
                    ? "p-16 sm:p-24"
                    : "p-20 sm:p-32 md:p-40 lg:p-48",
              )}
            >
              <div className="flex flex-col sm:flex-row gap-12 sm:gap-20 md:gap-28 lg:gap-36">
                {state.roles.map((role, idx) => (
                  <RoleChartNode
                    key={role.id}
                    role={role}
                    isRoot
                    isFirst={idx === 0}
                    isLast={idx === state.roles.length - 1}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
