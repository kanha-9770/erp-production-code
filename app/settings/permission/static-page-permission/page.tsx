"use client"

/**
 * /settings/permission/static-page-permission
 *
 * Mirror of /settings/permission/roles, but the resource being permissioned
 * is every entry in the static-page registry (lib/static-pages.ts) instead
 * of dynamic form modules.
 *
 * Two top-level tabs:
 *   • By Role         — pick a role on the left, see every static page on
 *                       the right with tri-state grant/deny/default cells.
 *                       Reuses ByRoleView so the role-list rail (with
 *                       searchable users + permission counts) is shared
 *                       across both permission pages.
 *
 *   • By Static Page  — sidebar of every static page; picking one opens
 *                       a per-page detail with two sub-tabs:
 *                         - Roles : the existing RoutePermissionMatrix
 *                         - Users : new PageUsersMatrix (per-user overrides
 *                                   for this path)
 *                       For power users: a "All pages × Roles" toggle at the
 *                       top swaps the detail for the existing bulk matrix.
 *
 * Static pages have no form/section/field hierarchy, so we omit those
 * matrices — the role page's structure is otherwise preserved.
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Anchor,
  Globe,
  GripVertical,
  Layers,
  Shield,
  Users as UsersIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ByRoleView } from "@/components/admin/permission-page/by-role-view"
import { StaticPagesSidebar } from "@/components/admin/static-page-permission/static-pages-sidebar"
import { RoleStaticPagesMatrix } from "@/components/admin/static-page-permission/role-static-pages-matrix"
import { PageUsersMatrix } from "@/components/admin/static-page-permission/page-users-matrix"
import { RoutePermissionMatrix } from "@/components/admin/route-permission-matrix"
import { StaticPagesRolesMatrix } from "@/components/admin/static-pages-roles-matrix"
import { findStaticPage } from "@/lib/static-pages"
import PageBackLink from "@/components/shared/page-back-link"

const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 520
const SIDEBAR_DEFAULT = 280
const SIDEBAR_STORAGE_KEY = "static-page-permission:sidebar-width"

export default function StaticPagePermissionPage() {
  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
      <PageHeader />

      <Tabs defaultValue="by-role">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="by-role" className="gap-1.5 flex-1 sm:flex-none">
            <UsersIcon className="h-3.5 w-3.5" />
            By Role
          </TabsTrigger>
          <TabsTrigger value="by-page" className="gap-1.5 flex-1 sm:flex-none">
            <Layers className="h-3.5 w-3.5" />
            By Static Page
          </TabsTrigger>
        </TabsList>

        <TabsContent value="by-role" className="mt-3 sm:mt-4">
          <ByRoleView
            renderPermissionsSlot={(role) => (
              <RoleStaticPagesMatrix roleId={role.id} roleName={role.name} />
            )}
          />
        </TabsContent>

        <TabsContent value="by-page" className="mt-3 sm:mt-4">
          <ByPageView />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PageHeader() {
  return (
    <div className="space-y-2">
      <PageBackLink href="/settings/permission" label="Permission Management" />
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          <Globe className="h-4.5 w-4.5" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-semibold leading-tight">
            Static Page Permission
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-tight">
            Grant or deny access to system pages (Leaves, Attendance, Payroll, …)
            per role and per user.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── By Static Page view ─────────────────────────────────────────────────────

function ByPageView() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [bulkView, setBulkView] = useState(true)

  const handlePageSelect = useCallback((path: string) => {
    setBulkView(false)
    setSelectedPath(path)
  }, [])

  const handleShowBulk = useCallback(() => {
    setSelectedPath(null)
    setBulkView(true)
  }, [])

  // ── Resizable sidebar (lg+ only) ──────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT)
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (saved) {
      const n = Number(saved)
      if (Number.isFinite(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) {
        setSidebarWidth(n)
      }
    }
  }, [])

  const sidebarWidthRef = useRef(sidebarWidth)
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
    if (containerRef.current) {
      containerRef.current.style.setProperty("--sidebar-w", `${sidebarWidth}px`)
    }
  }, [sidebarWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current || !containerRef.current) return
      e.preventDefault()
      const rect = containerRef.current.getBoundingClientRect()
      const next = Math.min(
        SIDEBAR_MAX,
        Math.max(SIDEBAR_MIN, e.clientX - rect.left),
      )
      setSidebarWidth(next)
    }
    const onUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      setIsResizing(false)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      try {
        window.localStorage.setItem(
          SIDEBAR_STORAGE_KEY,
          String(sidebarWidthRef.current),
        )
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

  const selectedMeta = selectedPath ? findStaticPage(selectedPath) : null

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-stretch gap-3 lg:flex-row lg:gap-0"
    >
      <div className="w-full lg:sticky lg:top-3 lg:h-[calc(100vh-9rem)] lg:w-[var(--sidebar-w,280px)] lg:shrink-0 lg:self-start rounded-lg border bg-card">
        <StaticPagesSidebar
          selectedPath={selectedPath}
          onSelect={handlePageSelect}
          bulkHeader={
            <Button
              size="sm"
              variant={bulkView ? "default" : "outline"}
              onClick={handleShowBulk}
              className="w-full justify-start gap-1.5"
            >
              <Layers className="h-3.5 w-3.5" />
              All pages × roles
            </Button>
          }
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

      <div className="min-w-0 flex-1 space-y-3 lg:pl-3 lg:flex lg:flex-col lg:h-[calc(100vh-9rem)] lg:overflow-y-auto">
        {bulkView ? (
          <StaticPagesRolesMatrix />
        ) : selectedPath ? (
          <PageDetail path={selectedPath} label={selectedMeta?.label ?? selectedPath} />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <Globe className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">
                Pick a static page from the sidebar
              </p>
              <p className="text-xs mt-1">
                Or use "All pages × roles" for a bulk view.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function PageDetail({ path, label }: { path: string; label: string }) {
  return (
    <Tabs defaultValue="roles" className="space-y-3">
      <TabsList>
        <TabsTrigger value="roles" className="gap-1.5">
          <Shield className="h-3.5 w-3.5" />
          Roles
        </TabsTrigger>
        <TabsTrigger value="users" className="gap-1.5">
          <UsersIcon className="h-3.5 w-3.5" />
          Users
        </TabsTrigger>
      </TabsList>

      <TabsContent value="roles" className="space-y-3 mt-0">
        <RoutePermissionMatrix path={path} />
      </TabsContent>

      <TabsContent value="users" className="space-y-3 mt-0">
        <PageUsersMatrix path={path} />
      </TabsContent>
    </Tabs>
  )
}
