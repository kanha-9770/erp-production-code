/**
 * GET /api/leaves/calendar
 *   Combined endpoint that returns everything a calendar view needs in a
 *   single round-trip:
 *     - weeklyOffDays (from AttendanceConfiguration)
 *     - holidays      (Holiday table, falls back to form-based reader)
 *     - leaves        (LeaveRequest rows overlapping the requested range)
 *
 *   Query params:
 *     ?from=YYYY-MM-DD            inclusive lower bound (defaults to first of current month)
 *     ?to=YYYY-MM-DD              inclusive upper bound (defaults to last of current month)
 *     ?scope=mine|org             "mine" → caller's leaves only (default).
 *                                 "org"  → all leaves in the org (admin/approver only).
 *     ?statuses=PENDING,APPROVED  comma-separated whitelist (default: all).
 *     ?withDetails=1              include applicant info on each leave.
 *
 *   Read-only; no side effects.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';
import { canApproveLeave } from '@/lib/hr/leave-service';
import { getVisibleUserIdsForHierarchy } from '@/lib/database/roles';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: fmt(first), to: fmt(last) };
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403, headers: NO_STORE },
    );
  }

  const url = new URL(request.url);
  const def = defaultRange();
  const from = url.searchParams.get('from') ?? def.from;
  const to = url.searchParams.get('to') ?? def.to;
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json(
      { success: false, error: "'from' and 'to' must be YYYY-MM-DD with from <= to" },
      { status: 400, headers: NO_STORE },
    );
  }

  const scope = (url.searchParams.get('scope') ?? 'mine').toLowerCase();
  if (scope !== 'mine' && scope !== 'org') {
    return NextResponse.json(
      { success: false, error: "scope must be 'mine' or 'org'" },
      { status: 400, headers: NO_STORE },
    );
  }

  const statusesRaw = (url.searchParams.get('statuses') ?? '').toUpperCase();
  const statuses = statusesRaw
    ? statusesRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is (typeof ALL_STATUSES)[number] =>
          (ALL_STATUSES as readonly string[]).includes(s),
        )
    : Array.from(ALL_STATUSES);

  // Authorize "org" scope: only admins or approvers may pull org-wide.
  // For non-admin approvers (e.g. a Sales Head) we also narrow `org` to
  // their role-tree subtree so heads can't see sibling departments.
  let orgVisibleUserIds: string[] | null = null;
  if (scope === 'org') {
    const [admin, approver] = await Promise.all([
      isUserAdmin(authUser.id, authUser.organizationId),
      canApproveLeave(authUser.id, authUser.organizationId),
    ]);
    if (!admin && !approver) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403, headers: NO_STORE },
      );
    }
    // null = admin (no filter); a list = restrict to caller + descendants.
    orgVisibleUserIds = await getVisibleUserIdsForHierarchy(
      authUser.id,
      authUser.organizationId,
    );
  }

  const withDetails = url.searchParams.get('withDetails') === '1';

  // Fan-out — three independent queries in parallel.
  const [cfg, holidays, leaves] = await Promise.all([
    getAttendanceConfig(authUser.organizationId),
    (prisma as any).holiday.findMany({
      where: {
        organizationId: authUser.organizationId,
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, name: true, isOptional: true },
    }),
    (prisma as any).leaveRequest.findMany({
      where: {
        organizationId: authUser.organizationId,
        status: { in: statuses },
        startDate: { lte: to },
        endDate: { gte: from },
        ...(scope === 'mine'
          ? { userId: authUser.id }
          : orgVisibleUserIds
            ? { userId: { in: orgVisibleUserIds } }
            : {}),
      },
      orderBy: { startDate: 'asc' },
    }),
  ]);

  const weeklyOffDays = Array.isArray((cfg as any)?.weeklyOffDays)
    ? ((cfg as any).weeklyOffDays as number[])
    : [0];

  // Optional enrichment with applicant + leave-type info.
  let leavesOut: any[] = leaves.map((r: any) => ({
    id: r.id,
    userId: r.userId,
    leaveTypeId: r.leaveTypeId,
    startDate: r.startDate,
    endDate: r.endDate,
    duration: r.duration,
    status: r.status,
    totalDays: r.totalDays != null ? Number(r.totalDays.toString?.() ?? r.totalDays) : null,
    reason: r.reason ?? null,
  }));

  if (withDetails && leaves.length > 0) {
    const userIds: string[] = Array.from(new Set(leaves.map((r: any) => r.userId as string)));
    const typeIds: string[] = Array.from(new Set(leaves.map((r: any) => r.leaveTypeId as string)));
    const [users, types] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, first_name: true, last_name: true, department: true, avatar: true },
      }),
      (prisma as any).leaveType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true, name: true, code: true, color: true },
      }),
    ]);
    const userMap = new Map(users.map((u: any) => [u.id, u]));
    const typeMap = new Map((types as any[]).map((t) => [t.id, t]));
    leavesOut = leavesOut.map((l) => {
      const u: any = userMap.get(l.userId);
      const t: any = typeMap.get(l.leaveTypeId);
      return {
        ...l,
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
        leaveType: t ? { id: t.id, name: t.name, code: t.code, color: t.color } : null,
      };
    });
  }

  return NextResponse.json(
    {
      success: true,
      from,
      to,
      scope,
      weeklyOffDays,
      holidays,
      leaves: leavesOut,
    },
    { headers: NO_STORE },
  );
}
