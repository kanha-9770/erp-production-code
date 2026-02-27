import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function GET() {
  try {
    const modules = await DatabaseService.getModuleHierarchy()
    return NextResponse.json({
      success: true,
      data: modules,
    })
  } catch (error: any) {
    console.error("API Error fetching module hierarchy:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch module hierarchy",
      },
      { status: 500 },
    )
  }
}
