import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getRequestMeta } from '@/lib/api-helpers';
import {
  AttendanceError,
  recordPunch,
  type PunchType,
  type PunchSource,
} from '@/lib/hr/attendance-service';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';

export const dynamic = 'force-dynamic';

interface PunchBody {
  type?: string;
  geo?: { lat?: unknown; lng?: unknown } | null;
  source?: string;
  idempotencyKey?: string;
  photoUrl?: string | null;
  // Optional face-match score recorded by /api/attendance/photo. Lower is
  // a better match. The punch service stores this on the Attendance row
  // so admins can audit verification confidence per punch.
  faceMatch?: number | null;
  // Liveness check outcome from the capture sequence. True = motion
  // detected (real face), false = static (rejected), null = check not
  // run. Persisted on the Attendance row for audit / reporting.
  livenessPassed?: boolean | null;
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

  // Accept finite numeric faceMatch only — anything else is treated as
  // "no verification ran" (consistent with how the photo route returns
  // null when verification is OFF).
  const faceMatch =
    typeof body.faceMatch === 'number' && Number.isFinite(body.faceMatch)
      ? body.faceMatch
      : null;

  const livenessPassed =
    typeof body.livenessPassed === 'boolean' ? body.livenessPassed : null;

  // ─── Server-side enforcement of face capture / verify / liveness ─────
  // The widget gates the dialog client-side, but a stale-status snapshot,
  // a custom client, or a direct API call (cURL / dev-tools) can bypass
  // that. This block is the authoritative gate: when the org has any of
  // the face features turned ON, the punch endpoint refuses anything that
  // didn't go through the matching capture/verify/liveness step.
  //
  // Key insight on photoUrl: when facePhotoStoreAfterVerify = NEVER or
  // ON_MISMATCH_ONLY, a fully-verified punch legitimately arrives with
  // photoUrl = null. So we accept photoUrl=null ONLY when verification
  // actually ran (faceMatch is numeric). Otherwise we require a photoUrl.
  const cfg = await getAttendanceConfig(authUser.organizationId);
  const verificationProof = typeof faceMatch === 'number';
  if (cfg.faceCaptureMode === 'REQUIRED' && !photoUrl && !verificationProof) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Face capture is required. Please use the Check In button in the app — direct punches without a captured photo are not allowed.',
        code: 'FACE_CAPTURE_REQUIRED',
      },
      { status: 403 },
    );
  }
  if (cfg.faceVerifyMode === 'ENFORCE' && !verificationProof) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Face verification is required but no verification was performed for this punch. Please retake the photo through the app.',
        code: 'FACE_VERIFY_REQUIRED',
      },
      { status: 403 },
    );
  }
  if (cfg.faceLivenessMode === 'STRICT' && livenessPassed !== true) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Liveness check is required and was not confirmed for this punch.',
        code: 'LIVENESS_REQUIRED',
      },
      { status: 403 },
    );
  }

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
      faceMatch,
      livenessPassed,
    });

    // The punch changed the day's attendance row, which means the cached
    // payroll for this user's org is now stale. Invalidate so the next
    // /api/payroll or /api/payroll/stats fetch recomputes from live data.
    // We wipe the whole org because a single punch can shift this month's
    // present/half-day counts and there's no measurable cost to recomputing
    // adjacent months on the next read. Idempotent retries skip the
    // invalidation since they didn't actually change state.
    if (!deduplicated && authUser.organizationId) {
      invalidatePayrollCache(authUser.organizationId);
    }

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
