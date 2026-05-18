/**
 * PATCH  /api/engagement/targets/[id] — partial update (author or admin).
 * DELETE /api/engagement/targets/[id] — delete (author or admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import {
  serializeTarget,
  TARGET_INCLUDE,
} from '@/lib/hr/engagement-serializers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

const ALLOWED_STATUS = new Set(['not-started', 'in-progress', 'completed']);

function clampProgress(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

interface PatchBody {
  title?: string;
  description?: string;
  targetDate?: string;
  status?: string;
  progress?: number;
}

async function loadAndAuthorize(request: NextRequest, id: string) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return { error: err('Not authenticated', 401) } as const;
  if (!authUser.organizationId) return { error: err('No organization', 403) } as const;

  const row = await (prisma as any).engagementTarget.findFirst({
    where: { id, organizationId: authUser.organizationId },
  });
  if (!row) return { error: err('Not found', 404) } as const;

  const admin = await isUserAdmin(authUser.id, authUser.organizationId);
  if (row.userId !== authUser.id && !admin) {
    return { error: err('You can only edit your own Target.', 403) } as const;
  }
  return { authUser, row };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return err('Invalid JSON body');
  }
  const loaded = await loadAndAuthorize(request, params.id);
  if ('error' in loaded) return loaded.error;

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title.trim().slice(0, 200);
  if (body.description !== undefined) patch.description = body.description.toString().slice(0, 5000);
  if (body.targetDate !== undefined) {
    if (!DATE_RE.test(body.targetDate)) return err("'targetDate' must be YYYY-MM-DD");
    patch.targetDate = body.targetDate;
  }
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.has(body.status)) return err('Invalid status');
    patch.status = body.status;
  }
  if (body.progress !== undefined) patch.progress = clampProgress(body.progress);

  const updated = await (prisma as any).engagementTarget.update({
    where: { id: params.id },
    data: patch,
    include: TARGET_INCLUDE,
  });
  return NextResponse.json(
    { success: true, target: serializeTarget(updated) },
    { headers: NO_STORE },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const loaded = await loadAndAuthorize(request, params.id);
  if ('error' in loaded) return loaded.error;
  await (prisma as any).engagementTarget.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
