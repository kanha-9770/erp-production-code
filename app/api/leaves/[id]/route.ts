/**
 * GET /api/leaves/[id] — fetch a single leave request.
 *   Allowed for: the applicant, an approver of their org, or an admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { getRequest, canApproveLeave } from '@/lib/hr/leave-service';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const req = await getRequest(params.id, authUser.organizationId);
  if (!req) {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404, headers: NO_STORE },
    );
  }

  if (req.userId !== authUser.id) {
    const [admin, approver] = await Promise.all([
      isUserAdmin(authUser.id, authUser.organizationId),
      canApproveLeave(authUser.id, authUser.organizationId),
    ]);
    if (!admin && !approver) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403, headers: NO_STORE },
      );
    }
  }

  return NextResponse.json({ success: true, request: req }, { headers: NO_STORE });
}
