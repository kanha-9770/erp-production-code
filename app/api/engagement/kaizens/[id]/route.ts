/**
 * PATCH  /api/engagement/kaizens/[id]  — partial update (author or admin).
 * DELETE /api/engagement/kaizens/[id]  — delete (author or admin).
 *
 * Reads use the team-scoped where; mutations additionally require the caller
 * to either own the record or be an admin. HR can read everything but is NOT
 * allowed to mutate someone else's Kaizen — that's an explicit admin action.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { serializeKaizen, KAIZEN_INCLUDE } from '@/lib/hr/engagement-serializers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: NO_STORE });
}

const ALLOWED_STATUS = new Set(['idea', 'approved', 'in-implementation', 'implemented']);

interface PatchBody {
  title?: string;
  description?: string;
  currentState?: string;
  proposedState?: string;
  benefits?: string;
  status?: string;
  // Vote toggle: when true, the current viewer is added/removed from the
  // votedByUserIds set and `votes` is recalculated.
  vote?: boolean;
}

async function loadAndAuthorize(
  request: NextRequest,
  id: string,
  requireMutate = true,
) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return { error: err('Not authenticated', 401) } as const;
  if (!authUser.organizationId) return { error: err('No organization', 403) } as const;

  const row = await (prisma as any).engagementKaizen.findFirst({
    where: { id, organizationId: authUser.organizationId },
  });
  if (!row) return { error: err('Not found', 404) } as const;

  if (requireMutate) {
    const admin = await isUserAdmin(authUser.id, authUser.organizationId);
    if (row.userId !== authUser.id && !admin) {
      return { error: err('You can only edit your own Kaizen.', 403) } as const;
    }
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

  // Vote toggle is a separate code path — it doesn't require mutate rights
  // because anyone who can see the Kaizen can vote on it. We re-run the
  // load without the mutate gate.
  if (body.vote !== undefined) {
    const loaded = await loadAndAuthorize(request, params.id, false);
    if ('error' in loaded) return loaded.error;
    const { authUser, row } = loaded;
    const voted: string[] = Array.isArray(row.votedByUserIds) ? row.votedByUserIds : [];
    const has = voted.includes(authUser.id);
    const nextVoted = body.vote && !has
      ? [...voted, authUser.id]
      : !body.vote && has
        ? voted.filter((x) => x !== authUser.id)
        : voted;
    const updated = await (prisma as any).engagementKaizen.update({
      where: { id: params.id },
      data: { votedByUserIds: nextVoted, votes: nextVoted.length },
      include: KAIZEN_INCLUDE,
    });
    return NextResponse.json(
      { success: true, kaizen: serializeKaizen(updated, authUser.id) },
      { headers: NO_STORE },
    );
  }

  const loaded = await loadAndAuthorize(request, params.id, true);
  if ('error' in loaded) return loaded.error;
  const { authUser } = loaded;

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title.trim().slice(0, 200);
  if (body.description !== undefined) patch.description = body.description.toString().slice(0, 5000);
  if (body.currentState !== undefined) patch.currentState = body.currentState.toString().slice(0, 5000);
  if (body.proposedState !== undefined) patch.proposedState = body.proposedState.toString().slice(0, 5000);
  if (body.benefits !== undefined) patch.benefits = body.benefits.toString().slice(0, 5000);
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.has(body.status)) return err('Invalid status');
    patch.status = body.status;
  }

  const updated = await (prisma as any).engagementKaizen.update({
    where: { id: params.id },
    data: patch,
    include: KAIZEN_INCLUDE,
  });
  return NextResponse.json(
    { success: true, kaizen: serializeKaizen(updated, authUser.id) },
    { headers: NO_STORE },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const loaded = await loadAndAuthorize(request, params.id, true);
  if ('error' in loaded) return loaded.error;
  await (prisma as any).engagementKaizen.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
