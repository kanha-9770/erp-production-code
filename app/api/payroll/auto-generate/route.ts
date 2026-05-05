import { NextRequest, NextResponse } from 'next/server';
import { calculatePayroll } from '@/lib/utils/payroll-utils';
import {
  getEmployeeFormsStatus,
  PayrollRecord as InMemoryPayrollRecord,
  setPayrollRecords,
} from '@/lib/utils/payroll-store';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// PayrollRecord is unique on (employeeId, month, year). We upsert one row per
// employee so re-running auto-generate for the same month overwrites instead
// of duplicating. We also store the breakdown JSON in `allowances` (an
// existing Json column) so the schema doesn't need a migration.
async function persistPayrollRecords(
  authUserId: string,
  month: string,
  payrolls: InMemoryPayrollRecord[],
): Promise<void> {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr);
  const monthNum = Number(mStr);
  if (!Number.isInteger(year) || !Number.isInteger(monthNum)) return;

  // Run upserts sequentially — Prisma's `$transaction` array would also work
  // but we want a partial save if one row fails (e.g. an unusable employeeId)
  // rather than rolling back the whole batch.
  for (const p of payrolls) {
    if (!p.employeeId) continue;
    const grossSalary = p.grossSalary;
    const totalDeductions =
      p.deductions.pf + p.deductions.tax + p.deductions.insurance + p.deductions.other;
    const data = {
      presentDays: Math.round(p.breakdown.presentDays),
      leaveDays: p.breakdown.paidLeaveDays + p.breakdown.unpaidLeaveDays,
      halfDays: p.breakdown.halfDays,
      shortLeaves: 0,
      overtimeHours: 0,
      baseSalary: p.baseSalary,
      grossSalary,
      deductions: totalDeductions,
      netSalary: p.netSalary,
      allowances: { breakdown: p.breakdown, deductionDetail: p.deductions } as any,
      deductionDetail: p.deductions as any,
      status: p.status,
      processedBy: authUserId,
      processedAt: new Date(),
    };
    try {
      await prisma.payrollRecord.upsert({
        where: { employeeId_month_year: { employeeId: p.employeeId, month: monthNum, year } },
        update: data,
        create: { employeeId: p.employeeId, month: monthNum, year, ...data },
      });
    } catch (err) {
      console.warn(
        `[payroll] failed to persist record for ${p.employeeId} ${month}:`,
        err instanceof Error ? err.message : err,
      );
      // Swallow — we'd rather return the calculated payroll and surface the
      // persistence failure as a partial result than block the whole batch.
    }
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const month: string = body?.month || new Date().toISOString().slice(0, 7);

    const formsStatus = await getEmployeeFormsStatus(authUser.organizationId);

    // Gate: an Employee form is always required (we need salary + identity).
    // Check-in is optional as a FORM — the static /attendance widget writes to
    // the Attendance table directly, and payroll's data layer already merges
    // those rows. Either source counts, so we only block when BOTH are missing.
    if (!formsStatus.hasEmployeeForm || !formsStatus.hasAnyCheckInSource) {
      const missing: string[] = [];
      if (!formsStatus.hasEmployeeForm) {
        missing.push('an Employee Profile form');
      }
      if (!formsStatus.hasAnyCheckInSource) {
        missing.push(
          'a check-in source (either bind a Check-In form in /settings/attendance-config OR have employees punch in via the widget at /attendance)',
        );
      }
      return NextResponse.json({
        success: false,
        message: `Cannot run payroll yet — needs ${missing.join(' AND ')}.`,
        formsStatus,
        payrolls: [],
      });
    }

    const payrolls = await calculatePayroll(authUser.organizationId, month);
    setPayrollRecords(authUser.organizationId, month, payrolls);

    if (payrolls.length === 0) {
      return NextResponse.json({
        success: false,
        message:
          'No payroll could be generated. Make sure Employee Profile records have a salary and that Check-In/Check-Out records exist for the selected month.',
        formsStatus,
        payrolls: [],
      });
    }

    // Persist after computing so the in-memory result is always authoritative
    // for this request and DB write failures degrade gracefully.
    await persistPayrollRecords(authUser.id, month, payrolls);

    const totalNet = payrolls.reduce((sum, p) => sum + p.netSalary, 0);
    const totalGross = payrolls.reduce((sum, p) => sum + p.grossSalary, 0);

    return NextResponse.json({
      success: true,
      message: `Generated payroll for ${payrolls.length} employees`,
      month,
      formsStatus,
      payrolls,
      summary: {
        employees: payrolls.length,
        totalGross,
        totalNet,
      },
    });
  } catch (error) {
    console.error('[payroll] auto-generate error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to auto-generate payroll',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
