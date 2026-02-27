"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { useRoles } from "@/context/role-context";
import { ChartNode } from "./chart-node";
import { Button } from "@/components/ui/button";
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Smartphone,
  Tablet,
  Monitor,
  MousePointer2,
  HelpCircle,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatisticsPopup } from "./statistics-popup";

export function OrganizationTree() {
  const { state, dispatch } = useRoles();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<"mobile" | "tablet" | "desktop">(
    "desktop"
  );

  // Transformation State: Starts centered
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.7 });
  const [isPanning, setIsPanning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // --- PERFECT CENTER FUNCTION ---
  const centerView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // Centers the chart based on container size
    setTransform({
      x: rect.width / 2 - 200, // Roughly center the first node
      y: 100,
      scale: 0.75,
    });
  }, []);

  // Center on initial load
  useEffect(() => {
    centerView();
  }, [centerView]);

  // --- MOUSE WHEEL ZOOM-TO-CURSOR ---
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.pow(1.1, -e.deltaY / 120); // Standardized speed

    setTransform((prev) => {
      const newScale = Math.min(Math.max(prev.scale * factor, 0.1), 3);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return prev;

      // Calculate relative mouse position
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      return {
        x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
        y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
        scale: newScale,
      };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => el?.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // --- PANNING LOGIC ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setIsPanning(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning) return;
      setTransform((prev) => ({
        ...prev,
        x: prev.x + e.movementX,
        y: prev.y + e.movementY,
      }));
    };
    const handleMouseUp = () => setIsPanning(false);

    if (isPanning) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPanning]);

  const viewWidths = { mobile: "400px", tablet: "768px", desktop: "100%" };

  return (
    <div
      className={cn(
        "flex flex-col gap-4 w-full transition-all duration-500",
        isFullscreen
          ? "fixed inset-0 z-[100] bg-slate-50 p-6 h-screen"
          : "h-[85vh] relative"
      )}
    >
      {/* Dynamic Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2 bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl z-50">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="rounded-xl h-9 font-bold bg-white"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 mr-2" />
            ) : (
              <Maximize2 className="h-4 w-4 mr-2" />
            )}
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                setTransform((p) => ({
                  ...p,
                  scale: Math.max(p.scale - 0.1, 0.2),
                }))
              }
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-[11px] font-black w-14 text-center select-none">
              {Math.round(transform.scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                setTransform((p) => ({
                  ...p,
                  scale: Math.min(p.scale + 0.1, 2),
                }))
              }
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="w-px h-4 bg-slate-300 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={centerView}
              title="Center Chart"
            >
              <Target className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] font-black"
              onClick={() => dispatch({ type: "EXPAND_ALL_ORG" })}
            >
              EXPAND ALL
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] font-black"
              onClick={() => dispatch({ type: "COLLAPSE_ALL_ORG" })}
            >
              COLLAPSE ALL
            </Button>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Button
              variant={viewMode === "mobile" ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("mobile")}
            >
              <Smartphone className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "tablet" ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("tablet")}
            >
              <Tablet className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "desktop" ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("desktop")}
            >
              <Monitor className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-indigo-600 rounded-xl hover:bg-indigo-50"
            onClick={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* INFINITE CANVAS AREA */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        className={cn(
          "flex-1 relative overflow-hidden bg-slate-50 rounded-[2.5rem] border-2 border-slate-200 shadow-inner select-none transition-all",
          isPanning ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{
          backgroundImage: `radial-gradient(#cbd5e1 0.8px, transparent 0.8px)`,
          backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
          backgroundPosition: `${transform.x}px ${transform.y}px`,
        }}
      >
        {/* Transform Layer */}
        <div
          className={cn(
            "absolute origin-top-left will-change-transform",
            viewMode !== "desktop" &&
              "border-[12px] border-slate-900 rounded-[3rem] bg-white shadow-2xl overflow-hidden"
          )}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            width: viewMode === "desktop" ? "auto" : viewWidths[viewMode],
            transition: isPanning ? "none" : "transform 0.1s ease-out",
          }}
        >
          <div className="p-40 min-w-max flex justify-center">
            <DndContext collisionDetection={closestCenter}>
              <div className="flex gap-32">
                {(state.organizationUnits || []).map((unit) => (
                  <ChartNode key={unit.id} unit={unit} isRoot />
                ))}
              </div>
            </DndContext>
          </div>
        </div>
      </div>
      <StatisticsPopup
        isOpen={state.isOrgStatsPopupOpen}
        onClose={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
        type="organization"
        data={state.organizationUnits}
        expandedCount={state.expandedOrgNodes?.size || 0}
      />
    </div>
  );
}
