// app/api/lookup/sources/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { LookupService } from "@/lib/lookup-service"
import { getAuthenticatedUser } from "@/lib/api-helpers"

interface CachedEntry {
  data: any[]
  timestamp: number
}
const CACHE_DURATION = 60000 // 1 minute
const cache = new Map<string, CachedEntry>()

interface ModuleInfo {
  id: string
  name: string
  parentId: string | null
}
interface FormInfo {
  id: string
  moduleId: string
  name: string
}
interface LookupInfo {
  id: string
  sourceForm?: {
    id: string
    name: string
    moduleId: string
  }
  sourceModuleId?: string
}

function getAncestry(
  id: string,
  moduleMap: Map<string, ModuleInfo>
): Array<{ id: string; name: string; type: "module" }> {
  const ancestry: Array<{ id: string; name: string; type: "module" }> = []
  let currentId: string | null = id
  while (currentId && moduleMap.has(currentId)) {
    const mod = moduleMap.get(currentId)!
    ancestry.push({ id: mod.id, name: mod.name, type: "module" })
    currentId = mod.parentId
  }
  ancestry.reverse()
  return ancestry
}

function buildPath(
  ancestry: Array<{ id: string; name: string; type: string }>
): string {
  return ancestry.map((a) => a.name).join("/")
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const quick = searchParams.get("quick") === "true"
    const now = Date.now()

    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const userId = authUser.id
    const organizationId = authUser.organizationId
    const cacheKey = `${userId}_${quick ? "quick" : "full"}`

    // Check cache
    const cached = cache.get(cacheKey)
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        data: cached.data,
        cached: true,
      })
    }

    // Step 1: Get raw sources with original prefixed IDs (form_..., module_..., static_...)
    let sources = await LookupService.getLookupSources(userId, { quick })

    // Step 2: Extract clean key (without prefix) + preserve original id
    sources = sources.map((source: any) => {
      const originalId = source.id // e.g. form_cm123, module_cm456, static_cm789
      let key = originalId

      if (source.type === "module") key = originalId.replace(/^module_/, "")
      else if (source.type === "form") key = originalId.replace(/^form_/, "")
      else if (source.type === "static") key = originalId.replace(/^static_/, "")

      return {
        ...source,
        id: originalId,   // Keep original → used by getFields()
        key,              // Clean ID → use in tree, URLs, React keys
      }
    })

    // Step 3: Enrich with path, ancestry, parentId (only in full mode)
    if (!quick && organizationId) {
      const allModules = await prisma.formModule.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true, parentId: true },
      })
      const moduleMap = new Map<string, ModuleInfo>(
        allModules.map((mod) => [mod.id, mod])
      )

      // Batch fetch forms
      const formKeys = sources.filter((s: any) => s.type === "form").map((s: any) => s.key)
      const formMap = new Map<string, FormInfo>()
      if (formKeys.length > 0) {
        const forms = await prisma.form.findMany({
          where: { id: { in: formKeys } },
          select: { id: true, moduleId: true, name: true },
        })
        forms.forEach((f) => formMap.set(f.id, f))
      }

      // Batch fetch static lookups
      const staticKeys = sources.filter((s: any) => s.type === "static").map((s: any) => s.key)
      const lookupMap = new Map<string, LookupInfo>()
      if (staticKeys.length > 0) {
        const lookups = await prisma.lookupSource.findMany({
          where: { id: { in: staticKeys } },
          include: { sourceForm: { select: { id: true, name: true, moduleId: true } } },
        })
        lookups.forEach((l) => lookupMap.set(l.id, l))
      }

      const enrichedSources = sources.map((source: any) => {
        let sourcePath = source.name
        let fullAncestry: Array<{ id: string; name: string; type: string }> = [
          { id: source.key, name: source.name, type: source.type },
        ]
        let parentId: string | null = null

        if (source.type === "module") {
          if (moduleMap.has(source.key)) {
            const ancestry = getAncestry(source.key, moduleMap)
            fullAncestry = ancestry.map((a) => ({ ...a, type: "module" }))
            sourcePath = buildPath(fullAncestry)
            parentId = moduleMap.get(source.key)?.parentId || null
          }
        } else if (source.type === "form") {
          const form = formMap.get(source.key)
          if (form?.moduleId && moduleMap.has(form.moduleId)) {
            const modAncestry = getAncestry(form.moduleId, moduleMap)
            fullAncestry = [
              ...modAncestry.map((a) => ({ ...a, type: "module" })),
              { id: source.key, name: source.name, type: "form" },
            ]
            sourcePath = buildPath(fullAncestry)
            // FIXED: Make parentId prefixed to match frontend expectation
            parentId = `module_${form.moduleId}`
          }
        } else if (source.type === "static") {
          const lookup = lookupMap.get(source.key)
          let effectiveModuleId: string | null = null
          let intermediate = null

          if (lookup?.sourceForm) {
            effectiveModuleId = lookup.sourceForm.moduleId
            intermediate = { id: lookup.sourceForm.id, name: lookup.sourceForm.name, type: "form" }
          } else if (lookup?.sourceModuleId) {
            effectiveModuleId = lookup.sourceModuleId
          }

          if (effectiveModuleId && moduleMap.has(effectiveModuleId)) {
            const modAncestry = getAncestry(effectiveModuleId, moduleMap)
            fullAncestry = [
              ...modAncestry.map((a) => ({ ...a, type: "module" })),
              ...(intermediate ? [intermediate] : []),
              { id: source.key, name: source.name, type: "static" },
            ]
            sourcePath = buildPath(fullAncestry)
            // For static: prefix if it's from a form
            parentId = lookup?.sourceForm?.id
              ? `form_${lookup.sourceForm.id}`
              : lookup?.sourceModuleId
                ? `module_${lookup.sourceModuleId}`
                : null
          }
        }

        return {
          ...source,
          sourcePath,
          fullAncestry,
          parentId,
        }
      })

      sources = enrichedSources
    }

    // Cache full results only
    if (!quick) {
      cache.set(cacheKey, { data: sources, timestamp: now })
    }

    return NextResponse.json({
      success: true,
      data: sources,
      cached: false,
      quick,
    })
  } catch (error) {
    console.error("Error fetching lookup sources:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch lookup sources" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  cache.clear()
  return NextResponse.json({ success: true, message: "Cache cleared" })
}