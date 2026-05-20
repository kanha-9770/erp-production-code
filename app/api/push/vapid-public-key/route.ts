/**
 * GET /api/push/vapid-public-key — return the VAPID public key so the
 * browser can pass it to `pushManager.subscribe`. Public on purpose: the
 * key is meant to be shared with every client; only the private half is
 * a secret.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY || '';
  if (!key) {
    return NextResponse.json(
      { success: false, error: 'VAPID public key not configured' },
      { status: 503 },
    );
  }
  return NextResponse.json({ success: true, key });
}
