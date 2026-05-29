/**
 * PATCH  /api/engagement/problems/[id] — partial update (author or admin).
 * DELETE /api/engagement/problems/[id] — delete (author or admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import {
  serializeProblem,
  PROBLEM_INCLUDE,
} from '@/lib/hr/engagement-serializers';
import { fireWorkflow } from '@/lib/workflow/static-triggers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

const ALLOWED_SEVERITY = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_STATUS = new Set(['open', 'in-review', 'resolved', 'closed']);

interface PatchBody {
  title?: string;
  description?: string;
  severity?: string;
  category?: string;
  status?: string;
  proposedSolution?: string;
}

async function loadAndAuthorize(request: NextRequest, id: string) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return { error: err('Not authenticated', 401) } as const;
  if (!authUser.organizationId) return { error: err('No organization', 403) } as const;

  const row = await (prisma as any).engagementProblem.findFirst({
    where: { id, organizationId: authUser.organizationId },
  });
  if (!row) return { error: err('Not found', 404) } as const;

  const admin = await isUserAdmin(authUser.id, authUser.organizationId);
  if (row.userId !== authUser.id && !admin) {
    return { error: err('You can only edit your own Problem.', 403) } as const;
  }
  return { authUser, row };
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return err('Invalid JSON body');
  }
  const loaded = await loadAndAuthorize(request, params.id);
  if ('error' in loaded) return loaded.error;
  const { authUser } = loaded;

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title.trim().slice(0, 200);
  if (body.description !== undefined) patch.description = body.description.toString().slice(0, 5000);
  if (body.category !== undefined) patch.category = body.category.trim().slice(0, 80);
  if (body.proposedSolution !== undefined) patch.proposedSolution = body.proposedSolution.toString().slice(0, 5000);
  if (body.severity !== undefined) {
    if (!ALLOWED_SEVERITY.has(body.severity)) return err('Invalid severity');
    patch.severity = body.severity;
  }
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.has(body.status)) return err('Invalid status');
    patch.status = body.status;
  }

  const updated = await (prisma as any).engagementProblem.update({
    where: { id: params.id },
    data: patch,
    include: PROBLEM_INCLUDE,
  });
  const wire = serializeProblem(updated);
  fireWorkflow({
    moduleName: 'Problem Registration',
    action: 'Edit',
    organizationId: authUser.organizationId!,
    userId: authUser.id,
    recordId: wire.id,
    recordData: wire as any,
  });
  return NextResponse.json(
    { success: true, problem: wire },
    { headers: NO_STORE },
  );
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const loaded = await loadAndAuthorize(request, params.id);
  if ('error' in loaded) return loaded.error;
  const { authUser, row } = loaded;
  await (prisma as any).engagementProblem.delete({ where: { id: params.id } });
  fireWorkflow({
    moduleName: 'Problem Registration',
    action: 'Delete',
    organizationId: authUser.organizationId!,
    userId: authUser.id,
    recordId: params.id,
    recordData: { id: params.id, title: row.title, userId: row.userId },
  });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
