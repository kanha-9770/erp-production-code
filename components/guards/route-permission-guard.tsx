"use client"

import { useEffect, useRef, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import { resolveRouteAccess } from "@/lib/route-permissions"
import { useGetUserQuery } from "@/lib/api/auth"
import { baseApi } from "@/lib/api/baseApi"
import { useDispatch } from "react-redux"

// ─── Configuration ──────────────────────────────────────────────────────────

/** How often (ms) to poll for permission changes. The /api/auth/perm-version
 *  endpoint is now Redis-cached (cachedSWR), so every open tab across every
 *  user collapses into ~1 DB read per org per cache window regardless of poll
 *  frequency — the per-tab DB cost the old 60s value guarded against no longer
 *  exists. 15s keeps grants/revocations reflecting near-real-time and matches
 *  the "within 15 seconds" copy shown in the Route Permissions UI footer. */
const POLL_INTERVAL = 15_000 // 15 seconds

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

  // Mint timestamp of the user's signed auth-meta cookie (from /api/auth/me).
  // The poll compares this against the org's perm-version: if a permission
  // change is newer than the cookie, the cookie is stale and is refreshed —
  // even on the very first poll after a page load. Held in a ref so the poll
  // closure always reads the latest value without re-creating the interval.
  const permMetaTs: number = (userData?.user as any)?.permMetaTs ?? 0
  const permMetaTsRef = useRef(0)
  useEffect(() => {
    permMetaTsRef.current = permMetaTs
  }, [permMetaTs])

  // Don't start polling / baselining until /api/auth/me has resolved, so the
  // staleness comparison below always has a real cookie timestamp to compare
  // against (otherwise the first poll could fire with permMetaTs still 0 and
  // refresh unnecessarily on every cold load).
  const userReady = !!userData

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
    if (!userReady) return // wait for /api/auth/me before baselining

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

        // First poll — store version baseline. Crucially, the cookie this user
        // is currently carrying may PREDATE the latest permission change (e.g.
        // an admin granted them access before they loaded/reloaded the page).
        // In that case the signed auth-meta cookie is stale, so /api/auth/me is
        // returning old allowedRoutes and the new page never appears. Detect it
        // by comparing the server version against the cookie's mint timestamp,
        // and refresh immediately instead of waiting for the cookie to age out
        // (5 min) or for a *future* change to bump the version.
        if (lastVersionRef.current === 0) {
          lastVersionRef.current = serverVersion
          if (serverVersion > permMetaTsRef.current) {
            console.log(
              `[RoutePermissionGuard] stale cookie on load (serverVersion=${serverVersion} > cookieTs=${permMetaTsRef.current}) → refreshing`
            )
            await refreshAndRecheck()
          }
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
  }, [pathname, userReady, refreshAndRecheck])

  return <>{children}</>
}
