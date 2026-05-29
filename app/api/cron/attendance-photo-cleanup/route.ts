/**
 * Trigger for the attendance-photo retention sweep.
 *
 *   POST /api/cron/attendance-photo-cleanup
 *   Body : { organizationId?: string }   (optional; omit to sweep all)
 *   Auth : either an admin session OR an `x-cron-secret` header that
 *          matches process.env.CRON_SECRET (for an external scheduler).
 *
 * Behavior:
 *   • Admin session: sweeps only the admin's own organization. The body's
 *     organizationId is ignored to keep tenant boundaries clean.
 *   • External scheduler (CRON_SECRET): sweeps the org named in the body,
 *     or every org if `organizationId` is omitted. This is the path the
 *     daily cron uses.
 *
 * The sweep deletes photos older than each org's facePhotoRetentionDays
 * setting (0 = retain forever, default 30). Failures within an org don't
 * block other orgs; a leftover failed delete just retries on the next
 * sweep.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import {
  cleanupAllOrgsAttendancePhotos,
  cleanupOrgAttendancePhotos,
} from '@/lib/hr/attendance-photo-cleanup';

export const dynamic = 'force-dynamic';
// FTP deletes are slow; give the sweep room to drain a large backlog
// before Vercel/Next forcibly kills the request. The lib also caps at
// MAX_DELETIONS_PER_ORG to keep any single sweep bounded.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* allow empty body — both auth paths work without one */
  }

  // Auth path A: external scheduler with CRON_SECRET header.
  const headerSecret = request.headers.get('x-cron-secret') ?? '';
  const expected = process.env.CRON_SECRET ?? '';
  const secretOk = expected.length > 0 && headerSecret === expected;

  if (secretOk) {
    // External scheduler path. Body MAY specify `organizationId` to sweep
    // a single org; otherwise we sweep every org with an attendance
    // configuration row.
    try {
      if (typeof body.organizationId === 'string' && body.organizationId) {
        const result = await cleanupOrgAttendancePhotos(body.organizationId);
        return NextResponse.json({ success: true, result });
      }
      const summary = await cleanupAllOrgsAttendancePhotos();
      return NextResponse.json({ success: true, summary });
    } catch (err: any) {
      console.error('[cron/photo-cleanup] sweep failed:', err);
      return NextResponse.json(
        { success: false, error: err?.message ?? 'internal error' },
        { status: 500 },
      );
    }
  }

  // Auth path B: admin session. Always scoped to the admin's own org so
  // an admin can't fire a sweep against another tenant by tweaking the
  // body.
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'User is not a member of any organization' },
      { status: 403 },
    );
  }
  const admin = await isUserAdmin(authUser.id, authUser.organizationId);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: 'Admin access required' },
      { status: 403 },
    );
  }
  try {
    const result = await cleanupOrgAttendancePhotos(authUser.organizationId);
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    console.error('[cron/photo-cleanup] admin-trigger failed:', err);
    return NextResponse.json(
      { success: false, error: err?.message ?? 'internal error' },
      { status: 500 },
    );
  }
}
