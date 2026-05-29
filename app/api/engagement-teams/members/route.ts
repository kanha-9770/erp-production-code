/**
 * GET /api/engagement-teams/members — contributor / team-mate picker source.
 *
 * Returns the employees the caller can pick as engagement contributors
 * (e.g. the Kaizen "Employee Contributor" multi-select).
 *
 * Unlike /api/employees — which scopes by role hierarchy and so returns only
 * the caller's own record for a leaf employee — this returns the caller's
 * engagement-team peers, falling back to all active org employees when the
 * caller has no team yet. See listTeamMembersForUser for the scoping rules.
 *
 * Response: { success, members: TeamMemberOption[], scope: 'team' | 'org' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { listTeamMembersForUser } from '@/lib/hr/engagement-team-service';

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

  try {
    const { members, scope } = await listTeamMembersForUser(
      authUser.id,
      authUser.organizationId ?? null,
    );
    return NextResponse.json(
      { success: true, members, scope },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error('[GET /api/engagement-teams/members]', e);
    return NextResponse.json(
      { success: false, error: 'Failed to load team members', members: [], scope: 'org' },
      { status: 500, headers: NO_STORE },
    );
  }
}
