import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { distanceMeters, todayKey } from '@/lib/hr/attendance-service';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';

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
  // inside/outside the office radius. We deliberately ignore
  // `geofenceMode` — visibility is decoupled from enforcement so admins
  // can see out-of-radius punches even when mode is still OFF.
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

  return NextResponse.json(
    {
      success: true,
      from,
      to,
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
          ipAddress: r.ipAddress ?? null,
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
