import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { getEmployeesFromDB } from "@/lib/utils/payroll-store";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not a member of any organization" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const month = Number.parseInt(searchParams.get("month") || "0");
    const year = Number.parseInt(searchParams.get("year") || "0");

    if (!month || !year) {
      return NextResponse.json(
        { success: false, error: "Month and year are required" },
        { status: 400 }
      );
    }

    // Pull THIS org's active config — never another tenant's.
    const config = await prisma.payrollConfiguration.findFirst({
      where: { isActive: true, organizationId: authUser.organizationId },
      orderBy: { createdAt: "desc" },
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: "No active payroll configuration found" },
        { status: 404 }
      );
    }

    const attendanceFormIds = (config.attendanceFormIds as string[]) || [];
    const leaveFormIds = (config.leaveFormIds as string[]) || [];
    const attendanceFieldMappings =
      (config.attendanceFieldMappings as any) || {};
    const leaveFieldMappings = (config.leaveFieldMappings as any) || {};

    const allFormIds = [...new Set([...attendanceFormIds, ...leaveFormIds])];

    if (allFormIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          attendance: [],
          leave: [],
        },
        config: {
          attendanceFormIds: [],
          leaveFormIds: [],
          month,
          year,
        },
      });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Defence in depth: only consider forms that actually live under THIS
    // org's modules. A stale config that referenced another tenant's formId
    // would otherwise leak records.
    const forms = await prisma.form.findMany({
      where: {
        id: { in: allFormIds },
        module: { organizationId: authUser.organizationId },
      },
      include: {
        tableMapping: true,
      },
    });

    const records: any[] = [];

    for (const form of forms) {
      const tableName = form.tableMapping?.storageTable;

      if (!tableName) continue;

      const tableNumber = tableName.match(/\d+$/)?.[0];

      if (!tableNumber) continue;

      const tablePrismaKey = `formRecord${tableNumber}` as keyof typeof prisma;

      if (tablePrismaKey in prisma) {
        const formRecords = await (prisma[tablePrismaKey] as any).findMany({
          where: {
            formId: form.id,
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
        });

        records.push(
          ...formRecords.map((record: any) => ({
            ...record,
            formId: form.id,
            data: record.recordData,
          }))
        );
      }
    }

    const transformedAttendance: any[] = [];
    const transformedLeave: any[] = [];

    for (const record of records) {
      const data = record.data as any;

      if (attendanceFormIds.includes(record.formId)) {
        const mapping = attendanceFieldMappings[record.formId] || {};
        transformedAttendance.push({
          id: record.id,
          formId: record.formId,
          employee_id: data[mapping.employeeIdField],
          date: data[mapping.dateField],
          recordData: {
            overtime: data[mapping.overtimeField],
            checkIn: data[mapping.checkInField],
            checkOut: data[mapping.checkOutField],
          },
          createdAt: record.createdAt,
        });
      }

      if (leaveFormIds.includes(record.formId)) {
        const mapping = leaveFieldMappings[record.formId] || {};
        transformedLeave.push({
          id: record.id,
          formId: record.formId,
          employee_id: data[mapping.employeeIdField],
          date: data[mapping.dateField],
          recordData: {
            leaveType: data[mapping.typeField],
            type: data[mapping.typeField],
            duration: data[mapping.durationField],
            days: data[mapping.durationField],
            startDate: data[mapping.startDateField],
            endDate: data[mapping.endDateField],
          },
          createdAt: record.createdAt,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        attendance: transformedAttendance,
        leave: transformedLeave,
      },
      config: {
        attendanceFormIds,
        leaveFormIds,
        month,
        year,
      },
    });
  } catch (error) {
    console.error("[payroll] records GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch payroll records" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
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

    const body = await request.json();
    const {
      employeeId,
      month,
      year,
      presentDays,
      leaveDays,
      grossSalary,
      deductions,
      status,
    } = body;

    if (!employeeId || !month || !year) {
      return NextResponse.json(
        { success: false, error: "Employee ID, month, and year are required" },
        { status: 400 }
      );
    }

    // The employee being targeted must exist in THIS org's roster.
    // PayrollRecord lacks an organization_id column, so this runtime check is
    // the boundary that prevents an admin from writing into a peer tenant.
    const orgEmployees = await getEmployeesFromDB(authUser.organizationId);
    const target = String(employeeId).toLowerCase();
    const owned = orgEmployees.some(
      (e) => String(e.employeeId).toLowerCase() === target ||
             (e.email && String(e.email).toLowerCase() === target),
    );
    if (!owned) {
      return NextResponse.json(
        { success: false, error: "Employee not found in your organization" },
        { status: 404 }
      );
    }

    const netSalary = (grossSalary || 0) - (deductions || 0);

    const existingRecord = await prisma.payrollRecord.findUnique({
      where: {
        employeeId_month_year: {
          employeeId,
          month,
          year,
        },
      },
    });

    let payrollRecord;

    if (existingRecord) {
      payrollRecord = await prisma.payrollRecord.update({
        where: {
          employeeId_month_year: {
            employeeId,
            month,
            year,
          },
        },
        data: {
          presentDays: presentDays ?? existingRecord.presentDays,
          leaveDays: leaveDays ?? existingRecord.leaveDays,
          grossSalary: grossSalary ?? existingRecord.grossSalary,
          deductions: deductions ?? existingRecord.deductions,
          netSalary,
          status: status ?? existingRecord.status,
          baseSalary: grossSalary ?? existingRecord.baseSalary,
          processedBy: authUser.id,
          processedAt: new Date(),
        },
      });
    } else {
      payrollRecord = await prisma.payrollRecord.create({
        data: {
          employeeId,
          month,
          year,
          presentDays: presentDays || 0,
          leaveDays: leaveDays || 0,
          grossSalary: grossSalary || 0,
          deductions: deductions || 0,
          netSalary,
          baseSalary: grossSalary || 0,
          status: status || "pending",
          processedBy: authUser.id,
          processedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: payrollRecord,
      message: "Payroll record saved successfully",
    });
  } catch (error) {
    console.error("[payroll] records POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save payroll record" },
      { status: 500 }
    );
  }
}
