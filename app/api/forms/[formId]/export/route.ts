import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function GET(request: Request, { params }: { params: { formId: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format") || "csv"

    // Get form with records
    const form = await DatabaseService.getForm(params.formId)
    if (!form) {
      return NextResponse.json({ success: false, error: "Form not found" }, { status: 404 })
    }

    const records = await DatabaseService.getFormRecords(params.formId)

    if (format === "json") {
      // Export as JSON
      const exportData = {
        form: {
          id: form.id,
          name: form.name,
          description: form.description,
          exportedAt: new Date().toISOString(),
        },
        records: records.map((record) => ({
          id: record.id,
          data: record.recordData,
          submittedBy: record.submittedBy,
          submittedAt: record.submittedAt,
        })),
        totalRecords: records.length,
      }

      return NextResponse.json(exportData, {
        headers: {
          "Content-Disposition": `attachment; filename="${form.name}_export.json"`,
        },
      })
    } else {
      // Export as CSV
      if (records.length === 0) {
        return new NextResponse("No records to export", {
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${form.name}_export.csv"`,
          },
        })
      }

      // Get all unique keys from all records
      const allKeys = new Set<string>()
      records.forEach((record) => {
        Object.keys(record.recordData as any).forEach((key) => allKeys.add(key))
      })

      // Add system fields
      allKeys.add("Record ID")
      allKeys.add("Submitted By")
      allKeys.add("Submitted At")

      const headers = Array.from(allKeys)
      const csvRows = [headers.join(",")]

      // Add data rows
      records.forEach((record) => {
        const recordData = record.recordData as any
        const row = headers.map((header) => {
          let value = ""

          if (header === "Record ID") {
            value = record.id
          } else if (header === "Submitted By") {
            value = record.submittedBy || ""
          } else if (header === "Submitted At") {
            value = record.submittedAt?.toISOString() || ""
          } else {
            const fieldValue = recordData[header]

            // Handle lookup values (objects with label/value)
            if (fieldValue && typeof fieldValue === "object") {
              if (Array.isArray(fieldValue)) {
                // Multi-select lookup
                value = fieldValue.map((item) => item.label || item.value || item).join("; ")
              } else if (fieldValue.label) {
                // Single lookup
                value = fieldValue.label
              } else {
                value = JSON.stringify(fieldValue)
              }
            } else {
              value = String(fieldValue || "")
            }
          }

          // Escape CSV values
          if (value.includes(",") || value.includes('"') || value.includes("\n")) {
            value = `"${value.replace(/"/g, '""')}"`
          }

          return value
        })

        csvRows.push(row.join(","))
      })

      const csvContent = csvRows.join("\n")

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${form.name}_export.csv"`,
        },
      })
    }
  } catch (error: any) {
    console.error("Error exporting form data:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to export form data",
      },
      { status: 500 },
    )
  }
}
