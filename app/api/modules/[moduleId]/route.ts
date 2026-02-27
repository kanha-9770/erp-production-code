import { NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/lib/database-service'
import { prisma } from '@/lib/prisma'
import { validateSession } from '@/lib/auth'

// Reusable audit log helper — now correctly includes organizationId
async function logAudit({
  userId,
  organizationId,
  performedBy,
  action,
  details,
  ipAddress,
  userAgent,
  recordId,
  recordName,
  module = "Form Modules",
}: {
  userId: string
  organizationId: string | null
  performedBy: string
  action: string
  details?: string
  ipAddress: string
  userAgent: string
  recordId?: string
  recordName?: string
  module?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        performedBy,
        action,
        module,
        recordId: recordId || null,
        recordName: recordName || null,
        details: details || null,
        ipAddress,
        userAgent,
      },
    })
    console.log(`Audit log: ${action} "${recordName || recordId}" by ${performedBy}`)
  } catch (err) {
    console.error("Failed to create audit log:", err)
  }
}

// Get authenticated user WITH organizationId
async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value
  if (!token) return null

  const session = await validateSession(token)
  if (!session || !session.user) return null

  // Fetch user with organizationId
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      organizationId: true,
    },
  })

  return user
}

// ──────────────────────────────────────────────────────────────
// GET: Fetch a single module
// ──────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  try {
    const module = await DatabaseService.getModule(params.moduleId)

    if (!module) {
      return NextResponse.json(
        { success: false, error: 'Module not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: module,
    })
  } catch (error: any) {
    console.error('Error fetching module:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch module' },
      { status: 500 }
    )
  }
}

// ──────────────────────────────────────────────────────────────
// PUT: Update a module (name, description, etc.)
// ──────────────────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    const data = await request.json()

    const oldModule = await DatabaseService.getModule(params.moduleId)
    if (!oldModule) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 })
    }

    const updatedModule = await DatabaseService.updateModule(params.moduleId, data)

    // Generate change summary
    const changes = Object.keys(data)
      .map((key) => `${key}: "${(oldModule as any)[key]}" → "${data[key]}"`)
      .join("; ") || "No changes detected"

    await logAudit({
      userId: user.id,
      organizationId: user.organizationId,
      performedBy: user.email,
      action: "Updated",
      details: `Module updated: ${changes}`,
      ipAddress,
      userAgent,
      recordId: params.moduleId,
      recordName: updatedModule.name,
    })

    return NextResponse.json({
      success: true,
      data: updatedModule,
    })
  } catch (error: any) {
    console.error('Error updating module:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update module' },
      { status: 500 }
    )
  }
}

// ──────────────────────────────────────────────────────────────
// DELETE: Delete a module
// ──────────────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    if (!params.moduleId) {
      return NextResponse.json({ error: "Module ID is required" }, { status: 400 })
    }

    const module = await DatabaseService.getModule(params.moduleId)
    if (!module) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 })
    }

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    await DatabaseService.deleteModule(params.moduleId)

    await logAudit({
      userId: user.id,
      organizationId: user.organizationId,
      performedBy: user.email,
      action: "Deleted",
      details: `Deleted module "${module.name}"`,
      ipAddress,
      userAgent,
      recordId: params.moduleId,
      recordName: module.name,
    })

    return NextResponse.json({
      success: true,
      message: "Module deleted successfully",
    })
  } catch (error: any) {
    console.error('Error deleting module:', error)

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"
    const user = await getAuthenticatedUser(request)

    if (user) {
      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        performedBy: user.email,
        action: "Delete Failed",
        details: `Failed to delete module "${params.moduleId}": ${error.message}`,
        ipAddress,
        userAgent,
        recordId: params.moduleId,
      })
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete module' },
      { status: 500 }
    )
  }
}

// ──────────────────────────────────────────────────────────────
// PATCH: Mainly used for moving/reparenting module (drag & drop)
// ──────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: { moduleId: string } }
) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user || !user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { moduleId } = params
    const body = await request.json()
    const { parentId } = body

    // Validation
    if (parentId !== null && typeof parentId !== 'string') {
      return NextResponse.json(
        { success: false, error: "Invalid parentId format" },
        { status: 400 }
      )
    }

    // Prevent self-parenting
    if (parentId === moduleId) {
      return NextResponse.json(
        { success: false, error: "Cannot move module to itself" },
        { status: 400 }
      )
    }

    // Check current module exists and belongs to the organization
    const existingModule = await prisma.formModule.findFirst({
      where: {
        id: moduleId,
        organizationId: user.organizationId,
      },
    })

    if (!existingModule) {
      return NextResponse.json(
        { success: false, error: "Module not found or access denied" },
        { status: 404 }
      )
    }

    // If new parent is provided → validate it
    if (parentId) {
      const parentExists = await prisma.formModule.findFirst({
        where: {
          id: parentId,
          organizationId: user.organizationId,
        },
      })

      if (!parentExists) {
        return NextResponse.json(
          { success: false, error: "Target parent module not found" },
          { status: 404 }
        )
      }

      // Basic cycle protection (prevent direct child → parent loop)
      const wouldCycle = await prisma.formModule.findFirst({
        where: {
          id: parentId,
          organizationId: user.organizationId,
          children: {
            some: { id: moduleId },
          },
        },
      })

      if (wouldCycle) {
        return NextResponse.json(
          { success: false, error: "Cannot create circular reference" },
          { status: 400 }
        )
      }
    }

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    // Perform the reparenting
    const updatedModule = await prisma.formModule.update({
      where: { id: moduleId },
      data: {
        parentId: parentId || null,
      },
      select: {
        id: true,
        name: true,
        parentId: true,
      },
    })

    // Log the move operation
    await logAudit({
      userId: user.id,
      organizationId: user.organizationId,
      performedBy: user.email,
      action: "Moved",
      details: `Module "${updatedModule.name}" moved to parent: ${parentId || 'root'}`,
      ipAddress,
      userAgent,
      recordId: moduleId,
      recordName: updatedModule.name,
    })

    return NextResponse.json({
      success: true,
      data: updatedModule,
    })
  } catch (error: any) {
    console.error("[PATCH] Error moving module:", error)

    return NextResponse.json(
      {
        success: false,
        error: "Failed to move module",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}