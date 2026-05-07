import { NextRequest, NextResponse } from 'next/server';
import {
  getEmployeeFormsStatus,
  getEmployeesFromDB,
  getStoredMonths,
} from '@/lib/utils/payroll-store';
import { readLivePayroll } from '@/lib/utils/payroll-live';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: 'User is not a member of any organization' },
        { status: 403 },
      );
    }

    const orgId = authUser.organizationId;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') ?? undefined;
    // Live read — same TTL-cached compute the records endpoint uses, so
    // stats and the listing always agree about a punch made 1s ago.
    const [records, employees, formsStatus] = await Promise.all([
      readLivePayroll(orgId, month),
      getEmployeesFromDB(orgId),
      getEmployeeFormsStatus(orgId),
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
        availableMonths: getStoredMonths(orgId),
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
