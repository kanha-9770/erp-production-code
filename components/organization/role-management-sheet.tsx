// "use client";

// import React, { useState, useRef, useEffect, useCallback } from "react";
// import { useRoles } from "@/context/role-context";
// import { Button } from "@/components/ui/button";
// import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
// import {
//   Plus,
//   Shield,
//   ZoomIn,
//   ZoomOut,
//   RotateCcw,
//   Smartphone,
//   Tablet,
//   Monitor,
//   Maximize2,
//   Minimize2,
//   Target,
// } from "lucide-react";
// import { cn } from "@/lib/utils";
// import { RoleChartNode } from "./role-tree-node";

// export function RoleManagementSheet() {
//   const { state, dispatch } = useRoles();
//   const [isFullscreen, setIsFullscreen] = useState(false);
//   const [viewMode, setViewMode] = useState<"mobile" | "tablet" | "desktop">(
//     "desktop"
//   );
//   const [transform, setTransform] = useState({ x: 50, y: 50, scale: 0.65 });
//   const [isPanning, setIsPanning] = useState(false);
//   const containerRef = useRef<HTMLDivElement>(null);

//   const handleWheel = useCallback((e: WheelEvent) => {
//     e.preventDefault();
//     const factor = Math.pow(1.1, -e.deltaY / 120);
//     setTransform((prev) => {
//       const newScale = Math.min(Math.max(prev.scale * factor, 0.15), 2);
//       const rect = containerRef.current?.getBoundingClientRect();
//       if (!rect) return prev;
//       const mouseX = e.clientX - rect.left;
//       const mouseY = e.clientY - rect.top;
//       return {
//         x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
//         y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
//         scale: newScale,
//       };
//     });
//   }, []);

//   useEffect(() => {
//     const el = containerRef.current;
//     if (state.isRoleSheetOpen && el) {
//       el.addEventListener("wheel", handleWheel, { passive: false });
//     }
//     return () => el?.removeEventListener("wheel", handleWheel);
//   }, [state.isRoleSheetOpen, handleWheel]);

//   // Panning
//   useEffect(() => {
//     const move = (e: MouseEvent) => {
//       if (isPanning)
//         setTransform((p) => ({
//           ...p,
//           x: p.x + e.movementX,
//           y: p.y + e.movementY,
//         }));
//     };
//     const up = () => setIsPanning(false);
//     window.addEventListener("mousemove", move);
//     window.addEventListener("mouseup", up);
//     return () => {
//       window.removeEventListener("mousemove", move);
//       window.removeEventListener("mouseup", up);
//     };
//   }, [isPanning]);

//   return (
//     <Sheet
//       open={state.isRoleSheetOpen}
//       onOpenChange={() => dispatch({ type: "CLOSE_ROLE_SHEET" })}
//     >
//       <SheetContent
//         className={cn(
//           "p-0 transition-all duration-500 max-w-full",
//           isFullscreen ? "w-screen" : "w-[95%] sm:max-w-[1100px]"
//         )}
//       >
//         <div className="flex flex-col h-full bg-slate-50">
//           <div className="p-4 bg-white border-b flex items-center justify-between">
//             <SheetTitle className="flex items-center gap-2">
//               <Shield className="h-5 w-5 text-purple-600" /> Role Hierarchy
//             </SheetTitle>
//             <div className="flex gap-2">
//               <Button
//                 variant="outline"
//                 size="sm"
//                 onClick={() => setIsFullscreen(!isFullscreen)}
//               >
//                 {isFullscreen ? <Minimize2 /> : <Maximize2 />}
//               </Button>
//               <Button
//                 onClick={() =>
//                   dispatch({
//                     type: "SELECT_ROLE",
//                     payload: {
//                       role: {
//                         id: "new",
//                         name: "",
//                         children: [],
//                         level: 0,
//                       } as any,
//                     },
//                   })
//                 }
//                 className="bg-purple-600"
//               >
//                 New Root
//               </Button>
//             </div>
//           </div>

//           <div
//             ref={containerRef}
//             onMouseDown={() => setIsPanning(true)}
//             className={cn(
//               "flex-1 relative overflow-hidden bg-slate-100/50",
//               isPanning ? "cursor-grabbing" : "cursor-grab"
//             )}
//             style={{
//               backgroundImage: `radial-gradient(#cbd5e1 0.8px, transparent 0.8px)`,
//               backgroundSize: `${20 * transform.scale}px ${
//                 20 * transform.scale
//               }px`,
//               backgroundPosition: `${transform.x}px ${transform.y}px`,
//             }}
//           >
//             <div
//               style={{
//                 transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
//                 transformOrigin: "0 0",
//               }}
//               className={cn(
//                 "absolute transition-all duration-100",
//                 viewMode !== "desktop" &&
//                   "border-[10px] border-slate-900 rounded-[3rem] bg-white shadow-2xl mt-10"
//               )}
//             >
//               <div className="p-40 min-w-max flex justify-center">
//                 <div className="flex gap-32">
//                   {state.roles.map((role, idx) => (
//                     <RoleChartNode
//                       key={role.id}
//                       role={role}
//                       isRoot
//                       isFirst={idx === 0}
//                       isLast={idx === state.roles.length - 1}
//                     />
//                   ))}
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>
//       </SheetContent>
//     </Sheet>
//   );
// }



"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRoles } from "@/context/role-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetClose } from "@/components/ui/sheet";
import {
  Plus,
  Shield,
  ZoomIn,
  ZoomOut,
  Target,
  Smartphone,
  Tablet,
  Monitor,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RoleChartNode } from "./role-tree-node";

export function RoleManagementSheet() {
  const { state, dispatch } = useRoles();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<"mobile" | "tablet" | "desktop">("desktop");

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.7 });
  const [isPanning, setIsPanning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Center on open
  const centerView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTransform({
      x: rect.width / 2 - 180,
      y: 80,
      scale: 0.75,
    });
  }, []);

  useEffect(() => {
    if (state.isRoleSheetOpen) {
      const timer = setTimeout(centerView, 350); // wait for sheet slide-in
      return () => clearTimeout(timer);
    }
  }, [state.isRoleSheetOpen, centerView]);

  // ────────────────────────────────────────────────
  // Mouse wheel zoom — identical to OrganizationTree
  // ────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    console.log("Wheel event captured on canvas", { deltaY: e.deltaY, clientX: e.clientX, clientY: e.clientY });

    e.preventDefault();
    e.stopPropagation(); // prevent bubbling to sheet or window

    const factor = Math.pow(1.1, -e.deltaY / 120);

    setTransform((prev) => {
      const newScale = Math.min(Math.max(prev.scale * factor, 0.15), 2.5);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return prev;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      return {
        x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
        y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
        scale: newScale,
      };
    });
  }, []);

  // Attach wheel listener with retry (sheet animation delay)
  useEffect(() => {
    if (!state.isRoleSheetOpen) return;

    let attached = false;

    const tryAttach = () => {
      const el = containerRef.current;
      if (!el || attached) return;

      console.log("Attaching wheel listener to canvas");
      el.addEventListener("wheel", handleWheel, { passive: false });
      attached = true;
    };

    tryAttach(); // first try
    const interval = setInterval(tryAttach, 200); // retry every 200ms until success

    return () => {
      clearInterval(interval);
      const el = containerRef.current;
      if (el) {
        console.log("Cleaning up wheel listener");
        el.removeEventListener("wheel", handleWheel);
      }
    };
  }, [state.isRoleSheetOpen, handleWheel]);

  // Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, select, [role='button']")) return;
    setIsPanning(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e: MouseEvent) => {
      setTransform((p) => ({
        ...p,
        x: p.x + e.movementX,
        y: p.y + e.movementY,
      }));
    };

    const onUp = () => setIsPanning(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isPanning]);

  const viewWidths = {
    mobile: "420px",
    tablet: "780px",
    desktop: "100%",
  };

  return (
    <Sheet
      open={state.isRoleSheetOpen}
      onOpenChange={() => dispatch({ type: "CLOSE_ROLE_SHEET" })}
    >
      <SheetContent
        side="right"
        className={cn(
          "p-0 border-l border-slate-200 shadow-2xl overflow-hidden",
          isFullscreen
            ? "w-screen max-w-none"
            : "w-full sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-[86vw] xl:max-w-[82vw] 2xl:max-w-[78vw] max-w-[1600px]"
        )}
      >
        <div className="flex flex-col h-full bg-slate-50">
          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-white border-b shadow-sm flex-shrink-0">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-purple-600" />
              <SheetTitle className="text-xl font-bold text-slate-900">
                Role Hierarchy
              </SheetTitle>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Zoom controls */}
              <div className="hidden sm:flex items-center bg-slate-100 rounded-lg border border-slate-200 px-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTransform(p => ({ ...p, scale: Math.max(p.scale - 0.1, 0.2) }))}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs font-bold w-12 text-center select-none">
                  {Math.round(transform.scale * 100)}%
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTransform(p => ({ ...p, scale: Math.min(p.scale + 0.1, 2.5) }))}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={centerView} title="Center">
                  <Target className="h-4 w-4" />
                </Button>
              </div>

              {/* View modes */}
              <div className="flex bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                <Button variant={viewMode === "mobile" ? "default" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("mobile")}>
                  <Smartphone className="h-4 w-4" />
                </Button>
                <Button variant={viewMode === "tablet" ? "default" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("tablet")}>
                  <Tablet className="h-4 w-4" />
                </Button>
                <Button variant={viewMode === "desktop" ? "default" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("desktop")}>
                  <Monitor className="h-4 w-4" />
                </Button>
              </div>

              <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>

            </div>
          </div>

          {/* Canvas */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onWheel={(e) => {
              // Force prevent inner scrolling when wheel over canvas
              e.stopPropagation();
            }}
            className={cn(
              "flex-1 relative overflow-hidden bg-slate-50/70 select-none",
              isPanning ? "cursor-grabbing" : "cursor-grab"
            )}
            style={{
              backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
              backgroundSize: `${22 * transform.scale}px ${22 * transform.scale}px`,
              backgroundPosition: `${transform.x}px ${transform.y}px`,
            }}
          >
            <div
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: "0 0",
                willChange: "transform",
                transition: isPanning ? "none" : "transform 0.12s ease-out",
              }}
              className={cn(
                "absolute inset-0 origin-top-left",
                viewMode !== "desktop" &&
                  "border-[12px] border-slate-900 rounded-[3rem] bg-white shadow-2xl overflow-hidden mx-auto mt-8"
              )}
            >
              <div className="p-40 min-w-max flex justify-center items-start">
                <div className="flex gap-32">
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
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}