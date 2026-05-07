import { NextRequest, NextResponse } from 'next/server';
import { calculatePayroll } from '@/lib/utils/payroll-utils';
import { setPayrollRecords } from '@/lib/utils/payroll-store';
import {
  readLivePayroll,
  invalidatePayrollCache,
} from '@/lib/utils/payroll-live';
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

  // Live recompute on every read so the response always reflects the latest
  // punches/leaves. The TTL inside readLivePayroll coalesces the 3 parallel
  // page-load fetches (records + stats + prevStats) into a single compute.
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') ?? undefined;
    const payrolls = await readLivePayroll(authUser.organizationId, month);
    return NextResponse.json({ success: true, payrolls });
  } catch (err) {
    console.error('[payroll] GET live read error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to read payroll' },
      { status: 500 },
    );
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
    // POST forces a fresh compute and invalidates any cached entry for
    // this (org, month) so subsequent reads pick up the freshly computed
    // result via the live cache.
    invalidatePayrollCache(authUser.organizationId, month);
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
