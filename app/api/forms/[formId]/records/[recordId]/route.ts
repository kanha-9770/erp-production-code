import { type NextRequest, NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database/database-service"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import { moveToTrash } from "@/lib/trash"

export async function GET(
  request: NextRequest,
  { params }: { params: { formId: string; recordId: string } }
) {
  try {
    const { formId, recordId } = await params

    const record = await DatabaseService.getFormRecord(recordId)

    if (!record) {
      return NextResponse.json(
        {
          success: false,
          error: "Record not found",
        },
        { status: 404 }
      )
    }

    if (record.formId !== formId) {
      return NextResponse.json(
        {
          success: false,
          error: "Record does not belong to this form",
        },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: record,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch form record",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { formId: string; recordId: string } }
) {
  try {
    const { formId, recordId } = await params
    const body = await request.json()

    const { recordData, status, submittedBy } = body

    if (!recordData || typeof recordData !== "object" || Array.isArray(recordData)) {
      return NextResponse.json(
        {
          success: false,
          error: "Record data is required and must be a non-array object",
        },
        { status: 400 }
      )
    }

    const updatedRecord = await DatabaseService.updateFormRecord(recordId, {
      recordData,
      status: status ?? "submitted",
      submittedBy: submittedBy ?? "admin",
      updatedAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      data: updatedRecord,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update form record",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { formId: string; recordId: string } }
) {
  try {
    const { formId, recordId } = await params

    const record = await DatabaseService.getFormRecord(recordId)

    if (!record) {
      return NextResponse.json(
        {
          success: false,
          error: "Record not found",
        },
        { status: 404 }
      )
    }

    if (record.formId !== formId) {
      return NextResponse.json(
        {
          success: false,
          error: "Record does not belong to this form",
        },
        { status: 403 }
      )
    }

    const user = await getAuthenticatedUser(request)
    await moveToTrash("FormRecord", recordId, {
      userId: user?.id ?? null,
      userName: user?.email ?? null,
      organizationId: user?.organizationId ?? null,
    })

    return NextResponse.json({
      success: true,
      message: "Record moved to recycle bin",
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete form record",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
