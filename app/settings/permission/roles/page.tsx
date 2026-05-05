"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { FormsSidebar } from "@/components/admin/forms-sidebar"
import { FormsPermissionMatrix } from "@/components/admin/forms-permission-matrix"
import { SectionsPermissionMatrix } from "@/components/admin/sections-permission-matrix"
import { FieldsPermissionMatrix } from "@/components/admin/fields-permission-matrix"
import { RoutePermissionMatrix } from "@/components/admin/route-permission-matrix"
import { useModules } from "@/hooks/use-modules"
import type { FormSelection } from "@/types/permissions"
import { GripVertical, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 520
const SIDEBAR_DEFAULT = 280
const SIDEBAR_STORAGE_KEY = "roles-permissions:sidebar-width"

export default function RolesPermissionsPage() {
  const [formSelection, setFormSelection] = useState<FormSelection | null>(null)
  // Static-page selection runs in parallel with form selection. Picking a
  // static page clears the form selection (so the right side renders the
  // route matrix), and vice versa.
  const [routeSelection, setRouteSelection] = useState<string | null>(null)
  const { modules, loading, error } = useModules()

  // The matrix component keeps this ref in sync with its unsaved-changes state.
  // We read it on form switch to warn before discarding edits.
  const unsavedChangesRef = useRef(false)

  const guardSwitch = useCallback(() => {
    if (
      unsavedChangesRef.current &&
      !window.confirm(
        "You have unsaved permission changes. Switch and discard them?",
      )
    ) {
      return false
    }
    return true
  }, [])

  const handleFormSelect = useCallback(
    (formId: string, moduleId: string, submoduleId?: string) => {
      if (!guardSwitch()) return
      setRouteSelection(null)
      setFormSelection({ formId, moduleId, submoduleId: submoduleId ?? null })
    },
    [guardSwitch],
  )

  const handleRouteSelect = useCallback(
    (path: string) => {
      if (!guardSwitch()) return
      setFormSelection(null)
      setRouteSelection(path)
    },
    [guardSwitch],
  )

  // ─── Resizable sidebar (lg+ only) ─────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT)
  const [isResizing, setIsResizing] = useState(false)

  // Restore persisted width on mount
  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (saved) {
      const n = Number(saved)
      if (Number.isFinite(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) {
        setSidebarWidth(n)
      }
    }
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current || !containerRef.current) return
      e.preventDefault()
      const rect = containerRef.current.getBoundingClientRect()
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX - rect.left))
      setSidebarWidth(next)
    }
    const onUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      setIsResizing(false)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidthRef.current))
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  // Mirror current width into a ref so the mouseup handler can read the latest,
  // and push the value to a CSS custom property on the layout container so
  // Tailwind's arbitrary value (`lg:w-[var(--sidebar-w)]`) resolves it without
  // needing a React `style` prop.
  const sidebarWidthRef = useRef(sidebarWidth)
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
    if (containerRef.current) {
      containerRef.current.style.setProperty("--sidebar-w", `${sidebarWidth}px`)
    }
  }, [sidebarWidth])

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    setIsResizing(true)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  const resetWidth = () => {
    setSidebarWidth(SIDEBAR_DEFAULT)
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(SIDEBAR_DEFAULT))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="container mx-auto space-y-6">
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      <div
        ref={containerRef}
        className="flex flex-col items-stretch gap-6 lg:flex-row lg:gap-0"
      >
        {/* Sidebar */}
        <div className="w-full lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-[var(--sidebar-w,280px)] lg:shrink-0 lg:self-start">
          <FormsSidebar
            modules={modules}
            loading={loading}
            onFormSelect={handleFormSelect}
            selectedForm={formSelection?.formId ?? null}
            selectedRoute={routeSelection}
            onRouteSelect={handleRouteSelect}
          />
        </div>

        {/* Resize handle (desktop only) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          tabIndex={0}
          onMouseDown={startResize}
          onDoubleClick={resetWidth}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              setSidebarWidth((w) => Math.max(SIDEBAR_MIN, w - 16))
            } else if (e.key === "ArrowRight") {
              setSidebarWidth((w) => Math.min(SIDEBAR_MAX, w + 16))
            } else if (e.key === "Home") {
              setSidebarWidth(SIDEBAR_MIN)
            } else if (e.key === "End") {
              setSidebarWidth(SIDEBAR_MAX)
            } else if (e.key === "Enter" || e.key === " ") {
              resetWidth()
            }
          }}
          className={cn(
            "group relative hidden cursor-col-resize self-stretch lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)] lg:w-1.5 lg:items-center lg:justify-center lg:mx-1.5",
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

        {/* Content — switches between the form-level matrices and the
            route-level matrix based on what's selected in the sidebar.
            One of `formSelection` or `routeSelection` is set at a time. */}
        <div className="min-w-0 flex-1 space-y-6 lg:pl-3">
          {routeSelection ? (
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
              <CardContent className="py-16 text-center text-muted-foreground">
                <Globe className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">Pick a form or system page</p>
                <p className="text-xs mt-1">
                  Use the sidebar to choose which resource you want to permission. Static
                  pages (like leaves, payroll, attendance) appear under <strong>System Pages</strong>.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
