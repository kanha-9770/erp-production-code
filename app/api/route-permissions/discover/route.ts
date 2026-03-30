export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import fs from "fs"
import path from "path"

/** Routes that don't need permission management (public / auth pages). */
const EXCLUDED_ROUTES = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-otp",
  "/auth",
  "/auth/reset-password",
  "/unauthorized",
  "/unautherized",
])

/**
 * Recursively scan the app directory for page.tsx files and convert to route paths.
 * Skips api routes, dynamic segments ([param]), and excluded public routes.
 */
function discoverRoutes(appDir: string): string[] {
  const routes: string[] = []

  function walk(dir: string, routePrefix: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const name = entry.name

      // Skip api routes, internal Next.js folders
      if (name === "api" || name.startsWith("_") || name.startsWith(".")) continue

      // Skip dynamic route segments like [module_name], [[...slug]]
      if (name.startsWith("[")) continue

      const childDir = path.join(dir, name)
      const routePath = `${routePrefix}/${name}`

      // Check if this directory has a page.tsx
      const hasPage =
        fs.existsSync(path.join(childDir, "page.tsx")) ||
        fs.existsSync(path.join(childDir, "page.ts")) ||
        fs.existsSync(path.join(childDir, "page.jsx")) ||
        fs.existsSync(path.join(childDir, "page.js"))

      if (hasPage && !EXCLUDED_ROUTES.has(routePath)) {
        routes.push(routePath)
      }

      // Continue recursing into subdirectories
      walk(childDir, routePath)
    }
  }

  // Check root page
  const hasRootPage = fs.existsSync(path.join(appDir, "page.tsx"))
  if (hasRootPage) {
    routes.push("/")
  }

  walk(appDir, "")

  return routes.sort()
}

/**
 * GET /api/route-permissions/discover
 * Returns all static routes from the app directory.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const appDir = path.join(process.cwd(), "app")
    const routes = discoverRoutes(appDir)

    return NextResponse.json({ success: true, data: routes })
  } catch (error) {
    console.error("[GET /api/route-permissions/discover]", error)
    return NextResponse.json(
      { success: false, error: "Failed to discover routes" },
      { status: 500 }
    )
  }
}
