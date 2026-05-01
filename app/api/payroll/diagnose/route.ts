import { NextRequest, NextResponse } from 'next/server';
import { diagnose, getEmployeeFormsStatus } from '@/lib/utils/payroll-store';
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
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const [report, formsStatus] = await Promise.all([
      diagnose(orgId, month),
      getEmployeeFormsStatus(orgId),
    ]);
    return NextResponse.json({ success: true, month, formsStatus, report });
  } catch (error) {
    console.error('[payroll] diagnose error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Diagnose failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
