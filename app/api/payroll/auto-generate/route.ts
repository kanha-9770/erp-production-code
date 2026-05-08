import { NextRequest, NextResponse } from 'next/server';
import {
  getEmployeeFormsStatus,
  PayrollRecord as InMemoryPayrollRecord,
} from '@/lib/utils/payroll-store';
import {
  getLivePayroll,
  invalidatePayrollCache,
} from '@/lib/utils/payroll-live';
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
      overtimeHours: p.overtimeHours ?? 0,
      baseSalary: p.baseSalary,
      grossSalary,
      deductions: totalDeductions,
      netSalary: p.netSalary,
      allowances: { breakdown: p.breakdown, earnings: p.earnings, deductionsDetail: p.deductionsDetail } as any,
      deductionDetail: p.deductionsDetail as any,
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

    // Gate: payroll needs (a) some way to identify employees and (b) some
    // check-in signal. Both are now satisfiable WITHOUT bound forms because
    // payroll-store.ts can synthesise employees from the User table and
    // pull punches from the native Attendance table. We only block when
    // there's literally no check-in source AND no employee profile form —
    // that's the only configuration where the engine has nothing to work
    // with. (User-table synthesis still produces a non-empty employee list,
    // it just won't have any attendance to credit them with.)
    if (!formsStatus.hasAnyCheckInSource) {
      return NextResponse.json({
        success: false,
        message:
          'Cannot run payroll yet — no check-in source. Either bind a Check-In form in /settings/attendance-config OR have employees punch in via the widget at /attendance.',
        formsStatus,
        payrolls: [],
      });
    }

    // Force-fresh recompute through the live engine — bypasses the TTL
    // cache so an admin clicking "Generate" always gets the very latest
    // attendance state, and primes the cache so the immediately-following
    // GETs (records + stats) return the same numbers without recomputing.
    invalidatePayrollCache(authUser.organizationId, month);
    const payrolls = await getLivePayroll(authUser.organizationId, month, {
      force: true,
      persist: false, // we persist below with the existing per-row error handling
      processedBy: authUser.id,
    });

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
