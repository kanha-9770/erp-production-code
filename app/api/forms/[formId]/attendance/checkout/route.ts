import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest, props: { params: Promise<{ formId: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json()
    const { employeeId, checkOutTime, date, location, deviceInfo, workingHours } = body

    if (!employeeId || !checkOutTime || !date) {
      return NextResponse.json(
        { success: false, error: "Employee ID, check-out time, and date are required" },
        { status: 400 }
      )
    }

    const formId = params.formId

    // RULE 2: Check if employee has checked in today
    const statusResponse = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || request.nextUrl.origin}/api/forms/${formId}/attendance/status?employeeId=${employeeId}&date=${date}`,
      { headers: request.headers }
    )

    if (!statusResponse.ok) {
      throw new Error("Failed to fetch attendance status")
    }

    const statusData = await statusResponse.json()

    // RULE 2: Block check-out without check-in
    if (!statusData.hasCheckedIn) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot check out without checking in first",
        },
        { status: 400 }
      )
    }

    // RULE 2: Block multiple check-outs
    if (statusData.hasCheckedOut) {
      return NextResponse.json(
        {
          success: false,
          error: "Employee has already checked out today",
        },
        { status: 400 }
      )
    }

    // Update the existing record with check-out information
    const recordId = statusData.recordId

    // Fetch the existing record
    const recordResponse = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || request.nextUrl.origin}/api/forms/${formId}/records`,
      { headers: request.headers }
    )

    if (!recordResponse.ok) {
      throw new Error("Failed to fetch record")
    }

    const recordsData = await recordResponse.json()
    const existingRecord = recordsData.records.find((r: any) => r.id === recordId)

    if (!existingRecord) {
      throw new Error("Attendance record not found")
    }

    // Update record with check-out data and working hours (RULE 3)
    const updatedRecordData = {
      ...existingRecord.recordData,
      checkOutTime: { value: checkOutTime, type: "datetime", label: "Check-Out Time" },
      location: { value: `${existingRecord.recordData.location?.value || ""} | ${location}`, type: "text", label: "Location" },
      deviceInfo: { value: deviceInfo, type: "text", label: "Device Info (Check-Out)" },
      workingHours: { value: workingHours.toFixed(2), type: "number", label: "Working Hours" },
      checkedOut: { value: true, type: "checkbox", label: "Checked Out" },
    }

    const updateResponse = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || request.nextUrl.origin}/api/forms/${formId}/records/${recordId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recordData: updatedRecordData,
          submittedBy: employeeId,
          status: existingRecord.status || "submitted",
        }),
      }
    )

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json()
      throw new Error(errorData.error || "Failed to update check-out record")
    }

    const result = await updateResponse.json()

    return NextResponse.json({
      success: true,
      message: "Check-out recorded successfully",
      workingHours,
      recordId,
    })
  } catch (error: any) {
    console.error("Error recording check-out:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to record check-out",
      },
      { status: 500 }
    )
  }
}
