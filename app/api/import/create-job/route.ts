import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateSession } from "@/lib/auth" // Your existing session validator

// Reusable audit log helper with organizationId support
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
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        performedBy,
        action,
        module: "Data Import",
        recordId: recordId || null,
        recordName: recordName || null,
        details: details || null,
        ipAddress,
        userAgent,
      },
    })
    console.log(`Audit log: ${action} by ${performedBy} (Import Job ${recordId})`)
  } catch (error) {
    console.error("Failed to create audit log for import:", error)
    // Never break the main flow
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[CREATE-JOB] POST handler invoked")

    // === 1. Authenticate user ===
    const token = request.cookies.get("auth-token")?.value
    if (!token) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const session = await validateSession(token)
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Invalid session" }, { status: 401 })
    }

    const userId = session.user.id

    // Fetch user with organizationId and email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, organizationId: true },
    })

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    if (!user.organizationId) {
      return NextResponse.json(
        { success: false, error: "User not associated with any organization" },
        { status: 403 }
      )
    }

    // === 2. Capture request metadata ===
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    // === 3. Parse and validate body ===
    let body
    try {
      const bodyText = await request.text()
      console.log("[CREATE-JOB] Request body text:", bodyText.substring(0, 200))
      body = JSON.parse(bodyText)
    } catch (parseError) {
      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        performedBy: user.email,
        action: "Import Create Failed",
        details: "Invalid JSON in request body",
        ipAddress,
        userAgent,
      })

      return NextResponse.json(
        { success: false, error: "Invalid JSON format" },
        { status: 400 }
      )
    }

    const {
      moduleId,
      formId,
      fileName,
      fileSize,
      duplicateHandling = "insert",
      importOptions = {},
    } = body

    if (!moduleId || !formId || !fileName) {
      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        performedBy: user.email,
        action: "Import Create Failed",
        details: "Missing required fields: moduleId, formId, or fileName",
        ipAddress,
        userAgent,
      })

      return NextResponse.json(
        { success: false, error: "Missing required fields: moduleId, formId, fileName" },
        { status: 400 }
      )
    }

    // === 4. Map duplicate handling ===
    const handlingMap: Record<string, "INSERT_ONLY" | "UPDATE_ONLY" | "UPSERT"> = {
      insert: "INSERT_ONLY",
      update: "UPDATE_ONLY",
      upsert: "UPSERT",
    }

    const normalizedHandling = handlingMap[duplicateHandling.toLowerCase()] || "INSERT_ONLY"

    // === 5. Create the import job ===
    console.log("[CREATE-JOB] Creating import job in database...")
    const job = await prisma.importJob.create({
      data: {
        moduleId,
        formId,
        fileName,
        fileSize: fileSize || 0,
        duplicateHandling: normalizedHandling,
        enableWorkflows: importOptions.enableWorkflows ?? false,
        enableValidation: importOptions.enableValidation ?? true,
        enableApprovals: importOptions.enableApprovals ?? false,
        status: "PENDING",
      },
    })

    console.log("[CREATE-JOB] Job created successfully:", job.id)

    // === 6. Log successful audit entry ===
    await logAudit({
      userId: user.id,
      organizationId: user.organizationId,
      performedBy: user.email,
      action: "Import Started",
      details: `Import job created for file "${fileName}" (${fileSize ? `${fileSize} bytes` : 'unknown size'}) | Handling: ${normalizedHandling} | Form ID: ${formId}`,
      ipAddress,
      userAgent,
      recordId: job.id,
      recordName: fileName,
    })

    // === 7. Return success ===
    return NextResponse.json(
      {
        success: true,
        message: "Import job created successfully",
        importJobId: job.id,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[CREATE-JOB] Unexpected error:", error)

    // Best-effort audit log on failure
    const ipAddress = request.headers.get("x-forwarded-for") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    const token = request.cookies.get("auth-token")?.value
    if (token) {
      try {
        const session = await validateSession(token)
        if (session?.user?.id) {
          const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { email: true, organizationId: true },
          })
          if (user) {
            await logAudit({
              userId: session.user.id,
              organizationId: user.organizationId,
              performedBy: user.email,
              action: "Import Create Failed",
              details: `Server error: ${error.message}`,
              ipAddress,
              userAgent,
              recordId: null,
              recordName: null,
            })
          }
        }
      } catch (_) {
        // Ignore secondary errors
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create import job",
        details: error.message,
      },
      { status: 500 }
    )
  }
}