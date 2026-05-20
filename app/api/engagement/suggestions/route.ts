/**
 * GET  /api/engagement/suggestions — team-scoped list.
 * POST /api/engagement/suggestions — author creates a Suggestion.
 *   Body: { title, suggestion, category, status? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { buildScopedWhere } from '@/lib/hr/engagement-scope';
import {
  serializeSuggestion,
  SUGGESTION_INCLUDE,
} from '@/lib/hr/engagement-serializers';
import { nextDisplayId } from '@/lib/hr/engagement-display-id';
import { fireWorkflow } from '@/lib/workflow/static-triggers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

const ALLOWED_STATUS = new Set([
  'submitted',
  'under-review',
  'accepted',
  'rejected',
  'implemented',
]);

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const where = await buildScopedWhere(authUser.id, authUser.organizationId);
  const rows = await (prisma as any).engagementSuggestion.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: SUGGESTION_INCLUDE,
  });
  return NextResponse.json(
    { success: true, suggestions: rows.map(serializeSuggestion) },
    { headers: NO_STORE },
  );
}

interface CreateBody {
  title?: string;
  suggestion?: string;
  category?: string;
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
  if (!body.suggestion?.trim()) return err("'suggestion' is required");
  if (!body.category?.trim()) return err("'category' is required");

  const status = body.status && ALLOWED_STATUS.has(body.status) ? body.status : 'submitted';

  const displayId = await nextDisplayId('Suggestion', authUser.organizationId);
  const created = await (prisma as any).engagementSuggestion.create({
    data: {
      organizationId: authUser.organizationId,
      userId: authUser.id,
      displayId,
      title: body.title.trim().slice(0, 200),
      suggestion: body.suggestion.trim().slice(0, 5000),
      category: body.category.trim().slice(0, 80),
      status,
      endDate: (body.endDate ?? '').toString().slice(0, 20) || null,
      referenceImage: ((body as any).media || (body as any).referenceImage || '').toString().slice(0, 6_000_000) || null,
    },
    include: SUGGESTION_INCLUDE,
  });
  const wire = serializeSuggestion(created);
  fireWorkflow({
    moduleName: 'Employee Suggestion',
    action: 'Create',
    organizationId: authUser.organizationId,
    userId: authUser.id,
    recordId: wire.id,
    recordData: wire as any,
  });
  return NextResponse.json(
    { success: true, suggestion: wire },
    { headers: NO_STORE },
  );
}
