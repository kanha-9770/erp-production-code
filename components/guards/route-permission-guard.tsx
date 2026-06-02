"use client"

import { useEffect, useRef, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import { resolveRouteAccess } from "@/lib/route-permissions"
import { useGetUserQuery } from "@/lib/api/auth"
import { baseApi } from "@/lib/api/baseApi"
import { useDispatch } from "react-redux"

// ─── Configuration ──────────────────────────────────────────────────────────

/** How often (ms) to poll for permission changes. Permission changes are rare;
 *  at 15s every open tab hit /api/auth/perm-version 4×/min (2 DB queries each).
 *  60s cuts that background load 4× while staying responsive enough. */
const POLL_INTERVAL = 60_000 // 60 seconds

/** Routes that never require permission checks (unauthenticated pages) */
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-otp",
  "/unauthorized",
  "/unautherized",
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.some(
      (r) => pathname === r || pathname.startsWith(r + "/")
    ) ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/form/")
  )
}

const CUID_REGEX = /^c[a-z0-9]{15,}$/

/**
 * Check if a pathname is allowed (open-by-default mode).
 * Only blocks if explicitly denied by a matching pattern.
 */
function checkRouteAccess(
  pathname: string,
  isAdmin: boolean,
  allowedRoutes: string[],
  deniedRoutes: string[]
): boolean {
  if (isAdmin) return true

  const result = resolveRouteAccess(pathname, allowedRoutes, deniedRoutes)

  if (result === true) return true
  if (result === false) return false

  // Dynamic module routes — allowed (page-level VIEW check handles it)
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length >= 2 && CUID_REGEX.test(segments[1])) {
    return true
  }

  // No rule matched = open
  return true
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * RoutePermissionGuard — Client-side real-time route permission enforcement.
 *
 * 1. Uses useGetUserQuery data (same as useRouteAccess) for route checks
 * 2. Polls /api/auth/perm-version every 15s to detect permission changes
 * 3. When a change is detected:
 *    a. Refreshes the auth-meta cookie via POST /api/auth/refresh-meta
 *    b. Invalidates the RTK Query "User" cache so all consumers re-render
 *    c. Re-checks access and redirects to /unauthorized if revoked
 */
export function RoutePermissionGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const dispatch = useDispatch()
  const lastVersionRef = useRef<number>(0)

  const { data: userData } = useGetUserQuery()
  const isAdmin = userData?.user?.isAdmin ?? false
  const allowedRoutes: string[] = userData?.user?.allowedRoutes ?? []
  const deniedRoutes: string[] = (userData?.user as any)?.deniedRoutes ?? []

  // ── Check access on every route change ──────────────────────────────────
  useEffect(() => {
    if (isPublicRoute(pathname)) return
    if (!userData) return // Still loading

    const allowed = checkRouteAccess(pathname, isAdmin, allowedRoutes, deniedRoutes)
    if (!allowed) {
      console.log(`[RoutePermissionGuard] DENIED path=${pathname} → redirecting`)
      router.replace("/unauthorized")
    }
  }, [pathname, userData, isAdmin, allowedRoutes, deniedRoutes, router])

  // ── Poll for permission changes and refresh data ────────────────────────
  const refreshAndRecheck = useCallback(async () => {
    // 1. Refresh the auth-meta cookie on the server
    try {
      await fetch("/api/auth/refresh-meta", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      })
    } catch {
      return
    }

    // 2. Invalidate RTK Query "User" cache so useGetUserQuery and
    //    useRouteAccess re-fetch with updated allowedRoutes/deniedRoutes
    dispatch(baseApi.util.invalidateTags(["User"]))
  }, [dispatch])

  useEffect(() => {
    if (isPublicRoute(pathname)) return

    let cancelled = false

    const poll = async () => {
      if (cancelled) return

      try {
        const res = await fetch("/api/auth/perm-version", {
          credentials: "include",
          cache: "no-store",
        })
        if (!res.ok) return
        const json = await res.json()
        const serverVersion = json.success ? (json.data?.version ?? 0) : 0

        if (cancelled) return

        // First poll — store version baseline
        if (lastVersionRef.current === 0) {
          lastVersionRef.current = serverVersion
          return
        }

        // Permission changed on server
        if (serverVersion > lastVersionRef.current) {
          console.log(
            `[RoutePermissionGuard] permission change: ${lastVersionRef.current} → ${serverVersion}`
          )
          lastVersionRef.current = serverVersion
          await refreshAndRecheck()
        }
      } catch {
        // Network error — skip this cycle
      }
    }

    poll()
    const intervalId = setInterval(poll, POLL_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [pathname, refreshAndRecheck])

  return <>{children}</>
}
