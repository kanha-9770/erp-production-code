/**
 * Typed accessor for AttendanceConfiguration.
 *
 * One row per org; missing row → safe defaults so a brand-new tenant works
 * without any setup. The defaults here are also the values payroll-store
 * falls back to, so attendance and payroll never disagree about working
 * days, half-day thresholds, or payable basis.
 */

import { prisma } from '@/lib/prisma';
import { buildKey, cached, cacheInvalidate } from '@/lib/cache';

const ATTENDANCE_CONFIG_TTL_S = 600; // 10 minutes — config only changes on admin save
const attendanceConfigKey = (orgId: string) =>
  buildKey('hr', 'attendance-config', orgId);

export type GeofenceMode = 'OFF' | 'CAPTURE' | 'ENFORCE';
export type PayableBasis = 'monthDays' | 'fixed26' | 'fixed30';
export type FaceCaptureMode = 'OFF' | 'OPTIONAL' | 'REQUIRED';
export type FaceVerifyMode = 'OFF' | 'WARN' | 'ENFORCE';
export type FaceLivenessMode = 'OFF' | 'PERMISSIVE' | 'STRICT';
export type FacePhotoStoreAfterVerify = 'ALWAYS' | 'ON_MISMATCH_ONLY' | 'NEVER';

export interface AttendanceConfig {
  id: string | null;
  organizationId: string | null;
  defaultShiftStart: string; // "HH:mm"
  defaultShiftEnd: string;
  graceMinutes: number;
  halfDayMinHours: number;
  fullDayMinHours: number;
  overtimeAfterHours: number;
  breakMinutes: number;
  /** # of half-day occurrences the company forgives each month. Beyond this
   *  count, every half-day still costs 0.5 day pay. 0 = no allowance. */
  monthlyHalfDayQuota: number;
  /** # of short-leave occurrences the company forgives each month. */
  monthlyShortLeaveQuota: number;
  /** Duration of one short-leave window in hours. A day whose deficit
   *  (fullDay − workedHours) is within this window counts as a short leave
   *  rather than a half-day. */
  shortLeaveHours: number;
  /** Minutes after shift-end before the widget's "Start Overtime" toggle
   *  becomes available. e.g. shift 18:30 + 30 → OT button enabled at 19:00. */
  overtimeStartBufferMinutes: number;
  /** Labour-law daily cap on counted OT hours. */
  overtimeMaxHoursPerDay: number;
  /** When true, payroll counts OT only on rows where the employee toggled
   *  OT on. False keeps the legacy "anything past overtimeAfterHours" path. */
  overtimeRequiresOptIn: boolean;
  weeklyOffDays: number[]; // 0=Sun … 6=Sat
  autoCheckoutAt: string | null;
  geofenceMode: GeofenceMode;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
  ipWhitelist: string[];
  payableBasis: PayableBasis;
  workflowModuleName: string | null;
  enforceEmployeeActive: boolean;
  minPunchGapSeconds: number;
  faceCaptureMode: FaceCaptureMode;
  facePhotoMaxKb: number;
  /** Days to retain uploaded attendance photos before the cleanup job
   *  deletes them. 0 = retain forever. */
  facePhotoRetentionDays: number;
  /** When face verification ran and succeeded, whether to keep the JPEG. */
  facePhotoStoreAfterVerify: FacePhotoStoreAfterVerify;
  faceVerifyMode: FaceVerifyMode;
  faceMatchThreshold: number;
  faceLivenessMode: FaceLivenessMode;
  attendanceModuleId: string | null;
  notifyOnPunch: boolean;
  attendanceApproverRoleIds: string[];
  reportRecipients: string[];
  reportTimezone: string | null;
  reportSendHour: number;
  reportDailyEnabled: boolean;
  reportWeeklyEnabled: boolean;
  reportMonthlyEnabled: boolean;
  isActive: boolean;
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  id: null,
  organizationId: null,
  defaultShiftStart: '09:00',
  defaultShiftEnd: '18:00',
  graceMinutes: 15,
  halfDayMinHours: 4,
  fullDayMinHours: 8,
  overtimeAfterHours: 9,
  breakMinutes: 60,
  monthlyHalfDayQuota: 0,
  // One short leave per user per month by default — counter resets at the
  // start of each calendar month. Admin can raise/lower via Attendance
  // Configuration → "Short leaves / month".
  monthlyShortLeaveQuota: 1,
  shortLeaveHours: 2,
  overtimeStartBufferMinutes: 30,
  overtimeMaxHoursPerDay: 4,
  overtimeRequiresOptIn: true,
  weeklyOffDays: [0],
  autoCheckoutAt: null,
  geofenceMode: 'OFF',
  geofenceLat: null,
  geofenceLng: null,
  geofenceRadiusM: null,
  ipWhitelist: [],
  payableBasis: 'monthDays',
  workflowModuleName: 'Attendance',
  enforceEmployeeActive: false,
  minPunchGapSeconds: 5,
  faceCaptureMode: 'OFF',
  facePhotoMaxKb: 100,
  facePhotoRetentionDays: 30,
  facePhotoStoreAfterVerify: 'ALWAYS',
  faceVerifyMode: 'OFF',
  faceMatchThreshold: 0.55,
  faceLivenessMode: 'OFF',
  attendanceModuleId: null,
  notifyOnPunch: true,
  attendanceApproverRoleIds: [],
  reportRecipients: [],
  reportTimezone: null,
  reportSendHour: 7,
  reportDailyEnabled: false,
  reportWeeklyEnabled: false,
  reportMonthlyEnabled: false,
  isActive: true,
};

function coerceWeeklyOff(raw: unknown): number[] {
  if (!Array.isArray(raw)) return DEFAULT_ATTENDANCE_CONFIG.weeklyOffDays;
  const out = raw
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return out.length > 0 ? out : DEFAULT_ATTENDANCE_CONFIG.weeklyOffDays;
}

function coerceIpList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

function coerceGeofenceMode(raw: unknown): GeofenceMode {
  return raw === 'CAPTURE' || raw === 'ENFORCE' ? raw : 'OFF';
}

function coercePayableBasis(raw: unknown): PayableBasis {
  return raw === 'fixed26' || raw === 'fixed30' ? raw : 'monthDays';
}

function coerceFaceCaptureMode(raw: unknown): FaceCaptureMode {
  return raw === 'OPTIONAL' || raw === 'REQUIRED' ? raw : 'OFF';
}

function coerceFaceVerifyMode(raw: unknown): FaceVerifyMode {
  return raw === 'WARN' || raw === 'ENFORCE' ? raw : 'OFF';
}

function coerceFaceLivenessMode(raw: unknown): FaceLivenessMode {
  return raw === 'PERMISSIVE' || raw === 'STRICT' ? raw : 'OFF';
}

function coerceFacePhotoStoreAfterVerify(
  raw: unknown,
): FacePhotoStoreAfterVerify {
  return raw === 'ON_MISMATCH_ONLY' || raw === 'NEVER' ? raw : 'ALWAYS';
}

// Retention is in days. 0 means "forever"; we clamp the upper bound at
// 10 years so a typo can't accidentally schedule a 100-year retention.
function coerceFacePhotoRetentionDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ATTENDANCE_CONFIG.facePhotoRetentionDays;
  return Math.min(3650, Math.max(0, Math.floor(n)));
}

function coerceFaceMatchThreshold(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ATTENDANCE_CONFIG.faceMatchThreshold;
  // face-api.js descriptors live in [0, ~1.5]; clamp to a sensible band
  // so an admin can't accidentally save a useless 0 or 99.
  return Math.min(1.0, Math.max(0.3, n));
}

function coerceRoleIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function coerceEmailList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((v): v is string => typeof v === 'string')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => EMAIL_RE.test(s)),
    ),
  );
}

function coerceSendHour(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 7;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

export async function getAttendanceConfig(
  organizationId: string | null,
): Promise<AttendanceConfig> {
  if (!organizationId) {
    return { ...DEFAULT_ATTENDANCE_CONFIG };
  }

  // Cached in the `hr` namespace (dedicated Upstash DB). On a Redis outage
  // `cached` falls through to the loader, which preserves the original
  // try/catch + defaults safety net below.
  return cached(
    'hr',
    attendanceConfigKey(organizationId),
    ATTENDANCE_CONFIG_TTL_S,
    () => loadAttendanceConfigFromDb(organizationId),
  );
}

async function loadAttendanceConfigFromDb(
  organizationId: string,
): Promise<AttendanceConfig> {
  try {
    const row = await (prisma as any).attendanceConfiguration.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) {
      return { ...DEFAULT_ATTENDANCE_CONFIG, organizationId };
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      defaultShiftStart: row.defaultShiftStart ?? '09:00',
      defaultShiftEnd: row.defaultShiftEnd ?? '18:00',
      graceMinutes: row.graceMinutes ?? 15,
      halfDayMinHours: Number(row.halfDayMinHours ?? 4),
      fullDayMinHours: Number(row.fullDayMinHours ?? 8),
      overtimeAfterHours: Number(row.overtimeAfterHours ?? 9),
      breakMinutes: row.breakMinutes ?? 60,
      monthlyHalfDayQuota: Number.isFinite(row.monthlyHalfDayQuota)
        ? Math.max(0, Math.floor(Number(row.monthlyHalfDayQuota)))
        : 0,
      monthlyShortLeaveQuota: Number.isFinite(row.monthlyShortLeaveQuota)
        ? Math.max(0, Math.floor(Number(row.monthlyShortLeaveQuota)))
        : 0,
      shortLeaveHours: Number.isFinite(row.shortLeaveHours)
        ? Math.max(0, Number(row.shortLeaveHours))
        : 2,
      overtimeStartBufferMinutes: Number.isFinite(row.overtimeStartBufferMinutes)
        ? Math.max(0, Math.floor(Number(row.overtimeStartBufferMinutes)))
        : 30,
      overtimeMaxHoursPerDay: Number.isFinite(row.overtimeMaxHoursPerDay)
        ? Math.max(0, Number(row.overtimeMaxHoursPerDay))
        : 4,
      overtimeRequiresOptIn:
        row.overtimeRequiresOptIn === undefined ? true : !!row.overtimeRequiresOptIn,
      weeklyOffDays: coerceWeeklyOff(row.weeklyOffDays),
      autoCheckoutAt: row.autoCheckoutAt ?? null,
      geofenceMode: coerceGeofenceMode(row.geofenceMode),
      geofenceLat: row.geofenceLat ?? null,
      geofenceLng: row.geofenceLng ?? null,
      geofenceRadiusM: row.geofenceRadiusM ?? null,
      ipWhitelist: coerceIpList(row.ipWhitelist),
      payableBasis: coercePayableBasis(row.payableBasis),
      workflowModuleName:
        typeof row.workflowModuleName === 'string' && row.workflowModuleName.trim().length > 0
          ? row.workflowModuleName.trim()
          : null,
      enforceEmployeeActive: !!row.enforceEmployeeActive,
      minPunchGapSeconds: Number.isFinite(row.minPunchGapSeconds)
        ? Math.max(0, Number(row.minPunchGapSeconds))
        : 5,
      faceCaptureMode: coerceFaceCaptureMode(row.faceCaptureMode),
      facePhotoMaxKb: Number.isFinite(row.facePhotoMaxKb)
        ? Math.max(50, Number(row.facePhotoMaxKb))
        : DEFAULT_ATTENDANCE_CONFIG.facePhotoMaxKb,
      facePhotoRetentionDays: coerceFacePhotoRetentionDays(
        row.facePhotoRetentionDays,
      ),
      facePhotoStoreAfterVerify: coerceFacePhotoStoreAfterVerify(
        row.facePhotoStoreAfterVerify,
      ),
      faceVerifyMode: coerceFaceVerifyMode(row.faceVerifyMode),
      faceMatchThreshold: coerceFaceMatchThreshold(row.faceMatchThreshold),
      faceLivenessMode: coerceFaceLivenessMode(row.faceLivenessMode),
      attendanceModuleId:
        typeof row.attendanceModuleId === 'string' && row.attendanceModuleId.length > 0
          ? row.attendanceModuleId
          : null,
      notifyOnPunch: row.notifyOnPunch === undefined ? true : !!row.notifyOnPunch,
      attendanceApproverRoleIds: coerceRoleIds(row.attendanceApproverRoleIds),
      reportRecipients: coerceEmailList(row.reportRecipients),
      reportTimezone:
        typeof row.reportTimezone === 'string' && row.reportTimezone.trim().length > 0
          ? row.reportTimezone.trim()
          : null,
      reportSendHour: coerceSendHour(row.reportSendHour),
      reportDailyEnabled: !!row.reportDailyEnabled,
      reportWeeklyEnabled: !!row.reportWeeklyEnabled,
      reportMonthlyEnabled: !!row.reportMonthlyEnabled,
      isActive: row.isActive ?? true,
    };
  } catch (err) {
    console.warn('[attendance-config] load failed; using defaults:', err);
    return { ...DEFAULT_ATTENDANCE_CONFIG, organizationId };
  }
}

export interface AttendanceConfigUpdate {
  defaultShiftStart?: string;
  defaultShiftEnd?: string;
  graceMinutes?: number;
  halfDayMinHours?: number;
  fullDayMinHours?: number;
  overtimeAfterHours?: number;
  breakMinutes?: number;
  monthlyHalfDayQuota?: number;
  monthlyShortLeaveQuota?: number;
  shortLeaveHours?: number;
  overtimeStartBufferMinutes?: number;
  overtimeMaxHoursPerDay?: number;
  overtimeRequiresOptIn?: boolean;
  weeklyOffDays?: number[];
  autoCheckoutAt?: string | null;
  geofenceMode?: GeofenceMode;
  geofenceLat?: number | null;
  geofenceLng?: number | null;
  geofenceRadiusM?: number | null;
  ipWhitelist?: string[];
  payableBasis?: PayableBasis;
  workflowModuleName?: string | null;
  enforceEmployeeActive?: boolean;
  minPunchGapSeconds?: number;
  faceCaptureMode?: FaceCaptureMode;
  facePhotoMaxKb?: number;
  facePhotoRetentionDays?: number;
  facePhotoStoreAfterVerify?: FacePhotoStoreAfterVerify;
  faceVerifyMode?: FaceVerifyMode;
  faceMatchThreshold?: number;
  faceLivenessMode?: FaceLivenessMode;
  attendanceModuleId?: string | null;
  notifyOnPunch?: boolean;
  attendanceApproverRoleIds?: string[];
  reportRecipients?: string[];
  reportTimezone?: string | null;
  reportSendHour?: number;
  reportDailyEnabled?: boolean;
  reportWeeklyEnabled?: boolean;
  reportMonthlyEnabled?: boolean;
  isActive?: boolean;
}

// Extract the offending argument name from a Prisma "Unknown argument
// `xyz`" validation message. Returns null if it isn't that kind of error.
function unknownArgumentField(err: unknown): string | null {
  const msg = String((err as any)?.message ?? err ?? '');
  // Prisma 6 message shape:  "Unknown argument `myField`. Available …"
  const m =
    msg.match(/Unknown argument `([^`]+)`/) ??
    msg.match(/Unknown arg\s+`([^`]+)`/) ??
    null;
  return m ? m[1] : null;
}

export async function upsertAttendanceConfig(
  organizationId: string,
  patch: AttendanceConfigUpdate,
): Promise<AttendanceConfig> {
  // Filter out undefined so we don't overwrite stored values with nulls.
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) data[k] = v;
  }

  // Resilience against a stale Prisma client: if the running client was
  // generated before the latest schema additions (typical when the dev
  // server held the .dll lock during `prisma generate`), the upsert
  // fails with `Unknown argument <field>`. We strip that field and retry
  // until the call lands or we run out of fields to drop. The caller's
  // save still partially succeeds; the dropped fields are logged so the
  // admin sees what didn't persist.
  const droppedFields: string[] = [];
  // Cap iterations defensively — every retry must remove at least one
  // field, so 32 is wildly more than enough for the schema's column count.
  for (let attempt = 0; attempt < 32; attempt++) {
    try {
      await (prisma as any).attendanceConfiguration.upsert({
        where: { organizationId },
        update: data,
        create: { organizationId, ...data },
      });
      if (droppedFields.length > 0) {
        console.warn(
          `[attendance-config] saved with ${droppedFields.length} field(s) dropped — Prisma client is stale: ${droppedFields.join(
            ', ',
          )}. Run \`npx prisma generate\` to enable them.`,
        );
      }
      // Invalidate cache BEFORE re-reading so the read repopulates from DB.
      await cacheInvalidate('hr', attendanceConfigKey(organizationId));
      return getAttendanceConfig(organizationId);
    } catch (err) {
      const field = unknownArgumentField(err);
      if (!field || !(field in data)) throw err;
      delete data[field];
      droppedFields.push(field);
    }
  }
  // Shouldn't reach here — every retry removes a field, so we either
  // succeed or the data object empties out and the bare upsert succeeds
  // (creating just the organizationId row).
  throw new Error('upsertAttendanceConfig: too many client/schema mismatches');
}

// HH:mm → minutes-since-midnight. Returns null for malformed input so
// callers can decide whether to fall back to a default.
export function parseHHmm(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
