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
}

export interface AttendanceStatus {
  state: AttendanceState;
  date: string; // YYYY-MM-DD (local server tz)
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
  isAutoCheckedOut: boolean;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  faceCapture: {
    mode: 'OFF' | 'OPTIONAL' | 'REQUIRED';
    maxKb: number;
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
  };
}

// ---- Date / time helpers --------------------------------------------------

// Format YYYY-MM-DD using server-local time. Mirrors lib/attendance.getToday()
// behaviour for backward compatibility — we deliberately do NOT swap to UTC
// here, since the existing Attendance rows were written this way and a
// timezone change would split today's row in two.
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dateAtHHmm(base: Date, hhmm: string): Date {
  const mins = parseHHmm(hhmm) ?? 9 * 60;
  const out = new Date(base);
  out.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return out;
}

function diffMinutes(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60000);
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

// Find an approved leave covering `date` for this user. We match by user's
// email since the leave form's identity column is email or empId, but the
// User row we have here only carries email reliably.
function findLeaveForToday(
  leaves: SampleLeave[],
  userEmail: string | null,
  date: string,
): SampleLeave | null {
  if (!userEmail) return null;
  const normalized = userEmail.toLowerCase();
  for (const l of leaves) {
    if (l.email.toLowerCase() !== normalized) continue;
    if (l.startDate <= date && date <= l.endDate) return l;
  }
  return null;
}

// ---- Status ---------------------------------------------------------------

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
  now: Date,
): Promise<{ checkOutAt: Date; overtimeMinutes: number; earlyOutMinutes: number } | null> {
  const auto = parseHHmm(cfg.autoCheckoutAt ?? null);
  if (auto === null) return null;
  const autoToday = new Date(now);
  autoToday.setHours(Math.floor(auto / 60), auto % 60, 0, 0);
  if (now < autoToday) return null;
  // Don't auto-close before the user has been "in" for a sensible duration —
  // shields against misconfigurations that would otherwise fire instantly.
  if (now.getTime() - checkInAt.getTime() < 60 * 60 * 1000) return null;

  const checkOutAt = autoToday;
  const expectedOut = dateAtHHmm(now, cfg.defaultShiftEnd);
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
      checkOutTime: formatHHmm(checkOutAt),
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
  const cfg = await getAttendanceConfig(organizationId);
  const now = new Date();
  const date = todayKey(now);
  const month = date.slice(0, 7);

  // Look up the user's email once — used for matching leave records and
  // (later) for tenant-scoped team views. Falls back gracefully if the row
  // is gone for some reason.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const userEmail = user?.email ?? null;

  let row = await prisma.attendance.findFirst({
    where: { userId, date },
  });

  // Holiday and leave detection. Only meaningful when we know the org.
  let isHoliday = false;
  let holidayName: string | null = null;
  let isOnLeave = false;
  let leaveType: string | null = null;
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
    const leave = findLeaveForToday(leaves, userEmail, date);
    if (leave) {
      isOnLeave = true;
      leaveType = leave.leaveType || null;
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
      now,
    );
    if (result) {
      // Re-fetch with the freshly-written values rather than mutating the
      // local row in-place — keeps the source-of-truth read in one place.
      row = await prisma.attendance.findFirst({ where: { userId, date } });
    }
  }

  const expectedInAt = dateAtHHmm(now, cfg.defaultShiftStart);
  const expectedOutAt = dateAtHHmm(now, cfg.defaultShiftEnd);
  const isWeeklyOff = cfg.weeklyOffDays.includes(now.getDay());

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
  const canCheckIn =
    !checkedIn && !isHoliday && !isOnLeave && !isWeeklyOff;

  return {
    state,
    date,
    checkedIn,
    checkedOut,
    canCheckIn,
    canCheckOut: checkedIn && !checkedOut,
    checkInAt: checkInAt?.toISOString() ?? null,
    checkOutAt: checkOutAt?.toISOString() ?? null,
    checkInTime: row?.checkInTime ?? (checkInAt ? formatHHmm(checkInAt) : null),
    checkOutTime: row?.checkOutTime ?? (checkOutAt ? formatHHmm(checkOutAt) : null),
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
    isAutoCheckedOut: !!(row as any)?.isAutoCheckedOut,
    checkInPhoto: (row as any)?.checkInPhoto ?? null,
    checkOutPhoto: (row as any)?.checkOutPhoto ?? null,
    faceCapture: {
      mode: cfg.faceCaptureMode,
      maxKb: cfg.facePhotoMaxKb,
    },
    geofence: {
      mode: cfg.geofenceMode,
      lat: cfg.geofenceLat,
      lng: cfg.geofenceLng,
      radiusM: cfg.geofenceRadiusM,
    },
    shift: { start: cfg.defaultShiftStart, end: cfg.defaultShiftEnd },
  };
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
  const cfg = await getAttendanceConfig(input.organizationId);
  const now = new Date();
  const date = todayKey(now);
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
  if (cfg.faceCaptureMode === 'REQUIRED' && !input.photoUrl) {
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

    const expectedIn = dateAtHHmm(now, cfg.defaultShiftStart);
    const graceEnd = new Date(expectedIn.getTime() + cfg.graceMinutes * 60_000);
    const lateMinutes = Math.max(0, diffMinutes(now, graceEnd));

    const punchData = {
      checkedIn: true,
      checkInAt: now,
      checkInTime: formatHHmm(now),
      checkInLat: input.geo?.lat ?? null,
      checkInLng: input.geo?.lng ?? null,
      checkInIp: input.ip ?? null,
      ipAddress: input.ip ?? null, // legacy column kept in sync
      checkInDevice: input.userAgent ?? null,
      checkInSource: source,
      checkInPhoto: input.photoUrl ?? null,
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
    const expectedOut = dateAtHHmm(now, cfg.defaultShiftEnd);
    const earlyOutMinutes = Math.max(0, diffMinutes(expectedOut, now));

    let overtimeMinutes = 0;
    if (checkInAt) {
      const workedMinutes = Math.max(
        0,
        diffMinutes(now, checkInAt) - cfg.breakMinutes,
      );
      const overtimeThreshold = Math.round(cfg.overtimeAfterHours * 60);
      overtimeMinutes = Math.max(0, workedMinutes - overtimeThreshold);
    }

    // Conditional update — only if still checked-in-not-out. Catches the
    // race where two checkout requests land at the same instant.
    const result = await prisma.attendance.updateMany({
      where: { id: existing.id, checkedIn: true, checkedOut: false },
      data: {
        checkedOut: true,
        checkOutAt: now,
        checkOutTime: formatHHmm(now),
        checkOutLat: input.geo?.lat ?? null,
        checkOutLng: input.geo?.lng ?? null,
        checkOutIp: input.ip ?? null,
        checkOutDevice: input.userAgent ?? null,
        checkOutSource: source,
        checkOutPhoto: input.photoUrl ?? null,
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
