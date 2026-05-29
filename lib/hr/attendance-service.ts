/**
 * Attendance service: status + punch operations.
 *
 * Single source of truth for the new /api/attendance/punch endpoint and
 * the legacy /api/attendance shim. Mirrors the payroll engine's
 * "config-driven, typed-in / typed-out" pattern so payroll can read from
 * the same Attendance table without any extra translation layer.
 *
 * Returns rich status objects (shift context, lateness, holiday/weekly-off
 * detection) so the widget never has to compute that client-side.
 */

import { prisma } from '@/lib/prisma';
import {
  getAttendanceConfig,
  parseHHmm,
  type AttendanceConfig,
  type GeofenceMode,
} from './attendance-config';
import {
  getHolidaysFromDB,
  getLeavesFromDB,
  type SampleHoliday,
  type SampleLeave,
} from '@/lib/utils/payroll-store';
import { acquireSlot, commitSlot } from './attendance-rate-limit';
import { triggerWorkflowsForRecord } from '@/lib/workflow/trigger';
import { logAudit } from '@/lib/api-helpers';

export type PunchType = 'IN' | 'OUT';
export type PunchSource = 'WEB' | 'MOBILE' | 'BIOMETRIC' | 'ADMIN';

export type AttendanceState =
  | 'PRE_SHIFT' // not checked in yet, before shift start + grace
  | 'LATE' // not checked in, past shift start + grace
  | 'WORKING' // checked in, not checked out
  | 'DONE' // checked in and out
  | 'HOLIDAY'
  | 'ON_LEAVE'
  | 'WEEKLY_OFF';

export interface PunchGeo {
  lat: number;
  lng: number;
}

export interface PunchInput {
  userId: string;
  organizationId: string | null;
  type: PunchType;
  geo?: PunchGeo | null;
  ip?: string | null;
  userAgent?: string | null;
  source?: PunchSource;
  idempotencyKey?: string | null;
  // Public URL of the captured face photo, if any. Required-mode rejects
  // when missing; optional-mode passes it through; off-mode ignores.
  photoUrl?: string | null;
  // Euclidean distance between the captured selfie and the user's stored
  // face enrollment, computed by /api/attendance/photo. Lower is better.
  // null when face verification didn't run (mode OFF, user not enrolled,
  // or no descriptor sent by the client).
  faceMatch?: number | null;
  // Anti-spoofing motion check result. True = real face (motion seen),
  // false = static (would have been rejected upstream unless WARN), null
  // = not checked. Persisted for audit even when not enforced.
  livenessPassed?: boolean | null;
}

export interface AttendanceStatus {
  state: AttendanceState;
  date: string; // YYYY-MM-DD (local server tz)
  // IANA tz name the org's attendance times are anchored to (e.g.
  // "Asia/Kolkata"). Single source of truth so HR, the employee, the bell
  // notification and the widget all render check-in/out in the same zone.
  reportTimezone: string;
  checkedIn: boolean;
  checkedOut: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  checkInAt: string | null; // ISO
  checkOutAt: string | null; // ISO
  checkInTime: string | null; // HH:mm — kept for legacy display
  checkOutTime: string | null;
  expectedInAt: string; // ISO for today
  expectedOutAt: string;
  graceMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  isHoliday: boolean;
  holidayName: string | null;
  isWeeklyOff: boolean;
  isOnLeave: boolean;
  leaveType: string | null;
  // Half-day leaves don't fully block punching — the user can still check
  // in for the other half. Widget reads this to leave the CTA active.
  isHalfDayLeave: boolean;
  isAutoCheckedOut: boolean;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  faceCapture: {
    mode: 'OFF' | 'OPTIONAL' | 'REQUIRED';
    maxKb: number;
  };
  faceVerify: {
    mode: 'OFF' | 'WARN' | 'ENFORCE';
    threshold: number;
    // Whether the current user has a FaceEnrollment row. Drives a banner
    // in the widget so users see "enroll first" *before* spending time
    // on the camera flow when ENFORCE mode is on.
    enrolled: boolean;
  };
  faceLiveness: {
    mode: 'OFF' | 'PERMISSIVE' | 'STRICT';
  };
  geofence: {
    mode: GeofenceMode;
    lat: number | null;
    lng: number | null;
    radiusM: number | null;
  };
  shift: {
    start: string; // HH:mm
    end: string;
    /** True when the times shown here come from the user's Employee.inTime
     *  / outTime override rather than the org default. UI can flag this. */
    isCustom: boolean;
  };
  /** Opt-in overtime state for the widget.
   *  - availableAt: ISO of the moment the "Start Overtime" toggle becomes
   *    enabled (shift end + cfg.overtimeStartBufferMinutes). Widget compares
   *    `now` against this to enable / disable the toggle.
   *  - optedIn: whether the employee has currently started an OT session.
   *  - startedAt: when the OT session began (null when optedIn=false).
   *  - maxHoursPerDay: labour-law daily cap for OT, surfaced so the widget
   *    can warn the employee when they're about to hit it.
   *  - requiresOptIn: mirrors AttendanceConfiguration.overtimeRequiresOptIn
   *    so the widget knows whether to show the toggle at all. */
  overtime: {
    availableAt: string | null;
    optedIn: boolean;
    startedAt: string | null;
    maxHoursPerDay: number;
    requiresOptIn: boolean;
  };
}

// ---- Date / time helpers --------------------------------------------------

// Format YYYY-MM-DD for the *org's* timezone (not the server's). Production
// hosts run in UTC, so reading the calendar date off a raw Date would key a
// late-night IST check-in to the wrong day (UTC is 5:30 behind IST). Passing
// the org tz keeps the day boundary aligned with what the employee sees.
export function todayKey(now: Date = new Date(), tz: string = FALLBACK_TZ): string {
  const { year, month, day } = zonedParts(now, tz);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Default IANA timezone used when neither the org config nor the env
// supplies one. The product is shipped primarily to India-based orgs, so
// IST is the safest fallback — the original implementation used the
// server's local TZ which on Vercel/Supabase is UTC and produced wrong
// notification times by +5:30.
const FALLBACK_TZ = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

export function orgTimezone(
  cfg: { reportTimezone?: string | null } | null | undefined,
): string {
  const tz = cfg?.reportTimezone?.trim();
  return tz && tz.length > 0 ? tz : FALLBACK_TZ;
}

export function formatHHmm(d: Date, tz: string = FALLBACK_TZ): string {
  // Intl.DateTimeFormat respects the IANA tz, so this returns "09:30"
  // for an Indian user even when the Node process is running in UTC.
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(d);
  } catch {
    // Bad TZ name — fall back to a UTC-local read so we never throw mid-punch.
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
}

// ---- Timezone-aware date math ---------------------------------------------
//
// All "midnight" / "today at HH:mm" boundaries must be computed in the org's
// IANA timezone, NOT the server's. On Vercel/Supabase the Node process runs
// in UTC, so `Date.setHours(0,...)` yields 00:00 UTC = 05:30 IST — which is
// exactly why auto-checkout stamps were showing 05:30 instead of midnight.
//
// India observes no DST, so a single offset read is exact. For DST zones the
// one-pass guess is correct except for the ~1h/year fold, which is acceptable
// for attendance boundaries.

/** Break a Date down into its wall-clock components *in tz* (24h). */
function zonedParts(date: Date, tz: string): {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/** Offset (ms) of tz relative to UTC at `date`: localWallClockAsUTC − date. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

/** Build the UTC instant for a given wall-clock (y/mo/d/h/mi) *in tz*. Month
 *  is 1-based; out-of-range day/hour values roll over via Date.UTC. */
function zonedWallClockToUtc(
  y: number, mo: number, d: number, h: number, mi: number, tz: string,
): Date {
  // First guess treats the wall clock as if it were UTC, then corrects by the
  // tz offset at that instant. One pass is exact for non-DST zones (India).
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offset = tzOffsetMs(new Date(guess), tz);
  return new Date(guess - offset);
}

function dateAtHHmm(base: Date, hhmm: string, tz: string = FALLBACK_TZ): Date {
  const mins = parseHHmm(hhmm) ?? 9 * 60;
  const { year, month, day } = zonedParts(base, tz);
  return zonedWallClockToUtc(year, month, day, Math.floor(mins / 60), mins % 60, tz);
}

/** 00:00 of `now`'s calendar day, in tz, as a UTC instant. */
function startOfDayInTz(now: Date, tz: string = FALLBACK_TZ): Date {
  const { year, month, day } = zonedParts(now, tz);
  return zonedWallClockToUtc(year, month, day, 0, 0, tz);
}

function diffMinutes(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

// ---- Per-employee shift override ------------------------------------------

export interface EffectiveShift {
  start: string; // HH:mm
  end: string;
  /** True when the user has their own `Employee.inTime`/`outTime` set and we
   *  used those instead of the org default. UI can show a "(custom)" tag. */
  isCustom: boolean;
}

/**
 * Look up the shift window that should apply to this user for late/grace/OT
 * classification. Prefers the user's per-employee override (`Employee.inTime`
 * / `Employee.outTime`) when both are valid HH:mm strings; otherwise falls
 * back to the org-wide `AttendanceConfig.defaultShiftStart` / `End`.
 *
 * Returning a tiny struct (not just two strings) so callers don't have to do
 * the override-detection themselves and so the API can surface `isCustom` to
 * the widget without a second lookup.
 */
export async function getEffectiveShift(
  userId: string,
  cfg: AttendanceConfig,
): Promise<EffectiveShift> {
  const fallback: EffectiveShift = {
    start: cfg.defaultShiftStart,
    end: cfg.defaultShiftEnd,
    isCustom: false,
  };
  if (!userId) return fallback;

  let emp: { inTime: string | null; outTime: string | null } | null;
  try {
    emp = await prisma.employee.findUnique({
      where: { userId },
      select: { inTime: true, outTime: true },
    });
  } catch {
    // Employee table may not have the columns yet in old migrations — fall
    // back silently so attendance still works.
    return fallback;
  }
  if (!emp) return fallback;

  const start = (emp.inTime ?? '').trim();
  const end = (emp.outTime ?? '').trim();
  // Both sides must be valid HH:mm; a half-set override would silently mix
  // a custom start with the org default end, which is almost always wrong.
  if (parseHHmm(start) === null || parseHHmm(end) === null) return fallback;

  return { start, end, isCustom: true };
}

// ---- Geofence -------------------------------------------------------------

// Haversine distance in metres. Both points required; returns Infinity if
// either side of the comparison is missing — caller decides what to do.
export function distanceMeters(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null,
): number {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function isInsideFence(geo: PunchGeo | null | undefined, cfg: AttendanceConfig): boolean {
  if (!cfg.geofenceLat || !cfg.geofenceLng || !cfg.geofenceRadiusM) return true;
  if (!geo) return false;
  return (
    distanceMeters(geo, { lat: cfg.geofenceLat, lng: cfg.geofenceLng }) <=
    cfg.geofenceRadiusM
  );
}

function isIpAllowed(ip: string | null | undefined, cfg: AttendanceConfig): boolean {
  if (!cfg.ipWhitelist || cfg.ipWhitelist.length === 0) return true;
  if (!ip) return false;
  // Exact match for v1. CIDR support can come later without changing the API.
  return cfg.ipWhitelist.some((entry) => entry.trim() === ip);
}

// ---- Holiday / leave cache (per org+month, 60s TTL) -----------------------
//
// getStatus runs every 60s per active widget. Pulling holidays and leaves
// from form records on every call would scan the whole leave form each
// time — expensive on bigger tenants. We cache by (orgId, month) for 60s
// so a cohort of widgets in the same org pays the read once per minute.

const HL_TTL_MS = 60_000;
declare global {
  // eslint-disable-next-line no-var
  var __attendanceStatusCache:
    | {
        holidays: Map<string, { at: number; data: SampleHoliday[] }>;
        leaves: Map<string, { at: number; data: SampleLeave[] }>;
      }
    | undefined;
}
const hlCache = globalThis.__attendanceStatusCache ?? {
  holidays: new Map<string, { at: number; data: SampleHoliday[] }>(),
  leaves: new Map<string, { at: number; data: SampleLeave[] }>(),
};
if (!globalThis.__attendanceStatusCache) {
  globalThis.__attendanceStatusCache = hlCache;
}

async function getHolidaysCached(
  organizationId: string,
  month: string,
): Promise<SampleHoliday[]> {
  const key = `${organizationId}|${month}`;
  const hit = hlCache.holidays.get(key);
  if (hit && Date.now() - hit.at < HL_TTL_MS) return hit.data;
  try {
    const data = await getHolidaysFromDB(organizationId, month);
    hlCache.holidays.set(key, { at: Date.now(), data });
    return data;
  } catch {
    // Holiday form may not be configured; treat as "no holidays" silently.
    return hit?.data ?? [];
  }
}

async function getLeavesCached(
  organizationId: string,
  month: string,
): Promise<SampleLeave[]> {
  const key = `${organizationId}|${month}`;
  const hit = hlCache.leaves.get(key);
  if (hit && Date.now() - hit.at < HL_TTL_MS) return hit.data;
  try {
    const data = await getLeavesFromDB(organizationId, month);
    hlCache.leaves.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return hit?.data ?? [];
  }
}

// Find an approved leave covering `date` for this user. Matches against
// every known identity key the user has — email plus employee id — so a
// leave filed by Employee ID (with no email column) still triggers the
// ON_LEAVE banner in the widget. matchKey on a SampleLeave is one of:
//   - "email:user@example.com"
//   - "empId:emp123"
function findLeaveForToday(
  leaves: SampleLeave[],
  userMatchKeys: Set<string>,
  date: string,
): SampleLeave | null {
  if (userMatchKeys.size === 0) return null;
  for (const l of leaves) {
    if (!userMatchKeys.has(l.matchKey)) continue;
    if (l.startDate <= date && date <= l.endDate) return l;
  }
  return null;
}

// ---- Status ---------------------------------------------------------------

// Midnight auto-checkout — always on, no admin toggle. When a user is still
// checked in past midnight following their check-in, close the row at exactly
// 00:00 the day after checkInAt (server-local time). This guarantees:
//   1. Stale rows from prior days (user forgot to check out) get closed,
//      freeing the next day's (userId, date) slot for a fresh check-in.
//   2. The recorded `checkOutAt` reflects what payroll should see — capped
//      at end-of-day, not whenever the lazy sweep happened to run. So a
//      user who logs in two days later doesn't get credited for the gap.
//
// Runs at the top of getStatus and recordPunch (per-user sweep) AND at the
// top of the team-attendance GET (org-wide sweep) — without the latter, an
// admin viewing /attendance/team would see "Working" rows from prior days
// because the row's owner hasn't loaded their widget yet to trigger the
// per-user sweep.

/** Midnight (00:00) of the day immediately after checkInAt, in the org's
 *  timezone `tz`, returned as a UTC instant. Day+1 rolls over month/year via
 *  Date.UTC. Computed in tz (not server-local) so the stored checkOutAt lands
 *  at true local midnight — e.g. 18:30 UTC for 00:00 IST — instead of 00:00
 *  UTC, which would display as 05:30 IST. */
function midnightAfter(checkInAt: Date, tz: string = FALLBACK_TZ): Date {
  const { year, month, day } = zonedParts(checkInAt, tz);
  return zonedWallClockToUtc(year, month, day + 1, 0, 0, tz);
}

/**
 * Sweep stale (checkedIn-but-not-checkedOut past midnight) Attendance rows
 * and close them at 00:00 the day after checkInAt. Filter by either a
 * single userId or an entire organizationId; passing neither is a no-op
 * (defence against accidental table-wide sweeps).
 *
 * Exported so the team-attendance API can run the org-wide variant before
 * it reads rows — otherwise its query returns stale "Working" rows from
 * prior days for users who haven't opened their widget since.
 */
export async function applyDayCapAutoCheckouts(
  filter: { userId?: string; organizationId?: string },
  now: Date,
): Promise<void> {
  if (!filter.userId && !filter.organizationId) return;
  // Cutoff = start of today (local). A row qualifies when its check-in is
  // from a prior calendar day, regardless of how long ago that was — so a
  // user who checked in at 11:55 PM yesterday gets closed at 00:00 today,
  // and a user who checked in three days ago gets closed at 00:00 of the
  // day after their check-in.
  const startOfToday = startOfDayInTz(now, FALLBACK_TZ);
  const where: any = {
    checkedIn: true,
    checkedOut: false,
    checkInAt: { lt: startOfToday, not: null },
  };
  if (filter.userId) where.userId = filter.userId;
  if (filter.organizationId) {
    // Attendance.organizationId can legitimately be null on legacy rows;
    // pick those up too via the user relation so the sweep still closes
    // them. The `OR` lets either path match.
    where.OR = [
      { organizationId: filter.organizationId },
      { user: { organizationId: filter.organizationId } },
    ];
  }
  const stale = await prisma.attendance.findMany({
    where,
    select: {
      id: true,
      organizationId: true,
      checkInAt: true,
      // OT bookkeeping the sweep needs to mirror recordPunch's OUT path.
      // Without these, we'd write inflated OT minutes for opt-in orgs
      // (employee toggled OT at 22:00 but legacy "worked − 9h" formula
      // still credits ~5h, which the daily cap clips to 4h — paying for
      // 4h of OT when only ~2h was actually opted-in).
      overtimeOptedIn: true,
      overtimeStartedAt: true,
    } as any,
  });
  if (stale.length === 0) return;

  // Group by org so we fetch each config at most once even when a user has
  // multiple stale rows (rare but possible after a long outage).
  const cfgByOrg = new Map<string | null, AttendanceConfig>();
  for (const row of stale as any[]) {
    const checkInAt: Date | null = (row as any).checkInAt;
    if (!checkInAt) continue;

    const orgId: string | null = row.organizationId ?? null;
    let cfg = cfgByOrg.get(orgId);
    if (!cfg) {
      cfg = await getAttendanceConfig(orgId);
      cfgByOrg.set(orgId, cfg);
    }

    const checkOutAt = midnightAfter(checkInAt, orgTimezone(cfg));

    // OT computation — must match the OUT branch in recordPunch (around
    // line 1192-1214) so a row closed by the sweep produces the same
    // overtimeMinutes a self-checkout would have. Two paths:
    //   • overtimeRequiresOptIn = true → credit only the time between
    //     overtimeStartedAt and checkOutAt (= midnight). Not opted in?
    //     OT = 0 and payroll's AUTO_CHECKOUT branch will zero the day.
    //   • overtimeRequiresOptIn = false → legacy "worked beyond
    //     overtimeAfterHours is OT" for orgs that haven't switched on
    //     opt-in. Cap applies in both branches.
    const cap = Math.round(Math.max(0, cfg.overtimeMaxHoursPerDay) * 60);
    let overtimeMinutes = 0;
    if (cfg.overtimeRequiresOptIn) {
      const otStart: Date | null = (row as any).overtimeStartedAt
        ? new Date((row as any).overtimeStartedAt)
        : null;
      if ((row as any).overtimeOptedIn && otStart) {
        const rawOt = Math.max(0, diffMinutes(checkOutAt, otStart));
        overtimeMinutes = cap > 0 ? Math.min(rawOt, cap) : rawOt;
      }
    } else {
      const workedMinutes = Math.max(
        0,
        diffMinutes(checkOutAt, checkInAt) - cfg.breakMinutes,
      );
      const overtimeThreshold = Math.round(cfg.overtimeAfterHours * 60);
      const raw = Math.max(0, workedMinutes - overtimeThreshold);
      overtimeMinutes = cap > 0 ? Math.min(raw, cap) : raw;
    }

    // Conditional update keeps us race-safe against a parallel checkout — if
    // someone else just closed the row, our updateMany matches 0 and we
    // simply skip it.
    await prisma.attendance.updateMany({
      where: { id: row.id, checkedOut: false },
      data: {
        checkedOut: true,
        checkOutAt,
        checkOutTime: formatHHmm(checkOutAt, orgTimezone(cfg)),
        checkOutSource: 'AUTO_MIDNIGHT',
        isAutoCheckedOut: true,
        // earlyOut is meaningless for a midnight cap — the user worked
        // past shift end. overtimeMinutes carries the excess.
        earlyOutMinutes: 0,
        overtimeMinutes,
        status: 'PRESENT',
      } as any,
    });
  }
}

// Lazy auto-checkout: when getStatus runs and finds the user still
// checked in past the org's autoCheckoutAt wall-clock time, retroactively
// close the day at that wall-clock time and mark the row isAutoCheckedOut.
// This is a stopgap for orgs without a dedicated worker — the proper fix
// is a nightly BullMQ job, but the math here is the same one the worker
// would run, so swapping it in later is a single function call.
async function applyAutoCheckoutIfNeeded(
  rowId: string,
  checkInAt: Date,
  cfg: AttendanceConfig,
  shift: EffectiveShift,
  now: Date,
): Promise<{ checkOutAt: Date; overtimeMinutes: number; earlyOutMinutes: number } | null> {
  if (parseHHmm(cfg.autoCheckoutAt ?? null) === null) return null;
  const tz = orgTimezone(cfg);
  // The configured auto-checkout wall-clock, on today's date, in the org tz.
  const autoToday = dateAtHHmm(now, cfg.autoCheckoutAt as string, tz);
  if (now < autoToday) return null;
  // Don't auto-close before the user has been "in" for a sensible duration —
  // shields against misconfigurations that would otherwise fire instantly.
  if (now.getTime() - checkInAt.getTime() < 60 * 60 * 1000) return null;

  const checkOutAt = autoToday;
  const expectedOut = dateAtHHmm(now, shift.end, tz);
  const earlyOutMinutes = Math.max(0, diffMinutes(expectedOut, checkOutAt));
  const workedMinutes = Math.max(
    0,
    diffMinutes(checkOutAt, checkInAt) - cfg.breakMinutes,
  );
  const overtimeThreshold = Math.round(cfg.overtimeAfterHours * 60);
  const overtimeMinutes = Math.max(0, workedMinutes - overtimeThreshold);

  await prisma.attendance.update({
    where: { id: rowId },
    data: {
      checkedOut: true,
      checkOutAt,
      checkOutTime: formatHHmm(checkOutAt, orgTimezone(cfg)),
      checkOutSource: 'ADMIN',
      isAutoCheckedOut: true,
      earlyOutMinutes,
      overtimeMinutes,
      status: 'PRESENT',
    } as any,
  });

  return { checkOutAt, overtimeMinutes, earlyOutMinutes };
}

export async function getStatus(
  userId: string,
  organizationId: string | null,
): Promise<AttendanceStatus> {
  const now = new Date();
  // 24-hour cap: close any prior-day rows where the user forgot to check
  // out, BEFORE we read today's row. Without this, a stale Monday row
  // would still show as "WORKING" on Tuesday and block today's check-in.
  await applyDayCapAutoCheckouts({ userId }, now);

  const cfg = await getAttendanceConfig(organizationId);
  // Resolve the user's effective shift once up front. Late/grace/OT and the
  // shift block in the response all use the same window so an employee with
  // per-row inTime/outTime gets classified against their own hours instead of
  // the org default.
  const shift = await getEffectiveShift(userId, cfg);
  const tz = orgTimezone(cfg);
  const date = todayKey(now, tz);
  const month = date.slice(0, 7);

  // Look up the user + linked employee once — both feed leave-matching:
  // a leave filed against employee id (no email column) still has to
  // trigger the ON_LEAVE banner for that user.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, employee: { select: { id: true } } },
  });
  const userEmail = user?.email ?? null;
  const employeeId = user?.employee?.id ?? null;

  // Build the set of match-keys the leave reader uses:
  //   - email-keyed leaves match "email:<lowercased email>"
  //   - empId-keyed leaves match "empId:<lowercased empId>"
  const userMatchKeys = new Set<string>();
  if (userEmail) userMatchKeys.add(`email:${userEmail.toLowerCase()}`);
  if (employeeId) userMatchKeys.add(`empId:${employeeId.toLowerCase()}`);

  let row = await prisma.attendance.findFirst({
    where: { userId, date },
  });

  // Holiday and leave detection. Only meaningful when we know the org.
  let isHoliday = false;
  let holidayName: string | null = null;
  let isOnLeave = false;
  let leaveType: string | null = null;
  let isHalfDayLeave = false;
  if (organizationId) {
    const [holidays, leaves] = await Promise.all([
      getHolidaysCached(organizationId, month),
      getLeavesCached(organizationId, month),
    ]);
    const hit = holidays.find((h) => h.date === date);
    if (hit) {
      isHoliday = true;
      holidayName = hit.name || null;
    }
    const leave = findLeaveForToday(leaves, userMatchKeys, date);
    if (leave) {
      isOnLeave = true;
      leaveType = leave.leaveType || null;
      isHalfDayLeave = !!leave.isHalfDay;
    }
  }

  // Lazy auto-checkout. If the user is still checked in past the org's
  // autoCheckoutAt, close the day before computing state.
  const checkInAtInitial = (row as any)?.checkInAt
    ? new Date((row as any).checkInAt)
    : null;
  if (
    row?.checkedIn &&
    !row.checkedOut &&
    checkInAtInitial &&
    cfg.autoCheckoutAt
  ) {
    const result = await applyAutoCheckoutIfNeeded(
      row.id,
      checkInAtInitial,
      cfg,
      shift,
      now,
    );
    if (result) {
      // Re-fetch with the freshly-written values rather than mutating the
      // local row in-place — keeps the source-of-truth read in one place.
      row = await prisma.attendance.findFirst({ where: { userId, date } });
    }
  }

  const expectedInAt = dateAtHHmm(now, shift.start, tz);
  const expectedOutAt = dateAtHHmm(now, shift.end, tz);
  // Day-of-week must be read in the org tz, not server-local: near the
  // UTC/IST boundary `now.getDay()` can name yesterday's weekday. Noon-UTC of
  // the tz-local calendar date is unambiguous.
  const isWeeklyOff = cfg.weeklyOffDays.includes(
    new Date(`${date}T12:00:00Z`).getUTCDay(),
  );

  const checkedIn = !!row?.checkedIn;
  const checkedOut = !!row?.checkedOut;
  const checkInAt = (row as any)?.checkInAt
    ? new Date((row as any).checkInAt)
    : null;
  const checkOutAt = (row as any)?.checkOutAt
    ? new Date((row as any).checkOutAt)
    : null;

  let workedMinutes = 0;
  if (checkInAt) {
    const end = checkOutAt ?? now;
    workedMinutes = Math.max(0, diffMinutes(end, checkInAt) - cfg.breakMinutes);
  }

  let lateMinutes = (row as any)?.lateMinutes ?? 0;
  if (!checkedIn) {
    const graceEnd = new Date(expectedInAt.getTime() + cfg.graceMinutes * 60_000);
    lateMinutes = Math.max(0, diffMinutes(now, graceEnd));
  }

  const earlyOutMinutes = (row as any)?.earlyOutMinutes ?? 0;
  const overtimeMinutes = (row as any)?.overtimeMinutes ?? 0;

  // State precedence: a checked-in/out row beats anything because it
  // reflects what actually happened. Otherwise the day's classification
  // (holiday > leave > weekly-off) wins. Late vs pre-shift is the
  // last-resort fall-through for ordinary working days.
  let state: AttendanceState;
  if (checkedOut) state = 'DONE';
  else if (checkedIn) state = 'WORKING';
  else if (isHoliday) state = 'HOLIDAY';
  else if (isOnLeave) state = 'ON_LEAVE';
  else if (isWeeklyOff) state = 'WEEKLY_OFF';
  else {
    const graceEnd = new Date(expectedInAt.getTime() + cfg.graceMinutes * 60_000);
    state = now > graceEnd ? 'LATE' : 'PRE_SHIFT';
  }

  // Off-days don't block check-in entirely — admins / rotating staff still
  // need to clock in on holidays. We just won't *prompt* via the "Check In"
  // CTA in those states; the popover still allows a manual punch.
  // Half-day leaves are special: the user still works the other half, so
  // the CTA stays active even though the banner shows "On leave".
  const canCheckIn =
    !checkedIn &&
    !isHoliday &&
    !isWeeklyOff &&
    (!isOnLeave || isHalfDayLeave);

  return {
    state,
    date,
    reportTimezone: orgTimezone(cfg),
    checkedIn,
    checkedOut,
    canCheckIn,
    canCheckOut: checkedIn && !checkedOut,
    checkInAt: checkInAt?.toISOString() ?? null,
    checkOutAt: checkOutAt?.toISOString() ?? null,
    checkInTime: row?.checkInTime ?? (checkInAt ? formatHHmm(checkInAt, orgTimezone(cfg)) : null),
    checkOutTime: row?.checkOutTime ?? (checkOutAt ? formatHHmm(checkOutAt, orgTimezone(cfg)) : null),
    expectedInAt: expectedInAt.toISOString(),
    expectedOutAt: expectedOutAt.toISOString(),
    graceMinutes: cfg.graceMinutes,
    lateMinutes,
    earlyOutMinutes,
    workedMinutes,
    overtimeMinutes,
    isHoliday,
    holidayName,
    isWeeklyOff,
    isOnLeave,
    leaveType,
    isHalfDayLeave,
    isAutoCheckedOut: !!(row as any)?.isAutoCheckedOut,
    checkInPhoto: (row as any)?.checkInPhoto ?? null,
    checkOutPhoto: (row as any)?.checkOutPhoto ?? null,
    faceCapture: {
      mode: cfg.faceCaptureMode,
      maxKb: cfg.facePhotoMaxKb,
    },
    faceVerify: {
      mode: cfg.faceVerifyMode,
      threshold: cfg.faceMatchThreshold,
      // Only run the lookup when verification might actually need it —
      // saves a query in OFF mode (the common default).
      enrolled:
        cfg.faceVerifyMode === 'OFF'
          ? false
          : !!(await (prisma as any).faceEnrollment.findUnique({
              where: { userId },
              select: { id: true },
            })),
    },
    faceLiveness: {
      mode: cfg.faceLivenessMode,
    },
    geofence: {
      mode: cfg.geofenceMode,
      lat: cfg.geofenceLat,
      lng: cfg.geofenceLng,
      radiusM: cfg.geofenceRadiusM,
    },
    shift: { start: shift.start, end: shift.end, isCustom: shift.isCustom },
    overtime: {
      // Toggle becomes available at (shift end + buffer). Computed against
      // today's clock so timezone-aware widgets compare like-with-like.
      availableAt: dateAtHHmm(
        now,
        addMinutesToHHmm(shift.end, cfg.overtimeStartBufferMinutes),
        tz,
      ).toISOString(),
      optedIn: !!(row as any)?.overtimeOptedIn,
      startedAt: (row as any)?.overtimeStartedAt
        ? new Date((row as any).overtimeStartedAt).toISOString()
        : null,
      maxHoursPerDay: cfg.overtimeMaxHoursPerDay,
      requiresOptIn: cfg.overtimeRequiresOptIn,
    },
  };
}

// Add N minutes to an HH:mm string, wrapping past 24:00. Used to compute
// the moment the OT toggle becomes available without going through a full
// Date round-trip.
function addMinutesToHHmm(hhmm: string, minutes: number): string {
  const base = parseHHmm(hhmm) ?? 18 * 60;
  const sum = ((base + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const h = Math.floor(sum / 60);
  const m = sum % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---- Punch ----------------------------------------------------------------

export class AttendanceError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

interface PunchOutcome {
  status: AttendanceStatus;
  deduplicated: boolean;
  // The persisted attendance row id, when we know it. Used by the workflow
  // trigger and audit log so admins can drill back to the exact event.
  attendanceId: string | null;
  // Only populated on a real state change (not on dedup). Drives whether we
  // bother firing the workflow + audit-log "success" entries.
  changed: boolean;
}

// Audit log helper. Wraps logAudit so a logging failure never crashes the
// punch flow. logAudit itself swallows errors but we add an extra try/catch
// just in case the helper signature changes later.
async function safeAudit(
  authUserEmail: string,
  userId: string,
  organizationId: string | null,
  action: string,
  detailsObj: Record<string, unknown>,
  ip: string | null,
  userAgent: string | null,
  attendanceId: string | null,
): Promise<void> {
  try {
    await logAudit({
      userId,
      organizationId,
      performedBy: authUserEmail,
      action,
      module: 'Attendance',
      details: JSON.stringify(detailsObj),
      ipAddress: ip ?? 'unknown',
      userAgent: userAgent ?? 'unknown',
      recordId: attendanceId ?? undefined,
      recordName: detailsObj.date ? `Attendance ${detailsObj.date}` : undefined,
    });
  } catch (err) {
    console.error('[attendance] audit log failed:', err);
  }
}

// Build the recordData payload the workflow trigger and any custom Function
// scripts will see. Flat keys so workflow templates that look up by API name
// can resolve common attributes; matches the convention used elsewhere.
function buildWorkflowRecordData(
  type: PunchType,
  status: AttendanceStatus,
  user: { email: string | null; name: string | null; employeeId: string | null },
  organizationId: string | null,
  source: PunchSource,
): Record<string, unknown> {
  const punchAt = type === 'IN' ? status.checkInAt : status.checkOutAt;
  const punchTime = type === 'IN' ? status.checkInTime : status.checkOutTime;
  return {
    // Identity
    userId: user.employeeId, // intentionally the employee id when available
    employeeId: user.employeeId,
    employeeEmail: user.email,
    employeeName: user.name,
    organizationId,
    // Event
    punchType: type,
    punchAt,
    punchTime,
    date: status.date,
    source,
    // Attendance metrics — flat for easy {{}} resolution
    state: status.state,
    lateMinutes: status.lateMinutes,
    earlyOutMinutes: status.earlyOutMinutes,
    overtimeMinutes: status.overtimeMinutes,
    workedMinutes: status.workedMinutes,
    isAutoCheckedOut: status.isAutoCheckedOut,
    isHoliday: status.isHoliday,
    isOnLeave: status.isOnLeave,
    isWeeklyOff: status.isWeeklyOff,
    holidayName: status.holidayName,
    leaveType: status.leaveType,
    // Shift context
    shiftStart: status.shift.start,
    shiftEnd: status.shift.end,
    expectedInAt: status.expectedInAt,
    expectedOutAt: status.expectedOutAt,
    graceMinutes: status.graceMinutes,
  };
}

// Verifies the user is allowed to punch right now. Throws AttendanceError
// with a precise code when they're not — the API endpoint maps the code
// to a user-friendly toast.
async function assertUserCanPunch(
  userId: string,
  cfg: AttendanceConfig,
): Promise<{
  email: string | null;
  name: string | null;
  employeeId: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      username: true,
      first_name: true,
      last_name: true,
      status: true,
    },
  });
  if (!user) {
    throw new AttendanceError('USER_NOT_FOUND', 'Account not found.', 404);
  }
  if (user.status && user.status !== 'ACTIVE') {
    throw new AttendanceError(
      'USER_NOT_ACTIVE',
      `Your account is ${String(user.status).toLowerCase()} and cannot record attendance.`,
      403,
    );
  }

  const composedName =
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || null;
  const displayName = composedName || user.username || user.email || null;

  let employeeIdString: string | null = null;
  if (cfg.enforceEmployeeActive) {
    const emp = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });
    if (!emp) {
      throw new AttendanceError(
        'EMPLOYEE_NOT_FOUND',
        'No employee record linked to this account. Contact your admin.',
        403,
      );
    }
    if (emp.status && emp.status !== 'ACTIVE') {
      throw new AttendanceError(
        'EMPLOYEE_NOT_ACTIVE',
        `Your employee record is ${String(emp.status).toLowerCase()} and cannot record attendance.`,
        403,
      );
    }
    employeeIdString = emp.id;
  } else {
    // Best-effort lookup so workflow payloads still carry the employee id
    // when present, without enforcing existence.
    const emp = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    employeeIdString = emp?.id ?? null;
  }

  return { email: user.email, name: displayName, employeeId: employeeIdString };
}

export async function recordPunch(
  input: PunchInput,
): Promise<{ status: AttendanceStatus; deduplicated: boolean }> {
  const now = new Date();
  // 24-hour cap: clean up any prior-day rows the user forgot to close so a
  // fresh check-in on today's date isn't blocked by yesterday's open row.
  // Cheap (indexed lookup, zero work in the common case).
  await applyDayCapAutoCheckouts({ userId: input.userId }, now);

  const cfg = await getAttendanceConfig(input.organizationId);
  // Per-employee shift override: pulled once so the IN's lateMinutes and the
  // OUT's earlyOutMinutes / overtimeMinutes are all computed against the
  // same window the widget/getStatus shows the user.
  const shift = await getEffectiveShift(input.userId, cfg);
  const tz = orgTimezone(cfg);
  const date = todayKey(now, tz);
  const source = input.source ?? 'WEB';

  // Account validity. We do this first so an inactive/terminated user gets a
  // clean reject without burning rate-limit slots or fetching attendance rows.
  let actor: {
    email: string | null;
    name: string | null;
    employeeId: string | null;
  };
  try {
    actor = await assertUserCanPunch(input.userId, cfg);
  } catch (err) {
    if (err instanceof AttendanceError) {
      await safeAudit(
        'unknown',
        input.userId,
        input.organizationId,
        `Attendance: ${input.type === 'IN' ? 'Check-In' : 'Check-Out'} rejected (${err.code})`,
        { date, code: err.code, reason: err.message, source },
        input.ip ?? null,
        input.userAgent ?? null,
        null,
      );
    }
    throw err;
  }

  const auditEmail = actor.email ?? 'unknown';
  const auditAction =
    input.type === 'IN'
      ? 'Attendance: Check-In'
      : 'Attendance: Check-Out';

  // Pre-flight reject: geofence + IP. We log the rejection so admins can see
  // attempts even when nothing was written. ENFORCE blocks; CAPTURE records
  // and warns; OFF ignores.
  //
  // A photoUrl-less punch is allowed when face verification successfully
  // ran for this punch — i.e. `faceMatch` is a finite number. That covers
  // the legitimate "facePhotoStoreAfterVerify = NEVER / ON_MISMATCH_ONLY"
  // path where the photo route skips the upload after a verified match.
  // The match score on the row IS the audit trail in that case.
  const hasVerificationProof =
    typeof input.faceMatch === 'number' && Number.isFinite(input.faceMatch);
  if (
    cfg.faceCaptureMode === 'REQUIRED' &&
    !input.photoUrl &&
    !hasVerificationProof
  ) {
    await safeAudit(
      auditEmail,
      input.userId,
      input.organizationId,
      `${auditAction} rejected (FACE_PHOTO_REQUIRED)`,
      { date, code: 'FACE_PHOTO_REQUIRED', source },
      input.ip ?? null,
      input.userAgent ?? null,
      null,
    );
    throw new AttendanceError(
      'FACE_PHOTO_REQUIRED',
      'A face photo is required for every punch. Allow camera access and try again.',
      403,
    );
  }

  if (cfg.geofenceMode === 'ENFORCE' && !isInsideFence(input.geo ?? null, cfg)) {
    await safeAudit(
      auditEmail,
      input.userId,
      input.organizationId,
      `${auditAction} rejected (OUT_OF_FENCE)`,
      { date, code: 'OUT_OF_FENCE', source, geo: input.geo ?? null },
      input.ip ?? null,
      input.userAgent ?? null,
      null,
    );
    throw new AttendanceError(
      'OUT_OF_FENCE',
      'You are outside the office geofence. Request approval to punch from here.',
      403,
    );
  }
  if (!isIpAllowed(input.ip, cfg)) {
    await safeAudit(
      auditEmail,
      input.userId,
      input.organizationId,
      `${auditAction} rejected (IP_NOT_ALLOWED)`,
      { date, code: 'IP_NOT_ALLOWED', source, ip: input.ip ?? null },
      input.ip ?? null,
      input.userAgent ?? null,
      null,
    );
    throw new AttendanceError(
      'IP_NOT_ALLOWED',
      'Punching from this network is not allowed. Use the office network or VPN.',
      403,
    );
  }

  // Server-side leave guard: full-day approved leaves block IN punches. Half-
  // day leaves are intentionally permitted (the user still works the other
  // half). Skipped for OUT punches so an emergency cancel/checkout still
  // works if the leave was approved mid-day. Source-of-truth is the same
  // cached leaves reader used by getStatus, so the widget's `canCheckIn`
  // flag and this guard never disagree.
  if (input.type === 'IN' && input.organizationId) {
    const monthKey = date.slice(0, 7);
    const leavesToday = await getLeavesCached(input.organizationId, monthKey);
    const matchKeys = new Set<string>();
    if (actor.email) matchKeys.add(`email:${actor.email.toLowerCase()}`);
    if (actor.employeeId) matchKeys.add(`empId:${actor.employeeId.toLowerCase()}`);
    const onLeave = findLeaveForToday(leavesToday, matchKeys, date);
    if (onLeave && !onLeave.isHalfDay) {
      await safeAudit(
        auditEmail,
        input.userId,
        input.organizationId,
        `${auditAction} rejected (ON_APPROVED_LEAVE)`,
        { date, code: 'ON_APPROVED_LEAVE', source, leaveType: onLeave.leaveType ?? null },
        input.ip ?? null,
        input.userAgent ?? null,
        null,
      );
      const nice = onLeave.leaveType ? `${onLeave.leaveType} ` : '';
      throw new AttendanceError(
        'ON_APPROVED_LEAVE',
        `You are on approved ${nice}leave today. Cancel the leave first if you need to clock in.`,
        409,
      );
    }
  }

  const existing = await prisma.attendance.findFirst({
    where: { userId: input.userId, date },
  });

  // Idempotency: a request whose key matches the row's last-stored key is a
  // retry of a punch we already accepted. Return current state without
  // writing — and without burning the rate-limit slot.
  if (
    input.idempotencyKey &&
    existing &&
    (existing as any).idempotencyKey === input.idempotencyKey
  ) {
    return {
      status: await getStatus(input.userId, input.organizationId),
      deduplicated: true,
    };
  }

  // Rate limit: only against fresh-key punches. Idempotent retries skip this
  // (the dedup branch above returned already). The cooldown is per
  // (user, type) so a checkout immediately after a check-in is fine.
  const cooldown = Math.max(0, cfg.minPunchGapSeconds * 1000);
  if (cooldown > 0) {
    const slot = acquireSlot(input.userId, input.type, cooldown, now.getTime());
    if (!slot.allowed) {
      const retrySec = Math.ceil(slot.retryAfterMs / 1000);
      await safeAudit(
        auditEmail,
        input.userId,
        input.organizationId,
        `${auditAction} rejected (RATE_LIMITED)`,
        { date, code: 'RATE_LIMITED', source, retryAfterSec: retrySec },
        input.ip ?? null,
        input.userAgent ?? null,
        existing?.id ?? null,
      );
      throw new AttendanceError(
        'RATE_LIMITED',
        `Too many punch attempts. Try again in ${retrySec}s.`,
        429,
      );
    }
  }

  let outcome: PunchOutcome;

  if (input.type === 'IN') {
    if (existing?.checkedIn) {
      // Already in: treat as successful no-op. Don't fire workflow / audit
      // again — this is just the user double-tapping.
      return {
        status: await getStatus(input.userId, input.organizationId),
        deduplicated: true,
      };
    }

    const expectedIn = dateAtHHmm(now, shift.start, tz);
    const graceEnd = new Date(expectedIn.getTime() + cfg.graceMinutes * 60_000);
    const lateMinutes = Math.max(0, diffMinutes(now, graceEnd));

    // Annotate the source with FACE_VERIFIED when a real match score
    // came back. Keeps the existing source values intact ('WEB' etc.)
    // and lets audit / reporting filter on `LIKE 'WEB+FACE_VERIFIED%'`.
    const inSource =
      typeof input.faceMatch === 'number'
        ? `${source}+FACE_VERIFIED`
        : source;

    const punchData = {
      checkedIn: true,
      checkInAt: now,
      checkInTime: formatHHmm(now, orgTimezone(cfg)),
      checkInLat: input.geo?.lat ?? null,
      checkInLng: input.geo?.lng ?? null,
      checkInIp: input.ip ?? null,
      ipAddress: input.ip ?? null, // legacy column kept in sync
      checkInDevice: input.userAgent ?? null,
      checkInSource: inSource,
      checkInPhoto: input.photoUrl ?? null,
      checkInFaceMatch: input.faceMatch ?? null,
      checkInLivenessPassed: input.livenessPassed ?? null,
      lateMinutes,
      organizationId: input.organizationId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    };

    if (!existing) {
      // Race-safe create. If a concurrent request beat us to creating the
      // row, the unique [userId, date] constraint throws P2002 and we fall
      // back to a conditional update — only writes if the row is still in
      // the !checkedIn state we expected.
      try {
        const created = await prisma.attendance.create({
          data: { userId: input.userId, date, ...punchData } as any,
        });
        outcome = await buildOutcome(input, created.id, true);
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
        const result = await prisma.attendance.updateMany({
          where: { userId: input.userId, date, checkedIn: false },
          data: punchData as any,
        });
        if (result.count === 0) {
          // Lost the race — someone else's IN landed first. Return their
          // result so the client sees the truth, and dedup so the widget
          // doesn't double-toast.
          return {
            status: await getStatus(input.userId, input.organizationId),
            deduplicated: true,
          };
        }
        const refetch = await prisma.attendance.findFirst({
          where: { userId: input.userId, date },
        });
        outcome = await buildOutcome(input, refetch?.id ?? null, true);
      }
    } else {
      // Existing row but not yet checked in. Conditional update guards
      // against a concurrent IN landing between our findFirst and update.
      const result = await prisma.attendance.updateMany({
        where: { id: existing.id, checkedIn: false },
        data: punchData as any,
      });
      if (result.count === 0) {
        return {
          status: await getStatus(input.userId, input.organizationId),
          deduplicated: true,
        };
      }
      outcome = await buildOutcome(input, existing.id, true);
    }
  } else {
    // OUT
    if (!existing?.checkedIn) {
      await safeAudit(
        auditEmail,
        input.userId,
        input.organizationId,
        `${auditAction} rejected (NOT_CHECKED_IN)`,
        { date, code: 'NOT_CHECKED_IN', source },
        input.ip ?? null,
        input.userAgent ?? null,
        existing?.id ?? null,
      );
      throw new AttendanceError(
        'NOT_CHECKED_IN',
        'You need to check in before checking out.',
      );
    }
    if (existing.checkedOut) {
      return {
        status: await getStatus(input.userId, input.organizationId),
        deduplicated: true,
      };
    }

    const checkInAt = (existing as any).checkInAt
      ? new Date((existing as any).checkInAt)
      : null;
    const expectedOut = dateAtHHmm(now, shift.end, tz);
    const earlyOutMinutes = Math.max(0, diffMinutes(expectedOut, now));

    // Overtime computation. Two paths depending on the org policy:
    //   - overtimeRequiresOptIn = true: OT runs from the moment the
    //     employee toggled "Start Overtime" on (overtimeStartedAt) until
    //     this check-out. Capped by overtimeMaxHoursPerDay.
    //   - overtimeRequiresOptIn = false: legacy "anything past
    //     overtimeAfterHours of worked time is OT" — preserved so orgs
    //     that haven't enabled opt-in keep the same behaviour.
    let overtimeMinutes = 0;
    if (checkInAt) {
      if (cfg.overtimeRequiresOptIn) {
        const otStart: Date | null = (existing as any).overtimeStartedAt
          ? new Date((existing as any).overtimeStartedAt)
          : null;
        if ((existing as any).overtimeOptedIn && otStart) {
          const rawOt = Math.max(0, diffMinutes(now, otStart));
          const cap = Math.round(
            Math.max(0, cfg.overtimeMaxHoursPerDay) * 60,
          );
          overtimeMinutes = cap > 0 ? Math.min(rawOt, cap) : rawOt;
        }
      } else {
        const workedMinutes = Math.max(
          0,
          diffMinutes(now, checkInAt) - cfg.breakMinutes,
        );
        const overtimeThreshold = Math.round(cfg.overtimeAfterHours * 60);
        const raw = Math.max(0, workedMinutes - overtimeThreshold);
        const cap = Math.round(Math.max(0, cfg.overtimeMaxHoursPerDay) * 60);
        overtimeMinutes = cap > 0 ? Math.min(raw, cap) : raw;
      }
    }

    const outSource =
      typeof input.faceMatch === 'number'
        ? `${source}+FACE_VERIFIED`
        : source;

    // Conditional update — only if still checked-in-not-out. Catches the
    // race where two checkout requests land at the same instant.
    const result = await prisma.attendance.updateMany({
      where: { id: existing.id, checkedIn: true, checkedOut: false },
      data: {
        checkedOut: true,
        checkOutAt: now,
        checkOutTime: formatHHmm(now, orgTimezone(cfg)),
        checkOutLat: input.geo?.lat ?? null,
        checkOutLng: input.geo?.lng ?? null,
        checkOutIp: input.ip ?? null,
        checkOutDevice: input.userAgent ?? null,
        checkOutSource: outSource,
        checkOutPhoto: input.photoUrl ?? null,
        checkOutFaceMatch: input.faceMatch ?? null,
        checkOutLivenessPassed: input.livenessPassed ?? null,
        earlyOutMinutes,
        overtimeMinutes,
        idempotencyKey: input.idempotencyKey ?? null,
        status: 'PRESENT',
      } as any,
    });
    if (result.count === 0) {
      return {
        status: await getStatus(input.userId, input.organizationId),
        deduplicated: true,
      };
    }
    outcome = await buildOutcome(input, existing.id, true);
  }

  // Commit the rate-limit slot only after we've actually written to the DB —
  // a failed punch (geofence, IP, account check) shouldn't count.
  if (cooldown > 0) commitSlot(input.userId, input.type, now.getTime());

  // Audit + workflow trigger run after the write succeeds. Both fire-and-
  // forget for the workflow trigger so a slow downstream rule never
  // blocks the response. The audit log is awaited so it lands in order.
  await safeAudit(
    auditEmail,
    input.userId,
    input.organizationId,
    auditAction,
    {
      date,
      attendanceId: outcome.attendanceId,
      source,
      lateMinutes: outcome.status.lateMinutes,
      earlyOutMinutes: outcome.status.earlyOutMinutes,
      overtimeMinutes: outcome.status.overtimeMinutes,
      isHoliday: outcome.status.isHoliday,
      isOnLeave: outcome.status.isOnLeave,
      isWeeklyOff: outcome.status.isWeeklyOff,
      ip: input.ip ?? null,
      geo: input.geo ?? null,
    },
    input.ip ?? null,
    input.userAgent ?? null,
    outcome.attendanceId,
  );

  if (input.organizationId && cfg.workflowModuleName) {
    // The trigger's downstream actions can take seconds (SMTP, function vm),
    // so we fire-and-forget. A misbehaving rule must NEVER block the punch
    // response.
    const recordData = buildWorkflowRecordData(
      input.type,
      outcome.status,
      actor,
      input.organizationId,
      source,
    );
    void triggerWorkflowsForRecord({
      moduleName: cfg.workflowModuleName,
      action: input.type === 'IN' ? 'Create' : 'Edit',
      organizationId: input.organizationId,
      userId: input.userId,
      recordId: outcome.attendanceId ?? undefined,
      recordData,
    }).catch((err) => {
      console.error('[attendance] workflow trigger failed:', err);
    });
  }

  // Per-user self-notification — feeds the bell with a daily trail of
  // "Checked in / late" / "Checked out / overtime" rows. Org-configurable
  // via AttendanceConfiguration.notifyOnPunch (default true). Fire-and-
  // forget so a slow notifications insert never blocks the punch.
  if (input.organizationId && cfg.notifyOnPunch) {
    void createPunchNotification({
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      status: outcome.status,
      attendanceId: outcome.attendanceId,
      moduleName: cfg.workflowModuleName ?? 'Attendance',
    }).catch((err) => {
      console.error('[attendance] notification create failed:', err);
    });
  }

  return { status: outcome.status, deduplicated: false };
}

// Small minutes → "Xh YYm" formatter used only for the notification body.
// We don't reuse the client-side helper to avoid a server/client import
// boundary.
function fmtHM(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Build + insert the per-punch notification. Kept separate so the punch
// path stays linear.
async function createPunchNotification(args: {
  organizationId: string;
  userId: string;
  type: PunchType;
  status: AttendanceStatus;
  attendanceId: string | null;
  moduleName: string;
}): Promise<void> {
  const { organizationId, userId, type, status, attendanceId, moduleName } = args;

  // Build the headline + a structured `data.fields` payload so the bell's
  // detail dialog can render late / worked / overtime as a clean table.
  let title: string;
  let body: string;
  const fields: Array<{ label: string; apiName: string; value: string }> = [];

  if (type === 'IN') {
    title = `Checked in at ${status.checkInTime ?? '—'}`;
    if (status.lateMinutes > 0) {
      body = `Late by ${fmtHM(status.lateMinutes)}.`;
      fields.push({
        label: 'Late by',
        apiName: 'lateMinutes',
        value: fmtHM(status.lateMinutes),
      });
    } else {
      body = `On time. Shift ends at ${status.shift.end}.`;
    }
    fields.push({
      label: 'Shift',
      apiName: 'shift',
      value: `${status.shift.start} – ${status.shift.end}`,
    });
  } else {
    title = `Checked out at ${status.checkOutTime ?? '—'}`;
    const parts: string[] = [];
    if (status.workedMinutes > 0) {
      parts.push(`Worked ${fmtHM(status.workedMinutes)}`);
      fields.push({
        label: 'Worked',
        apiName: 'workedMinutes',
        value: fmtHM(status.workedMinutes),
      });
    }
    if (status.overtimeMinutes > 0) {
      parts.push(`overtime ${fmtHM(status.overtimeMinutes)}`);
      fields.push({
        label: 'Overtime',
        apiName: 'overtimeMinutes',
        value: fmtHM(status.overtimeMinutes),
      });
    }
    if (status.earlyOutMinutes > 0) {
      parts.push(`early by ${fmtHM(status.earlyOutMinutes)}`);
      fields.push({
        label: 'Early out by',
        apiName: 'earlyOutMinutes',
        value: fmtHM(status.earlyOutMinutes),
      });
    }
    if (status.isAutoCheckedOut) {
      parts.push('auto-closed by policy');
    }
    body = parts.length > 0 ? parts.join(', ') + '.' : 'Working time recorded.';
  }

  // The Notification.data column was added in a recent migration. Older
  // Prisma clients reject it as an unknown argument — we follow the
  // workflow-trigger pattern and retry without `data` on that exact
  // failure so the bell still shows the row.
  try {
    await (prisma as any).notification.create({
      data: {
        recipientId: userId,
        organizationId,
        title,
        body,
        moduleName,
        recordId: attendanceId ?? null,
        link: '/attendance',
        data: fields.length > 0 ? { fields } : null,
      },
    });
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    const looksLikeUnknownDataArg =
      msg.includes('Unknown arg') ||
      msg.includes('Unknown argument');
    if (!looksLikeUnknownDataArg) throw err;
    await (prisma as any).notification.create({
      data: {
        recipientId: userId,
        organizationId,
        title,
        body,
        moduleName,
        recordId: attendanceId ?? null,
        link: '/attendance',
      },
    });
  }
}

// Builds the response status + outcome metadata. Centralised so every
// success path uses the same shape.
async function buildOutcome(
  input: PunchInput,
  attendanceId: string | null,
  changed: boolean,
): Promise<PunchOutcome> {
  const status = await getStatus(input.userId, input.organizationId);
  return { status, deduplicated: false, attendanceId, changed };
}

// ---- Overtime opt-in -------------------------------------------------------

export interface OvertimeToggleInput {
  userId: string;
  organizationId: string | null;
  /** true → start an OT session, false → stop it. */
  optIn: boolean;
}

/**
 * Toggle the employee's overtime opt-in for today's attendance row.
 *
 *   - Must be currently checked-in (otherwise OT has nothing to attach to).
 *   - When `optIn = true`, sets `overtimeStartedAt = now` only if it isn't
 *     already set. Toggling on twice in a row keeps the original start so
 *     the elapsed-time display in the widget doesn't jump backward.
 *   - When `optIn = false`, clears `overtimeOptedIn` but preserves
 *     `overtimeStartedAt` — payroll uses it as the audit trail for "the
 *     employee tried OT but cancelled before checkout" and the check-out
 *     calc gates on `overtimeOptedIn` so paused sessions contribute zero
 *     OT minutes by design.
 *   - Time-gates against `shift end + overtimeStartBufferMinutes` so the
 *     toggle can't be flipped before the buffer elapses, matching the
 *     widget's gating client-side.
 */
export async function setOvertimeOptIn(
  input: OvertimeToggleInput,
): Promise<AttendanceStatus> {
  const cfg = await getAttendanceConfig(input.organizationId);
  const shift = await getEffectiveShift(input.userId, cfg);
  const now = new Date();
  const tz = orgTimezone(cfg);
  const date = todayKey(now, tz);

  const row = await prisma.attendance.findFirst({
    where: { userId: input.userId, date },
  });
  if (!row || !row.checkedIn) {
    throw new AttendanceError(
      'NOT_CHECKED_IN',
      'You need to check in before starting overtime.',
      409,
    );
  }
  if (row.checkedOut) {
    throw new AttendanceError(
      'ALREADY_CHECKED_OUT',
      'You have already checked out — overtime cannot be toggled.',
      409,
    );
  }

  // Buffer gate: server-side mirror of the widget's clock check so a
  // misbehaving client can't sneak an early OT start through.
  if (input.optIn) {
    const availableAt = dateAtHHmm(
      now,
      addMinutesToHHmm(shift.end, cfg.overtimeStartBufferMinutes),
      tz,
    );
    if (now < availableAt) {
      throw new AttendanceError(
        'OT_NOT_AVAILABLE',
        `Overtime starts at ${formatHHmm(availableAt, orgTimezone(cfg))}. Try again then.`,
        409,
      );
    }
  }

  const data: Record<string, unknown> = {
    overtimeOptedIn: input.optIn,
  };
  if (input.optIn && !(row as any).overtimeStartedAt) {
    data.overtimeStartedAt = now;
  }

  await prisma.attendance.update({
    where: { id: row.id },
    data: data as any,
  });

  return getStatus(input.userId, input.organizationId);
}
