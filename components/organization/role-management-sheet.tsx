// "use client"

// import React, { useState, useEffect } from "react"
// import { useRoles } from "@/context/role-context"
// import { useCanvasTransform } from "@/hooks/use-canvas-transform"
// import { Button } from "@/components/ui/button"
// import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
// import { Shield, ZoomIn, ZoomOut, Target, Smartphone, Tablet, Monitor, Maximize2, Minimize2 } from "lucide-react"
// import { cn } from "@/lib/utils"
// import { RoleChartNode } from "./role-tree-node"

// type ViewMode = "mobile" | "tablet" | "desktop"

// const VIEW_WIDTHS: Record<ViewMode, string> = {
//   mobile: "420px",
//   tablet: "780px",
//   desktop: "100%",
// }

// export function RoleManagementSheet() {
//   const { state, dispatch } = useRoles()
//   const [isFullscreen, setIsFullscreen] = useState(false)
//   const [viewMode, setViewMode] = useState<ViewMode>("desktop")

//   const {
//     transform,
//     isPanning,
//     containerRef,
//     centerView,
//     handleMouseDown,
//     attachWheelListener,
//     zoomIn,
//     zoomOut,
//   } = useCanvasTransform({ initialScale: 0.7, maxScale: 2.5 })

//   // Center after the sheet slide-in animation completes
//   useEffect(() => {
//     if (!state.isRoleSheetOpen) return
//     const timer = setTimeout(() => centerView(180, 80, 0.75), 350)
//     return () => clearTimeout(timer)
//   }, [state.isRoleSheetOpen, centerView])

//   // Attach wheel listener after the sheet is open and DOM is ready
//   useEffect(() => {
//     if (!state.isRoleSheetOpen) return
//     const timer = setTimeout(() => {
//       return attachWheelListener()
//     }, 400)
//     return () => clearTimeout(timer)
//   }, [state.isRoleSheetOpen, attachWheelListener])

//   return (
//     <Sheet
//       open={state.isRoleSheetOpen}
//       onOpenChange={() => dispatch({ type: "CLOSE_ROLE_SHEET" })}
//     >
//       <SheetContent
//         side="right"
//         className={cn(
//           "p-0 border-l border-slate-200 shadow-2xl overflow-hidden",
//           isFullscreen
//             ? "w-screen max-w-none"
//             : "w-full sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-[86vw] xl:max-w-[82vw] 2xl:max-w-[78vw] max-w-[1600px]"
//         )}
//       >
//         <div className="flex flex-col h-full bg-slate-50">
//           {/* Header */}
//           <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-white border-b shadow-sm flex-shrink-0">
//             <div className="flex items-center gap-3">
//               <Shield className="h-5 w-5 text-purple-600" />
//               <SheetTitle className="text-xl font-bold text-slate-900">Role Hierarchy</SheetTitle>
//             </div>

//             <div className="flex items-center gap-2 sm:gap-3">
//               {/* Zoom controls */}
//               <div className="hidden sm:flex items-center bg-slate-100 rounded-lg border border-slate-200 px-1">
//                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut}>
//                   <ZoomOut className="h-4 w-4" />
//                 </Button>
//                 <span className="text-xs font-bold w-12 text-center select-none">
//                   {Math.round(transform.scale * 100)}%
//                 </span>
//                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn}>
//                   <ZoomIn className="h-4 w-4" />
//                 </Button>
//                 <Button
//                   variant="ghost"
//                   size="icon"
//                   className="h-8 w-8"
//                   onClick={() => centerView(180, 80, 0.75)}
//                   title="Center"
//                 >
//                   <Target className="h-4 w-4" />
//                 </Button>
//               </div>

//               {/* View modes */}
//               <div className="flex bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
//                 {(["mobile", "tablet", "desktop"] as ViewMode[]).map((mode) => (
//                   <Button
//                     key={mode}
//                     variant={viewMode === mode ? "default" : "ghost"}
//                     size="icon"
//                     className="h-9 w-9"
//                     onClick={() => setViewMode(mode)}
//                   >
//                     {mode === "mobile" && <Smartphone className="h-4 w-4" />}
//                     {mode === "tablet" && <Tablet className="h-4 w-4" />}
//                     {mode === "desktop" && <Monitor className="h-4 w-4" />}
//                   </Button>
//                 ))}
//               </div>

//               <Button
//                 variant="outline"
//                 size="icon"
//                 className="h-9 w-9 rounded-lg"
//                 onClick={() => setIsFullscreen(!isFullscreen)}
//               >
//                 {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
//               </Button>
//             </div>
//           </div>

//           {/* Canvas */}
//           <div
//             ref={containerRef}
//             onMouseDown={handleMouseDown}
//             className={cn(
//               "flex-1 relative overflow-hidden bg-slate-50/70 select-none",
//               isPanning ? "cursor-grabbing" : "cursor-grab"
//             )}
//             style={{
//               backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
//               backgroundSize: `${22 * transform.scale}px ${22 * transform.scale}px`,
//               backgroundPosition: `${transform.x}px ${transform.y}px`,
//             }}
//           >
//             <div
//               style={{
//                 transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
//                 transformOrigin: "0 0",
//                 willChange: "transform",
//                 transition: isPanning ? "none" : "transform 0.12s ease-out",
//               }}
//               className={cn(
//                 "absolute inset-0 origin-top-left",
//                 viewMode !== "desktop" &&
//                   "border-[12px] border-slate-900 rounded-[3rem] bg-white shadow-2xl overflow-hidden mx-auto mt-8"
//               )}
//             >
//               <div className="p-40 min-w-max flex justify-center items-start">
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
//   )
// }


"use client"

import React, { useState, useEffect } from "react"
import { useRoles } from "@/context/role-context"
import { useCanvasTransform } from "@/hooks/use-canvas-transform"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import {
  Shield,
  ZoomIn,
  ZoomOut,
  Target,
  Smartphone,
  Tablet,
  Monitor,
  Maximize2,
  Minimize2,
  Move,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { RoleChartNode } from "./role-tree-node"

type ViewMode = "mobile" | "tablet" | "desktop"

const VIEW_WIDTHS: Record<ViewMode, string> = {
  mobile: "360px",    // realistic phone width
  tablet: "680px",
  desktop: "100%",
}

export function RoleManagementSheet() {
  const { state, dispatch } = useRoles()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("desktop")
  const [showPanHint, setShowPanHint] = useState(true)

  const {
    transform,
    isPanning,
    containerRef,
    centerView,
    handleMouseDown,
    attachWheelListener,
    zoomIn,
    zoomOut,
  } = useCanvasTransform({ initialScale: 0.75, maxScale: 2.8 })

  // Center after sheet opens + animation delay
  useEffect(() => {
    if (!state.isRoleSheetOpen) return

    const timer = setTimeout(() => {
      centerView(160, 70, 0.8)
    }, 380)

    return () => clearTimeout(timer)
  }, [state.isRoleSheetOpen, centerView])

  // Attach wheel listener
  useEffect(() => {
    if (!state.isRoleSheetOpen) return

    const timer = setTimeout(() => {
      return attachWheelListener()
    }, 450)

    return () => clearTimeout(timer)
  }, [state.isRoleSheetOpen, attachWheelListener])

  // Hide pan hint after first interaction
  useEffect(() => {
    if (isPanning) setShowPanHint(false)
  }, [isPanning])

  const isMobile = viewMode === "mobile"
  const isTablet = viewMode === "tablet"

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
            : "w-full sm:max-w-[92vw] md:max-w-[88vw] lg:max-w-[84vw] xl:max-w-[80vw] 2xl:max-w-[76vw] max-w-[1450px]"
        )}
      >
        <div className="flex flex-col h-full bg-slate-50/95">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b shadow-sm flex-shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
              <SheetTitle className="text-lg sm:text-xl font-bold text-slate-900">
                Role Hierarchy
              </SheetTitle>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5">
              {/* Create new root role */}
              <Button
                size="sm"
                className="h-8 sm:h-9 px-3 sm:px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-sm"
                onClick={() =>
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
                      },
                    },
                  })
                }
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">New Role</span>
              </Button>

              <div className="h-5 w-px bg-slate-200 mx-0.5 hidden sm:block" />

              {/* Zoom controls - compact on mobile */}
              <div className="flex items-center bg-slate-100/80 rounded-lg border border-slate-200 p-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 sm:h-9 sm:w-9"
                  onClick={zoomOut}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>

                <span className="min-w-10 text-center text-xs font-bold text-slate-700">
                  {Math.round(transform.scale * 100)}%
                </span>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 sm:h-9 sm:w-9"
                  onClick={zoomIn}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 sm:h-9 sm:w-9 hidden sm:flex"
                  onClick={() => centerView(160, 70, 0.8)}
                  title="Center view"
                >
                  <Target className="h-4 w-4" />
                </Button>
              </div>

              {/* Device preview selector */}
              <div className="flex bg-slate-100/80 rounded-lg border border-slate-200 overflow-hidden">
                {(["mobile", "tablet", "desktop"] as ViewMode[]).map((mode) => (
                  <Button
                    key={mode}
                    variant={viewMode === mode ? "default" : "ghost"}
                    size="icon"
                    className={cn(
                      "h-8 w-8 sm:h-9 sm:w-9",
                      viewMode === mode && "bg-white shadow-sm"
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

              {/* Fullscreen toggle */}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Canvas Area */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            className={cn(
              "flex-1 relative overflow-hidden bg-slate-50/70 select-none",
              isPanning ? "cursor-grabbing" : "cursor-grab"
            )}
            style={{
              backgroundImage: `radial-gradient(#cbd5e1 0.9px, transparent 0.9px)`,
              backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
              backgroundPosition: `${transform.x}px ${transform.y}px`,
            }}
          >
            {/* One-time pan/zoom hint */}
            {showPanHint && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <div className="flex items-center gap-2.5 bg-white/85 backdrop-blur-sm px-4 py-2.5 rounded-full shadow-lg border border-slate-200 animate-pulse">
                  <Move className="h-4 w-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">
                    Drag to pan • Pinch / wheel to zoom
                  </span>
                </div>
              </div>
            )}

            {state.roles.length === 0 ? (
              /* Empty state — no roles yet */
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 sm:p-10 text-center max-w-sm">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-purple-100 mx-auto mb-4">
                    <Shield className="h-7 w-7 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">No roles yet</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Create your first role to start building the organizational hierarchy.
                  </p>
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6"
                    onClick={() =>
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
                          },
                        },
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Role
                  </Button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transformOrigin: "0 0",
                  willChange: "transform",
                  transition: isPanning ? "none" : "transform 0.14s ease-out",
                }}
                className={cn(
                  "absolute inset-0 origin-top-left",
                  viewMode !== "desktop" &&
                    cn(
                      "border-4 sm:border-8 border-slate-800/90 rounded-2xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden mx-auto mt-6 sm:mt-8",
                      isMobile && "border-opacity-80 rounded-xl",
                      isTablet && "border-opacity-85 rounded-2xl"
                    )
                )}
              >
                {/* Responsive inner padding based on view mode */}
                <div
                  className={cn(
                    "min-w-max flex justify-center items-start",
                    isMobile ? "p-16 sm:p-20" : isTablet ? "p-24 sm:p-32" : "p-32 sm:p-40 md:p-48 lg:p-56"
                  )}
                >
                  <div className="flex gap-20 sm:gap-28 md:gap-36 lg:gap-48">
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
      </SheetContent>
    </Sheet>
  )
}