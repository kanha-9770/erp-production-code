export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

/**
 * GET /api/lookup/templates
 * Returns all lookup templates for the user's organization.
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

    const templates = await prisma.lookupTemplate.findMany({
      where: { organizationId: authUser.organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        config: true,
        selectedFields: true,
        dependencies: true,
        sourceInfo: true,
        createdAt: true,
        createdBy: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({ success: true, data: templates })
  } catch (error) {
    console.error("[GET /api/lookup/templates]", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch templates" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/lookup/templates
 * Save a new lookup configuration template.
 * Body: { name, description?, config, selectedFields, dependencies?, sourceInfo }
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
    const { name, description, config, selectedFields, dependencies, sourceInfo } = body

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Template name is required" },
        { status: 400 }
      )
    }
    if (!config || !selectedFields) {
      return NextResponse.json(
        { success: false, error: "Config and selectedFields are required" },
        { status: 400 }
      )
    }

    const template = await prisma.lookupTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        organizationId: authUser.organizationId,
        createdById: authUser.id,
        config,
        selectedFields,
        dependencies: dependencies || null,
        sourceInfo: sourceInfo || {},
      },
    })

    return NextResponse.json({ success: true, data: template })
  } catch (error) {
    console.error("[POST /api/lookup/templates]", error)
    return NextResponse.json(
      { success: false, error: "Failed to save template" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/lookup/templates?id=xxx
 * Delete a lookup template.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Template id is required" },
        { status: 400 }
      )
    }

    // Verify ownership
    const template = await prisma.lookupTemplate.findFirst({
      where: { id, organizationId: authUser.organizationId },
    })
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 }
      )
    }

    await prisma.lookupTemplate.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[DELETE /api/lookup/templates]", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete template" },
      { status: 500 }
    )
  }
}
