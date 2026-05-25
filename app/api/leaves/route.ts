/**
 * GET  /api/leaves                  — list leave requests
 *   Query: ?status=PENDING&userId=&from=&to=&limit=
 *   Non-admins can only list their own leaves; userId is silently coerced
 *   to the caller's id. Admins / approvers can pass userId or omit it for
 *   the org-wide view.
 *
 * POST /api/leaves                  — apply for leave (self only)
 *   Body: { leaveTypeId, startDate, endDate, duration, reason?, attachmentUrl? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import {
  applyLeave,
  canApproveLeave,
  listRequests,
  LeaveError,
  type LeaveDuration,
  type LeaveRequestStatus,
  isValidDateStr,
} from '@/lib/hr/leave-service';
import { buildLeaveRecordData } from '@/lib/hr/leave-workflow';
import { fireWorkflow } from '@/lib/workflow/static-triggers';
import { getVisibleUserIdsForHierarchy } from '@/lib/database/roles';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, code },
    { status, headers: NO_STORE },
  );
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const url = new URL(request.url);
  const status = (url.searchParams.get('status') ?? undefined) as LeaveRequestStatus | undefined;
  const requestedUserId = url.searchParams.get('userId') ?? undefined;
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const limit = Number(url.searchParams.get('limit') ?? '200');

  if (status && !['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    return err("status must be one of PENDING|APPROVED|REJECTED|CANCELLED");
  }
  if (from && !isValidDateStr(from)) return err("'from' must be YYYY-MM-DD");
  if (to && !isValidDateStr(to)) return err("'to' must be YYYY-MM-DD");

  // Authorization: non-privileged users can only see their own.
  const [admin, approver] = await Promise.all([
    isUserAdmin(authUser.id, authUser.organizationId),
    canApproveLeave(authUser.id, authUser.organizationId),
  ]);

  let userIdFilter: string | undefined = requestedUserId;
  if (!admin && !approver) {
    userIdFilter = authUser.id;
  }

  // Approvers see the org by default, but a non-admin approver (e.g. a
  // department Head configured as an attendance approver) must only see
  // leaves from users at or below them in the role tree. Admins get `null`
  // and skip this filter. If the approver explicitly requested a userId
  // outside their subtree, return 403 rather than silently broadening.
  const visibleUserIds = await getVisibleUserIdsForHierarchy(
    authUser.id,
    authUser.organizationId,
  );
  if (visibleUserIds && userIdFilter && !visibleUserIds.includes(userIdFilter)) {
    return err('You cannot view leaves for that user.', 403);
  }

  const rows = await listRequests({
    organizationId: authUser.organizationId,
    userId: userIdFilter,
    userIds: userIdFilter ? undefined : visibleUserIds ?? undefined,
    status,
    from,
    to,
    limit: Number.isFinite(limit) ? limit : 200,
  });

  // Enrich with applicant + leave-type info so the UI can render names without
  // a second roundtrip. Only when explicitly requested to keep the default
  // payload tight.
  const withDetails = url.searchParams.get('withDetails') === '1';
  if (!withDetails) {
    return NextResponse.json({ success: true, requests: rows }, { headers: NO_STORE });
  }

  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const typeIds = Array.from(new Set(rows.map((r) => r.leaveTypeId)));
  const [users, types] = await Promise.all([
    userIds.length === 0
      ? []
      : prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, first_name: true, last_name: true, department: true, avatar: true },
        }),
    typeIds.length === 0
      ? []
      : (prisma as any).leaveType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, name: true, code: true, color: true },
        }),
  ]);
  const userMap = new Map(users.map((u: any) => [u.id, u]));
  const typeMap = new Map((types as any[]).map((t) => [t.id, t]));

  const enriched = rows.map((r) => {
    const u = userMap.get(r.userId) as any;
    const t = typeMap.get(r.leaveTypeId);
    return {
      ...r,
      user: u
        ? {
            id: u.id,
            email: u.email,
            firstName: u.first_name ?? null,
            lastName: u.last_name ?? null,
            department: u.department ?? null,
            avatar: u.avatar ?? null,
          }
        : null,
      leaveType: t ?? null,
    };
  });

  return NextResponse.json({ success: true, requests: enriched }, { headers: NO_STORE });
}

interface ApplyBody {
  leaveTypeId?: string;
  startDate?: string;
  endDate?: string;
  duration?: string;
  reason?: string | null;
  attachmentUrl?: string | null;
  isEmergency?: boolean;
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  let body: ApplyBody;
  try {
    body = (await request.json()) as ApplyBody;
  } catch {
    return err('Invalid JSON body');
  }

  if (!body.leaveTypeId) return err("'leaveTypeId' is required");
  if (!body.startDate || !isValidDateStr(body.startDate))
    return err("'startDate' must be YYYY-MM-DD");
  if (!body.endDate || !isValidDateStr(body.endDate))
    return err("'endDate' must be YYYY-MM-DD");

  const allowedDurations = ['FULL_DAY', 'HALF_DAY_FIRST', 'HALF_DAY_SECOND'];
  const duration = (body.duration ?? 'FULL_DAY') as LeaveDuration;
  if (!allowedDurations.includes(duration)) return err(`'duration' must be one of ${allowedDurations.join('|')}`);

  // Photo URL only accepted from our own uploader, mirrors attendance/punch.
  const attachmentUrl =
    typeof body.attachmentUrl === 'string' &&
    /^https?:\/\/businesscard\.nesscoglobal\.com\//.test(body.attachmentUrl)
      ? body.attachmentUrl
      : null;

  try {
    const created = await applyLeave({
      organizationId: authUser.organizationId,
      userId: authUser.id,
      leaveTypeId: body.leaveTypeId,
      startDate: body.startDate,
      endDate: body.endDate,
      duration,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 2000) : null,
      attachmentUrl,
      isEmergency: body.isEmergency === true,
    });
    // Fire workflow rules attached to "Leave" / "Leave Management" / etc.
    // Awaited the recordData lookup (cheap) but fire-and-forget the trigger
    // itself so a slow workflow runtime can't delay the user's response.
    buildLeaveRecordData(created).then((recordData) => {
      fireWorkflow({
        moduleName: 'Leave',
        action: 'Create',
        organizationId: authUser.organizationId!,
        userId: authUser.id,
        recordId: created.id,
        recordData,
      });
    });
    return NextResponse.json({ success: true, request: created }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof LeaveError) return err(e.message, e.status, e.code);
    console.error('[POST /api/leaves]', e);
    return err('Failed to apply for leave', 500);
  }
}
