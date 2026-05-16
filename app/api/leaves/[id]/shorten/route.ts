/**
 * POST /api/leaves/[id]/shorten — employee requests to end their APPROVED
 * leave earlier than originally planned.
 *   Body: { newEndDate: YYYY-MM-DD, reason?: string }
 *
 * Mirrors the apply-leave flow: the request goes into a PENDING state and an
 * approver decides via /api/leaves/[id]/shorten/decide. Balance is NOT
 * touched here — only on approval.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import {
  requestEarlyReturn,
  getRequest,
  LeaveError,
  isValidDateStr,
} from '@/lib/hr/leave-service';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, code },
    { status, headers: NO_STORE },
  );
}

interface ShortenBody {
  newEndDate?: string;
  reason?: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const existing = await getRequest(params.id, authUser.organizationId);
  if (!existing) return err('Not found', 404);
  if (existing.userId !== authUser.id) return err('Forbidden', 403);

  let body: ShortenBody;
  try {
    body = (await request.json()) as ShortenBody;
  } catch {
    return err('Invalid JSON body');
  }

  if (!body.newEndDate || !isValidDateStr(body.newEndDate)) {
    return err("'newEndDate' must be YYYY-MM-DD");
  }

  try {
    const updated = await requestEarlyReturn({
      requestId: params.id,
      userId: authUser.id,
      newEndDate: body.newEndDate,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 2000) : null,
    });
    return NextResponse.json({ success: true, request: updated }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof LeaveError) return err(e.message, e.status, e.code);
    console.error('[POST /api/leaves/[id]/shorten]', e);
    return err('Failed to request early return', 500);
  }
}
