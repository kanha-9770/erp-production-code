/**
 * POST /api/push/unsubscribe — drop a saved subscription so the user stops
 * receiving pushes on this device. Called by the client when the user revokes
 * permission or "logs out" of push.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface Body {
  endpoint?: string;
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }
  if (!body.endpoint) {
    return NextResponse.json(
      { success: false, error: 'Missing endpoint' },
      { status: 400 },
    );
  }

  try {
    // Scope by userId so a user can't drop someone else's subscription if
    // they manage to guess an endpoint. The endpoint is unique so this is
    // effectively a single-row delete.
    await (prisma as any).pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: user.id },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/push/unsubscribe]', err);
    return NextResponse.json(
      { success: false, error: 'Failed to remove subscription' },
      { status: 500 },
    );
  }
}
