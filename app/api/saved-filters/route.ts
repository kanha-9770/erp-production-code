export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

/**
 * GET /api/saved-filters?moduleId=xxx
 * Returns all saved filters for a specific module in the user's organization.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const { searchParams } = new URL(request.url)
    const moduleId = searchParams.get("moduleId")
    if (!moduleId) {
      return NextResponse.json(
        { success: false, error: "moduleId is required" },
        { status: 400 }
      )
    }

    const savedFilters = await prisma.savedFilter.findMany({
      where: {
        organizationId: authUser.organizationId,
        moduleId,
      },
      select: {
        id: true,
        name: true,
        moduleId: true,
        filters: true,
        createdAt: true,
        createdBy: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({ success: true, data: savedFilters })
  } catch (error) {
    console.error("[GET /api/saved-filters]", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch saved filters" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/saved-filters
 * Save a new filter preset.
 * Body: { name, moduleId, filters }
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const body = await request.json()
    const { name, moduleId, filters } = body

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Filter name is required" },
        { status: 400 }
      )
    }
    if (!moduleId) {
      return NextResponse.json(
        { success: false, error: "moduleId is required" },
        { status: 400 }
      )
    }
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one filter is required" },
        { status: 400 }
      )
    }

    const savedFilter = await prisma.savedFilter.create({
      data: {
        name: name.trim(),
        moduleId,
        organizationId: authUser.organizationId,
        createdById: authUser.id,
        filters,
      },
    })

    return NextResponse.json({ success: true, data: savedFilter })
  } catch (error) {
    console.error("[POST /api/saved-filters]", error)
    return NextResponse.json(
      { success: false, error: "Failed to save filter" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/saved-filters
 * Update an existing saved filter.
 * Body: { id, name?, filters? }
 */
export async function PUT(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const body = await request.json()
    const { id, name, filters } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Filter id is required" },
        { status: 400 }
      )
    }

    // Verify ownership
    const existing = await prisma.savedFilter.findFirst({
      where: { id, organizationId: authUser.organizationId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Saved filter not found" },
        { status: 404 }
      )
    }

    const updateData: Record<string, any> = {}
    if (name?.trim()) updateData.name = name.trim()
    if (filters && Array.isArray(filters)) updateData.filters = filters

    const updated = await prisma.savedFilter.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("[PUT /api/saved-filters]", error)
    return NextResponse.json(
      { success: false, error: "Failed to update saved filter" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/saved-filters?id=xxx
 * Delete a saved filter.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Filter id is required" },
        { status: 400 }
      )
    }

    // Verify ownership
    const existing = await prisma.savedFilter.findFirst({
      where: { id, organizationId: authUser.organizationId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Saved filter not found" },
        { status: 404 }
      )
    }

    await prisma.savedFilter.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[DELETE /api/saved-filters]", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete saved filter" },
      { status: 500 }
    )
  }
}
