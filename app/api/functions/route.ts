export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

/**
 * GET /api/functions
 * Returns all functions for the user's organization.
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

    const functions = await prisma.crmFunction.findMany({
      where: { organizationId: authUser.organizationId },
      select: {
        id: true,
        name: true,
        displayName: true,
        category: true,
        language: true,
        description: true,
        associated: true,
        restApi: true,
        script: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({ success: true, data: functions })
  } catch (error) {
    console.error("[GET /api/functions]", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch functions" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/functions
 * Create a new function.
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
    const { name, displayName, category, language, description } = body

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Function name is required" },
        { status: 400 }
      )
    }

    const fn = await prisma.crmFunction.create({
      data: {
        name: name.trim(),
        displayName: (displayName || name).trim(),
        category: category || "Automation",
        language: "JavaScript",
        description: description?.trim() || null,
        organizationId: authUser.organizationId,
        createdById: authUser.id,
      },
    })

    return NextResponse.json({ success: true, data: fn })
  } catch (error) {
    console.error("[POST /api/functions]", error)
    return NextResponse.json(
      { success: false, error: "Failed to create function" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/functions
 * Update an existing function.
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
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Function id is required" },
        { status: 400 }
      )
    }

    const existing = await prisma.crmFunction.findFirst({
      where: { id, organizationId: authUser.organizationId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Function not found" },
        { status: 404 }
      )
    }

    const updateData: Record<string, any> = {}
    if (fields.name?.trim()) updateData.name = fields.name.trim()
    if (fields.displayName?.trim()) updateData.displayName = fields.displayName.trim()
    if (fields.category) updateData.category = fields.category
    if (fields.language) updateData.language = fields.language
    if (fields.description !== undefined) updateData.description = fields.description?.trim() || null
    if (fields.associated !== undefined) updateData.associated = fields.associated
    if (fields.restApi !== undefined) updateData.restApi = fields.restApi
    if (fields.script !== undefined) updateData.script = fields.script

    const updated = await prisma.crmFunction.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("[PUT /api/functions]", error)
    return NextResponse.json(
      { success: false, error: "Failed to update function" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/functions?id=xxx
 * Delete a function.
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
        { success: false, error: "Function id is required" },
        { status: 400 }
      )
    }

    const existing = await prisma.crmFunction.findFirst({
      where: { id, organizationId: authUser.organizationId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Function not found" },
        { status: 404 }
      )
    }

    await prisma.crmFunction.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[DELETE /api/functions]", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete function" },
      { status: 500 }
    )
  }
}
