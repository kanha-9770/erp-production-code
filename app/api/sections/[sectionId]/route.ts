export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function PUT(request: Request, { params }: { params: { sectionId: string } }) {
  try {
    const body = await request.json()

    const section = await DatabaseService.updateSection(params.sectionId, {
      title: body.title,
      description: body.description,
      columns: body.columns,
      order: body.order,
      visible: body.visible,
      collapsible: body.collapsible,
      collapsed: body.collapsed,
      conditional: body.conditional,
      styling: body.styling,
    })

    return NextResponse.json({ success: true, data: section })
  } catch (error: any) {
    console.error("Error updating section:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: { sectionId: string } }) {
  try {
    // Delete section with complete cleanup (fields + records)
    await DatabaseService.deleteSectionWithCleanup(params.sectionId)

    return NextResponse.json({ success: true, message: "Section and associated data deleted successfully" })
  } catch (error: any) {
    console.error("Error deleting section:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function GET(request: Request, { params }: { params: { sectionId: string } }) {
  try {
    // This could be used to get a specific section if needed
    return NextResponse.json({ success: true, data: null })
  } catch (error: any) {
    console.error("Error fetching section:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
