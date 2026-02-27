"use client"

import React from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "../context/AuthContext"

interface AuthGuardProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  requireAuth?: boolean
}

export function AuthGuard({ 
  children, 
  fallback,
  requireAuth = true 
}: AuthGuardProps) {
  const { loading, isAuthenticated } = useAuth()

  // Show loading spinner while authentication is being checked
  if (loading) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      )
    )
  }

  // If authentication is required but user is not authenticated, don't render children
  if (requireAuth && !isAuthenticated) {
    return null
  }

  // If authentication is not required or user is authenticated, render children
  return <>{children}</>
}