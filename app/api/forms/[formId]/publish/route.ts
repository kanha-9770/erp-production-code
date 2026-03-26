import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database/database-service"

export async function POST(request: Request, { params }: { params: { formId: string } }) {
  try {
    let body: any = {}

    // ✅ Safe body parsing (prevents crash on empty body)
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    // ✅ HANDLE UNPUBLISH FIRST (CRITICAL)
    if (body?.unpublish === true) {
      const form = await DatabaseService.unpublishForm(params.formId)
      return NextResponse.json({ success: true, data: form })
    }

    const {
      allowAnonymous,
      requireLogin,
      maxSubmissions,
      submissionMessage,
    } = body

    // ✅ VALIDATION (correct place)
    if (allowAnonymous === true && requireLogin === true) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot enable both anonymous submissions and require login.",
        },
        { status: 400 }
      )
    }

    // ✅ NORMAL PUBLISH FLOW
    const form = await DatabaseService.publishForm(params.formId, {
      allowAnonymous: allowAnonymous ?? true,
      requireLogin: requireLogin ?? false,
      maxSubmissions: maxSubmissions || null,
      submissionMessage:
        submissionMessage || "Thank you for your submission!",
    })

    return NextResponse.json({ success: true, data: form })
  } catch (error: any) {
    console.error("Error publishing/unpublishing form:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}