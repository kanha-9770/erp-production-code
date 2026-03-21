import { type NextRequest, NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database/database-service"

export async function GET(request: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const { formId } = params

    // Get enhanced linked records with detailed information
    const linkedRecords = await DatabaseService.getLinkedRecords(formId)

    return NextResponse.json({
      success: true,
      linkedForms: linkedRecords.linkedForms,
    })
  } catch (error: any) {
    console.error("Error fetching linked records:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch linked records",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
        linkedForms: [],
      },
      { status: 500 },
    )
  }
}
