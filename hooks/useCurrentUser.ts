"use client"

import { useMemo } from "react"
import { useGetCurrentUserQuery } from "@/lib/api/auth"

export function useCurrentUser() {
  const { data, error, isLoading } = useGetCurrentUserQuery()

  const fullName = useMemo(() => {
    if (!data?.user) return null

    const { first_name, last_name, username } = data.user

    if (first_name && last_name) {
      return `${first_name} ${last_name}`.trim()
    }
    if (first_name) return first_name.trim()
    if (last_name) return last_name.trim()
    return username || "Unknown User"
  }, [data?.user])

  return {
    fullName,
    user: data?.user ?? null,
    isLoading,
    isError: !!error,
    isAuthenticated: !!data?.user,
  }
}
