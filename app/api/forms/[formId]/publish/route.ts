import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function POST(request: Request, { params }: { params: { formId: string } }) {
  try {
    const body = await request.json()
    const { allowAnonymous, requireLogin, maxSubmissions, submissionMessage } = body

    const form = await DatabaseService.publishForm(params.formId, {
      allowAnonymous: allowAnonymous ?? true,
      requireLogin: requireLogin ?? false,
      maxSubmissions: maxSubmissions || null,
      submissionMessage: submissionMessage || "Thank you for your submission!",
    })

    return NextResponse.json({ success: true, data: form })
  } catch (error: any) {
    console.error("Error publishing form:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: { formId: string } }) {
  try {
    const form = await DatabaseService.unpublishForm(params.formId)
    return NextResponse.json({ success: true, data: form })
  } catch (error: any) {
    console.error("Error unpublishing form:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
