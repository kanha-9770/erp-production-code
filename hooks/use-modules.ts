"use client"

import { useState, useEffect } from "react"
import type { PermissionModule } from "@/types/permissions"

interface UseModulesResult {
  modules: PermissionModule[]
  loading: boolean
  error: string | null
}

/**
 * Fetches the permitted module+form tree from /api/modules-permission.
 * Single source of truth — share this across the roles page, sidebar, and matrix
 * instead of each component fetching independently.
 */
export function useModules(): UseModulesResult {
  const [modules, setModules] = useState<PermissionModule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    fetch("/api/modules-permission")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!mounted) return
        if (json.success) setModules(json.data)
        else setError(json.error || "Failed to load modules")
      })
      .catch((err: Error) => {
        if (mounted) setError(err.message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [])

  return { modules, loading, error }
}
