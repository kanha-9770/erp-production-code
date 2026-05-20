/**
 * GET  /api/engagement/problems — team-scoped list.
 * POST /api/engagement/problems — author registers a problem.
 *   Body: { title, description, severity, category, status?, proposedSolution }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { buildScopedWhere } from '@/lib/hr/engagement-scope';
import {
  serializeProblem,
  PROBLEM_INCLUDE,
} from '@/lib/hr/engagement-serializers';
import { nextDisplayId } from '@/lib/hr/engagement-display-id';
import { fireWorkflow } from '@/lib/workflow/static-triggers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

const ALLOWED_SEVERITY = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_STATUS = new Set(['open', 'in-review', 'resolved', 'closed']);

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const where = await buildScopedWhere(authUser.id, authUser.organizationId);
  const rows = await (prisma as any).engagementProblem.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: PROBLEM_INCLUDE,
  });
  return NextResponse.json(
    { success: true, problems: rows.map(serializeProblem) },
    { headers: NO_STORE },
  );
}

interface CreateBody {
  title?: string;
  description?: string;
  severity?: string;
  category?: string;
  status?: string;
  proposedSolution?: string;
  endDate?: string;
  referenceImage?: string;
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
  if (!body.category?.trim()) return err("'category' is required");

  const severity = body.severity && ALLOWED_SEVERITY.has(body.severity) ? body.severity : 'medium';
  const status = body.status && ALLOWED_STATUS.has(body.status) ? body.status : 'open';

  const displayId = await nextDisplayId('Problem', authUser.organizationId);
  const created = await (prisma as any).engagementProblem.create({
    data: {
      organizationId: authUser.organizationId,
      userId: authUser.id,
      displayId,
      title: body.title.trim().slice(0, 200),
      description: body.description.trim().slice(0, 5000),
      severity,
      category: body.category.trim().slice(0, 80),
      status,
      proposedSolution: (body.proposedSolution ?? '').toString().slice(0, 5000),
      endDate: (body.endDate ?? '').toString().slice(0, 20) || null,
      referenceImage: (body.referenceImage ?? '').toString().slice(0, 6_000_000) || null,
    },
    include: PROBLEM_INCLUDE,
  });
  const wire = serializeProblem(created);
  fireWorkflow({
    moduleName: 'Problem Registration',
    action: 'Create',
    organizationId: authUser.organizationId,
    userId: authUser.id,
    recordId: wire.id,
    recordData: wire as any,
  });
  return NextResponse.json(
    { success: true, problem: wire },
    { headers: NO_STORE },
  );
}
