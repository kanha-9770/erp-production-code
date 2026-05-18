/**
 * PATCH  /api/engagement/initiatives/[id] — partial update (author or admin).
 * DELETE /api/engagement/initiatives/[id] — delete (author or admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import {
  serializeInitiative,
  INITIATIVE_INCLUDE,
} from '@/lib/hr/engagement-serializers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

const ALLOWED_STATUS = new Set(['planning', 'in-progress', 'completed', 'on-hold']);

interface PatchBody {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  status?: string;
}

async function loadAndAuthorize(request: NextRequest, id: string) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return { error: err('Not authenticated', 401) } as const;
  if (!authUser.organizationId) return { error: err('No organization', 403) } as const;

  const row = await (prisma as any).engagementInitiative.findFirst({
    where: { id, organizationId: authUser.organizationId },
  });
  if (!row) return { error: err('Not found', 404) } as const;

  const admin = await isUserAdmin(authUser.id, authUser.organizationId);
  if (row.userId !== authUser.id && !admin) {
    return { error: err('You can only edit your own Initiative.', 403) } as const;
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
  const { row } = loaded;

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title.trim().slice(0, 200);
  if (body.description !== undefined) patch.description = body.description.toString().slice(0, 5000);
  if (body.category !== undefined) patch.category = body.category.trim().slice(0, 80);
  if (body.startDate !== undefined) {
    if (!DATE_RE.test(body.startDate)) return err("'startDate' must be YYYY-MM-DD");
    patch.startDate = body.startDate;
  }
  if (body.endDate !== undefined) {
    if (!DATE_RE.test(body.endDate)) return err("'endDate' must be YYYY-MM-DD");
    patch.endDate = body.endDate;
  }
  // Cross-field check: end can't precede start (either the patched or stored
  // value, whichever applies).
  const effectiveStart = (patch.startDate as string) ?? row.startDate;
  const effectiveEnd = (patch.endDate as string) ?? row.endDate;
  if (effectiveEnd < effectiveStart) {
    return err("'endDate' cannot be before 'startDate'");
  }
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.has(body.status)) return err('Invalid status');
    patch.status = body.status;
  }

  const updated = await (prisma as any).engagementInitiative.update({
    where: { id: params.id },
    data: patch,
    include: INITIATIVE_INCLUDE,
  });
  return NextResponse.json(
    { success: true, initiative: serializeInitiative(updated) },
    { headers: NO_STORE },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const loaded = await loadAndAuthorize(request, params.id);
  if ('error' in loaded) return loaded.error;
  await (prisma as any).engagementInitiative.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
