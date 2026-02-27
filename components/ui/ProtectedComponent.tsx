"use client"

import React, { useEffect, useState } from "react"
import { useAuthenticatedApi } from "@/hooks/useAuthenticatedApi"
import { Loader2 } from "lucide-react"
import { useAuth } from "../context/AuthContext"

interface ProtectedComponentProps {
  children: (api: ReturnType<typeof useAuthenticatedApi>) => React.ReactNode
  fallback?: React.ReactNode
  loadingComponent?: React.ReactNode
}

export function ProtectedComponent({ 
  children, 
  fallback,
  loadingComponent 
}: ProtectedComponentProps) {
  const { loading, isAuthenticated } = useAuth()
  const api = useAuthenticatedApi()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!loading && isAuthenticated && api.isReady) {
      setIsReady(true)
    } else {
      setIsReady(false)
    }
  }, [loading, isAuthenticated, api.isReady])

  // Show loading while authentication is being checked
  if (loading || !isReady) {
    return (
      loadingComponent || (
        <div className="flex items-center justify-center p-8">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <p className="text-sm text-gray-600">Loading...</p>
          </div>
        </div>
      )
    )
  }

  // If not authenticated, show fallback or nothing
  if (!isAuthenticated) {
    return fallback || null
  }

  // Render children with authenticated API
  return <>{children(api)}</>
}