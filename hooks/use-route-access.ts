"use client"

import { useMemo, useCallback } from "react"
import { useGetUserQuery } from "@/lib/api/auth"
import { resolveRouteAccess } from "@/lib/route-permissions"

/**
 * useRouteAccess — Route permission checks for UI filtering.
 *
 * Reads `allowedRoutes` and `deniedRoutes` from the `/api/auth/me`
 * response (served by useGetUserQuery, already cached by RTK Query).
 * No direct cookie reading — works reliably regardless of httpOnly.
 *
 * Provides two functions:
 *
 *  canAccess(path)   — open by default: returns true unless explicitly denied.
 *                      Use for guards, middleware, sidebar buttons.
 *
 *  isPermitted(path) — whitelist mode: returns true ONLY if explicitly allowed.
 *                      Use for settings page where you only want to show
 *                      items the admin has granted.
 *
 * Both use specificity-based matching (see resolveRouteAccess).
 */
export function useRouteAccess() {
  const { data, isLoading } = useGetUserQuery()

  const isAdmin = data?.user?.isAdmin ?? false

  const allowedRoutes = useMemo(
    () => (Array.isArray(data?.user?.allowedRoutes) ? data!.user!.allowedRoutes! : []),
    [data]
  )

  const deniedRoutes = useMemo(
    () => {
      const user = data?.user as any
      return Array.isArray(user?.deniedRoutes) ? user.deniedRoutes as string[] : []
    },
    [data]
  )

  /**
   * Open-by-default check.
   * Returns true unless the path is explicitly denied.
   * No rule = allowed.
   */
  const canAccess = useCallback(
    (path: string): boolean => {
      if (isAdmin) return true
      if (isLoading || !data) return true // allow while loading

      const result = resolveRouteAccess(path, allowedRoutes, deniedRoutes)
      if (result === false) return false
      return true
    },
    [isAdmin, isLoading, data, allowedRoutes, deniedRoutes]
  )

  /**
   * Whitelist check.
   * Returns true ONLY when the path matches an explicit grant.
   * No rule = hidden. Use for settings pages.
   */
  const isPermitted = useCallback(
    (path: string): boolean => {
      if (isAdmin) return true
      if (isLoading || !data) return false // hide while loading

      const result = resolveRouteAccess(path, allowedRoutes, deniedRoutes)
      return result === true
    },
    [isAdmin, isLoading, data, allowedRoutes, deniedRoutes]
  )

  return { canAccess, isPermitted, isAdmin, isLoading }
}
