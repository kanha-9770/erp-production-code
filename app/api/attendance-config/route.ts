import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import {
  getAttendanceConfig,
  upsertAttendanceConfig,
  type AttendanceConfigUpdate,
  type GeofenceMode,
  type PayableBasis,
} from '@/lib/hr/attendance-config';
import { syncOrganizationSchedule } from '@/lib/hr/attendance-report-scheduler';

export const dynamic = 'force-dynamic';

function pickOptionalNumber(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return undefined; // PUT-with-null is treated as "no change"
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function pickOptionalNullableNumber(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function pickOptionalString(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') return raw;
  return undefined;
}

function pickOptionalNullableString(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw === 'string') return raw;
  return undefined;
}

function pickWeeklyOff(raw: unknown): number[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return out;
}

function pickIpList(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const REPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function pickReportRecipients(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  return Array.from(
    new Set(
      raw
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => REPORT_EMAIL_RE.test(s)),
    ),
  );
}

function pickGeofenceMode(raw: unknown): GeofenceMode | undefined {
  if (raw === 'OFF' || raw === 'CAPTURE' || raw === 'ENFORCE') return raw;
  return undefined;
}

function pickPayableBasis(raw: unknown): PayableBasis | undefined {
  if (raw === 'monthDays' || raw === 'fixed26' || raw === 'fixed30') return raw;
  return undefined;
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  const config = await getAttendanceConfig(authUser.organizationId);
  return NextResponse.json({ success: true, config });
}

export async function PUT(request: NextRequest) {
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const patch: AttendanceConfigUpdate = {};
  const ds = pickOptionalString(body.defaultShiftStart);
  if (ds !== undefined) patch.defaultShiftStart = ds;
  const de = pickOptionalString(body.defaultShiftEnd);
  if (de !== undefined) patch.defaultShiftEnd = de;
  const gm = pickOptionalNumber(body.graceMinutes);
  if (gm !== undefined) patch.graceMinutes = gm;
  const hd = pickOptionalNumber(body.halfDayMinHours);
  if (hd !== undefined) patch.halfDayMinHours = hd;
  const fd = pickOptionalNumber(body.fullDayMinHours);
  if (fd !== undefined) patch.fullDayMinHours = fd;
  const ot = pickOptionalNumber(body.overtimeAfterHours);
  if (ot !== undefined) patch.overtimeAfterHours = ot;
  const bm = pickOptionalNumber(body.breakMinutes);
  if (bm !== undefined) patch.breakMinutes = bm;
  const wo = pickWeeklyOff(body.weeklyOffDays);
  if (wo !== undefined) patch.weeklyOffDays = wo;
  const ac = pickOptionalNullableString(body.autoCheckoutAt);
  if (ac !== undefined) patch.autoCheckoutAt = ac;
  const gMode = pickGeofenceMode(body.geofenceMode);
  if (gMode !== undefined) patch.geofenceMode = gMode;
  const gLat = pickOptionalNullableNumber(body.geofenceLat);
  if (gLat !== undefined) patch.geofenceLat = gLat;
  const gLng = pickOptionalNullableNumber(body.geofenceLng);
  if (gLng !== undefined) patch.geofenceLng = gLng;
  const gRad = pickOptionalNullableNumber(body.geofenceRadiusM);
  if (gRad !== undefined) patch.geofenceRadiusM = gRad;
  const ips = pickIpList(body.ipWhitelist);
  if (ips !== undefined) patch.ipWhitelist = ips;
  const pb = pickPayableBasis(body.payableBasis);
  if (pb !== undefined) patch.payableBasis = pb;

  // Workflow integration: trim and treat empty string as null so the punch
  // service skips the trigger entirely. Anything else passes through.
  if (body.workflowModuleName !== undefined) {
    if (body.workflowModuleName === null) {
      patch.workflowModuleName = null;
    } else if (typeof body.workflowModuleName === 'string') {
      const trimmed = body.workflowModuleName.trim();
      patch.workflowModuleName = trimmed.length > 0 ? trimmed : null;
    }
  }
  if (typeof body.enforceEmployeeActive === 'boolean') {
    patch.enforceEmployeeActive = body.enforceEmployeeActive;
  }
  const gap = pickOptionalNumber(body.minPunchGapSeconds);
  if (gap !== undefined && gap >= 0) patch.minPunchGapSeconds = Math.floor(gap);

  if (
    body.faceCaptureMode === 'OFF' ||
    body.faceCaptureMode === 'OPTIONAL' ||
    body.faceCaptureMode === 'REQUIRED'
  ) {
    patch.faceCaptureMode = body.faceCaptureMode;
  }
  const fpKb = pickOptionalNumber(body.facePhotoMaxKb);
  if (fpKb !== undefined && fpKb >= 50 && fpKb <= 10_000) {
    patch.facePhotoMaxKb = Math.floor(fpKb);
  }

  // Face verification mode + threshold. Mode follows the same OFF/WARN/
  // ENFORCE shape used internally; threshold is clamped to the band the
  // coercer in attendance-config.ts accepts so a typo can't lock anyone
  // out (threshold=0 would reject every match).
  if (
    body.faceVerifyMode === 'OFF' ||
    body.faceVerifyMode === 'WARN' ||
    body.faceVerifyMode === 'ENFORCE'
  ) {
    patch.faceVerifyMode = body.faceVerifyMode;
  }
  const fmt = pickOptionalNumber(body.faceMatchThreshold);
  if (fmt !== undefined && fmt >= 0.3 && fmt <= 1.0) {
    patch.faceMatchThreshold = fmt;
  }

  // Liveness mode. Plain enum coerce — anything else falls through as
  // "no change" so existing rows aren't accidentally reset.
  if (
    body.faceLivenessMode === 'OFF' ||
    body.faceLivenessMode === 'PERMISSIVE' ||
    body.faceLivenessMode === 'STRICT'
  ) {
    patch.faceLivenessMode = body.faceLivenessMode;
  }

  // Anchor module: empty string / null disables the sidebar link. Anything
  // else is trimmed and passed through; the tenant scope is enforced via
  // the upsert (organizationId is implicit).
  if (body.attendanceModuleId !== undefined) {
    if (body.attendanceModuleId === null || body.attendanceModuleId === '') {
      patch.attendanceModuleId = null;
    } else if (typeof body.attendanceModuleId === 'string') {
      patch.attendanceModuleId = body.attendanceModuleId.trim() || null;
    }
  }
  if (typeof body.notifyOnPunch === 'boolean') {
    patch.notifyOnPunch = body.notifyOnPunch;
  }

  if (Array.isArray(body.attendanceApproverRoleIds)) {
    const ids = body.attendanceApproverRoleIds
      .filter((v): v is string => typeof v === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // Defence-in-depth: reject role IDs that don't belong to this org so
    // an admin-typo can't grant cross-tenant approval rights.
    if (ids.length > 0) {
      const owned = await prisma.role.count({
        where: { id: { in: ids }, organizationId: authUser.organizationId },
      });
      if (owned !== ids.length) {
        return NextResponse.json(
          {
            success: false,
            error:
              'One or more selected roles do not belong to your organization',
          },
          { status: 403 },
        );
      }
    }
    patch.attendanceApproverRoleIds = Array.from(new Set(ids));
  }

  // Scheduled-report fields. Each is independently optional so a partial
  // PUT (e.g. just toggling daily on/off) doesn't clobber the rest.
  const recipients = pickReportRecipients(body.reportRecipients);
  if (recipients !== undefined) patch.reportRecipients = recipients;
  const tz = pickOptionalNullableString(body.reportTimezone);
  if (tz !== undefined) {
    if (tz === null || tz.trim() === '') {
      patch.reportTimezone = null;
    } else {
      // Validate the IANA name up-front so cron doesn't blow up later.
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
        patch.reportTimezone = tz;
      } catch {
        return NextResponse.json(
          { success: false, error: `Invalid timezone: ${tz}` },
          { status: 400 },
        );
      }
    }
  }
  const sendHour = pickOptionalNumber(body.reportSendHour);
  if (sendHour !== undefined) {
    const h = Math.floor(sendHour);
    if (h < 0 || h > 23) {
      return NextResponse.json(
        { success: false, error: 'reportSendHour must be 0–23' },
        { status: 400 },
      );
    }
    patch.reportSendHour = h;
  }
  if (typeof body.reportDailyEnabled === 'boolean')
    patch.reportDailyEnabled = body.reportDailyEnabled;
  if (typeof body.reportWeeklyEnabled === 'boolean')
    patch.reportWeeklyEnabled = body.reportWeeklyEnabled;
  if (typeof body.reportMonthlyEnabled === 'boolean')
    patch.reportMonthlyEnabled = body.reportMonthlyEnabled;

  const config = await upsertAttendanceConfig(authUser.organizationId, patch);

  // If anything report-related changed, re-register the cron jobs so the
  // admin doesn't need to bounce the server. Fire-and-forget — failures
  // only mean the new schedule kicks in next boot.
  const reportFieldChanged =
    'reportRecipients' in patch ||
    'reportTimezone' in patch ||
    'reportSendHour' in patch ||
    'reportDailyEnabled' in patch ||
    'reportWeeklyEnabled' in patch ||
    'reportMonthlyEnabled' in patch;
  if (reportFieldChanged) {
    syncOrganizationSchedule(authUser.organizationId).catch((err) => {
      console.error(
        '[attendance-config] schedule re-sync failed; jobs will refresh on next boot:',
        err,
      );
    });
  }
  return NextResponse.json({ success: true, config });
}
