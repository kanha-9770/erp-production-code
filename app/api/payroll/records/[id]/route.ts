import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

// PATCH - Update payroll record
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = await validateSession(token);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    // Check if user is admin
    const isAdmin = session.unitAssignments?.some((ua: any) =>
      ua.role.name.toLowerCase().includes("admin")
    );

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const { id } = params;
    const body = await request.json();

    // Parse the ID to get employeeId, month, year
    const [employeeId, month, year] = id.split("-");

    if (!employeeId || !month || !year) {
      return NextResponse.json(
        { success: false, error: "Invalid record ID format" },
        { status: 400 }
      );
    }

    // Validate the update data
    const updateData: any = {
      processedBy: session.user.id,
      processedAt: new Date(),
    };

    if (body.presentDays !== undefined)
      updateData.presentDays = Number.parseInt(body.presentDays);
    if (body.leaveDays !== undefined)
      updateData.leaveDays = Number.parseFloat(body.leaveDays);
    if (body.grossSalary !== undefined)
      updateData.grossSalary = Number.parseFloat(body.grossSalary);
    if (body.deductions !== undefined)
      updateData.deductions = Number.parseFloat(body.deductions);
    if (body.status !== undefined) updateData.status = body.status;

    // Recalculate net salary if gross salary or deductions changed
    if (body.grossSalary !== undefined || body.deductions !== undefined) {
      const currentRecord = await prisma.payrollRecord.findUnique({
        where: {
          employeeId_month_year: {
            employeeId,
            month: Number.parseInt(month),
            year: Number.parseInt(year),
          },
        },
      });

      if (currentRecord) {
        const newGrossSalary =
          body.grossSalary !== undefined
            ? Number.parseFloat(body.grossSalary)
            : currentRecord.grossSalary;
        const newDeductions =
          body.deductions !== undefined
            ? Number.parseFloat(body.deductions)
            : currentRecord.deductions;
        updateData.netSalary = newGrossSalary - newDeductions;
        updateData.baseSalary = newGrossSalary;
      }
    }

    // Update or create the payroll record
    const updatedRecord = await prisma.payrollRecord.upsert({
      where: {
        employeeId_month_year: {
          employeeId,
          month: Number.parseInt(month),
          year: Number.parseInt(year),
        },
      },
      update: updateData,
      create: {
        employeeId,
        month: Number.parseInt(month),
        year: Number.parseInt(year),
        presentDays: body.presentDays || 0,
        leaveDays: body.leaveDays || 0,
        grossSalary: body.grossSalary || 0,
        deductions: body.deductions || 0,
        netSalary: (body.grossSalary || 0) - (body.deductions || 0),
        baseSalary: body.grossSalary || 0,
        status: body.status || "pending",
        processedBy: session.user.id,
        processedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedRecord,
      message: "Payroll record updated successfully",
    });
  } catch (error) {
    console.error("[v0] Error updating payroll record:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update payroll record" },
      { status: 500 }
    );
  }
}

// DELETE - Delete payroll record
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = await validateSession(token);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    // Check if user is admin
    const isAdmin = session.unitAssignments?.some((ua: any) =>
      ua.role.name.toLowerCase().includes("admin")
    );

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const { id } = params;

    // Parse the ID to get employeeId, month, year
    const [employeeId, month, year] = id.split("-");

    if (!employeeId || !month || !year) {
      return NextResponse.json(
        { success: false, error: "Invalid record ID format" },
        { status: 400 }
      );
    }

    // Delete the payroll record
    await prisma.payrollRecord.delete({
      where: {
        employeeId_month_year: {
          employeeId,
          month: Number.parseInt(month),
          year: Number.parseInt(year),
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Payroll record deleted successfully",
    });
  } catch (error) {
    console.error("[v0] Error deleting payroll record:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete payroll record" },
      { status: 500 }
    );
  }
}
