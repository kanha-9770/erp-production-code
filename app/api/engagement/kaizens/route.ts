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
import { nextDisplayId } from '@/lib/hr/engagement-display-id';
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
  endDate?: string;
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

  // Form sends `beforeMedia` and `afterMedia` as separate slots — typically
  // base64 `data:` URLs from the upload widget, so we allow up to ~6MB
  // each (after that the request itself usually exceeds Next's body limit).
  // Keep populating the legacy `referenceImage` column from beforeMedia so
  // historical readers still find something; new code reads the explicit
  // beforeMedia/afterMedia fields instead.
  const MEDIA_MAX = 6_000_000;
  const beforeMedia = ((body as any).beforeMedia ?? '').toString().slice(0, MEDIA_MAX) || null;
  const afterMedia = ((body as any).afterMedia ?? '').toString().slice(0, MEDIA_MAX) || null;
  const referenceImage = (
    beforeMedia ||
    ((body as any).referenceImage ?? '').toString().slice(0, MEDIA_MAX)
  ) || null;

  const displayId = await nextDisplayId('Kaizen', authUser.organizationId);

  const created = await (prisma as any).engagementKaizen.create({
    data: {
      organizationId: authUser.organizationId,
      userId: authUser.id,
      displayId,
      title: body.title.trim().slice(0, 200),
      description: body.description.trim().slice(0, 5000),
      currentState: (body.currentState ?? '').toString().slice(0, 5000),
      proposedState: (body.proposedState ?? '').toString().slice(0, 5000),
      benefits: (body.benefits ?? '').toString().slice(0, 5000),
      status,
      endDate: (body.endDate ?? '').toString().slice(0, 20) || null,
      referenceImage,
      beforeMedia,
      afterMedia,
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
