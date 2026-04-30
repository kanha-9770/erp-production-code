import { NextRequest, NextResponse } from 'next/server';
import { calculatePayroll } from '@/lib/utils/payroll-utils';
import { getEmployeeFormsStatus, setPayrollRecords } from '@/lib/utils/payroll-store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const month: string = body?.month || new Date().toISOString().slice(0, 7);

    const formsStatus = await getEmployeeFormsStatus();

    if (!formsStatus.hasEmployeeForm || !formsStatus.hasCheckInForm) {
      const missing: string[] = [];
      if (!formsStatus.hasEmployeeForm) missing.push('Employee Profile');
      if (!formsStatus.hasCheckInForm) missing.push('Check-In');
      return NextResponse.json({
        success: false,
        message: `Missing required HR forms: ${missing.join(', ')}. Please create these forms in your HR module first.`,
        formsStatus,
        payrolls: [],
      });
    }

    const payrolls = await calculatePayroll(month);
    setPayrollRecords(month, payrolls);

    if (payrolls.length === 0) {
      return NextResponse.json({
        success: false,
        message:
          'No payroll could be generated. Make sure Employee Profile records have a salary and that Check-In/Check-Out records exist for the selected month.',
        formsStatus,
        payrolls: [],
      });
    }

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
