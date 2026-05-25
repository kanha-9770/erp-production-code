import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, getRequestMeta, isUserAdmin } from '@/lib/api-helpers';
import { canApproveAttendance } from '@/lib/hr/attendance-permissions';
import {
  RegularizationError,
  createRegularization,
} from '@/lib/hr/attendance-regularization';
import { getVisibleUserIdsForHierarchy } from '@/lib/database/roles';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface CreateBody {
  date?: string;
  userId?: string; // admin acting on behalf
  requestedCheckInAt?: string | null;
  requestedCheckOutAt?: string | null;
  reason?: string;
}

function parseIso(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403 },
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (!body.date || !DATE_RE.test(body.date)) {
    return NextResponse.json(
      { success: false, error: "'date' must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  // userId in the body is honored only for admins or configured attendance
  // approvers (acting on behalf of someone else). Everyone else submits
  // for themselves.
  let targetUserId = authUser.id;
  if (body.userId && body.userId !== authUser.id) {
    const allowed = await canApproveAttendance(
      authUser.id,
      authUser.organizationId,
    );
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only admins or attendance approvers can regularize for other users',
        },
        { status: 403 },
      );
    }
    targetUserId = body.userId;
  }

  const { ipAddress, userAgent } = getRequestMeta(request);

  try {
    const result = await createRegularization({
      userId: targetUserId,
      organizationId: authUser.organizationId,
      requestedById: authUser.id,
      date: body.date,
      requestedCheckInAt: parseIso(body.requestedCheckInAt),
      requestedCheckOutAt: parseIso(body.requestedCheckOutAt),
      reason: body.reason ?? '',
      ip: ipAddress === 'unknown' ? null : ipAddress,
      userAgent,
    });
    return NextResponse.json({ success: true, regularization: result });
  } catch (err) {
    if (err instanceof RegularizationError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error('[regularize] create failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to create regularization' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const status = sp.get('status'); // PENDING | APPROVED | REJECTED | CANCELLED
  const scopeRaw = sp.get('scope'); // 'mine' | 'all' (admin only)

  // Approvers (configurable via roles) and admins can list "all" pending
  // requests for the org. Everyone else gets the "mine" scope only.
  const canApprove = await canApproveAttendance(
    authUser.id,
    authUser.organizationId,
  );
  const admin = await isUserAdmin(authUser.id, authUser.organizationId);
  const scope: 'mine' | 'all' = scopeRaw === 'all' && canApprove ? 'all' : 'mine';

  const where: any = { organizationId: authUser.organizationId };
  if (scope === 'mine') {
    // "Mine" means rows the user is the subject of OR the requester for.
    // The latter covers admins who submitted on behalf — they still see
    // the request in their own list.
    where.OR = [{ userId: authUser.id }, { requestedById: authUser.id }];
  } else {
    // scope === 'all': non-admin approvers (e.g. a Sales Head configured as
    // an attendance approver) must only see regularizations from users at
    // or below them in the role tree. Admins get `null` and skip the
    // filter. Returning [] for an approver with no descendants narrows the
    // list to nothing, which is correct — they have no one to approve.
    const visibleUserIds = await getVisibleUserIdsForHierarchy(
      authUser.id,
      authUser.organizationId,
    );
    if (visibleUserIds) {
      where.userId = { in: visibleUserIds };
    }
  }
  if (status && /^(PENDING|APPROVED|REJECTED|CANCELLED)$/.test(status)) {
    where.status = status;
  }

  const rows = await (prisma as any).attendanceRegularization.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });

  // Resolve names so the UI doesn't have to do per-row lookups.
  const userIds = Array.from(
    new Set<string>(
      rows.flatMap((r: any) =>
        [r.userId, r.requestedById, r.reviewedById].filter(Boolean),
      ),
    ),
  );
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, first_name: true, last_name: true, username: true },
  });
  const nameById = new Map<string, { name: string; email: string }>();
  for (const u of users) {
    const composed =
      [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
      u.username ||
      u.email;
    nameById.set(u.id, { name: composed ?? u.email, email: u.email });
  }

  return NextResponse.json({
    success: true,
    scope,
    isAdmin: admin,
    canApprove,
    regularizations: rows.map((r: any) => ({
      id: r.id,
      date: r.date,
      status: r.status,
      reason: r.reason,
      currentCheckInAt: r.currentCheckInAt,
      currentCheckOutAt: r.currentCheckOutAt,
      requestedCheckInAt: r.requestedCheckInAt,
      requestedCheckOutAt: r.requestedCheckOutAt,
      reviewedAt: r.reviewedAt,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt,
      user: nameById.get(r.userId) ?? null,
      requestedBy: nameById.get(r.requestedById) ?? null,
      reviewedBy: r.reviewedById ? nameById.get(r.reviewedById) ?? null : null,
    })),
  });
}
