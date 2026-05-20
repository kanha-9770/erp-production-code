import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateSession } from "@/lib/auth"
import { sanitizeSelectedModules, ERP_MODULES } from "@/lib/erp-modules"
import { ensureErpModuleSidebar } from "@/lib/erp-modules-seed"

/**
 * GET /api/organizations/modules
 * Returns the current org's selectedModules + the full catalog of choices.
 * No auth gate beyond having an active session — every member of the org
 * needs to read this to render the sidebar correctly.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const session = await validateSession(token)
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 })
  }
  const orgId = session.user.organizationId
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 })
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, selectedModules: true },
  })
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    organization: {
      id: org.id,
      name: org.name,
      selectedModules: org.selectedModules ?? [],
    },
    catalog: ERP_MODULES,
  })
}

/**
 * PUT /api/organizations/modules
 * Body: { selectedModules: string[] }
 * Admin-only — only org admins can change which modules are active.
 */
export async function PUT(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const session = await validateSession(token)
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 })
  }
  const orgId = session.user.organizationId
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 })
  }

  // Admin check — same rule as /api/auth/me. Owner OR any role tagged admin.
  const isOwner = !!session.user.ownedOrganization
  const hasAdminRole = session.user.unitAssignments.some(
    (ua) => ua.role.isAdmin || ua.role.name.toLowerCase().includes("admin")
  )
  if (!isOwner && !hasAdminRole) {
    return NextResponse.json(
      { error: "Only organization admins can change module selection" },
      { status: 403 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const selectedModules = sanitizeSelectedModules(body?.selectedModules)

  const updated = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id: orgId },
      data: { selectedModules },
      select: { id: true, name: true, selectedModules: true },
    })
    // Reconcile the org's FormModules + group anchors so the sidebar
    // matches the new selection. Newly-enabled modules get a FormModule
    // and group anchors; disabled modules have their group anchors
    // cleared (FormModule rows are kept so any custom forms aren't lost).
    await ensureErpModuleSidebar(tx, orgId, selectedModules)
    return org
  })

  return NextResponse.json({
    success: true,
    organization: updated,
    // Hint to the client — the auth-meta cookie now embeds selectedModules
    // (so middleware/sidebar use stale data). Caller should POST
    // /api/auth/refresh-meta after this to pick up the new values.
    refreshMeta: true,
  })
}
