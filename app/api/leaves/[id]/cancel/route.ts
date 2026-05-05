/**
 * POST /api/leaves/[id]/cancel — cancel a PENDING (anyone) or APPROVED-future
 * (own only) leave. Admins can cancel any approved leave at any time.
 *   Body: { reason?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { cancelLeave, getRequest, LeaveError } from '@/lib/hr/leave-service';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

interface CancelBody {
  reason?: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403, headers: NO_STORE },
    );
  }

  const existing = await getRequest(params.id, authUser.organizationId);
  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404, headers: NO_STORE },
    );
  }

  const admin = await isUserAdmin(authUser.id, authUser.organizationId);
  if (existing.userId !== authUser.id && !admin) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403, headers: NO_STORE },
    );
  }

  let body: CancelBody = {};
  try {
    body = (await request.json()) as CancelBody;
  } catch {
    // Body is optional for cancel — empty / malformed JSON is OK.
  }

  try {
    const updated = await cancelLeave({
      requestId: params.id,
      cancelledById: authUser.id,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 2000) : null,
      adminOverride: admin,
    });
    return NextResponse.json(
      { success: true, request: updated },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (e instanceof LeaveError) {
      return NextResponse.json(
        { success: false, error: e.message, code: e.code },
        { status: e.status, headers: NO_STORE },
      );
    }
    console.error('[POST /api/leaves/[id]/cancel]', e);
    return NextResponse.json(
      { success: false, error: 'Failed to cancel leave' },
      { status: 500, headers: NO_STORE },
    );
  }
}
