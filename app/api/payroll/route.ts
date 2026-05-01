import { NextRequest, NextResponse } from 'next/server';
import { calculatePayroll } from '@/lib/utils/payroll-utils';
import { getPayrollRecords, setPayrollRecords } from '@/lib/utils/payroll-store';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') ?? undefined;
  const payrolls = getPayrollRecords(authUser.organizationId, month);
  return NextResponse.json({ success: true, payrolls });
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
    const payrolls = await calculatePayroll(authUser.organizationId, month);
    setPayrollRecords(authUser.organizationId, month, payrolls);
    return NextResponse.json({ success: true, payrolls, month });
  } catch (error) {
    console.error('[payroll] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process payroll' },
      { status: 500 },
    );
  }
}
