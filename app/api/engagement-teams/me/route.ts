/**
 * GET /api/engagement-teams/me — visibility helper for engagement pages.
 *
 * Returns:
 *   - seeAll:    true for Admin / HR — bypasses team scoping on the
 *                Kaizen / Suggestion / Problem Registration / Self-Initiative
 *                / Self-Target pages.
 *   - myTeamId:  the caller's engagementTeamId (from their Employee record),
 *                or null when the user is unassigned. Engagement pages filter
 *                records to only those whose author shares this team.
 *   - myEmployeeId: convenience — caller's own employee.id so pages can fall
 *                back to "show only mine" when myTeamId is null.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import {
  canSeeAllEngagementData,
  getUserTeamId,
} from '@/lib/hr/engagement-team-service';
import { prisma } from '@/lib/prisma';

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
  const [seeAll, myTeamId, emp] = await Promise.all([
    canSeeAllEngagementData(authUser.id, authUser.organizationId ?? null),
    getUserTeamId(authUser.id),
    prisma.employee.findUnique({
      where: { userId: authUser.id },
      select: { id: true },
    }),
  ]);
  return NextResponse.json(
    {
      success: true,
      seeAll,
      myTeamId,
      myEmployeeId: emp?.id ?? null,
    },
    { headers: NO_STORE },
  );
}
