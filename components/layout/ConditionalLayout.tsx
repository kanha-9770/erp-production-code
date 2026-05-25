"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { CrmSidebar } from "./sidebar"
import { MobileBottomNav } from "./MobileBottomNav"
import { useEffect, useMemo, useState } from "react"
import { PermissionProvider } from "@/context/PermissionContext"
import { RoutePermissionGuard } from "@/components/guards/route-permission-guard"
import { Menu } from "lucide-react"

/**
 * Derives a mobile app-bar title from the current pathname. The first
 * non-empty path segment is title-cased — so `/` → "Dashboard",
 * `/profile` → "Profile", `/real-estate/agents` → "Real Estate",
 * `/employee-master` → "Employee Master". This keeps the header useful
 * without forcing every page to register a title manually.
 *
 * If you need a richer page-specific title (e.g. an employee's name on
 * `/profile/[id]`), the right move is to add a context that pages can
 * write into; this generic derivation handles the 95% case.
 */
function derivePageTitle(pathname: string): string {
  if (!pathname || pathname === "/" || pathname === "") return "Dashboard"
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return "Dashboard"
  const first = segments[0]
  return first
    .replace(/[^a-z0-9-]/gi, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [currentView, setCurrentView] = useState<string>("home")
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const publicRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-otp",
    "/unauthorized",
  ]

  const isPublic =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/form/")

  // Lock html/body scroll only while the app shell is mounted. Without this,
  // a child that accidentally exceeds 100vh (a stray `min-h-screen`, a tall
  // portal, an unconstrained widget) lets the document itself grow taller
  // than the viewport — producing a second, browser-level scrollbar next to
  // <main>'s own scrollbar. Public routes (login, /form/, /auth) keep
  // normal document scrolling because they bypass the shell entirely.
  useEffect(() => {
    if (isPublic) return
    document.documentElement.classList.add("app-shell-active")
    return () => {
      document.documentElement.classList.remove("app-shell-active")
    }
  }, [isPublic])

  const pageTitle = useMemo(() => derivePageTitle(pathname), [pathname])

  if (isPublic) {
    return <>{children}</>
  }

  return (
    <PermissionProvider>
      <RoutePermissionGuard>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
          {/* Mobile backdrop — blurred glass over the page content,
              fades in. Tapping it dismisses the drawer. */}
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Sidebar — drawer on mobile, static on md+.
              `cubic-bezier(0.32, 0.72, 0, 1)` is the iOS UIView spring
              curve — snappier and more "native-app" than `ease-in-out`.
              Shadow is mobile-only because on desktop the sidebar is
              inline and a drop shadow would just look like a hard
              vertical line. */}
          <div
            className={[
              "fixed md:relative z-50 h-full",
              "shadow-2xl md:shadow-none",
              "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
            ].join(" ")}
          >
            <CrmSidebar
              onViewChange={setCurrentView}
              onMobileClose={() => setMobileSidebarOpen(false)}
            />
          </div>

          {/* Main content area */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Mobile app bar. iOS-style: hamburger left, page title
                centred, invisible spacer right to keep the title
                visually centred regardless of title length.
                h-14 (vs h-12) gives a more app-native tap target on
                the menu button and breathing room around the title. */}
            <div className="md:hidden flex items-center justify-between h-14 px-3 border-b bg-white/95 dark:bg-gray-900/95 backdrop-blur-md dark:border-gray-800 shrink-0">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="flex items-center justify-center h-9 w-9 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-95"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5 text-gray-700 dark:text-gray-200" />
              </button>
              <h1 className="text-[15px] font-semibold text-gray-900 dark:text-gray-50 truncate px-2">
                {pageTitle}
              </h1>
              {/* Invisible spacer that mirrors the menu button width so
                  the title stays optically centred. If you ever add a
                  right-side action (e.g. notifications icon), drop it
                  in place of this spacer. */}
              <span className="w-9" aria-hidden="true" />
            </div>

            {/*
              `pb-24 md:pb-0` reserves ~6rem of space inside the scroll
              container on mobile so the last items aren't hidden behind
              the fixed MobileBottomNav (h-16 + safe-area inset) AND
              there's a visible gap between content end and the nav top
              — that's the "breathing room between top and bottom"
              feel the design asked for. Reset to zero at >=md where
              the nav is hidden.
            */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-24 md:pb-0">
              {children}
            </main>
          </div>

          {/* Mobile-only floating tab bar (Home / Check In / Check Out / Profile). */}
          <MobileBottomNav />
        </div>
      </RoutePermissionGuard>
    </PermissionProvider>
  )
}
