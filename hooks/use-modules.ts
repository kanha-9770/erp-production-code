"use client"

import { useGetPermissionModulesQuery } from "@/lib/api/modules"
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
 *
 * Now powered by RTK Query for automatic caching and deduplication.
 */
export function useModules(): UseModulesResult {
  const { data, isLoading, error } = useGetPermissionModulesQuery()

  return {
    modules: data?.success ? data.data : [],
    loading: isLoading,
    error: error ? "Failed to load modules" : null,
  }
}
