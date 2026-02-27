import { NextRequest, NextResponse } from "next/server"

export async function POST(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    const body = await request.json()
    const { employeeId, employeeName, checkInTime, date, location, deviceInfo } = body

    if (!employeeId || !checkInTime || !date) {
      return NextResponse.json(
        { success: false, error: "Employee ID, check-in time, and date are required" },
        { status: 400 }
      )
    }

    const formId = params.formId

    // RULE 1: Check if employee has already checked in today
    const statusResponse = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || request.nextUrl.origin}/api/forms/${formId}/attendance/status?employeeId=${employeeId}&date=${date}`,
      { headers: request.headers }
    )

    if (statusResponse.ok) {
      const statusData = await statusResponse.json()
      if (statusData.hasCheckedIn) {
        return NextResponse.json(
          {
            success: false,
            error: "Employee has already checked in today",
          },
          { status: 400 }
        )
      }
    }

    // Create attendance record with check-in data
    const recordData = {
      employeeId: { value: employeeId, type: "text", label: "Employee ID" },
      employeeName: { value: employeeName, type: "text", label: "Employee Name" },
      date: { value: date, type: "date", label: "Date" },
      checkInTime: { value: checkInTime, type: "datetime", label: "Check-In Time" },
      location: { value: location, type: "text", label: "Location" },
      deviceInfo: { value: deviceInfo, type: "text", label: "Device Info" },
      checkOutTime: { value: null, type: "datetime", label: "Check-Out Time" },
      workingHours: { value: null, type: "number", label: "Working Hours" },
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || request.nextUrl.origin}/api/forms/${formId}/records`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recordData,
          submittedBy: employeeId,
          status: "submitted",
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to create check-in record")
    }

    const result = await response.json()

    return NextResponse.json({
      success: true,
      message: "Check-in recorded successfully",
      recordId: result.recordId,
    })
  } catch (error: any) {
    console.error("Error recording check-in:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to record check-in",
      },
      { status: 500 }
    )
  }
}

