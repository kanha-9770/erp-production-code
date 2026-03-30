export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const rules = await prisma.routePermission.findMany({
      where: { organizationId: authUser.organizationId },
      orderBy: { pattern: "asc" },
      include: {
        roleAccess: { select: { roleId: true, granted: true } },
        userAccess: { select: { userId: true, granted: true } },
      },
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (error) {
    console.error("[GET /api/route-permissions]", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch route permissions" },
      { status: 500 }
    )
  }
}

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
    const { pattern, description, redirectTo } = body

    if (!pattern || typeof pattern !== "string") {
      return NextResponse.json({ error: "Pattern is required" }, { status: 400 })
    }

    const rule = await prisma.routePermission.create({
      data: {
        pattern: pattern.trim(),
        description: description || null,
        redirectTo: redirectTo || null,
        organizationId: authUser.organizationId,
      },
      include: {
        roleAccess: { select: { roleId: true, granted: true } },
        userAccess: { select: { userId: true, granted: true } },
      },
    })

    return NextResponse.json({ success: true, data: rule }, { status: 201 })
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "A rule with this pattern already exists" },
        { status: 409 }
      )
    }
    console.error("[POST /api/route-permissions]", error)
    return NextResponse.json(
      { success: false, error: "Failed to create route permission" },
      { status: 500 }
    )
  }
}

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
    const { id, pattern, description, redirectTo } = body

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const existing = await prisma.routePermission.findFirst({
      where: { id, organizationId: authUser.organizationId },
    })
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 })
    }

    const rule = await prisma.routePermission.update({
      where: { id },
      data: {
        pattern: pattern?.trim() ?? existing.pattern,
        description: description !== undefined ? description || null : existing.description,
        redirectTo: redirectTo !== undefined ? redirectTo || null : existing.redirectTo,
      },
      include: {
        roleAccess: { select: { roleId: true, granted: true } },
        userAccess: { select: { userId: true, granted: true } },
      },
    })

    return NextResponse.json({ success: true, data: rule })
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "A rule with this pattern already exists" },
        { status: 409 }
      )
    }
    console.error("[PUT /api/route-permissions]", error)
    return NextResponse.json(
      { success: false, error: "Failed to update route permission" },
      { status: 500 }
    )
  }
}

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
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const existing = await prisma.routePermission.findFirst({
      where: { id, organizationId: authUser.organizationId },
    })
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 })
    }

    await prisma.routePermission.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[DELETE /api/route-permissions]", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete route permission" },
      { status: 500 }
    )
  }
}
