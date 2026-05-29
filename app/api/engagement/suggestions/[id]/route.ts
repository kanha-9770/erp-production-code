/**
 * PATCH  /api/engagement/suggestions/[id] — partial update (author or admin).
 * DELETE /api/engagement/suggestions/[id] — delete (author or admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import {
  serializeSuggestion,
  SUGGESTION_INCLUDE,
} from '@/lib/hr/engagement-serializers';
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

interface PatchBody {
  title?: string;
  suggestion?: string;
  category?: string;
  status?: string;
  feedback?: string | null;
}

async function loadAndAuthorize(request: NextRequest, id: string) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return { error: err('Not authenticated', 401) } as const;
  if (!authUser.organizationId) return { error: err('No organization', 403) } as const;

  const row = await (prisma as any).engagementSuggestion.findFirst({
    where: { id, organizationId: authUser.organizationId },
  });
  if (!row) return { error: err('Not found', 404) } as const;

  const admin = await isUserAdmin(authUser.id, authUser.organizationId);
  if (row.userId !== authUser.id && !admin) {
    return { error: err('You can only edit your own Suggestion.', 403) } as const;
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
  if (body.suggestion !== undefined) patch.suggestion = body.suggestion.toString().slice(0, 5000);
  if (body.category !== undefined) patch.category = body.category.trim().slice(0, 80);
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.has(body.status)) return err('Invalid status');
    patch.status = body.status;
  }
  if (body.feedback !== undefined) {
    patch.feedback = body.feedback === null ? null : body.feedback.toString().slice(0, 5000);
  }

  const updated = await (prisma as any).engagementSuggestion.update({
    where: { id: params.id },
    data: patch,
    include: SUGGESTION_INCLUDE,
  });
  const wire = serializeSuggestion(updated);
  fireWorkflow({
    moduleName: 'Employee Suggestion',
    action: 'Edit',
    organizationId: authUser.organizationId!,
    userId: authUser.id,
    recordId: wire.id,
    recordData: wire as any,
  });
  return NextResponse.json(
    { success: true, suggestion: wire },
    { headers: NO_STORE },
  );
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const loaded = await loadAndAuthorize(request, params.id);
  if ('error' in loaded) return loaded.error;
  const { authUser, row } = loaded;
  await (prisma as any).engagementSuggestion.delete({ where: { id: params.id } });
  fireWorkflow({
    moduleName: 'Employee Suggestion',
    action: 'Delete',
    organizationId: authUser.organizationId!,
    userId: authUser.id,
    recordId: params.id,
    recordData: { id: params.id, title: row.title, userId: row.userId },
  });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
