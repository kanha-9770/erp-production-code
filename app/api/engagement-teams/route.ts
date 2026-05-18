/**
 * GET  /api/engagement-teams       — list all teams in the caller's org.
 *   Any authenticated user can read so engagement pages can render the
 *   team filter dropdown for admins / HR.
 *
 * POST /api/engagement-teams       — create a team. Admin-only.
 *   Body: { name, description?, color?, leadUserId? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import {
  createTeam,
  listTeams,
  EngagementTeamError,
} from '@/lib/hr/engagement-team-service';
import { fireWorkflow } from '@/lib/workflow/static-triggers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, code },
    { status, headers: NO_STORE },
  );
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const teams = await listTeams(authUser.organizationId);
  return NextResponse.json({ success: true, teams }, { headers: NO_STORE });
}

interface CreateBody {
  name?: string;
  description?: string | null;
  color?: string | null;
  leadUserId?: string | null;
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);
  if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
    return err('Only admins can create engagement teams.', 403);
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return err('Invalid JSON body');
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return err("'name' is required");
  }

  try {
    const team = await createTeam({
      organizationId: authUser.organizationId,
      name: body.name,
      description: body.description ?? null,
      color: body.color ?? null,
      leadUserId: body.leadUserId ?? null,
    });
    fireWorkflow({
      moduleName: 'Engagement Team',
      action: 'Create',
      organizationId: authUser.organizationId,
      userId: authUser.id,
      recordId: team.id,
      recordData: team as any,
    });
    return NextResponse.json({ success: true, team }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof EngagementTeamError) return err(e.message, e.status, e.code);
    console.error('[POST /api/engagement-teams]', e);
    return err('Failed to create team', 500);
  }
}
