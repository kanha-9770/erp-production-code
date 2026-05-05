/**
 * GET /api/leaves/balance — current year's balance per leave type.
 *   Query: ?userId=&year=
 *   Non-admin: userId is forced to caller's id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { getBalance, canApproveLeave } from '@/lib/hr/leave-service';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(request: NextRequest) {
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

  const url = new URL(request.url);
  const requestedUserId = url.searchParams.get('userId');
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { success: false, error: "'year' is out of range" },
      { status: 400, headers: NO_STORE },
    );
  }

  let targetUserId = authUser.id;
  if (requestedUserId && requestedUserId !== authUser.id) {
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
    targetUserId = requestedUserId;
  }

  const balances = await getBalance(authUser.organizationId, targetUserId, year);
  return NextResponse.json({ success: true, year, balances }, { headers: NO_STORE });
}
