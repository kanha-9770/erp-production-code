/**
 * POST /api/push/subscribe — store a Web Push subscription against the
 * authenticated user.
 *
 * The client passes the JSON returned by `pushManager.subscribe`, which has
 * shape `{ endpoint, keys: { p256dh, auth } }`. We persist that plus the
 * user-agent (for debugging "which device is this row?") and upsert on
 * `endpoint` so re-subscriptions don't create duplicate rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface Body {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  if (!user.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization context' },
      { status: 400 },
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
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { success: false, error: 'Missing endpoint or keys' },
      { status: 400 },
    );
  }

  const userAgent = request.headers.get('user-agent') || null;

  try {
    await (prisma as any).pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: user.id,
        organizationId: user.organizationId,
        p256dh,
        auth,
        userAgent,
      },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        endpoint,
        p256dh,
        auth,
        userAgent,
      },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/push/subscribe]', err);
    return NextResponse.json(
      { success: false, error: 'Failed to save subscription' },
      { status: 500 },
    );
  }
}
