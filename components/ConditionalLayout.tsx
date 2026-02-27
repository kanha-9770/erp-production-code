"use client"

import type React from "react"

import { usePathname } from "next/navigation"
import { CrmSidebar } from "./sidebar"
import { useState } from "react"
import { PermissionProvider } from "@/context/PermissionContext"

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [currentView, setCurrentView] = useState<string>("home")

  const publicRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-otp",
    "/unauthorized",
  ]

  // Render only children for public routes
  if (publicRoutes.includes(pathname)) {
    return <>{children}</>
  }

  // Render full layout with sidebar for other pages
  return (
    <PermissionProvider>
      <div className="flex h-screen bg-gray-50">
        <CrmSidebar onViewChange={setCurrentView} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div></PermissionProvider>
  )
}