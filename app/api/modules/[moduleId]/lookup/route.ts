import { NextResponse } from "next/server"
import { NextRequest } from "next/server"
import { DatabaseService } from "@/lib/database-service"
import { AuthMiddleware } from "@/lib/auth-middleware"

export async function GET(request: NextRequest, { params }: { params: { moduleId: string } }) {
  try {
    // Check user permissions for this module
    const authResult = await AuthMiddleware.checkPermission(
      request,
      "module",
      params.moduleId,
      "view"
    )

    if (!authResult.authorized) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.user ? 403 : 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    console.log(`[Module Lookup API] User ${authResult.user!.userEmail} accessing module: ${params.moduleId}, search: ${search}`)

    // Get the module and its forms
    const module = await DatabaseService.getModule(params.moduleId)
    if (!module) {
      return NextResponse.json({ success: false, error: "Module not found" }, { status: 404 })
    }

    // Collect all records from all forms in the module
    const allRecords: any[] = []

    for (const form of module.forms) {
      // Check if user has permission to view this form
      const hasFormPermission = AuthMiddleware.hasFormPermission(
        authResult.user!.permissions,
        params.moduleId,
        form.id,
        "view"
      )

      if (!hasFormPermission) {
        console.log(`[Module Lookup API] User ${authResult.user!.userEmail} skipping form ${form.id} - no permission`)
        continue
      }

      const records = await DatabaseService.getFormRecords(form.id)
      const formattedRecords = records.map((record) => ({
        id: record.id,
        value: record.id,
        label:
          record.recordData.name ||
          record.recordData.title ||
          record.recordData.email ||
          `Record ${record.id.slice(-8)}`,
        description: record.recordData.description || record.recordData.email || `From ${form.name}`,
        formId: form.id,
        formName: form.name,
        recordData: record.recordData,
        submittedAt: record.submittedAt,
      }))
      allRecords.push(...formattedRecords)
    }

    // Filter by search term if provided
    let filteredRecords = allRecords
    if (search) {
      const searchLower = search.toLowerCase()
      filteredRecords = allRecords.filter(
        (record) =>
          record.label.toLowerCase().includes(searchLower) ||
          record.description.toLowerCase().includes(searchLower) ||
          Object.values(record.recordData).some((value) => String(value).toLowerCase().includes(searchLower)),
      )
    }

    // Apply limit
    const limitedRecords = filteredRecords.slice(0, limit)

    console.log(`[Module Lookup API] Returning ${limitedRecords.length} records to user ${authResult.user!.userEmail}`)

    return NextResponse.json({
      success: true,
      data: limitedRecords,
      total: filteredRecords.length,
      limit: limit,
    })
  } catch (error: any) {
    console.error("Error in module lookup API:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch module lookup data",
      },
      { status: 500 },
    )
  }
}