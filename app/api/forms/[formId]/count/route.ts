import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function GET(request: Request, { params }: { params: { formId: string } }) {
  try {
    const count = await DatabaseService.getFormSubmissionCount(params.formId, undefined)
    return NextResponse.json({ success: true, data: { count } })
  } catch (error: any) {
    console.error("Error fetching form submission count:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
