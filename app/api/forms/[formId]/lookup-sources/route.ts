import { type NextRequest, NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function GET(request: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const { formId } = params

    console.log("Fetching enhanced lookup sources for form:", formId)

    // Get enhanced lookup sources with detailed information
    const lookupSources = await DatabaseService.getLookupSources(formId)

    console.log(`Found ${lookupSources.sources.length} lookup sources`)

    return NextResponse.json({
      success: true,
      sources: lookupSources.sources,
    })
  } catch (error: any) {
    console.error("Error fetching lookup sources:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch lookup sources",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
        sources: [],
      },
      { status: 500 },
    )
  }
}
