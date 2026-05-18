/**
 * GET  /api/engagement/kaizens  — team-scoped list.
 * POST /api/engagement/kaizens  — author creates a Kaizen.
 *   Body: { title, description, currentState, proposedState, benefits, status? }
 *
 * Visibility: Admin/HR see every Kaizen in the org. Other users see only
 * those whose author shares their EngagementTeam. Unassigned users see only
 * their own. See lib/hr/engagement-scope.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { buildScopedWhere } from '@/lib/hr/engagement-scope';
import { serializeKaizen, KAIZEN_INCLUDE } from '@/lib/hr/engagement-serializers';
import { fireWorkflow } from '@/lib/workflow/static-triggers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, code },
    { status, headers: NO_STORE },
  );
}

const ALLOWED_STATUS = new Set(['idea', 'approved', 'in-implementation', 'implemented']);

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const where = await buildScopedWhere(authUser.id, authUser.organizationId);
  const rows = await (prisma as any).engagementKaizen.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: KAIZEN_INCLUDE,
  });
  return NextResponse.json(
    { success: true, kaizens: rows.map((r: any) => serializeKaizen(r, authUser.id)) },
    { headers: NO_STORE },
  );
}

interface CreateBody {
  title?: string;
  description?: string;
  currentState?: string;
  proposedState?: string;
  benefits?: string;
  status?: string;
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return err('Invalid JSON body');
  }
  if (!body.title?.trim()) return err("'title' is required");
  if (!body.description?.trim()) return err("'description' is required");

  const status = body.status && ALLOWED_STATUS.has(body.status) ? body.status : 'idea';

  const created = await (prisma as any).engagementKaizen.create({
    data: {
      organizationId: authUser.organizationId,
      userId: authUser.id,
      title: body.title.trim().slice(0, 200),
      description: body.description.trim().slice(0, 5000),
      currentState: (body.currentState ?? '').toString().slice(0, 5000),
      proposedState: (body.proposedState ?? '').toString().slice(0, 5000),
      benefits: (body.benefits ?? '').toString().slice(0, 5000),
      status,
    },
    include: KAIZEN_INCLUDE,
  });
  const wire = serializeKaizen(created, authUser.id);
  // Fire any workflow rule attached to the "Kaizen" module so notifications
  // / emails / function actions actually run on a new submission.
  fireWorkflow({
    moduleName: 'Kaizen',
    action: 'Create',
    organizationId: authUser.organizationId,
    userId: authUser.id,
    recordId: wire.id,
    recordData: wire as any,
  });
  return NextResponse.json(
    { success: true, kaizen: wire },
    { headers: NO_STORE },
  );
}
