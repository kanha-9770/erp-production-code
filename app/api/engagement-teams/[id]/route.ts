/**
 * PATCH  /api/engagement-teams/[id]  — partial update (admin-only).
 *   Body: { name?, description?, color?, leadUserId?, isActive? }
 *
 * DELETE /api/engagement-teams/[id]  — delete the team (admin-only).
 *   Members' engagementTeamId is set to NULL via the FK rule — the employees
 *   themselves are not touched.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import {
  deleteTeam,
  updateTeam,
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

interface UpdateBody {
  name?: string;
  description?: string | null;
  color?: string | null;
  leadUserId?: string | null;
  isActive?: boolean;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);
  if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
    return err('Only admins can edit engagement teams.', 403);
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return err('Invalid JSON body');
  }

  try {
    const team = await updateTeam({
      id: params.id,
      organizationId: authUser.organizationId,
      name: body.name,
      description: body.description,
      color: body.color,
      leadUserId: body.leadUserId,
      isActive: body.isActive,
    });
    fireWorkflow({
      moduleName: 'Engagement Team',
      action: 'Edit',
      organizationId: authUser.organizationId,
      userId: authUser.id,
      recordId: team.id,
      recordData: team as any,
    });
    return NextResponse.json({ success: true, team }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof EngagementTeamError) return err(e.message, e.status, e.code);
    console.error('[PATCH /api/engagement-teams/[id]]', e);
    return err('Failed to update team', 500);
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);
  if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
    return err('Only admins can delete engagement teams.', 403);
  }

  try {
    await deleteTeam(params.id, authUser.organizationId);
    fireWorkflow({
      moduleName: 'Engagement Team',
      action: 'Delete',
      organizationId: authUser.organizationId,
      userId: authUser.id,
      recordId: params.id,
      recordData: { id: params.id },
    });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof EngagementTeamError) return err(e.message, e.status, e.code);
    console.error('[DELETE /api/engagement-teams/[id]]', e);
    return err('Failed to delete team', 500);
  }
}
