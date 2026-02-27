"use client"

import { useMemo } from "react"
import useSWR from "swr"

interface CurrentUser {
  id: string
  username: string
  first_name: string | null
  last_name: string | null
  email: string
}

interface ApiResponse {
  success: boolean
  user: CurrentUser | null
}

const fetcher = async (url: string): Promise<ApiResponse> => {
  const res = await fetch(url, {
    credentials: "include",
  })

  if (!res.ok) {
    throw new Error("Failed to fetch current user")
  }

  const data = await res.json()
  console.log("[v0] useCurrentUser fetched data:", data)
  return data
}

export function useCurrentUser() {
  const { data, error, isLoading } = useSWR<ApiResponse>("/api/user", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    refreshInterval: 0,
  })

  const fullName = useMemo(() => {
    if (!data?.user) {
      console.log("[v0] useCurrentUser: No user data available")
      return null
    }

    const { first_name, last_name, username } = data.user
    console.log("[v0] useCurrentUser: Building fullName from:", { first_name, last_name, username })

    if (first_name && last_name) {
      return `${first_name} ${last_name}`.trim()
    }
    if (first_name) return first_name.trim()
    if (last_name) return last_name.trim()
    return username || "Unknown User"
  }, [data?.user])

  console.log("[v0] useCurrentUser returning:", {
    fullName,
    isLoading,
    isError: !!error,
    isAuthenticated: !!data?.user,
  })

  return {
    fullName,
    user: data?.user ?? null,
    isLoading,
    isError: !!error,
    isAuthenticated: !!data?.user,
  }
}
