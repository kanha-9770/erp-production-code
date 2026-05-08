import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { computePayrollFromInputs } from '@/lib/utils/payroll-utils';
import { getPayrollFormulas, getPayrollPolicy } from '@/lib/utils/payroll-store';

export const dynamic = 'force-dynamic';

// POST /api/payroll/preview
// Inputs:
//   { baseSalary, year, month, presentDays, halfDays, leaveDays,
//     paidLeaveDays?, holidayDays?, weeklyOffDays?, overtimeHours? }
// Returns the same earnings + deductionsDetail breakdown the engine produces
// for auto-generated payroll, so the manual entry form's preview reflects
// real PF/ESI/PT/TDS instead of "gross minus a free-form deductions number".
export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser || !authUser.organizationId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const organizationId = authUser.organizationId;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const baseSalary = Number(body.baseSalary);
  const year = Number(body.year);
  const month = Number(body.month); // 1..12
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
    return NextResponse.json({ success: false, error: 'baseSalary required and > 0' }, { status: 400 });
  }
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ success: false, error: 'year + month (1-12) required' }, { status: 400 });
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  const presentDays = Math.max(0, Number(body.presentDays) || 0);
  const halfDaysCount = Math.max(0, Number(body.halfDays) || 0);
  const leaveDays = Math.max(0, Number(body.leaveDays) || 0); // treated as paid leave
  // Optional richer inputs — when the form starts capturing them, payable
  // days computation matches the engine exactly. Until then they default to
  // sensible values.
  const explicitPaidLeave = Number.isFinite(Number(body.paidLeaveDays)) ? Math.max(0, Number(body.paidLeaveDays)) : leaveDays;
  const holidayDays = Math.max(0, Number(body.holidayDays) || 0);
  const weeklyOffDays = Math.max(0, Number(body.weeklyOffDays) || 0);

  const payableDays =
    presentDays + halfDaysCount * 0.5 + explicitPaidLeave + holidayDays + weeklyOffDays;

  const otHours = body.overtimeHours;
  const overtimeBuckets =
    otHours && typeof otHours === 'object'
      ? {
          weekday: Math.max(0, Number(otHours.weekday) || 0),
          weekend: Math.max(0, Number(otHours.weekend) || 0),
          holiday: Math.max(0, Number(otHours.holiday) || 0),
        }
      : { weekday: Math.max(0, Number(body.overtimeHours) || 0), weekend: 0, holiday: 0 };

  const [policy, formulas] = await Promise.all([
    getPayrollPolicy(organizationId),
    getPayrollFormulas(organizationId),
  ]);

  const result = computePayrollFromInputs(
    {
      baseSalary,
      payableDays,
      daysInMonth,
      overtimeHours: overtimeBuckets,
    },
    policy,
    formulas,
  );

  return NextResponse.json({
    success: true,
    preview: {
      ...result,
      baseSalary,
      payableDays: Math.round(payableDays * 10) / 10,
      daysInMonth,
      perDay: Math.round(result.perDay * 100) / 100,
      hourlyRate: Math.round(result.hourlyRate * 100) / 100,
      monthlyGross: Math.round(result.monthlyGross),
    },
    formulas: {
      taxRegime: formulas.statutory.taxRegime,
      tdsMode: formulas.statutory.tdsMode,
      payableBasis: policy.payableBasis,
    },
  });
}
