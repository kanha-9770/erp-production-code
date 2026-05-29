import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { canApproveAttendance } from '@/lib/hr/attendance-permissions';
import {
  applyDayCapAutoCheckouts,
  distanceMeters,
  orgTimezone,
  todayKey,
} from '@/lib/hr/attendance-service';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';
import { computeEffectiveStatus } from '@/lib/hr/attendance-status';
import { userHasRouteAccess } from '@/lib/auth/route-meta';
import { getVisibleUserIdsForHierarchy } from '@/lib/database/roles';

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
  // Authorisation is layered:
  //   1. Admins / configured attendance approvers (legacy gate).
  //   2. Users whose role has been explicitly granted the route at
  //      Settings → Permission → Route Permissions.
  // The second branch is what makes "I gave my Team Lead role access to
  // /attendance/team" actually work — without it, the API still 403s even
  // though the sidebar (now) shows the link.
  const approver = await canApproveAttendance(
    authUser.id,
    authUser.organizationId,
  );
  const allowed =
    approver ||
    (await userHasRouteAccess(
      authUser.id,
      authUser.organizationId,
      '/attendance/team',
    ));
  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Only admins, configured attendance approvers, or roles granted /attendance/team can view team attendance.',
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

  // 24-hour cap: close any prior-day rows where a teammate forgot to check
  // out, BEFORE we read the attendance rows. Without this the team view
  // shows yesterday's "Working" rows with no check-out time / worked / OT
  // for users who haven't opened their own widget since punching in.
  // Indexed lookup → zero work in the common case.
  await applyDayCapAutoCheckouts(
    { organizationId: authUser.organizationId },
    new Date(),
  );

  // Role-hierarchy scoping: non-admins see only themselves + every user
  // sitting strictly below them in the role tree (e.g. IT Head sees the IT
  // subtree, not Sales). Admins get `null` and skip the filter entirely.
  // The same rule is used by Employee Master so the visibility surfaces stay
  // consistent.
  const visibleUserIds = await getVisibleUserIdsForHierarchy(
    authUser.id,
    authUser.organizationId,
  );

  // If a non-admin caller has no inherited users (leaf role with no
  // assignments below it) we still let them see their own row.
  if (visibleUserIds && userIdFilter && !visibleUserIds.includes(userIdFilter)) {
    return NextResponse.json(
      { success: false, error: 'You cannot view attendance for that user.' },
      { status: 403 },
    );
  }

  // Pull every active user in the org. We left-join attendance per (user,
  // date) below in JS — tractable for the dashboards we expect (≤500 users
  // × ≤92 days). Anything bigger should paginate at the API.
  const users = await prisma.user.findMany({
    where: {
      organizationId: authUser.organizationId,
      ...(userIdFilter
        ? { id: userIdFilter }
        : visibleUserIds
          ? { id: { in: visibleUserIds } }
          : {}),
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

  // Per-org geofence centre. Used to flag punches that landed outside the
  // configured radius so admins can spot off-site check-ins at a glance.
  // We deliberately ignore `geofenceMode` here: as soon as the admin has
  // filled in lat/lng/radius they expect to see who's punching out of
  // range, even if mode is still OFF (the default). Switching to ENFORCE
  // is a separate decision that's only about *blocking* — visibility
  // shouldn't depend on it.
  const cfg = await getAttendanceConfig(authUser.organizationId);
  const fenceActive =
    cfg.geofenceLat != null &&
    cfg.geofenceLng != null &&
    cfg.geofenceRadiusM != null;
  const fenceCentre = fenceActive
    ? { lat: cfg.geofenceLat as number, lng: cfg.geofenceLng as number }
    : null;
  const fenceRadius = fenceActive ? (cfg.geofenceRadiusM as number) : null;

  function annotateGeo(
    lat: number | null,
    lng: number | null,
    punched: boolean,
  ) {
    // `locationMissing` is independent of fence config: any time someone
    // punched without sharing GPS the admin should see it, so they can
    // notice users dodging the check even before the org has saved a fence.
    if (lat == null || lng == null) {
      return {
        distanceM: null,
        outsideRadius: null,
        locationMissing: punched,
      };
    }
    if (!fenceCentre || !fenceRadius) {
      return { distanceM: null, outsideRadius: null, locationMissing: false };
    }
    const d = distanceMeters({ lat, lng }, fenceCentre);
    return {
      distanceM: Math.round(d),
      outsideRadius: d > fenceRadius,
      locationMissing: false,
    };
  }

  return NextResponse.json(
    {
      success: true,
      from,
      to,
      // IANA tz the rows' check-in/out times should be rendered in.
      reportTimezone: orgTimezone(cfg),
      geofence: {
        mode: cfg.geofenceMode,
        lat: cfg.geofenceLat,
        lng: cfg.geofenceLng,
        radiusM: cfg.geofenceRadiusM,
      },
      // Same snapshots the My Attendance response carries — lets the
      // shared AttendanceRecordDetail panel render the verified badge and
      // label missing photos correctly (expired vs never-stored).
      faceVerify: {
        mode: cfg.faceVerifyMode,
        threshold: cfg.faceMatchThreshold,
      },
      facePhotoStorage: {
        storeAfterVerify: cfg.facePhotoStoreAfterVerify,
        retentionDays: cfg.facePhotoRetentionDays,
      },
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
      // Per-org thresholds so the admin's team view applies the same
      // cutoffs as the user's My Attendance view, even if the admin's
      // own user is in a different org someday.
      thresholds: {
        halfDayMinHours: cfg.halfDayMinHours,
        fullDayMinHours: cfg.fullDayMinHours,
      },
      records: records.map((r) => {
        const inGeo = annotateGeo(
          (r as any).checkInLat ?? null,
          (r as any).checkInLng ?? null,
          !!r.checkedIn,
        );
        const outGeo = annotateGeo(
          (r as any).checkOutLat ?? null,
          (r as any).checkOutLng ?? null,
          !!r.checkedOut,
        );
        const checkInMs = (r as any).checkInAt
          ? new Date((r as any).checkInAt).getTime()
          : null;
        const checkOutMs = (r as any).checkOutAt
          ? new Date((r as any).checkOutAt).getTime()
          : null;
        const workedMinutes =
          checkInMs !== null && checkOutMs !== null && checkOutMs > checkInMs
            ? Math.round((checkOutMs - checkInMs) / 60_000)
            : 0;
        const verdict = computeEffectiveStatus(
          {
            checkedIn: !!r.checkedIn,
            checkedOut: !!r.checkedOut,
            isAutoCheckedOut: !!(r as any).isAutoCheckedOut,
            overtimeOptedIn: !!(r as any).overtimeOptedIn,
            workedMinutes,
            lateMinutes: (r as any).lateMinutes ?? 0,
          },
          {
            halfDayMinHours: cfg.halfDayMinHours,
            fullDayMinHours: cfg.fullDayMinHours,
          },
        );
        return {
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
          overtimeOptedIn: !!(r as any).overtimeOptedIn,
          isAutoCheckedOut: !!(r as any).isAutoCheckedOut,
          status: (r as any).status ?? null,
          effectiveStatus: verdict.status,
          effectiveStatusReason: verdict.reason ?? null,
          checkInPhoto: (r as any).checkInPhoto ?? null,
          checkOutPhoto: (r as any).checkOutPhoto ?? null,
          checkInLat: (r as any).checkInLat ?? null,
          checkInLng: (r as any).checkInLng ?? null,
          checkOutLat: (r as any).checkOutLat ?? null,
          checkOutLng: (r as any).checkOutLng ?? null,
          checkInSource: (r as any).checkInSource ?? null,
          checkOutSource: (r as any).checkOutSource ?? null,
          checkInDistanceM: inGeo.distanceM,
          checkInOutsideRadius: inGeo.outsideRadius,
          checkInLocationMissing: inGeo.locationMissing,
          checkOutDistanceM: outGeo.distanceM,
          checkOutOutsideRadius: outGeo.outsideRadius,
          checkOutLocationMissing: outGeo.locationMissing,
        };
      }),
    },
    {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    },
  );
}
