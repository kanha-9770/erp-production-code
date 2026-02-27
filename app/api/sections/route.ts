export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const section = await DatabaseService.createSection({
      formId: body.formId,
      title: body.title,
      description: body.description,
      columns: body.columns,
      order: body.order,
    })

    return NextResponse.json({ success: true, data: section })
  } catch (error: any) {
    console.error("Error creating section:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    // This could be used to get all sections if needed
    return NextResponse.json({ success: true, data: [] })
  } catch (error: any) {
    console.error("Error fetching sections:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
