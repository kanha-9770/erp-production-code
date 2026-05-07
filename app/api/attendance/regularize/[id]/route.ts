import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getRequestMeta } from '@/lib/api-helpers';
import { canApproveAttendance } from '@/lib/hr/attendance-permissions';
import {
  RegularizationError,
  approveRegularization,
  cancelRegularization,
  rejectRegularization,
} from '@/lib/hr/attendance-regularization';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';

export const dynamic = 'force-dynamic';

interface ReviewBody {
  action?: 'approve' | 'reject' | 'cancel';
  note?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403 },
    );
  }

  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }
  const { ipAddress, userAgent } = getRequestMeta(request);
  const ip = ipAddress === 'unknown' ? null : ipAddress;

  try {
    if (body.action === 'cancel') {
      await cancelRegularization(
        params.id,
        authUser.id,
        authUser.organizationId,
        ip,
        userAgent,
      );
      return NextResponse.json({ success: true });
    }

    // approve / reject — admins + users in the configured approver roles.
    if (body.action !== 'approve' && body.action !== 'reject') {
      return NextResponse.json(
        { success: false, error: "action must be 'approve', 'reject' or 'cancel'" },
        { status: 400 },
      );
    }
    const allowed = await canApproveAttendance(
      authUser.id,
      authUser.organizationId,
    );
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You are not authorised to approve attendance regularizations. An admin must add your role to the approver list.',
        },
        { status: 403 },
      );
    }

    const reviewInput = {
      id: params.id,
      reviewerId: authUser.id,
      reviewerEmail: authUser.email,
      organizationId: authUser.organizationId,
      note: body.note ?? null,
      ip,
      userAgent,
    };

    if (body.action === 'approve') {
      await approveRegularization(reviewInput);
    } else {
      await rejectRegularization(reviewInput);
    }
    // An approved regularization rewrites the Attendance row's check-in
    // / check-out timestamps, which directly changes the day's classification
    // (present / half-day / absent). Drop the cached payroll for the org so
    // the next read picks up the new attendance state. Reject also drops
    // the cache because a previously-approved regularization being reversed
    // would otherwise leave stale data in the cache.
    invalidatePayrollCache(authUser.organizationId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof RegularizationError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error('[regularize] review failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update regularization' },
      { status: 500 },
    );
  }
}
