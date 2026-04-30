import { NextRequest, NextResponse } from 'next/server';
import {
  getEmployeeFormsStatus,
  getEmployeesFromDB,
  getPayrollRecords,
  getStoredMonths,
} from '@/lib/utils/payroll-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') ?? undefined;
    const records = getPayrollRecords(month);
    const [employees, formsStatus] = await Promise.all([
      getEmployeesFromDB(),
      getEmployeeFormsStatus(),
    ]);

    const totalEmployees = employees.length;
    const processedPayrolls = records.filter((r) => r.status === 'processed').length;
    const pendingPayslips = Math.max(0, totalEmployees - processedPayrolls);
    const totalPayrollExpense = records.reduce((sum, r) => sum + r.netSalary, 0);
    const totalGross = records.reduce((sum, r) => sum + r.grossSalary, 0);
    const totalDeductions = records.reduce(
      (sum, r) =>
        sum + r.deductions.pf + r.deductions.tax + r.deductions.insurance + r.deductions.other,
      0,
    );
    const averageSalary = records.length > 0 ? Math.round(totalPayrollExpense / records.length) : 0;
    const totalWorkingHours = records.reduce((sum, r) => sum + r.workingHours, 0);

    return NextResponse.json({
      success: true,
      stats: {
        totalEmployees,
        processedPayrolls,
        pendingPayslips,
        totalPayrollExpense,
        totalGross,
        totalDeductions,
        averageSalary,
        totalWorkingHours: Math.round(totalWorkingHours),
        availableMonths: getStoredMonths(),
        currentMonth: month ?? new Date().toISOString().slice(0, 7),
        formsStatus,
      },
    });
  } catch (error) {
    console.error('[payroll] stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate statistics' },
      { status: 500 },
    );
  }
}
