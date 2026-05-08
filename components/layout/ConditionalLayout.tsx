"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { CrmSidebar } from "./sidebar"
import { useState } from "react"
import { PermissionProvider } from "@/context/PermissionContext"
import { RoutePermissionGuard } from "@/components/guards/route-permission-guard"
import { Menu } from "lucide-react"

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

  if (
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/form/")
  ) {
    return <>{children}</>
  }

  return (
    <PermissionProvider>
      <RoutePermissionGuard>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
          {/* Mobile backdrop */}
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}

          {/* Sidebar — drawer on mobile, static on md+ */}
          <div
            className={[
              "fixed md:relative z-50 md:z-50 h-full",
              "transition-transform duration-300 ease-in-out",
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
            {/* Mobile top bar */}
            <div className="md:hidden flex items-center gap-3 h-12 px-4 border-b bg-white dark:bg-gray-900 dark:border-gray-800 shrink-0">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5 text-gray-700 dark:text-gray-200" />
              </button>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">ERP</span>
            </div>

            <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
          </div>
        </div>
      </RoutePermissionGuard>
    </PermissionProvider>
  )
}
