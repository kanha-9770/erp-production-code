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
import {
  buildSyntheticDays,
  fetchDayFillContext,
  leaveInfoForDate,
  leaveDayFractionForStatus,
} from '@/lib/hr/attendance-day-fill';
import { lateHalfDayAppliesTo, lateHalfDayScopeOf } from '@/lib/hr/late-half-day';
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
      // Role IDs per user so the late-half-day rule can be scoped per role /
      // per user the same way Route Permissions are. Cheap join — we already
      // page these users for the dashboard.
      unitAssignments: { select: { roleId: true } },
      employee: {
        select: { id: true, employeeName: true, department: true, designation: true },
      },
    },
    orderBy: { email: 'asc' },
  });

  // userId → role IDs, used to resolve the per-user late-half-day verdict below.
  const roleIdsByUser = new Map<string, string[]>(
    users.map((u) => [
      u.id,
      Array.from(
        new Set(
          ((u as any).unitAssignments ?? [])
            .map((a: { roleId: string | null }) => a.roleId)
            .filter((r: string | null): r is string => !!r),
        ),
      ),
    ]),
  );

  const userIds = users.map((u) => u.id);
  const records = await prisma.attendance.findMany({
    where: {
      userId: { in: userIds },
      date: { gte: from, lte: to },
    },
    orderBy: [{ date: 'desc' }, { userId: 'asc' }],
  });

  // Face-enrollment coverage: which of these in-scope users have NO
  // FaceEnrollment row. Surfaced so HR can see exactly who will be blocked at
  // check-in once face verification runs in ENFORCE mode — a row is required,
  // and without one ENFORCE returns FACE_NOT_ENROLLED. Cheap indexed lookup
  // over the same user set we already paged for the dashboard.
  const enrolledRows = await (prisma as any).faceEnrollment.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true },
  });
  const enrolledSet = new Set<string>(
    enrolledRows.map((r: { userId: string }) => r.userId),
  );

  // Per-org geofence centre. Used to flag punches that landed outside the
  // configured radius so admins can spot off-site check-ins at a glance.
  // We deliberately ignore `geofenceMode` here: as soon as the admin has
  // filled in lat/lng/radius they expect to see who's punching out of
  // range, even if mode is still OFF (the default). Switching to ENFORCE
  // is a separate decision that's only about *blocking* — visibility
  // shouldn't depend on it.
  const cfg = await getAttendanceConfig(authUser.organizationId);
  const lateScope = lateHalfDayScopeOf(cfg);
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

  // ── Gap-fill: synthesize Absent / Weekly-off / Holiday / On-leave rows for
  // every (user, date) in the window that has NO real Attendance row, so the
  // team view shows a complete per-day calendar instead of only the days people
  // actually punched. Display only — nothing is written and pay is unaffected
  // (payroll already books these days via its own calendar walk).
  const realDatesByUser = new Map<string, Set<string>>();
  for (const r of records) {
    const set = realDatesByUser.get(r.userId) ?? new Set<string>();
    set.add(r.date);
    realDatesByUser.set(r.userId, set);
  }
  const dayFillCtx = await fetchDayFillContext({
    organizationId: authUser.organizationId,
    userIds,
    from,
    to,
  });
  const syntheticRecords = buildSyntheticDays({
    userIds,
    from,
    to,
    today,
    weeklyOffDays: cfg.weeklyOffDays ?? [],
    realDatesByUser,
    ctx: dayFillCtx,
  });

  // Display shape for users — reused for both the full roster and the
  // un-enrolled subset so the two never drift in how names are composed.
  const mappedUsers = users.map((u) => ({
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
  }));

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
        // Capture mode too: ENFORCE only actually blocks when capture is on
        // (OPTIONAL/REQUIRED). The UI uses both to decide how loud the
        // un-enrolled warning should be.
        captureMode: cfg.faceCaptureMode,
        threshold: cfg.faceMatchThreshold,
      },
      facePhotoStorage: {
        storeAfterVerify: cfg.facePhotoStoreAfterVerify,
        retentionDays: cfg.facePhotoRetentionDays,
      },
      users: mappedUsers,
      // In-scope users with no FaceEnrollment row — these are blocked at
      // check-in under ENFORCE. HR uses this to enroll them proactively.
      unenrolled: mappedUsers.filter((u) => !enrolledSet.has(u.id)),
      // Per-org thresholds so the admin's team view applies the same
      // cutoffs as the user's My Attendance view, even if the admin's
      // own user is in a different org someday.
      thresholds: {
        halfDayMinHours: cfg.halfDayMinHours,
        fullDayMinHours: cfg.fullDayMinHours,
      },
      records: [
        ...records.map((r) => {
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
        // Approved leave covering this day — fed into the verdict so a day the
        // employee was partly on leave (half-day or short leave) isn't judged
        // against the full-day bar; the leave covers its share and only the
        // remaining hours are required.
        const leaveInfo = leaveInfoForDate(
          r.date,
          dayFillCtx.leavesByUser.get(r.userId),
        );
        const leaveDayFraction = leaveDayFractionForStatus(
          leaveInfo,
          cfg.fullDayMinHours,
        );
        // Hours of an approved short leave that still pay through an
        // auto-checkout (mirrors payroll's short-leave rescue). For a short
        // leave, leaveDayFraction is window÷full-day, so ×full-day recovers
        // the window hours. Gated on SHORT_LEAVE: half-day leaves are NOT
        // rescued on auto-checkout, so they must not soften the ₹0 tooltip.
        const autoCheckoutPaidLeaveHours =
          leaveInfo?.kind === 'SHORT_LEAVE'
            ? leaveDayFraction * cfg.fullDayMinHours
            : 0;
        const verdict = computeEffectiveStatus(
          {
            checkedIn: !!r.checkedIn,
            checkedOut: !!r.checkedOut,
            isAutoCheckedOut: !!(r as any).isAutoCheckedOut,
            overtimeOptedIn: !!(r as any).overtimeOptedIn,
            workedMinutes,
            lateMinutes: (r as any).lateMinutes ?? 0,
            leaveDayFraction,
            autoCheckoutPaidLeaveHours,
          },
          {
            halfDayMinHours: cfg.halfDayMinHours,
            fullDayMinHours: cfg.fullDayMinHours,
            lateHalfDay: lateHalfDayAppliesTo(
              lateScope,
              r.userId,
              roleIdsByUser.get(r.userId) ?? [],
            ),
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
          // Approved leave overlapping this day — surfaced even when the
          // employee also punched (e.g. worked one half, took the other as
          // half-day leave), so the leave isn't hidden behind an hours-based
          // Present/Half-Day badge.
          leave: leaveInfo,
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
        ...syntheticRecords,
      ].sort((a, b) =>
        // date desc, then userId asc — mirrors the original DB orderBy so the
        // merged real + synthetic list keeps a stable, predictable order.
        a.date < b.date
          ? 1
          : a.date > b.date
            ? -1
            : a.userId < b.userId
              ? -1
              : a.userId > b.userId
                ? 1
                : 0,
      ),
    },
    {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    },
  );
}
