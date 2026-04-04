import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser, getRequestMeta, logAudit } from "@/lib/api-helpers"

export async function POST(request: NextRequest) {
  try {
    // === 1. Authenticate user ===
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    if (!user.organizationId) {
      return NextResponse.json(
        { success: false, error: "User not associated with any organization" },
        { status: 403 }
      )
    }

    // === 2. Capture request metadata ===
    const { ipAddress, userAgent } = getRequestMeta(request)

    // === 3. Parse and validate body ===
    let body
    try {
      const bodyText = await request.text()
      body = JSON.parse(bodyText)
    } catch (parseError) {
      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        performedBy: user.email,
        action: "Import Create Failed",
        module: "Data Import",
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
      totalRows,
      duplicateHandling = "insert",
      importOptions = {},
    } = body

    if (!moduleId || !formId || !fileName) {
      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        performedBy: user.email,
        action: "Import Create Failed",
        module: "Data Import",
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
    const job = await prisma.importJob.create({
      data: {
        moduleId,
        formId,
        fileName,
        fileSize: fileSize || 0,
        duplicateHandling: normalizedHandling,
        totalRows: totalRows || 0,
        enableWorkflows: importOptions.enableWorkflows ?? false,
        enableValidation: importOptions.enableValidation ?? true,
        enableApprovals: importOptions.enableApprovals ?? false,
        status: "PENDING",
      },
    })

    // === 6. Log successful audit entry ===
    await logAudit({
      userId: user.id,
      organizationId: user.organizationId,
      performedBy: user.email,
      action: "Import Started",
      module: "Data Import",
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

    const { ipAddress, userAgent } = getRequestMeta(request)
    const user = await getAuthenticatedUser(request)

    if (user) {
      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        performedBy: user.email,
        action: "Import Create Failed",
        module: "Data Import",
        details: `Server error: ${error.message}`,
        ipAddress,
        userAgent,
      })
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
