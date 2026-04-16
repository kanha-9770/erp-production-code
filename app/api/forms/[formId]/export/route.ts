import { NextRequest, NextResponse } from "next/server"
import { exportFormRecords } from "@/lib/api-handlers/data-migration"
import { getAuthenticatedUser, hasFormPermission } from "@/lib/api-helpers"

export async function GET(request: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const allowed = await hasFormPermission(
      authUser.id,
      authUser.organizationId,
      params.formId,
      "EXPORT",
    )
    if (!allowed) {
      return NextResponse.json(
        { error: "You don't have permission to export this form" },
        { status: 403 },
      )
    }

    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format") || "csv"
    const fieldIds = searchParams.get("fields")?.split(",").filter(Boolean)

    const result = await exportFormRecords(params.formId, fieldIds)

    if (format === "json") {
      return NextResponse.json({
        form: { name: result.formName, exportedAt: new Date().toISOString() },
        headers: result.headers,
        records: result.rows,
        totalRecords: result.totalRecords,
      }, {
        headers: { "Content-Disposition": `attachment; filename="${result.formName}_export.json"` },
      })
    }

    // CSV
    if (result.rows.length === 0) {
      return new NextResponse("No records to export", {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${result.formName}_export.csv"`,
        },
      })
    }

    const csvRows = [result.headers.join(",")]
    for (const row of result.rows) {
      const values = result.headers.map((h) => {
        const val = String(row[h] ?? "")
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      })
      csvRows.push(values.join(","))
    }

    return new NextResponse(csvRows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${result.formName}_export.csv"`,
      },
    })
  } catch (error: any) {
    console.error("Error exporting form data:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to export" }, { status: 500 })
  }
}
