import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { getEmployeesFromDB } from "@/lib/utils/payroll-store";
import { moveToTrash } from "@/lib/trash";

// Confirm that an employeeId belongs to the caller's org. PayrollRecord has
// no organization_id column, so we fall back to checking the org's employee
// roster (read from form_hr_employee_master scoped to the org).
async function employeeBelongsToOrg(organizationId: string, employeeId: string): Promise<boolean> {
  const employees = await getEmployeesFromDB(organizationId);
  const target = String(employeeId).toLowerCase();
  return employees.some(
    (e) => String(e.employeeId).toLowerCase() === target ||
           (e.email && String(e.email).toLowerCase() === target),
  );
}

// PATCH - Update payroll record
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not a member of any organization" },
        { status: 403 }
      );
    }

    if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
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

    // Verify the employee belongs to the caller's org. Without this, an
    // admin in Org A could mutate Org B's payroll rows by guessing IDs.
    if (!(await employeeBelongsToOrg(authUser.organizationId, employeeId))) {
      return NextResponse.json(
        { success: false, error: "Payroll record not found in your organization" },
        { status: 404 }
      );
    }

    const updateData: any = {
      processedBy: authUser.id,
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
            : Number(currentRecord.grossSalary);
        const newDeductions =
          body.deductions !== undefined
            ? Number.parseFloat(body.deductions)
            : Number(currentRecord.deductions);
        updateData.netSalary = newGrossSalary - newDeductions;
        updateData.baseSalary = newGrossSalary;
      }
    }

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
        processedBy: authUser.id,
        processedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedRecord,
      message: "Payroll record updated successfully",
    });
  } catch (error) {
    console.error("[payroll] records[id] PATCH error:", error);
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
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not a member of any organization" },
        { status: 403 }
      );
    }

    if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const { id } = params;
    const [employeeId, month, year] = id.split("-");

    if (!employeeId || !month || !year) {
      return NextResponse.json(
        { success: false, error: "Invalid record ID format" },
        { status: 400 }
      );
    }

    // Same org check as PATCH: stop a cross-org delete by ID guess.
    if (!(await employeeBelongsToOrg(authUser.organizationId, employeeId))) {
      return NextResponse.json(
        { success: false, error: "Payroll record not found in your organization" },
        { status: 404 }
      );
    }

    // The trash helper keys off the primary `id`, so we look up the row's
    // cuid first via the composite (employeeId, month, year) unique key.
    const record = await prisma.payrollRecord.findUnique({
      where: {
        employeeId_month_year: {
          employeeId,
          month: Number.parseInt(month),
          year: Number.parseInt(year),
        },
      },
      select: { id: true },
    });
    if (!record) {
      return NextResponse.json(
        { success: false, error: "Payroll record not found" },
        { status: 404 }
      );
    }

    await moveToTrash("PayrollRecord", record.id, {
      userId: authUser.id,
      userName: authUser.email,
      organizationId: authUser.organizationId,
    });

    return NextResponse.json({
      success: true,
      message: "Payroll record moved to recycle bin",
    });
  } catch (error) {
    console.error("[payroll] records[id] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete payroll record" },
      { status: 500 }
    );
  }
}
