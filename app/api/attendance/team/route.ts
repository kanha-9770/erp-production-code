import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { canApproveAttendance } from '@/lib/hr/attendance-permissions';
import { todayKey } from '@/lib/hr/attendance-service';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftDays(yyyymmdd: string, delta: number): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
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
      { success: false, error: 'User is not a member of any organization' },
      { status: 403 },
    );
  }
  const allowed = await canApproveAttendance(
    authUser.id,
    authUser.organizationId,
  );
  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Only admins or configured attendance approvers can view team attendance.',
      },
      { status: 403 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const today = todayKey();
  const fromRaw = sp.get('from');
  const toRaw = sp.get('to');
  const userIdFilter = sp.get('userId');

  // Default to a single day (today) since the team view is wide; admins pick
  // a range only when they need to.
  const to = toRaw && DATE_RE.test(toRaw) ? toRaw : today;
  const from = fromRaw && DATE_RE.test(fromRaw) ? fromRaw : to;

  if (from > to) {
    return NextResponse.json(
      { success: false, error: "'from' must be on or before 'to'" },
      { status: 400 },
    );
  }
  if (shiftDays(from, 92) < to) {
    return NextResponse.json(
      { success: false, error: 'Range too large for team view (max 92 days)' },
      { status: 400 },
    );
  }

  // Pull every active user in the org. We left-join attendance per (user,
  // date) below in JS — tractable for the dashboards we expect (≤500 users
  // × ≤92 days). Anything bigger should paginate at the API.
  const users = await prisma.user.findMany({
    where: {
      organizationId: authUser.organizationId,
      ...(userIdFilter ? { id: userIdFilter } : {}),
    },
    select: {
      id: true,
      email: true,
      username: true,
      first_name: true,
      last_name: true,
      employee: {
        select: { id: true, employeeName: true, department: true, designation: true },
      },
    },
    orderBy: { email: 'asc' },
  });

  const userIds = users.map((u) => u.id);
  const records = await prisma.attendance.findMany({
    where: {
      userId: { in: userIds },
      date: { gte: from, lte: to },
    },
    orderBy: [{ date: 'desc' }, { userId: 'asc' }],
  });

  return NextResponse.json(
    {
      success: true,
      from,
      to,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name:
          [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
          u.employee?.employeeName ||
          u.username ||
          u.email,
        department: u.employee?.department ?? null,
        designation: u.employee?.designation ?? null,
        employeeId: u.employee?.id ?? null,
      })),
      records: records.map((r) => ({
        id: r.id,
        userId: r.userId,
        date: r.date,
        checkedIn: r.checkedIn,
        checkedOut: r.checkedOut,
        checkInAt: (r as any).checkInAt ?? null,
        checkOutAt: (r as any).checkOutAt ?? null,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        lateMinutes: (r as any).lateMinutes ?? 0,
        earlyOutMinutes: (r as any).earlyOutMinutes ?? 0,
        overtimeMinutes: (r as any).overtimeMinutes ?? 0,
        isAutoCheckedOut: !!(r as any).isAutoCheckedOut,
        status: (r as any).status ?? null,
        checkInPhoto: (r as any).checkInPhoto ?? null,
        checkOutPhoto: (r as any).checkOutPhoto ?? null,
        checkInLat: (r as any).checkInLat ?? null,
        checkInLng: (r as any).checkInLng ?? null,
        checkOutLat: (r as any).checkOutLat ?? null,
        checkOutLng: (r as any).checkOutLng ?? null,
        checkInSource: (r as any).checkInSource ?? null,
        checkOutSource: (r as any).checkOutSource ?? null,
      })),
    },
    {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    },
  );
}
