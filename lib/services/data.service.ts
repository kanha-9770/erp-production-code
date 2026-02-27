import { MODULE_CONFIGS } from "@/lib/module-configs"
import type { ModuleType, SubmoduleConfig } from "@/lib/types"
import { hrmDashboardData } from "@/lib/sample-data/hrm-dashboard"
import { hrmListData } from "@/lib/sample-data/hrm-list"
import { hrmDetailData } from "@/lib/sample-data/hrm-detail"
import { hrmReportsData } from "@/lib/sample-data/hrm-reports"
import { hrmSettings } from "@/lib/sample-data/hrm-settings"

export interface ContextData {
  moduleId: ModuleType
  moduleName: string
  contextName: string
  contextPath: string
  dashboard?: any
  list?: any
  detail?: any
  reports?: any
  settings?: any
}

function findSubmodule(submodules: SubmoduleConfig[] | undefined, path: string[]): SubmoduleConfig | null {
  if (!submodules || path.length === 0) return null
  const [current, ...rest] = path
  const found = submodules.find((sub) => sub.id === current)
  if (!found) return null
  if (rest.length === 0) return found
  return findSubmodule(found.submodules, rest)
}

export function getContextData(moduleId: ModuleType, submodulePath: string[] = []): ContextData {
  const module = MODULE_CONFIGS[moduleId]
  const fullPath = `/${moduleId}${submodulePath.length > 0 ? `/${submodulePath.join("/")}` : ""}`

  if (submodulePath.length === 0) {
    return {
      moduleId,
      moduleName: module.name,
      contextName: module.name,
      contextPath: fullPath,
      dashboard: moduleId === "hrm" ? hrmDashboardData : undefined,
      list: moduleId === "hrm" ? hrmListData : undefined,
      detail: moduleId === "hrm" ? hrmDetailData : undefined,
      reports: moduleId === "hrm" ? hrmReportsData : undefined,
      settings: moduleId === "hrm" ? hrmSettings : undefined,
    }
  }

  const submodule = findSubmodule(module.submodules, submodulePath)

  if (!submodule) {
    return {
      moduleId,
      moduleName: module.name,
      contextName: module.name,
      contextPath: fullPath,
    }
  }

  return {
    moduleId,
    moduleName: module.name,
    contextName: submodule.name,
    contextPath: fullPath,
    ...submodule.pageData,
  }
}
