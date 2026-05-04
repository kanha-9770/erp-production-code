import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { uploadToHostinger } from '@/lib/hostinger-upload';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';
import { todayKey } from '@/lib/hr/attendance-service';

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

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Filename keeps user + day + punch type so admins can sanity-check the
  // upload at a glance without opening the row. No PII in the filename
  // beyond what the URL already exposes (the user owns the photo).
  const safeUserId = authUser.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const day = todayKey();
  const ext = extFor(mime);
  const filename = `att_${safeUserId}_${day}_${punchType}_${Date.now()}.${ext}`;

  try {
    const url = await uploadToHostinger(buffer, filename);
    return NextResponse.json({ success: true, url });
  } catch (err) {
    console.error('[attendance/photo] upload failed:', err);
    return NextResponse.json(
      { success: false, error: 'Photo upload failed. Try again.' },
      { status: 502 },
    );
  }
}
