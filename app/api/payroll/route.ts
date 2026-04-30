import { NextRequest, NextResponse } from 'next/server';
import { calculatePayroll } from '@/lib/utils/payroll-utils';
import { getPayrollRecords, setPayrollRecords } from '@/lib/utils/payroll-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') ?? undefined;
  const payrolls = getPayrollRecords(month);
  return NextResponse.json({ success: true, payrolls });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const month: string = body?.month || new Date().toISOString().slice(0, 7);
    const payrolls = await calculatePayroll(month);
    setPayrollRecords(month, payrolls);
    return NextResponse.json({ success: true, payrolls, month });
  } catch (error) {
    console.error('[payroll] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process payroll' },
      { status: 500 },
    );
  }
}
