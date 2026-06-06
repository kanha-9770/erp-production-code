import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { distanceMeters, orgTimezone, todayKey } from '@/lib/hr/attendance-service';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';
import { computeEffectiveStatus } from '@/lib/hr/attendance-status';
import {
  buildSyntheticDays,
  fetchDayFillContext,
  leaveInfoForDate,
  leaveDayFractionForStatus,
} from '@/lib/hr/attendance-day-fill';
import { lateHalfDayAppliesTo, lateHalfDayScopeOf } from '@/lib/hr/late-half-day';
import { getCallerRoleContext } from '@/lib/database/roles';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftDays(yyyymmdd: string, delta: number): string {
  // Pure-string arithmetic in UTC to avoid local-timezone drift on the server.
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

  const sp = request.nextUrl.searchParams;
  const today = todayKey();
  const fromRaw = sp.get('from');
  const toRaw = sp.get('to');

  // Default: trailing 30 days ending today, inclusive.
  const to = toRaw && DATE_RE.test(toRaw) ? toRaw : today;
  const from =
    fromRaw && DATE_RE.test(fromRaw) ? fromRaw : shiftDays(to, -29);

  if (from > to) {
    return NextResponse.json(
      { success: false, error: "'from' must be on or before 'to'" },
      { status: 400 },
    );
  }

  // Hard cap to keep the response bounded — even an admin viewing their
  // own history can't pull years of data in one request.
  if (shiftDays(from, 366) < to) {
    return NextResponse.json(
      { success: false, error: 'Range too large (max 366 days)' },
      { status: 400 },
    );
  }

  const records = await prisma.attendance.findMany({
    where: {
      userId: authUser.id,
      date: { gte: from, lte: to },
    },
    orderBy: { date: 'desc' },
  });

  // Per-org geofence centre, so each historical row can be flagged as
  // inside/Off-site. We deliberately ignore
  // `geofenceMode` — visibility is decoupled from enforcement so admins
  // can see out-of-radius punches even when mode is still OFF.
  const cfg = await getAttendanceConfig(authUser.organizationId);

  // This view is always the caller's own attendance, so resolve their roles
  // once and compute the late-half-day verdict for every row from it.
  const roleCtx = await getCallerRoleContext(authUser.id, authUser.organizationId);
  const lateHalfDayForUser = lateHalfDayAppliesTo(
    lateHalfDayScopeOf(cfg),
    authUser.id,
    roleCtx.roleIds,
  );
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

  // Summary stats keep the page snappy without a follow-up call.
  let presentDays = 0;
  let lateDays = 0;
  let totalWorkedMinutes = 0;
  let totalOvertimeMinutes = 0;
  for (const r of records) {
    if (r.checkedIn) presentDays += 1;
    if ((r as any).lateMinutes && (r as any).lateMinutes > 0) lateDays += 1;
    const checkIn = (r as any).checkInAt ? new Date((r as any).checkInAt).getTime() : null;
    const checkOut = (r as any).checkOutAt
      ? new Date((r as any).checkOutAt).getTime()
      : null;
    if (checkIn && checkOut) {
      totalWorkedMinutes += Math.max(0, Math.round((checkOut - checkIn) / 60_000));
    }
    totalOvertimeMinutes += (r as any).overtimeMinutes ?? 0;
  }

  // ── Gap-fill: synthesize Absent / Weekly-off / Holiday / On-leave rows for
  // every day in the window with no real Attendance row, so My Attendance shows
  // a complete per-day calendar (not just the days the user punched). Display
  // only — pay is unaffected; payroll books these days via its own walk.
  const realDatesByUser = new Map<string, Set<string>>([
    [authUser.id, new Set(records.map((r) => r.date))],
  ]);
  const dayFillCtx = await fetchDayFillContext({
    organizationId: authUser.organizationId,
    userIds: [authUser.id],
    from,
    to,
  });
  const syntheticRecords = buildSyntheticDays({
    userIds: [authUser.id],
    from,
    to,
    today,
    weeklyOffDays: cfg.weeklyOffDays ?? [],
    realDatesByUser,
    ctx: dayFillCtx,
  });

  return NextResponse.json(
    {
      success: true,
      from,
      to,
      // IANA tz the rows' check-in/out times should be rendered in.
      // Single source of truth so every attendance surface stays aligned.
      reportTimezone: orgTimezone(cfg),
      summary: {
        presentDays,
        lateDays,
        totalWorkedMinutes,
        totalOvertimeMinutes,
      },
      geofence: {
        mode: cfg.geofenceMode,
        lat: cfg.geofenceLat,
        lng: cfg.geofenceLng,
        radiusM: cfg.geofenceRadiusM,
      },
      // Face-verification config snapshot — clients render the "verified"
      // badge against this threshold. Sent at the response level (not
      // per-row) since it doesn't vary across the date range.
      faceVerify: {
        mode: cfg.faceVerifyMode,
        threshold: cfg.faceMatchThreshold,
      },
      // Storage policy snapshot — lets the detail panel differentiate
      // "photo was never stored" from "photo was deleted by retention"
      // when checkInPhoto/checkOutPhoto is null on an older row. Retention
      // of 0 means "keep forever" and disables the inference.
      facePhotoStorage: {
        storeAfterVerify: cfg.facePhotoStoreAfterVerify,
        retentionDays: cfg.facePhotoRetentionDays,
      },
      // Threshold knobs surfaced to the client so the status filter chip
      // can display the right options and the badge stays in sync with the
      // payroll classifier. Mirrors the values the server uses for the
      // per-row `effectiveStatus` field below.
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
        // Worked-time figure that drives the status verdict. Wall-clock
        // checkOut − checkIn (in minutes) to match the "Worked" column;
        // break-time deduction is payroll's concern, not the badge's.
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
        // Approved leave covering this day — surfaced as a chip AND fed into
        // the status verdict so a day the user was partly on leave (half-day
        // or short leave) isn't judged against the full 8h bar; the leave
        // covers its share and only the remaining hours are required.
        const leaveInfo = leaveInfoForDate(
          r.date,
          dayFillCtx.leavesByUser.get(authUser.id),
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
            lateHalfDay: lateHalfDayForUser,
          },
        );
        return {
          id: r.id,
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
          // Server-computed display status — single source of truth that
          // already accounts for hours, lateness, and auto-checkout per
          // the org's AttendanceConfiguration thresholds.
          effectiveStatus: verdict.status,
          effectiveStatusReason: verdict.reason ?? null,
          // Approved leave overlapping this day, surfaced even when the user
          // also punched (worked one half, took the other as half-day leave).
          leave: leaveInfo,
          checkInPhoto: (r as any).checkInPhoto ?? null,
          checkOutPhoto: (r as any).checkOutPhoto ?? null,
          checkInFaceMatch: (r as any).checkInFaceMatch ?? null,
          checkOutFaceMatch: (r as any).checkOutFaceMatch ?? null,
          checkInLat: (r as any).checkInLat ?? null,
          checkInLng: (r as any).checkInLng ?? null,
          checkOutLat: (r as any).checkOutLat ?? null,
          checkOutLng: (r as any).checkOutLng ?? null,
          checkInSource: (r as any).checkInSource ?? null,
          checkOutSource: (r as any).checkOutSource ?? null,
          ipAddress: r.ipAddress ?? null,
          checkInDistanceM: inGeo.distanceM,
          checkInOutsideRadius: inGeo.outsideRadius,
          checkInLocationMissing: inGeo.locationMissing,
          checkOutDistanceM: outGeo.distanceM,
          checkOutOutsideRadius: outGeo.outsideRadius,
          checkOutLocationMissing: outGeo.locationMissing,
        };
        }),
        ...syntheticRecords,
      ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    },
    {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    },
  );
}
