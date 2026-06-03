/**
 * Day-fill: synthesize "no-row" attendance days so every calendar day shows
 * up in My Attendance and Team Attendance — not just the days an employee
 * actually punched.
 *
 * The Attendance table only gets a row when someone checks in (or an admin
 * makes a manual entry). So a day where the employee never punched, has no
 * approved leave, and isn't a holiday / weekly-off leaves NO row behind — and
 * the attendance screens (which only render existing rows) silently skip it.
 * Payroll already handles this correctly (its classifier walks every calendar
 * day and books a no-show working day as Absent/LOP — see
 * lib/utils/payroll-utils.ts `classifyDay`), but the *screens* didn't, so an
 * absence was invisible to admins until payday.
 *
 * This module fills the gaps for DISPLAY ONLY. It writes nothing to the DB and
 * changes no pay — it just produces synthetic, read-only rows for the days that
 * have no real Attendance row, classifying each the same way payroll does:
 *
 *   precedence (first match wins, mirrors classifyDay):
 *     1. out-of-service (before joining / after leaving) → no row at all
 *     2. holiday      → HOLIDAY
 *     3. weekly-off   → WEEKLY_OFF
 *     4. approved leave covering the day → ON_LEAVE
 *     5. otherwise, a plain working day with no punch:
 *          • today or future → no row (they may still check in)
 *          • a past day      → ABSENT
 *
 * Keeping the precedence identical to payroll means the badge an admin sees on
 * the screen matches the day the payroll engine will pay (or dock).
 */

import { prisma } from '@/lib/prisma';

export type SyntheticDayStatus = 'ABSENT' | 'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE';

/** One approved-leave interval, with the raw fields needed to describe it. */
export interface LeaveInterval {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  typeName: string;
  duration: string; // FULL_DAY | HALF_DAY_FIRST | HALF_DAY_SECOND
  startTime: string | null; // HH:MM — set only for SHORT_LEAVE requests
  endTime: string | null;
}

/**
 * Display-ready description of an approved leave covering a given day. Computed
 * server-side so every surface (badge chip, tooltip, detail panel) shows the
 * same wording without re-deriving from the raw duration/time fields.
 */
export interface LeaveInfo {
  typeName: string;
  /** SHORT_LEAVE = a fixed few-hour window; HALF_DAY = morning/afternoon. */
  kind: 'FULL_DAY' | 'HALF_DAY' | 'SHORT_LEAVE';
  half: 'FIRST' | 'SECOND' | null;
  startTime: string | null;
  endTime: string | null;
  /** Compact label for the row chip, e.g. "Short 13:00–15:00", "½ Casual Leave". */
  chipLabel: string;
  /** Full sentence for the tooltip / detail panel. */
  detailLabel: string;
}

/** Pre-fetched, org-scoped context the pure builder needs. */
export interface DayFillContext {
  /** date (YYYY-MM-DD) → holiday name. Non-optional holidays only. */
  holidaysByDate: Map<string, string>;
  /** userId → approved-leave intervals overlapping the window. */
  leavesByUser: Map<string, LeaveInterval[]>;
  /** userId → employment window (YYYY-MM-DD strings, or null when open-ended). */
  employmentByUser: Map<string, { doj: string | null; dol: string | null }>;
}

/** Turn a raw leave interval into the display-ready LeaveInfo. */
export function buildLeaveInfo(l: LeaveInterval): LeaveInfo {
  // Short leave is identified by the slot window the apply flow stamps onto
  // SHORT_LEAVE requests (half/full-day leaves leave these null).
  const isShort = !!(l.startTime && l.endTime);
  const half =
    l.duration === 'HALF_DAY_FIRST'
      ? 'FIRST'
      : l.duration === 'HALF_DAY_SECOND'
        ? 'SECOND'
        : null;
  const kind: LeaveInfo['kind'] = isShort
    ? 'SHORT_LEAVE'
    : half
      ? 'HALF_DAY'
      : 'FULL_DAY';

  // Row chip stays SHORT and type-agnostic so it fits the narrow status column
  // on mobile (the full type name + half/window detail lives in the tooltip and
  // the detail-panel banner). This avoids clutter like "½ Half Day Leave" when a
  // leave type is itself named "Half Day Leave".
  let chipLabel: string;
  let detailLabel: string;
  if (kind === 'SHORT_LEAVE') {
    const win = `${l.startTime}–${l.endTime}`;
    chipLabel = `Short ${win}`;
    detailLabel = `${l.typeName} — short leave ${win}`;
  } else if (kind === 'HALF_DAY') {
    const halfTxt = half === 'FIRST' ? '1st half' : '2nd half';
    chipLabel = '½ Leave';
    detailLabel = `${l.typeName} — half day (${halfTxt})`;
  } else {
    chipLabel = 'Leave';
    detailLabel = `${l.typeName} — full day`;
  }
  return {
    typeName: l.typeName,
    kind,
    half,
    startTime: l.startTime,
    endTime: l.endTime,
    chipLabel,
    detailLabel,
  };
}

/** LeaveInfo for the approved leave covering `date`, or null if none. First
 *  match wins (same precedence the payroll classifier uses). */
export function leaveInfoForDate(
  date: string,
  leaves: LeaveInterval[] | undefined,
): LeaveInfo | null {
  if (!leaves) return null;
  const hit = leaves.find((l) => date >= l.start && date <= l.end);
  return hit ? buildLeaveInfo(hit) : null;
}

/**
 * A synthetic, display-only attendance record. Shape-compatible with the
 * `AttendanceRecord` the attendance tables render: every punch/photo/geo field
 * is zeroed/nulled so the row shows dashes, and `synthetic: true` lets the UI
 * suppress actions (regularize / correction) that need a real DB row id.
 */
export interface SyntheticDayRecord {
  id: string;
  userId: string;
  date: string;
  synthetic: true;
  checkedIn: false;
  checkedOut: false;
  checkInAt: null;
  checkOutAt: null;
  checkInTime: null;
  checkOutTime: null;
  lateMinutes: 0;
  earlyOutMinutes: 0;
  overtimeMinutes: 0;
  overtimeOptedIn: false;
  isAutoCheckedOut: false;
  // Both fields are set so every consumer renders correctly: the team table
  // switches on `effectiveStatus` (ABSENT) and falls through to `status` for
  // ON_LEAVE / HOLIDAY / WEEKLY_OFF; My Attendance reads `effectiveStatus`.
  status: SyntheticDayStatus;
  effectiveStatus: SyntheticDayStatus;
  effectiveStatusReason: string | null;
  /** Approved-leave description, set on ON_LEAVE rows so the UI can show the
   *  leave chip / detail. Null on Absent / Weekly-off / Holiday rows. */
  leave: LeaveInfo | null;
  checkInPhoto: null;
  checkOutPhoto: null;
  checkInLat: null;
  checkInLng: null;
  checkOutLat: null;
  checkOutLng: null;
  checkInSource: null;
  checkOutSource: null;
  checkInDistanceM: null;
  checkInOutsideRadius: null;
  checkInLocationMissing: false;
  checkOutDistanceM: null;
  checkOutOutsideRadius: null;
  checkOutLocationMissing: false;
}

/** YYYY-MM-DD of a Date, in UTC. DOJ/DOL are stored at midnight so this is
 *  stable for the coarse employment-boundary comparison we use it for. */
function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive [from, to] as {date, weekday} pairs. Weekday is 0=Sun…6=Sat,
 *  computed in UTC so it never drifts with the server's local zone. */
function enumerateDates(
  from: string,
  to: string,
): Array<{ date: string; weekday: number }> {
  const out: Array<{ date: string; weekday: number }> = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (![fy, fm, fd, ty, tm, td].every(Number.isFinite)) return out;
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  // Bound the loop defensively so a malformed range can't spin forever.
  let guard = 0;
  while (cur <= end && guard < 1000) {
    out.push({ date: cur.toISOString().slice(0, 10), weekday: cur.getUTCDay() });
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

/**
 * Load the holiday / approved-leave / employment context for a set of users
 * over a date window. Degrades to empty maps on any query failure so the
 * caller still renders the real rows (just without gap-fill) rather than 500ing.
 */
export async function fetchDayFillContext(params: {
  organizationId: string;
  userIds: string[];
  from: string;
  to: string;
}): Promise<DayFillContext> {
  const { organizationId, userIds, from, to } = params;
  const empty: DayFillContext = {
    holidaysByDate: new Map(),
    leavesByUser: new Map(),
    employmentByUser: new Map(),
  };
  if (userIds.length === 0) return empty;

  try {
    const [holidays, leaves, employees] = await Promise.all([
      // Non-optional holidays in the window — same filter payroll uses so the
      // two stay in lockstep (optional/floating holidays don't auto-pay).
      (prisma as any).holiday.findMany({
        where: { organizationId, date: { gte: from, lte: to }, isOptional: false },
        select: { date: true, name: true },
      }),
      // Approved leaves that OVERLAP the window: start on/before `to` AND end
      // on/after `from`. Catches multi-day leaves that straddle the edges.
      (prisma as any).leaveRequest.findMany({
        where: {
          organizationId,
          status: 'APPROVED',
          userId: { in: userIds },
          startDate: { lte: to },
          endDate: { gte: from },
        },
        select: {
          userId: true,
          startDate: true,
          endDate: true,
          leaveTypeId: true,
          duration: true,
          startTime: true,
          endTime: true,
        },
      }),
      // Employment window so we never flag a day before someone joined / after
      // they left as Absent. userId is unique on Employee.
      (prisma as any).employee.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, dateOfJoining: true, dateOfLeaving: true },
      }),
    ]);

    const holidaysByDate = new Map<string, string>();
    for (const h of holidays as Array<{ date: string; name: string }>) {
      holidaysByDate.set(h.date, h.name ?? 'Holiday');
    }

    // Resolve leave-type names in one extra query (LeaveRequest stores only the
    // id — there's no relation on the model by design).
    const typeIds = Array.from(
      new Set(
        (leaves as Array<{ leaveTypeId: string }>).map((l) => l.leaveTypeId).filter(Boolean),
      ),
    );
    const typeNameById = new Map<string, string>();
    if (typeIds.length > 0) {
      const types = await (prisma as any).leaveType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true, name: true },
      });
      for (const t of types as Array<{ id: string; name: string }>) {
        typeNameById.set(t.id, t.name ?? 'Leave');
      }
    }

    const leavesByUser = new Map<string, LeaveInterval[]>();
    for (const l of leaves as Array<{
      userId: string;
      startDate: string;
      endDate: string;
      leaveTypeId: string;
      duration: string;
      startTime: string | null;
      endTime: string | null;
    }>) {
      const list = leavesByUser.get(l.userId) ?? [];
      list.push({
        start: l.startDate,
        end: l.endDate,
        typeName: typeNameById.get(l.leaveTypeId) ?? 'Leave',
        duration: l.duration,
        startTime: l.startTime ?? null,
        endTime: l.endTime ?? null,
      });
      leavesByUser.set(l.userId, list);
    }

    const employmentByUser = new Map<string, { doj: string | null; dol: string | null }>();
    for (const e of employees as Array<{
      userId: string | null;
      dateOfJoining: Date | null;
      dateOfLeaving: Date | null;
    }>) {
      if (!e.userId) continue;
      employmentByUser.set(e.userId, {
        doj: e.dateOfJoining ? ymdUtc(e.dateOfJoining) : null,
        dol: e.dateOfLeaving ? ymdUtc(e.dateOfLeaving) : null,
      });
    }

    return { holidaysByDate, leavesByUser, employmentByUser };
  } catch (err) {
    console.warn('[attendance-day-fill] context load failed:', err);
    return empty;
  }
}

/**
 * Build synthetic rows for every (user, date) in the window that has NO real
 * attendance row. Pure — no IO. `today` is the org's current day key, used to
 * gate the Absent fallback (today/future are never marked absent).
 */
export function buildSyntheticDays(params: {
  userIds: string[];
  from: string;
  to: string;
  today: string;
  weeklyOffDays: number[];
  /** userId → set of dates that already have a real Attendance row. */
  realDatesByUser: Map<string, Set<string>>;
  ctx: DayFillContext;
}): SyntheticDayRecord[] {
  const { userIds, from, to, today, weeklyOffDays, realDatesByUser, ctx } = params;
  const days = enumerateDates(from, to);
  if (days.length === 0) return [];
  const weeklyOff = new Set(weeklyOffDays);
  const out: SyntheticDayRecord[] = [];

  const base = (
    userId: string,
    date: string,
    status: SyntheticDayStatus,
    reason: string | null,
  ): SyntheticDayRecord => ({
    id: `synthetic-${userId}-${date}`,
    userId,
    date,
    synthetic: true,
    checkedIn: false,
    checkedOut: false,
    checkInAt: null,
    checkOutAt: null,
    checkInTime: null,
    checkOutTime: null,
    lateMinutes: 0,
    earlyOutMinutes: 0,
    overtimeMinutes: 0,
    overtimeOptedIn: false,
    isAutoCheckedOut: false,
    status,
    effectiveStatus: status,
    effectiveStatusReason: reason,
    leave: null,
    checkInPhoto: null,
    checkOutPhoto: null,
    checkInLat: null,
    checkInLng: null,
    checkOutLat: null,
    checkOutLng: null,
    checkInSource: null,
    checkOutSource: null,
    checkInDistanceM: null,
    checkInOutsideRadius: null,
    checkInLocationMissing: false,
    checkOutDistanceM: null,
    checkOutOutsideRadius: null,
    checkOutLocationMissing: false,
  });

  for (const userId of userIds) {
    const realDates = realDatesByUser.get(userId);
    const employment = ctx.employmentByUser.get(userId);
    const leaves = ctx.leavesByUser.get(userId);

    for (const { date, weekday } of days) {
      // A real row already covers this day — leave it to the real mapper.
      if (realDates && realDates.has(date)) continue;

      // Out of service: before joining or after leaving → no row at all.
      if (employment) {
        if (employment.doj && date < employment.doj) continue;
        if (employment.dol && date > employment.dol) continue;
      }

      // Holiday wins over weekly-off (a holiday on a Sunday is still a holiday).
      const holidayName = ctx.holidaysByDate.get(date);
      if (holidayName) {
        out.push(base(userId, date, 'HOLIDAY', holidayName));
        continue;
      }

      if (weeklyOff.has(weekday)) {
        out.push(base(userId, date, 'WEEKLY_OFF', 'Weekly off'));
        continue;
      }

      // Approved leave covering this day.
      const leaveHit = leaves?.find((l) => date >= l.start && date <= l.end);
      if (leaveHit) {
        const info = buildLeaveInfo(leaveHit);
        out.push({
          ...base(userId, date, 'ON_LEAVE', info.detailLabel),
          leave: info,
        });
        continue;
      }

      // Plain working day, no punch. Don't pre-judge today/future as absent —
      // the employee may still check in before the day ends.
      if (date >= today) continue;

      out.push(
        base(userId, date, 'ABSENT', 'No check-in recorded for this day — marked absent.'),
      );
    }
  }

  return out;
}
