import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    // Find the employee form across the entire organization
    const employeeForm = await prisma.form.findFirst({
      where: { isEmployeeForm: true },
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
