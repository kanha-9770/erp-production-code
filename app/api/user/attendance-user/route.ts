export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server"
import { validateSession } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const session = await validateSession(token)
    console.log("this is the session data", session)

    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        first_name: session.user.first_name,
        last_name: session.user.last_name,
        email_verified: session.user.email_verified,
        status: session.user.status,
        createdAt: session.user.createdAt,
        mobile: session.user.mobile,
        mobile_verified: session.user.mobile_verified,
        avatar: session.user.avatar,
        department: session.user.department,
        phone: session.user.phone,
        location: session.user.location,
        joinDate: session.user.joinDate,
        organization: session.user.organization
          ? {
              id: session.user.organization.id,
              name: session.user.organization.name,
            }
          : null,
        unitAssignments: session.user.unitAssignments.map((ua) => ({
          unit: {
            id: ua.unit.id,
            name: ua.unit.name,
          },
          role: {
            id: ua.role.id,
            name: ua.role.name,
          },
          notes: ua.notes,
        })),
        employee: session.user.employee
          ? {
              employeeName: session.user.employee.employeeName,
              gender: session.user.employee.gender,
              department: session.user.employee.department,
              designation: session.user.employee.designation,
              dob: session.user.employee.dob,
              nativePlace: session.user.employee.nativePlace,
              country: session.user.employee.country,
              permanentAddress: session.user.employee.permanentAddress,
              currentAddress: session.user.employee.currentAddress,
              personalContact: session.user.employee.personalContact,
              alternateNo1: session.user.employee.alternateNo1,
              alternateNo2: session.user.employee.alternateNo2,
              emailAddress1: session.user.employee.emailAddress1,
              emailAddress2: session.user.employee.emailAddress2,
              aadharCardNo: session.user.employee.aadharCardNo,
              bankName: session.user.employee.bankName,
              bankAccountNo: session.user.employee.bankAccountNo,
              ifscCode: session.user.employee.ifscCode,
              status: session.user.employee.status,
              shiftType: session.user.employee.shiftType,
              inTime: session.user.employee.inTime,
              outTime: session.user.employee.outTime,
              dateOfJoining: session.user.employee.dateOfJoining,
              dateOfLeaving: session.user.employee.dateOfLeaving,
              incrementMonth: session.user.employee.incrementMonth,
              yearsOfAgreement: session.user.employee.yearsOfAgreement,
              bonusAfterYears: session.user.employee.bonusAfterYears,
              companyName: session.user.employee.companyName,
              totalSalary: session.user.employee.totalSalary
                ? Number.parseFloat(session.user.employee.totalSalary)
                : null,
              givenSalary: session.user.employee.givenSalary
                ? Number.parseFloat(session.user.employee.givenSalary)
                : null,
              bonusAmount: session.user.employee.bonusAmount
                ? Number.parseFloat(session.user.employee.bonusAmount)
                : null,
              nightAllowance: session.user.employee.nightAllowance
                ? Number.parseFloat(session.user.employee.nightAllowance)
                : null,
              overTime: session.user.employee.overTime ? Number.parseFloat(session.user.employee.overTime) : null,
              oneHourExtra: session.user.employee.oneHourExtra
                ? Number.parseFloat(session.user.employee.oneHourExtra)
                : null,
              companySimIssue: session.user.employee.companySimIssue,
            }
          : null,
      },
    })
  } catch (error) {
    console.error("Get user error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
