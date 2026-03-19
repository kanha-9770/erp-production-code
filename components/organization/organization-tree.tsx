// "use client"

// import React, { useState, useEffect } from "react"
// import { DndContext, closestCenter } from "@dnd-kit/core"
// import { useRoles } from "@/context/role-context"
// import { useCanvasTransform } from "@/hooks/use-canvas-transform"
// import { ChartNode } from "./chart-node"
// import { StatisticsPopup } from "./statistics-popup"
// import { Button } from "@/components/ui/button"
// import {
//   Maximize2,
//   Minimize2,
//   ZoomIn,
//   ZoomOut,
//   Smartphone,
//   Tablet,
//   Monitor,
//   HelpCircle,
//   Target,
// } from "lucide-react"
// import { cn } from "@/lib/utils"

// type ViewMode = "mobile" | "tablet" | "desktop"

// const VIEW_WIDTHS: Record<ViewMode, string> = {
//   mobile: "380px",
//   tablet: "720px",
//   desktop: "100%",
// }

// export function OrganizationTree() {
//   const { state, dispatch } = useRoles()
//   const [isFullscreen, setIsFullscreen] = useState(false)
//   const [viewMode, setViewMode] = useState<ViewMode>("desktop")

//   const {
//     transform,
//     setTransform,
//     isPanning,
//     containerRef,
//     centerView,
//     handleMouseDown,
//     attachWheelListener,
//     zoomIn,
//     zoomOut,
//   } = useCanvasTransform({ initialScale: 0.7 })

//   // Center on mount + window resize
//   useEffect(() => {
//     centerView(200, 80)
//     const onResize = () => centerView(200, 80)
//     window.addEventListener("resize", onResize)
//     return () => window.removeEventListener("resize", onResize)
//   }, [centerView])

//   // Attach wheel listener
//   useEffect(() => {
//     return attachWheelListener()
//   }, [attachWheelListener])

//   return (
//     <div
//       className={cn(
//         "flex flex-col gap-3 sm:gap-4 w-full transition-all duration-500",
//         isFullscreen
//           ? "fixed inset-0 z-[100] bg-slate-50 p-4 sm:p-6 h-screen"
//           : "h-[80vh] sm:h-[85vh] relative"
//       )}
//     >
//       {/* Control Bar */}
//       <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-2 bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl sm:rounded-2xl shadow-xl z-50">
//         <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
//           <Button
//             variant="outline"
//             size="sm"
//             onClick={() => setIsFullscreen(!isFullscreen)}
//             className="rounded-xl h-8 sm:h-9 font-medium bg-white text-xs sm:text-sm px-3 sm:px-4"
//           >
//             {isFullscreen ? (
//               <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
//             ) : (
//               <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
//             )}
//             {isFullscreen ? "Exit" : "Full"}
//           </Button>

//           <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
//             <Button
//               variant="ghost"
//               size="icon"
//               className="h-7 w-7 sm:h-8 sm:w-8"
//               onClick={zoomOut}
//             >
//               <ZoomOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
//             </Button>
//             <span className="text-[10px] sm:text-[11px] font-black w-10 sm:w-14 text-center select-none flex items-center justify-center">
//               {Math.round(transform.scale * 100)}%
//             </span>
//             <Button
//               variant="ghost"
//               size="icon"
//               className="h-7 w-7 sm:h-8 sm:w-8"
//               onClick={zoomIn}
//             >
//               <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
//             </Button>
//             <div className="w-px h-4 bg-slate-300 mx-1 hidden sm:block" />
//             <Button
//               variant="ghost"
//               size="icon"
//               className="h-7 w-7 sm:h-8 sm:w-8"
//               onClick={() => centerView(200, 80)}
//               title="Center Chart"
//             >
//               <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
//             </Button>
//           </div>
//         </div>

//         <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
//           <div className="hidden md:flex bg-slate-100 p-1 rounded-xl border border-slate-200">
//             <Button
//               variant="ghost"
//               size="sm"
//               className="h-7 sm:h-8 text-[10px] sm:text-xs font-black px-2 sm:px-3"
//               onClick={() => dispatch({ type: "EXPAND_ALL_ORG" })}
//             >
//               EXPAND ALL
//             </Button>
//             <Button
//               variant="ghost"
//               size="sm"
//               className="h-7 sm:h-8 text-[10px] sm:text-xs font-black px-2 sm:px-3"
//               onClick={() => dispatch({ type: "COLLAPSE_ALL_ORG" })}
//             >
//               COLLAPSE ALL
//             </Button>
//           </div>

//           <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
//             {(["mobile", "tablet", "desktop"] as ViewMode[]).map((mode) => (
//               <Button
//                 key={mode}
//                 variant={viewMode === mode ? "default" : "ghost"}
//                 size="icon"
//                 className="h-7 w-7 sm:h-8 sm:w-8"
//                 onClick={() => setViewMode(mode)}
//               >
//                 {mode === "mobile" && <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
//                 {mode === "tablet" && <Tablet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
//                 {mode === "desktop" && <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
//               </Button>
//             ))}
//           </div>

//           <Button
//             variant="ghost"
//             size="icon"
//             className="h-8 w-8 sm:h-9 sm:w-9 text-indigo-600 rounded-xl hover:bg-indigo-50"
//             onClick={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
//           >
//             <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5" />
//           </Button>
//         </div>
//       </div>

//       {/* Infinite Canvas */}
//       <div
//         ref={containerRef}
//         onMouseDown={handleMouseDown}
//         className={cn(
//           "flex-1 relative overflow-hidden bg-slate-50 rounded-2xl sm:rounded-[2.5rem] border-2 border-slate-200 shadow-inner select-none transition-all",
//           isPanning ? "cursor-grabbing" : "cursor-grab"
//         )}
//         style={{
//           backgroundImage: `radial-gradient(#cbd5e1 0.8px, transparent 0.8px)`,
//           backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
//           backgroundPosition: `${transform.x}px ${transform.y}px`,
//         }}
//       >
//         <div
//           className={cn(
//             "absolute origin-top-left will-change-transform",
//             viewMode !== "desktop" &&
//               "border-[8px] sm:border-[12px] border-slate-900 rounded-2xl sm:rounded-[3rem] bg-white shadow-2xl overflow-hidden mx-auto"
//           )}
//           style={{
//             transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
//             width: viewMode === "desktop" ? "auto" : VIEW_WIDTHS[viewMode],
//             left: viewMode === "desktop" ? 0 : "50%",
//             transformOrigin: viewMode === "desktop" ? "top left" : "top center",
//             transition: isPanning ? "none" : "transform 0.1s ease-out",
//           }}
//         >
//           <div className="p-20 sm:p-32 md:p-40 min-w-max flex justify-center">
//             <DndContext collisionDetection={closestCenter}>
//               <div className="flex flex-col sm:flex-row gap-16 sm:gap-32">
//                 {(state.organizationUnits || []).map((unit) => (
//                   <ChartNode key={unit.id} unit={unit} isRoot />
//                 ))}
//               </div>
//             </DndContext>
//           </div>
//         </div>
//       </div>

//       <StatisticsPopup
//         isOpen={state.isOrgStatsPopupOpen}
//         onClose={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
//         type="organization"
//         data={state.organizationUnits}
//         expandedCount={state.expandedOrgNodes?.size || 0}
//       />
//     </div>
//   )
// }


// "use client"

// import React, { useState, useEffect } from "react"
// import { DndContext, closestCenter } from "@dnd-kit/core"
// import { useRoles } from "@/context/role-context"
// import { useCanvasTransform } from "@/hooks/use-canvas-transform"
// import { ChartNode } from "./chart-node"
// import { StatisticsPopup } from "./statistics-popup"
// import { Button } from "@/components/ui/button"
// import {
//   Maximize2,
//   Minimize2,
//   ZoomIn,
//   ZoomOut,
//   Smartphone,
//   Tablet,
//   Monitor,
//   HelpCircle,
//   Target,
//   Move,
// } from "lucide-react"
// import { cn } from "@/lib/utils"

// type ViewMode = "mobile" | "tablet" | "desktop"

// const VIEW_WIDTHS: Record<ViewMode, string> = {
//   mobile: "360px",    // slightly smaller than before — better for real phones
//   tablet: "680px",
//   desktop: "100%",
// }

// const VIEW_LABELS: Record<ViewMode, string> = {
//   mobile: "Mobile",
//   tablet: "Tablet",
//   desktop: "Desktop",
// }

// export function OrganizationTree() {
//   const { state, dispatch } = useRoles()
//   const [isFullscreen, setIsFullscreen] = useState(false)
//   const [viewMode, setViewMode] = useState<ViewMode>("desktop")
//   const [showPanHint, setShowPanHint] = useState(true)

//   const {
//     transform,
//     setTransform,
//     isPanning,
//     containerRef,
//     centerView,
//     handleMouseDown,
//     attachWheelListener,
//     zoomIn,
//     zoomOut,
//   } = useCanvasTransform({ initialScale: 0.8 })

//   // Auto-center on mount + resize + view mode change
//   useEffect(() => {
//     const timeout = setTimeout(() => {
//       centerView(160, 60) // slightly tighter centering for mobile
//     }, 150)

//     return () => clearTimeout(timeout)
//   }, [centerView, viewMode, isFullscreen])

//   useEffect(() => {
//     return attachWheelListener()
//   }, [attachWheelListener])

//   // Hide pan hint after first interaction
//   useEffect(() => {
//     if (isPanning) setShowPanHint(false)
//   }, [isPanning])

//   const isMobileView = viewMode === "mobile"
//   const isTabletView = viewMode === "tablet"

//   return (
//     <div
//       className={cn(
//         "flex flex-col w-full transition-all duration-500 ease-in-out",
//         isFullscreen
//           ? "fixed inset-0 z-[999] bg-slate-50/95 backdrop-blur-sm p-3 sm:p-5 md:p-6"
//           : "relative h-[78vh] sm:h-[82vh] md:h-[85vh] lg:h-[88vh]"
//       )}
//     >
//       {/* Control Bar — more compact on mobile */}
//       <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 px-3 sm:px-4 py-2.5 bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl shadow-lg z-50 mb-3 sm:mb-4">
//         {/* Left side controls */}
//         <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
//           <Button
//             variant="outline"
//             size="sm"
//             onClick={() => setIsFullscreen(!isFullscreen)}
//             className="h-8 sm:h-9 rounded-lg sm:rounded-xl px-2.5 sm:px-4 text-xs sm:text-sm font-medium"
//           >
//             {isFullscreen ? (
//               <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
//             ) : (
//               <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
//             )}
//             {isFullscreen ? "Exit" : "Full screen"}
//           </Button>

//           {/* Zoom controls */}
//           <div className="flex items-center bg-slate-100/80 rounded-lg border border-slate-200 p-0.5">
//             <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={zoomOut}>
//               <ZoomOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
//             </Button>

//             <span className="min-w-[42px] sm:min-w-[52px] text-center text-[10px] sm:text-xs font-bold text-slate-700">
//               {Math.round(transform.scale * 100)}%
//             </span>

//             <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={zoomIn}>
//               <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
//             </Button>

//             <Button
//               variant="ghost"
//               size="icon"
//               className="h-7 w-7 sm:h-8 sm:w-8 hidden sm:flex"
//               onClick={() => centerView(160, 60)}
//               title="Center view"
//             >
//               <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
//             </Button>
//           </div>
//         </div>

//         {/* Right side controls */}
//         <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
//           {/* Device preview selector */}
//           <div className="flex bg-slate-100/80 rounded-lg border border-slate-200 p-0.5">
//             {(["mobile", "tablet", "desktop"] as ViewMode[]).map((mode) => (
//               <Button
//                 key={mode}
//                 variant={viewMode === mode ? "default" : "ghost"}
//                 size="icon"
//                 className={cn(
//                   "h-7 w-7 sm:h-8 sm:w-8",
//                   viewMode === mode && "bg-white shadow-sm"
//                 )}
//                 onClick={() => setViewMode(mode)}
//                 title={VIEW_LABELS[mode]}
//               >
//                 {mode === "mobile" && <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
//                 {mode === "tablet" && <Tablet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
//                 {mode === "desktop" && <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
//               </Button>
//             ))}
//           </div>

//           {/* Stats / help toggle */}
//           <Button
//             variant="ghost"
//             size="icon"
//             className="h-8 w-8 sm:h-9 sm:w-9 text-indigo-600 hover:bg-indigo-50 rounded-lg sm:rounded-xl"
//             onClick={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
//           >
//             <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5" />
//           </Button>
//         </div>
//       </div>

//       {/* Canvas Area */}
//       <div
//         ref={containerRef}
//         onMouseDown={handleMouseDown}
//         onTouchStart={handleMouseDown} // better touch support
//         className={cn(
//           "flex-1 relative overflow-hidden bg-slate-50/70 rounded-xl sm:rounded-2xl md:rounded-3xl border border-slate-200 shadow-inner select-none",
//           isPanning ? "cursor-grabbing" : "cursor-grab"
//         )}
//         style={{
//           backgroundImage: `radial-gradient(#cbd5e1 0.8px, transparent 0.8px)`,
//           backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
//           backgroundPosition: `${transform.x}px ${transform.y}px`,
//         }}
//       >
//         {/* Pan hint (shows only once) */}
//         {showPanHint && !isFullscreen && (
//           <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
//             <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2.5 rounded-full shadow-lg border border-slate-200 animate-pulse">
//               <Move className="h-4 w-4 text-slate-600" />
//               <span className="text-sm font-medium text-slate-700">Drag to pan • Pinch / wheel to zoom</span>
//             </div>
//           </div>
//         )}

//         <div
//           className={cn(
//             "absolute origin-top-left will-change-transform",
//             viewMode !== "desktop" &&
//               cn(
//                 "border-4 sm:border-8 border-slate-800/90 rounded-2xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden mx-auto",
//                 isMobileView && "border-opacity-80 rounded-xl",
//                 isTabletView && "border-opacity-85 rounded-2xl"
//               )
//           )}
//           style={{
//             transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
//             width: viewMode === "desktop" ? "auto" : VIEW_WIDTHS[viewMode],
//             left: viewMode === "desktop" ? 0 : "50%",
//             transformOrigin: viewMode === "desktop" ? "top left" : "top center",
//             transition: isPanning ? "none" : "transform 0.12s ease-out",
//           }}
//         >
//           {/* Extra padding depending on device preview */}
//           <div
//             className={cn(
//               "min-w-max flex justify-center",
//               isMobileView ? "p-12 sm:p-16" : isTabletView ? "p-16 sm:p-24" : "p-20 sm:p-32 md:p-40 lg:p-48"
//             )}
//           >
//             <DndContext collisionDetection={closestCenter}>
//               <div className="flex flex-col sm:flex-row gap-12 sm:gap-20 md:gap-28 lg:gap-36">
//                 {(state.organizationUnits || []).map((unit) => (
//                   <ChartNode key={unit.id} unit={unit} isRoot />
//                 ))}
//               </div>
//             </DndContext>
//           </div>
//         </div>
//       </div>

//       <StatisticsPopup
//         isOpen={state.isOrgStatsPopupOpen}
//         onClose={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
//         type="organization"
//         data={state.organizationUnits}
//         expandedCount={state.expandedOrgNodes?.size || 0}
//       />
//     </div>
//   )
// }

"use client"

import React, { useState, useEffect } from "react"
import { DndContext, closestCenter } from "@dnd-kit/core"
import { useRoles } from "@/context/role-context"
import { useCanvasTransform } from "@/hooks/use-canvas-transform"
import { ChartNode } from "./chart-node"
import { StatisticsPopup } from "./statistics-popup"
import { Button } from "@/components/ui/button"
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Smartphone,
  Tablet,
  Monitor,
  HelpCircle,
  Target,
  Move,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ViewMode = "mobile" | "tablet" | "desktop"

const VIEW_WIDTHS: Record<ViewMode, string> = {
  mobile: "360px",    // slightly smaller than before — better for real phones
  tablet: "680px",
  desktop: "100%",
}

const VIEW_LABELS: Record<ViewMode, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
}

export function OrganizationTree() {
  const { state, dispatch } = useRoles()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("desktop")
  const [showPanHint, setShowPanHint] = useState(true)

  const {
    transform,
    setTransform,
    isPanning,
    containerRef,
    centerView,
    handleMouseDown,
    attachWheelListener,
    zoomIn,
    zoomOut,
  } = useCanvasTransform({ initialScale: 0.8 })

  // Auto-center on mount + resize + view mode change
  useEffect(() => {
    const timeout = setTimeout(() => {
      centerView(160, 60) // slightly tighter centering for mobile
    }, 150)

    return () => clearTimeout(timeout)
  }, [centerView, viewMode, isFullscreen])

  useEffect(() => {
    return attachWheelListener()
  }, [attachWheelListener])

  // Hide pan hint after first interaction
  useEffect(() => {
    if (isPanning) setShowPanHint(false)
  }, [isPanning])

  const isMobileView = viewMode === "mobile"
  const isTabletView = viewMode === "tablet"

  return (
    <div
      className={cn(
        "flex flex-col w-full transition-all duration-500 ease-in-out",
        isFullscreen
          ? "fixed inset-0 z-[100] bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm p-3 sm:p-5 md:p-6" // lowered from 999 → sidebar can cover if needed
          : "relative h-[78vh] sm:h-[82vh] md:h-[85vh] lg:h-[88vh]"
      )}
    >
      {/* Control Bar — more compact on mobile */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 px-3 sm:px-4 py-2.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10 mb-3 sm:mb-4"> {/* z-50 → z-10 */}
        {/* Left side controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-8 sm:h-9 rounded-lg sm:rounded-xl px-2.5 sm:px-4 text-xs sm:text-sm font-medium"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
            )}
            {isFullscreen ? "Exit" : "Full screen"}
          </Button>

          {/* Zoom controls */}
          <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={zoomOut}>
              <ZoomOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>

            <span className="min-w-[42px] sm:min-w-[52px] text-center text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300">
              {Math.round(transform.scale * 100)}%
            </span>

            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={zoomIn}>
              <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 hidden sm:flex"
              onClick={() => centerView(160, 60)}
              title="Center view"
            >
              <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Device preview selector */}
          <div className="flex bg-slate-100/80 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
            {(["mobile", "tablet", "desktop"] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "ghost"}
                size="icon"
                className={cn(
                  "h-7 w-7 sm:h-8 sm:w-8",
                  viewMode === mode && "bg-white dark:bg-slate-700 shadow-sm"
                )}
                onClick={() => setViewMode(mode)}
                title={VIEW_LABELS[mode]}
              >
                {mode === "mobile" && <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                {mode === "tablet" && <Tablet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                {mode === "desktop" && <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              </Button>
            ))}
          </div>

          {/* Stats / help toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg sm:rounded-xl"
            onClick={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
          >
            <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>
      </div>

      {/* Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown} // better touch support
        className={cn(
          "flex-1 relative overflow-hidden bg-slate-50/70 dark:bg-slate-950/40 rounded-xl sm:rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-inner select-none",
          isPanning ? "cursor-grabbing" : "cursor-grab",
          // Add top padding to account for toolbar height (prevents overlap on scroll)
          "pt-14 sm:pt-16"
        )}
        style={{
          backgroundImage: `radial-gradient(#cbd5e1 0.8px, transparent 0.8px)`,
          backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
          backgroundPosition: `${transform.x}px ${transform.y}px`,
        }}
      >
        {/* Pan hint (shows only once) */}
        {showPanHint && !isFullscreen && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
            <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm px-4 py-2.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 animate-pulse">
              <Move className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Drag to pan • Pinch / wheel to zoom</span>
            </div>
          </div>
        )}

        <div
          className={cn(
            "absolute origin-top-left will-change-transform",
            viewMode !== "desktop" &&
              cn(
                "border-4 sm:border-8 border-slate-800/90 dark:border-slate-300/80 rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-950 shadow-2xl overflow-hidden mx-auto",
                isMobileView && "border-opacity-80 rounded-xl",
                isTabletView && "border-opacity-85 rounded-2xl"
              )
          )}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            width: viewMode === "desktop" ? "auto" : VIEW_WIDTHS[viewMode],
            left: viewMode === "desktop" ? 0 : "50%",
            transformOrigin: viewMode === "desktop" ? "top left" : "top center",
            transition: isPanning ? "none" : "transform 0.12s ease-out",
          }}
        >
          {/* Extra padding depending on device preview */}
          <div
            className={cn(
              "min-w-max flex justify-center",
              isMobileView ? "p-12 sm:p-16" : isTabletView ? "p-16 sm:p-24" : "p-20 sm:p-32 md:p-40 lg:p-48"
            )}
          >
            <DndContext collisionDetection={closestCenter}>
              <div className="flex flex-col sm:flex-row gap-12 sm:gap-20 md:gap-28 lg:gap-36">
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
  )
}