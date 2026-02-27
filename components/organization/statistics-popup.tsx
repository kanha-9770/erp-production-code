"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Building2, Users, Database, Shield, ExpandIcon, TrendingUp, Activity } from "lucide-react"
import type { Role, OrganizationUnit } from "@/types/role"

interface StatisticsPopupProps {
  isOpen: boolean
  onClose: () => void
  type: "organization" | "roles"
  data: OrganizationUnit[] | Role[] | undefined
  expandedCount: number
}

export function StatisticsPopup({ isOpen, onClose, type, data, expandedCount }: StatisticsPopupProps) {
  // ────────────────────────────────────────────────
  // Safe version - handles undefined / null / non-array
  // ────────────────────────────────────────────────
  const getTotalNodes = (items: any[] | undefined | null): number => {
    if (!items || !Array.isArray(items)) return 0

    return items.reduce((total, item) => {
      return total + 1 + getTotalNodes(item.children || [])
    }, 0)
  }

  const getMaxDepth = (items: any[] | undefined | null): number => {
    if (!items || !Array.isArray(items) || items.length === 0) return 0

    return Math.max(
      ...items.map((item) => 1 + getMaxDepth(item.children || []))
    )
  }

  const getSharedRoles = (roles: Role[] | undefined | null): number => {
    if (!roles || !Array.isArray(roles)) return 0

    return roles.reduce((total, role) => {
      const current = role.shareDataWithPeers ? 1 : 0
      return total + current + getSharedRoles(role.children || [])
    }, 0)
  }

  const getLeafNodes = (items: any[] | undefined | null): number => {
    if (!items || !Array.isArray(items)) return 0

    return items.reduce((total, item) => {
      if (!item.children || item.children.length === 0) {
        return total + 1
      }
      return total + getLeafNodes(item.children)
    }, 0)
  }

  const getAverageChildren = (items: any[] | undefined | null): number => {
    if (!items || !Array.isArray(items)) return 0

    const allNodes = getAllNodes(items)
    const nodesWithChildren = allNodes.filter(
      (node) => node.children && node.children.length > 0
    )

    if (nodesWithChildren.length === 0) return 0

    const totalChildren = nodesWithChildren.reduce(
      (sum, node) => sum + (node.children?.length || 0),
      0
    )

    return Math.round((totalChildren / nodesWithChildren.length) * 10) / 10
  }

  const getAllNodes = (items: any[] | undefined | null): any[] => {
    if (!items || !Array.isArray(items)) return []

    const result: any[] = []
    items.forEach((item) => {
      result.push(item)
      if (item.children && Array.isArray(item.children)) {
        result.push(...getAllNodes(item.children))
      }
    })
    return result
  }

  // ────────────────────────────────────────────────
  // Early return when data is not ready
  // ────────────────────────────────────────────────
  if (!data || !Array.isArray(data)) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {type === "organization" ? (
                <Building2 className="h-5 w-5 text-blue-600" />
              ) : (
                <Shield className="h-5 w-5 text-purple-600" />
              )}
              {type === "organization" ? "Organization Statistics" : "Role Statistics"}
            </DialogTitle>
          </DialogHeader>

          <div className="py-12 text-center text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p>Loading hierarchy data...</p>
            <p className="text-xs mt-2 text-slate-400">
              This may take a moment on first load
            </p>
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ────────────────────────────────────────────────
  // Calculations (now safe)
  // ────────────────────────────────────────────────
  const totalNodes = getTotalNodes(data)
  const maxDepth = getMaxDepth(data)
  const leafNodes = getLeafNodes(data)
  const averageChildren = getAverageChildren(data)
  const sharedRoles = type === "roles" ? getSharedRoles(data as Role[]) : 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "organization" ? (
              <Building2 className="h-5 w-5 text-blue-600" />
            ) : (
              <Shield className="h-5 w-5 text-purple-600" />
            )}
            {type === "organization" ? "Organization Statistics" : "Role Statistics"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Primary Statistics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  {type === "organization" ? (
                    <Building2 className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Shield className="h-5 w-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-blue-700">
                    Total {type === "organization" ? "Units" : "Roles"}
                  </p>
                  <p className="text-2xl font-bold text-blue-900">{totalNodes}</p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Database className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-green-700">Max Depth</p>
                  <p className="text-2xl font-bold text-green-900">{maxDepth}</p>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <ExpandIcon className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-purple-700">Expanded</p>
                  <p className="text-2xl font-bold text-purple-900">{expandedCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Activity className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-orange-700">Leaf Nodes</p>
                  <p className="text-2xl font-bold text-orange-900">{leafNodes}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Statistics */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Detailed Analytics</h3>

            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-gray-700">Average Children per Node</span>
                </div>
                <span className="font-semibold text-gray-900">{averageChildren}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-gray-700">Expansion Rate</span>
                </div>
                <span className="font-semibold text-gray-900">
                  {totalNodes > 0 ? Math.round((expandedCount / totalNodes) * 100) : 0}%
                </span>
              </div>

              {type === "roles" && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-700">Data Sharing Roles</span>
                  </div>
                  <span className="font-semibold text-blue-900">{sharedRoles}</span>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-gray-700">Hierarchy Efficiency</span>
                </div>
                <span className="font-semibold text-gray-900">
                  {leafNodes > 0 ? Math.round((leafNodes / totalNodes) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={onClose} className="bg-gray-600 hover:bg-gray-700">
              Close Statistics
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}