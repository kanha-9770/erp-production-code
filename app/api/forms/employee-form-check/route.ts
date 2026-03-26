import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    // Optional: exclude a specific form from the check (used when editing an existing employee form)
    const excludeFormId = request.nextUrl.searchParams.get("excludeFormId")

    // Find employee form scoped to the user's organization
    // Form → FormModule → organizationId
    const employeeForm = await prisma.form.findFirst({
      where: {
        isEmployeeForm: true,
        ...(excludeFormId ? { id: { not: excludeFormId } } : {}),
        module: {
          organizationId: user.organizationId,
        },
      },
      select: { id: true, name: true, moduleId: true },
    })

    return NextResponse.json({
      success: true,
      exists: !!employeeForm,
      formId: employeeForm?.id || null,
      formName: employeeForm?.name || null,
    })
  } catch (error: any) {
    console.error("Error checking employee form:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
