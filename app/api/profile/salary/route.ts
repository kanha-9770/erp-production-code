import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/profile/salary
 *
 * Returns the salary (payroll) history of the currently signed-in user.
 *
 * Lookup chain:
 *   1. user.id  →  Employee.userId  →  Employee.id
 *   2. Employee.id  →  PayrollRecord.employeeId  (sorted newest first)
 *
 * Users without a linked Employee record receive an empty list with a
 * descriptive `reason` field so the UI can render a friendly empty state
 * instead of looking like a load failure.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: authUser.id },
      select: {
        id: true,
        employeeName: true,
        totalSalary: true,
        givenSalary: true,
      },
    });

    if (!employee) {
      return NextResponse.json({
        success: true,
        records: [],
        employee: null,
        reason: "no-employee-record",
      });
    }

    const records = await prisma.payrollRecord.findMany({
      where: { employeeId: employee.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    // Decimal columns come back as Prisma.Decimal; the client wants plain
    // numbers so JSON.stringify doesn't drop them to strings.
    const toNum = (v: unknown) =>
      v == null ? 0 : Number((v as { toString(): string }).toString());

    return NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        name: employee.employeeName,
        totalSalary: toNum(employee.totalSalary),
        givenSalary: toNum(employee.givenSalary),
      },
      records: records.map((r) => ({
        id: r.id,
        month: r.month,
        year: r.year,
        presentDays: r.presentDays,
        leaveDays: toNum(r.leaveDays),
        halfDays: toNum(r.halfDays),
        shortLeaves: r.shortLeaves,
        overtimeHours: toNum(r.overtimeHours),
        baseSalary: toNum(r.baseSalary),
        grossSalary: toNum(r.grossSalary),
        deductions: toNum(r.deductions),
        netSalary: toNum(r.netSalary),
        allowances: r.allowances,
        deductionDetail: r.deductionDetail,
        status: r.status,
        processedAt: r.processedAt,
        paidAt: r.paidAt,
        notes: r.notes,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error("[profile/salary] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load salary records" },
      { status: 500 },
    );
  }
}
