import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { uploadToHostinger } from '@/lib/hostinger-upload';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';
import { todayKey } from '@/lib/hr/attendance-service';
import { prisma } from '@/lib/prisma';
import {
  bytesToDescriptor,
  decodeDescriptor,
  euclideanDistance,
} from '@/lib/face/verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function extFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid multipart body' },
      { status: 400 },
    );
  }

  const file = formData.get('photo');
  const punchType = String(formData.get('type') ?? '').toUpperCase();
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Field 'photo' is required" },
      { status: 400 },
    );
  }
  if (punchType !== 'IN' && punchType !== 'OUT') {
    return NextResponse.json(
      { success: false, error: "Field 'type' must be 'IN' or 'OUT'" },
      { status: 400 },
    );
  }

  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { success: false, error: 'Only JPEG, PNG, and WebP photos are accepted' },
      { status: 415 },
    );
  }

  // Server-side size cap from the org config. Browser already downscales,
  // so this primarily catches misconfigured / malicious clients.
  const cfg = await getAttendanceConfig(authUser.organizationId);
  const maxBytes = Math.max(50, cfg.facePhotoMaxKb) * 1024;
  if (file.size === 0) {
    return NextResponse.json(
      { success: false, error: 'Empty file' },
      { status: 400 },
    );
  }
  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        success: false,
        error: `Photo too large (max ${cfg.facePhotoMaxKb} KB). Reduce capture quality.`,
      },
      { status: 413 },
    );
  }

  // Refuse photo upload outright when the org has the feature off — keeps
  // the FTP free of stray uploads from misbehaving clients.
  if (cfg.faceCaptureMode === 'OFF') {
    return NextResponse.json(
      { success: false, error: 'Face capture is disabled for this organization' },
      { status: 403 },
    );
  }

  // ─── Anti-spoofing: liveness check ───────────────────────────────────
  // The client posts livenessPassed: "true" | "false" when faceLivenessMode
  // is enabled. We enforce based on the org's mode:
  //   OFF        → never check this field, accept anything.
  //   PERMISSIVE → reject only when client explicitly says "false". A
  //                missing field (older client, detector errored) is
  //                accepted on the assumption that it's a transient
  //                client issue, not a spoof attempt.
  //   STRICT     → reject "false" AND missing — the client must affirm
  //                liveness was checked and passed.
  const rawLiveness = formData.get('livenessPassed');
  const livenessSent =
    rawLiveness === 'true'
      ? true
      : rawLiveness === 'false'
        ? false
        : null;
  if (cfg.faceLivenessMode !== 'OFF') {
    const blockFalse = livenessSent === false;
    const blockMissing = cfg.faceLivenessMode === 'STRICT' && livenessSent === null;
    if (blockFalse || blockMissing) {
      return NextResponse.json(
        {
          success: false,
          error: blockFalse
            ? 'Liveness check failed — the photo appears static. Retake while looking at the camera.'
            : 'Liveness check is required but the client did not run it. Try again.',
          code: 'LIVENESS_FAILED',
        },
        { status: 403 },
      );
    }
  }

  // ─── Anti-proxy: refuse multi-face frames ────────────────────────────
  // The client tells us how many faces it detected in the captured frame.
  // We refuse anything with 2+ faces because the most common proxy attack
  // is "user holds a colleague's phone next to their own face." This guard
  // runs whenever face capture is on, independent of faceVerifyMode — even
  // an org that hasn't enrolled anyone yet benefits from "exactly one
  // person in the photo."
  const rawFaceCount = formData.get('faceCount');
  const reportedFaceCount =
    typeof rawFaceCount === 'string' && /^\d+$/.test(rawFaceCount)
      ? Math.min(99, parseInt(rawFaceCount, 10))
      : null;
  if (reportedFaceCount !== null && reportedFaceCount > 1) {
    return NextResponse.json(
      {
        success: false,
        error: `Multiple faces detected (${reportedFaceCount}). Only one person can be in the frame at a time.`,
        code: 'MULTIPLE_FACES',
        faceCount: reportedFaceCount,
      },
      { status: 403 },
    );
  }

  // ─── Face verification (gated by faceVerifyMode) ──────────────────────
  //
  // OFF      → never look at the descriptor, behave like today.
  // WARN     → if descriptor + enrollment exist, compute the score and
  //            return it. Mismatches are logged but the upload proceeds.
  // ENFORCE  → require an enrollment AND a descriptor that matches within
  //            faceMatchThreshold. Block (403) on missing enrollment or
  //            mismatch.
  //
  // Note: descriptor extraction happens in the browser. The server never
  // runs face-api.js — it just compares two Float32Arrays.
  let faceMatch: number | null = null;
  let verified = false;
  if (cfg.faceVerifyMode !== 'OFF') {
    const submitted = decodeDescriptor(formData.get('descriptor'));
    const enrollment = await (prisma as any).faceEnrollment.findUnique({
      where: { userId: authUser.id },
      select: { descriptor: true },
    });

    if (!enrollment) {
      if (cfg.faceVerifyMode === 'ENFORCE') {
        return NextResponse.json(
          {
            success: false,
            error:
              'No face enrollment on file. Please ask your admin to add a profile photo first.',
            code: 'FACE_NOT_ENROLLED',
          },
          { status: 403 },
        );
      }
      // WARN mode + no enrollment → let the photo through, no score
      // available. The user will see a hint in the widget to enroll.
    } else if (!submitted) {
      // Client didn't (or couldn't) compute a descriptor. In ENFORCE we
      // must refuse; in WARN we tolerate (older clients / no-face frames).
      if (cfg.faceVerifyMode === 'ENFORCE') {
        return NextResponse.json(
          {
            success: false,
            error:
              'No face detected in the captured photo. Please retake with your face fully visible.',
            code: 'FACE_NOT_DETECTED',
          },
          { status: 400 },
        );
      }
    } else {
      try {
        const stored = bytesToDescriptor(enrollment.descriptor as Buffer);
        faceMatch = euclideanDistance(stored, submitted);
        verified = faceMatch <= cfg.faceMatchThreshold;
        if (!verified && cfg.faceVerifyMode === 'ENFORCE') {
          return NextResponse.json(
            {
              success: false,
              error: `Face does not match enrollment (score ${faceMatch.toFixed(2)}, threshold ${cfg.faceMatchThreshold}).`,
              code: 'FACE_MISMATCH',
              faceMatch,
            },
            { status: 403 },
          );
        }
      } catch (err) {
        console.error('[attendance/photo] face compare failed:', err);
        // Treat as a soft failure: in WARN we let the upload through with
        // no score; in ENFORCE we refuse since we can't prove identity.
        if (cfg.faceVerifyMode === 'ENFORCE') {
          return NextResponse.json(
            {
              success: false,
              error: 'Face verification could not be completed. Please retake.',
              code: 'FACE_VERIFY_FAILED',
            },
            { status: 500 },
          );
        }
      }
    }
  }

  // ─── Storage opt-out when verification already proved identity ───────
  // When face verification ran and either succeeded (verified=true) or
  // failed (verified=false), the match score itself is the audit trail —
  // the JPEG is redundant. Skip the FTP upload entirely if the org has
  // opted into not storing verified-only or never-storing photos. Saves
  // storage and shaves the slowest tail of the punch flow.
  //   ALWAYS            → keep uploading (legacy behavior).
  //   ON_MISMATCH_ONLY  → upload only when verification failed (verified=false).
  //   NEVER             → never upload when verification ran (regardless of pass/fail).
  // Only applies when verification actually ran AND produced a numeric
  // score; if descriptors were missing or the user wasn't enrolled, we
  // fall through to the upload so there's at least a photo on the row.
  const verificationRan = cfg.faceVerifyMode !== 'OFF' && faceMatch !== null;
  const skipStorage =
    verificationRan &&
    (cfg.facePhotoStoreAfterVerify === 'NEVER' ||
      (cfg.facePhotoStoreAfterVerify === 'ON_MISMATCH_ONLY' && verified));
  if (skipStorage) {
    return NextResponse.json({
      success: true,
      // No file means no URL — the attendance row will store null for
      // checkInPhoto / checkOutPhoto. Verification metadata (faceMatch,
      // verified, livenessPassed) still lands on the row via the punch
      // endpoint so the audit trail is preserved.
      url: null,
      faceMatch,
      verified,
      livenessPassed: livenessSent,
      stored: false,
    });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Filename keeps user + day + punch type so admins can sanity-check the
  // upload at a glance without opening the row. No PII in the filename
  // beyond what the URL already exposes (the user owns the photo).
  const safeUserId = authUser.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const day = todayKey();
  const ext = extFor(mime);
  const filename = `att_${safeUserId}_${day}_${punchType}_${Date.now()}.${ext}`;
  // Bucket uploads into month-folders so the retention sweeper can rm
  // whole months at a time instead of stat-ing 50k files in a flat dir
  // every day. Format: att/YYYY-MM. `day` is YYYY-MM-DD; slice first 7.
  const subdir = `att/${day.slice(0, 7)}`;

  try {
    const url = await uploadToHostinger(buffer, filename, subdir);
    return NextResponse.json({
      success: true,
      url,
      // Verification context. Always present in the response so the widget
      // can show a uniform UI; faceMatch is null when verification didn't
      // run (OFF / no enrollment / no descriptor).
      faceMatch,
      verified,
      // Echo liveness result back so the widget can include it on the
      // punch row for audit. null when liveness wasn't part of this
      // capture (faceLivenessMode === OFF or older client).
      livenessPassed: livenessSent,
    });
  } catch (err) {
    console.error('[attendance/photo] upload failed:', err);
    return NextResponse.json(
      { success: false, error: 'Photo upload failed. Try again.' },
      { status: 502 },
    );
  }
}
