import { prisma } from "@/lib/db"
import type { FieldDefinition } from "@/lib/types"

export class ExportProcessor {
  private formId: string
  private fields: FieldDefinition[]

  constructor(formId: string, fields: FieldDefinition[]) {
    this.formId = formId
    this.fields = fields
  }

  async generateExportData(): Promise<Array<Record<string, any>>> {
    // Fetch all records for the form
    const records = await prisma.record.findMany({
      where: { formId: this.formId },
      orderBy: { createdAt: "desc" },
    })

    // Transform records to export format
    const exportData = await Promise.all(
      records.map(async (record) => {
        const data = record.data as Record<string, any>
        const row: Record<string, any> = {}

        for (const field of this.fields) {
          const value = data[field.name]

          // Resolve lookup fields to display values
          if (field.fieldType === "LOOKUP" && value && field.lookupFormId) {
            const lookupRecord = await prisma.record.findUnique({
              where: { id: value },
            })

            if (lookupRecord) {
              const lookupData = lookupRecord.data as Record<string, any>
              // Use first display field or fallback to ID
              const displayField = field.lookupDisplayFields[0] || "id"
              row[field.label] = lookupData[displayField] || value
            } else {
              row[field.label] = value
            }
          }
          // Resolve picklist to labels
          else if (field.fieldType === "PICKLIST" && value && field.picklistOptions) {
            const option = field.picklistOptions.find((opt: any) => opt.value === value)
            row[field.label] = option?.label || value
          }
          // Format multi-picklist
          else if (field.fieldType === "MULTI_PICKLIST" && Array.isArray(value) && field.picklistOptions) {
            const labels = value.map((v) => {
              const option = field.picklistOptions?.find((opt: any) => opt.value === v)
              return option?.label || v
            })
            row[field.label] = labels.join(", ")
          }
          // Format dates
          else if (field.fieldType === "DATE" && value) {
            row[field.label] = new Date(value).toLocaleDateString()
          }
          // Format datetimes
          else if (field.fieldType === "DATETIME" && value) {
            row[field.label] = new Date(value).toLocaleString()
          }
          // Format booleans
          else if (field.fieldType === "BOOLEAN") {
            row[field.label] = value ? "Yes" : "No"
          }
          // Default
          else {
            row[field.label] = value !== null && value !== undefined ? value : ""
          }
        }

        return row
      }),
    )

    return exportData
  }

  generateCSV(data: Array<Record<string, any>>): string {
    if (data.length === 0) return ""

    const headers = Object.keys(data[0])
    const csvLines = [headers.join(",")]

    for (const row of data) {
      const values = headers.map((header) => {
        const value = row[header]
        // Escape commas and quotes
        const stringValue = String(value !== null && value !== undefined ? value : "")
        return `"${stringValue.replace(/"/g, '""')}"`
      })
      csvLines.push(values.join(","))
    }

    return csvLines.join("\n")
  }

  // For XLSX, you would use a library like xlsx or exceljs
  // This is a placeholder for the implementation
  async generateXLSX(data: Array<Record<string, any>>): Promise<Buffer> {
    // In production, use a library like 'xlsx' or 'exceljs'
    // For now, return CSV as buffer
    const csv = this.generateCSV(data)
    return Buffer.from(csv, "utf-8")
  }
}
