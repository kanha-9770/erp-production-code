import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get("employeeId")
    const date = searchParams.get("date") // Format: YYYY-MM-DD

    if (!employeeId || !date) {
      return NextResponse.json(
        { success: false, error: "Employee ID and date are required" },
        { status: 400 }
      )
    }

    const formId = params.formId

    // Fetch attendance records for the employee on the specified date
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || ""}/api/forms/${formId}/records`
    )

    if (!response.ok) {
      throw new Error("Failed to fetch records")
    }

    const data = await response.json()

    if (!data.success || !data.records) {
      return NextResponse.json({
        success: true,
        hasCheckedIn: false,
        hasCheckedOut: false,
      })
    }

    // Filter records for the specific employee and date
    const todayRecords = data.records.filter((record: any) => {
      const recordDate = record.recordData?.date?.value || record.recordData?.attendance_date?.value
      const recordEmployeeId = record.recordData?.employeeId?.value || record.recordData?.employee_id?.value
      
      return recordEmployeeId === employeeId && recordDate === date
    })

    if (todayRecords.length === 0) {
      return NextResponse.json({
        success: true,
        hasCheckedIn: false,
        hasCheckedOut: false,
      })
    }

    // Get the latest record for today
    const latestRecord = todayRecords[todayRecords.length - 1]
    const checkInTime = latestRecord.recordData?.checkInTime?.value || latestRecord.recordData?.check_in_time?.value
    const checkOutTime = latestRecord.recordData?.checkOutTime?.value || latestRecord.recordData?.check_out_time?.value
    const workingHours = latestRecord.recordData?.workingHours?.value || latestRecord.recordData?.working_hours?.value
    const location = latestRecord.recordData?.location?.value
    const deviceInfo = latestRecord.recordData?.deviceInfo?.value || latestRecord.recordData?.device_info?.value

    return NextResponse.json({
      success: true,
      hasCheckedIn: !!checkInTime,
      hasCheckedOut: !!checkOutTime,
      checkInTime,
      checkOutTime,
      workingHours: workingHours ? parseFloat(workingHours) : undefined,
      location,
      deviceInfo,
      recordId: latestRecord.id,
    })
  } catch (error: any) {
    console.error("Error fetching attendance status:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch attendance status",
      },
      { status: 500 }
    )
  }
}
