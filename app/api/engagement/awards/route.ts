/**
 * GET  /api/engagement/awards
 *   List EngagementAward rows for the caller's organization. Optional
 *   `?submissionIds=a,b,c` narrows to specific submissions (used by the
 *   employee profile page to fetch only the rows it cares about).
 *
 * POST /api/engagement/awards
 *   Upsert one award. Body:
 *     { submissionId, moduleType,
 *       points?:        number | null,      // 1..12, null clears
 *       reviewStatus?:  "approved"|"rejected"|"needs-info"|"pending"|null,
 *       notes?:         string | null }
 *   Restricted to Admin / HR (treated as anyone in an "HR" department or
 *   anyone whose role flags isAdmin / contains "admin"). Standard users
 *   get 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: NO_STORE },
  );
}

const ALLOWED_MODULES = new Set([
  'Kaizen',
  'Suggestion',
  'Problem',
  'Initiative',
  'Target',
]);

const ALLOWED_REVIEW_STATUS = new Set([
  'approved',
  'rejected',
  'needs-info',
  'pending',
]);

const POINTS_MIN = 1;
const POINTS_MAX = 12;
// Discretionary bonus points are a separate scale — usable for spot
// awards, milestone recognition, etc. 0 clears any existing bonus.
const BONUS_MIN = 0;
const BONUS_MAX = 100;

async function isReviewer(
  userId: string,
  organizationId: string | null,
): Promise<{ ok: boolean; name: string }> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      employee: { select: { employeeName: true, department: true } },
    },
  });
  const name = me?.employee?.employeeName || me?.email || 'Reviewer';
  if (await isUserAdmin(userId, organizationId)) return { ok: true, name };
  const dept = (me?.employee?.department ?? '').toLowerCase();
  if (dept.includes('hr') || dept.includes('human resource'))
    return { ok: true, name };
  return { ok: false, name };
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const url = new URL(request.url);
  const submissionIdsParam = url.searchParams.get('submissionIds');
  const where: Record<string, unknown> = {
    organizationId: authUser.organizationId,
  };
  if (submissionIdsParam) {
    const ids = submissionIdsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length > 0) where.submissionId = { in: ids };
  }

  const rows = await (prisma as any).engagementAward.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
  });

  return NextResponse.json(
    { success: true, awards: rows },
    { headers: NO_STORE },
  );
}

interface UpsertBody {
  submissionId?: string;
  moduleType?: string;
  points?: number | null;
  bonusPoints?: number | null;
  bonusReason?: string | null;
  reviewStatus?: string | null;
  notes?: string | null;
  // Inline reviewer remark (separate from review notes).
  remark?: string | null;
  // Best-Kaizen spotlight (only meaningful when moduleType === "Kaizen").
  isBestKaizen?: boolean | null;
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const { ok, name } = await isReviewer(authUser.id, authUser.organizationId);
  if (!ok) return err('Reviews and points are restricted to Admin / HR.', 403);

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return err('Invalid JSON body');
  }

  const submissionId = (body.submissionId ?? '').toString().trim();
  const moduleType = (body.moduleType ?? '').toString().trim();
  if (!submissionId) return err("'submissionId' is required");
  if (!ALLOWED_MODULES.has(moduleType))
    return err("'moduleType' must be one of Kaizen|Suggestion|Problem|Initiative|Target");

  // Normalise points: undefined leaves the field alone on upsert; null
  // clears it; numbers are clamped to [1, 12].
  let pointsValue: number | null | undefined;
  if (body.points === null) {
    pointsValue = null;
  } else if (typeof body.points === 'number' && Number.isFinite(body.points)) {
    pointsValue = Math.max(POINTS_MIN, Math.min(POINTS_MAX, Math.floor(body.points)));
  } else if (body.points === undefined) {
    pointsValue = undefined;
  } else {
    return err("'points' must be a number 1..12, null, or omitted");
  }

  let statusValue: string | null | undefined;
  if (body.reviewStatus === null) {
    statusValue = null;
  } else if (typeof body.reviewStatus === 'string') {
    const s = body.reviewStatus.trim();
    if (s && !ALLOWED_REVIEW_STATUS.has(s))
      return err("'reviewStatus' must be approved|rejected|needs-info|pending or null");
    statusValue = s || null;
  } else if (body.reviewStatus === undefined) {
    statusValue = undefined;
  } else {
    return err("'reviewStatus' must be a string or null");
  }

  let notesValue: string | null | undefined;
  if (body.notes === null) notesValue = null;
  else if (typeof body.notes === 'string')
    notesValue = body.notes.trim().slice(0, 5000) || null;
  else if (body.notes === undefined) notesValue = undefined;
  else return err("'notes' must be a string or null");

  let bonusPointsValue: number | null | undefined;
  if (body.bonusPoints === null) {
    bonusPointsValue = null;
  } else if (typeof body.bonusPoints === 'number' && Number.isFinite(body.bonusPoints)) {
    bonusPointsValue = Math.max(BONUS_MIN, Math.min(BONUS_MAX, Math.floor(body.bonusPoints)));
  } else if (body.bonusPoints === undefined) {
    bonusPointsValue = undefined;
  } else {
    return err("'bonusPoints' must be a number 0..100, null, or omitted");
  }

  let bonusReasonValue: string | null | undefined;
  if (body.bonusReason === null) bonusReasonValue = null;
  else if (typeof body.bonusReason === 'string')
    bonusReasonValue = body.bonusReason.trim().slice(0, 5000) || null;
  else if (body.bonusReason === undefined) bonusReasonValue = undefined;
  else return err("'bonusReason' must be a string or null");

  let remarkValue: string | null | undefined;
  if (body.remark === null) remarkValue = null;
  else if (typeof body.remark === 'string')
    remarkValue = body.remark.trim().slice(0, 5000) || null;
  else if (body.remark === undefined) remarkValue = undefined;
  else return err("'remark' must be a string or null");

  let bestKaizenValue: boolean | null | undefined;
  if (body.isBestKaizen === null) bestKaizenValue = null;
  else if (typeof body.isBestKaizen === 'boolean') bestKaizenValue = body.isBestKaizen;
  else if (body.isBestKaizen === undefined) bestKaizenValue = undefined;
  else return err("'isBestKaizen' must be a boolean or null");
  // Spotlight is Kaizen-only — silently coerce others to null.
  if (bestKaizenValue && moduleType !== 'Kaizen') bestKaizenValue = null;

  // Only stamp reviewer/reviewedAt when the review side changes.
  const reviewerStampUpdate =
    statusValue !== undefined || notesValue !== undefined
      ? {
          reviewerId: authUser.id,
          reviewerName: name,
          reviewedAt: new Date(),
        }
      : {};

  const data = {
    ...(pointsValue !== undefined ? { points: pointsValue } : {}),
    ...(bonusPointsValue !== undefined ? { bonusPoints: bonusPointsValue } : {}),
    ...(bonusReasonValue !== undefined ? { bonusReason: bonusReasonValue } : {}),
    ...(remarkValue !== undefined ? { remark: remarkValue } : {}),
    ...(bestKaizenValue !== undefined ? { isBestKaizen: bestKaizenValue } : {}),
    ...(statusValue !== undefined ? { reviewStatus: statusValue } : {}),
    ...(notesValue !== undefined ? { notes: notesValue } : {}),
    ...reviewerStampUpdate,
  };

  const row = await (prisma as any).engagementAward.upsert({
    where: {
      submissionId_moduleType: { submissionId, moduleType },
    },
    create: {
      organizationId: authUser.organizationId,
      submissionId,
      moduleType,
      points: pointsValue ?? null,
      bonusPoints: bonusPointsValue ?? null,
      bonusReason: bonusReasonValue ?? null,
      remark: remarkValue ?? null,
      isBestKaizen: bestKaizenValue ?? null,
      reviewStatus: statusValue ?? null,
      notes: notesValue ?? null,
      reviewerId: statusValue !== undefined || notesValue !== undefined ? authUser.id : null,
      reviewerName:
        statusValue !== undefined || notesValue !== undefined ? name : null,
      reviewedAt:
        statusValue !== undefined || notesValue !== undefined ? new Date() : null,
    },
    update: data,
  });

  return NextResponse.json({ success: true, award: row }, { headers: NO_STORE });
}
