import { MODULE_CONFIGS } from "@/lib/module-configs"
import type { ModuleType, SubmoduleConfig } from "@/lib/types"

export interface NavigationItem {
  id: string
  name: string
  icon: string
  href: string
  level: number
  submodules?: NavigationItem[]
}

export interface PageRoute {
  name: string
  href: string
  icon: string
}

// Build navigation tree for a module
export function buildNavigationTree(moduleId: ModuleType): NavigationItem[] {
  const module = MODULE_CONFIGS[moduleId]
  if (!module.submodules) return []

  function buildSubmoduleNav(submodules: SubmoduleConfig[], parentPath: string, level: number): NavigationItem[] {
    return submodules.map((sub) => ({
      id: sub.id,
      name: sub.name,
      icon: sub.icon,
      href: `${parentPath}/${sub.id}`,
      level,
      submodules: sub.submodules ? buildSubmoduleNav(sub.submodules, `${parentPath}/${sub.id}`, level + 1) : undefined,
    }))
  }

  return buildSubmoduleNav(module.submodules, `/${moduleId}`, 1)
}

// Get page routes for current context
export function getPageRoutes(basePath: string): PageRoute[] {
  return [
    { name: "Dashboard", href: `${basePath}/dashboard`, icon: "LayoutDashboard" },
    { name: "List", href: `${basePath}/list`, icon: "List" },
    { name: "Reports", href: `${basePath}/reports`, icon: "BarChart3" },
    { name: "Settings", href: `${basePath}/settings`, icon: "Settings" },
  ]
}

// Parse path segments to get module and submodule path
export function parsePath(segments: string[]): {
  moduleId: ModuleType
  submodulePath: string[]
} {
  const [moduleId, ...submodulePath] = segments
  return {
    moduleId: moduleId as ModuleType,
    submodulePath,
  }
}
