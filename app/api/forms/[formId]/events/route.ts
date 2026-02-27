import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function POST(request: Request, { params }: { params: { formId: string } }) {
  try {
    const body = await request.json()
    const { eventType, payload } = body

    // Get client info
    const userAgent = request.headers.get("user-agent") || ""
    const forwarded = request.headers.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0] : "unknown"

    const event = await DatabaseService.trackFormEvent(
      params.formId,
      eventType,
      payload,
      undefined, // sessionId - could be implemented
      userAgent,
      ipAddress,
    )

    return NextResponse.json({ success: true, data: event })
  } catch (error: any) {
    console.error("Error tracking form event:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
