import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getRequestMeta } from '@/lib/api-helpers';
import {
  AttendanceError,
  recordPunch,
  type PunchType,
  type PunchSource,
} from '@/lib/hr/attendance-service';

export const dynamic = 'force-dynamic';

interface PunchBody {
  type?: string;
  geo?: { lat?: unknown; lng?: unknown } | null;
  source?: string;
  idempotencyKey?: string;
  photoUrl?: string | null;
}

function parseGeo(raw: PunchBody['geo']): { lat: number; lng: number } | null {
  if (!raw) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function parseType(raw: unknown): PunchType | null {
  if (raw === 'IN' || raw === 'OUT') return raw;
  // Tolerate the legacy "checkin"/"checkout" wording from /api/attendance.
  if (raw === 'checkin') return 'IN';
  if (raw === 'checkout') return 'OUT';
  return null;
}

function parseSource(raw: unknown): PunchSource {
  return raw === 'MOBILE' || raw === 'BIOMETRIC' || raw === 'ADMIN'
    ? raw
    : 'WEB';
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  let body: PunchBody;
  try {
    body = (await request.json()) as PunchBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const type = parseType(body.type);
  if (!type) {
    return NextResponse.json(
      { success: false, error: "type must be 'IN' or 'OUT'" },
      { status: 400 },
    );
  }

  const { ipAddress, userAgent } = getRequestMeta(request);

  // Header takes precedence over body so retried requests can ride through
  // gateways that strip the body but preserve headers.
  const idempotencyKey =
    request.headers.get('idempotency-key') ?? body.idempotencyKey ?? null;

  // Only accept photo URLs from our own uploader. Anything else is treated
  // as missing — keeps a malicious client from injecting arbitrary remote
  // image URLs onto attendance rows.
  const photoUrl =
    typeof body.photoUrl === 'string' &&
    /^https?:\/\/businesscard\.nesscoglobal\.com\//.test(body.photoUrl)
      ? body.photoUrl
      : null;

  try {
    const { status, deduplicated } = await recordPunch({
      userId: authUser.id,
      organizationId: authUser.organizationId,
      type,
      geo: parseGeo(body.geo),
      ip: ipAddress === 'unknown' ? null : ipAddress,
      userAgent,
      source: parseSource(body.source),
      idempotencyKey,
      photoUrl,
    });

    return NextResponse.json(
      { success: true, status, deduplicated },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (err) {
    if (err instanceof AttendanceError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error('[attendance/punch] error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to record punch' },
      { status: 500 },
    );
  }
}
