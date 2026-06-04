/**
 * Single source of truth for classifying a day's attendance into a
 * presentation status (Working / Present / Half-Day / Absent / Auto-
 * Checkout). Same rules drive:
 *
 *   • UI status badges in My Attendance and Team Attendance
 *   • The payroll classifier's day-level present/half/absent buckets
 *   • The history / team API responses (which attach `effectiveStatus`
 *     so the client doesn't have to know about config thresholds)
 *
 * Keeping the rules here means a change to the half/full-day cutoff in
 * Attendance Configuration ripples to every consumer without drift
 * between what the badge shows and what payroll pays.
 *
 * Order of precedence (first match wins):
 *   1. Live punch (checkedIn && !checkedOut) → WORKING
 *   2. Auto-checkout + NO OT opt-in          → AUTO_CHECKOUT (₹0 day)
 *      (When the employee toggled OT on for the row before the auto-
 *      checkout fired, they signaled intent to stay — we treat the row
 *      as a normal punch and let the org's OT cap protect against the
 *      inflated 24h-cap hours.)
 *   3. Approved leave covers part of the day  → worked hours only have to
 *      (leaveDayFraction > 0)                   cover the REMAINING fraction;
 *                                               full day if they do, else
 *                                               HALF_DAY (never ABSENT — the
 *                                               leave guarantees the half).
 *   4. Hours worked < halfDayMinHours        → ABSENT (no pay)
 *   5. Hours worked < fullDayMinHours        → HALF_DAY
 *   6. Late past grace AND lateHalfDay on    → HALF_DAY (opt-in tardiness rule)
 *   7. Otherwise                             → PRESENT
 *
 * Step 5 is OPT-IN: the lateness→half-day downgrade only fires when the org
 * enables `lateHalfDay` in Attendance Configuration. When off (default), a
 * late check-in never costs half a day once full hours are met — lateMinutes
 * is still computed and surfaced as info (and drives the "Late by Nm"
 * tooltip), it just doesn't change the pay classification.
 *
 * Hours-worked thresholds come from AttendanceConfiguration so admins
 * can tune them per-org. Lateness is already shift-aware (the punch
 * service computes `lateMinutes` against the per-employee shift override
 * from Employee Master when set, with `lateMinutes = 0` when the user
 * arrived within the grace window). Per-employee timings and the grace
 * allowance flow through automatically without extra plumbing here.
 */

export type AttendanceEffectiveStatus =
  | 'WORKING'
  | 'AUTO_CHECKOUT'
  | 'ABSENT'
  | 'HALF_DAY'
  | 'PRESENT';

export interface AttendanceStatusInput {
  /** True when the user has at least one IN punch on this row. */
  checkedIn: boolean;
  /** True when the user has completed the day's OUT punch. */
  checkedOut: boolean;
  /** Set when the auto-checkout sweep closed this row (forgot to OUT). */
  isAutoCheckedOut?: boolean | null;
  /** Worked minutes for the day. Use `workedMinutesFor` (wall-clock
   *  checkOut − checkIn) so this matches the figure shown in the
   *  "Worked" column — payroll subtracts breaks elsewhere. */
  workedMinutes: number;
  /** Minutes the IN punch was past the configured grace. The punch
   *  service already accounts for the per-employee shift override AND
   *  subtracts the grace allowance — so `lateMinutes = 0` means the
   *  user arrived on time OR within grace, and any positive value is
   *  the excess past grace. Passing this value through is enough to
   *  honour each user's timing without re-deriving grace here. */
  lateMinutes?: number | null;
  /** Was the employee opted into overtime for this row when the day
   *  closed? Exempts auto-checkout rows from the zero-pay rule because
   *  the toggle is an explicit "I'm staying late" signal — payroll
   *  still applies the org's OT cap so 24h-cap rows don't blow up gross. */
  overtimeOptedIn?: boolean | null;
  /** Fraction of this day already covered by an APPROVED leave (0, 0.5, or
   *  1). A half-day leave (0.5) lowers the worked-hours bar: the leave covers
   *  one half of the day, so the employee only has to work the OTHER half to
   *  be credited a full day. Without this, a half-day-leave day on which the
   *  employee worked a normal half still gets mislabeled HALF_DAY "under the
   *  full-day requirement" — penalising them for the half they were on leave.
   *  Defaults to 0 (no leave), so existing callers are unaffected. */
  leaveDayFraction?: number | null;
}

export interface AttendanceStatusThresholds {
  /** Worked hours required to count as half-day (anything below → absent). */
  halfDayMinHours: number;
  /** Worked hours required to count as full day. */
  fullDayMinHours: number;
  /** When true, a check-in past shift+grace (lateMinutes > 0) downgrades an
   *  otherwise-full day to HALF_DAY. When false/omitted, lateness is info
   *  only and the day is judged purely on hours worked. Admin-configurable
   *  via Attendance Configuration. */
  lateHalfDay?: boolean;
}

export interface AttendanceStatusResult {
  status: AttendanceEffectiveStatus;
  /** Short human-readable explanation. Surface this as a tooltip on the
   *  badge so the employee can see *why* a day was scored a certain way
   *  — especially important for zero-pay days. */
  reason?: string;
}

/** Default thresholds when no AttendanceConfiguration row exists yet. */
export const DEFAULT_STATUS_THRESHOLDS: AttendanceStatusThresholds = {
  halfDayMinHours: 4,
  fullDayMinHours: 8,
  lateHalfDay: false,
};

function safeThresholds(
  raw?: Partial<AttendanceStatusThresholds> | null,
): AttendanceStatusThresholds {
  const half = Number(raw?.halfDayMinHours);
  const full = Number(raw?.fullDayMinHours);
  return {
    halfDayMinHours:
      Number.isFinite(half) && half > 0
        ? half
        : DEFAULT_STATUS_THRESHOLDS.halfDayMinHours,
    fullDayMinHours:
      Number.isFinite(full) && full > 0
        ? full
        : DEFAULT_STATUS_THRESHOLDS.fullDayMinHours,
    lateHalfDay: !!raw?.lateHalfDay,
  };
}

export function computeEffectiveStatus(
  input: AttendanceStatusInput,
  thresholds?: Partial<AttendanceStatusThresholds> | null,
): AttendanceStatusResult {
  const t = safeThresholds(thresholds);

  // Live punch — the day's still in progress; don't commit a verdict yet.
  if (input.checkedIn && !input.checkedOut) {
    return { status: 'WORKING' };
  }

  // No usable punch on either side — treat as absent. The classifier in
  // payroll-utils handles leave/holiday/weekly-off precedence above this
  // helper, so by the time we get here a row with no in-or-out really is
  // an absence.
  if (!input.checkedIn && !input.checkedOut) {
    return { status: 'ABSENT' };
  }

  // Auto-checkout without OT opt-in → zero-pay day. The OT-opt-in
  // branch (below) lets a row that *was* flagged for OT still get paid;
  // payroll's overtimeMaxHoursPerDay cap protects against the 24h-cap
  // hours inflating gross.
  if (input.isAutoCheckedOut && !input.overtimeOptedIn) {
    return {
      status: 'AUTO_CHECKOUT',
      reason:
        "Forgot to check out — system auto-closed this day. Salary = ₹0. Toggle Overtime before leaving if you plan to stay late.",
    };
  }

  const workedHours = Math.max(0, (input.workedMinutes ?? 0) / 60);
  const lateMinutes = Math.max(0, input.lateMinutes ?? 0);
  const autoWithOt = !!(input.isAutoCheckedOut && input.overtimeOptedIn);
  const h = workedHours.toFixed(2);
  const leaveFraction = Math.min(1, Math.max(0, input.leaveDayFraction ?? 0));

  // An approved leave (half-day or short leave) covers part of this day, so
  // the worked-hours bar drops by that fraction — the employee only has to
  // work the REMAINING share of a full day. This adjusts the THRESHOLD only:
  // the tardiness (lateHalfDay) rule below still applies, so an unrelated late
  // arrival isn't excused just because a leave covered another part of the
  // day. leaveFraction = 0 leaves every threshold exactly as before.
  const fullBar =
    leaveFraction > 0
      ? t.fullDayMinHours * (1 - leaveFraction)
      : t.fullDayMinHours;
  const coveredTxt =
    leaveFraction <= 0
      ? ''
      : leaveFraction === 0.5
        ? 'Half-day leave'
        : `Leave covers ${Math.round(leaveFraction * 100)}% of the day`;

  // Below the half-day floor → absent regardless of lateness. Avoids
  // crediting employees who clock in for a few minutes just to mark
  // attendance. Skipped when a leave covers part of the day — the leave
  // itself guarantees at least a half-day, so the day is never "absent".
  if (leaveFraction <= 0 && workedHours < t.halfDayMinHours) {
    return {
      status: 'ABSENT',
      reason: `Worked ${h}h — below the ${t.halfDayMinHours}h half-day minimum. Counts as absent.`,
    };
  }

  // Under the (leave-adjusted) full-day bar → half-day.
  if (workedHours + 1e-9 < fullBar) {
    return {
      status: 'HALF_DAY',
      reason: coveredTxt
        ? `${coveredTxt}; worked ${h}h (under the ${fullBar.toFixed(
            2,
          )}h needed alongside the leave) → half-day.`
        : autoWithOt
          ? `Auto-checkout, but OT was on. Paid for ${h}h (under ${t.fullDayMinHours}h full-day) → half-day.`
          : `Worked ${h}h (under ${t.fullDayMinHours}h full-day requirement) → half-day.`,
    };
  }

  // Tardiness → half-day, but ONLY when the org opted in via the
  // `lateHalfDay` toggle in Attendance Configuration. lateMinutes is already
  // grace-adjusted by the punch service (arriving within grace → 0). When
  // the toggle is off (default) we fall through to PRESENT and keep the
  // lateness purely as info on the row — "full hours = full day".
  if (t.lateHalfDay && lateMinutes > 0) {
    return {
      status: 'HALF_DAY',
      reason: `Late by ${lateMinutes}m past grace — half-day even with ${h}h worked.`,
    };
  }

  if (autoWithOt) {
    return {
      status: 'PRESENT',
      reason: `Auto-checkout, but OT was on. Paid for ${h}h (OT capped per org policy).`,
    };
  }

  // Full day reached with a leave covering part of it → present (the leave
  // half + the worked remainder make a whole day).
  if (coveredTxt) {
    return {
      status: 'PRESENT',
      reason: `${coveredTxt} + worked ${h}h → full day.`,
    };
  }

  if (lateMinutes > 0) {
    return {
      status: 'PRESENT',
      reason: `Late by ${lateMinutes}m past grace, but worked ${h}h — counts as a full day.`,
    };
  }

  return { status: 'PRESENT' };
}

/** Convenience for places that only need the status string. */
export function effectiveStatusOf(
  input: AttendanceStatusInput,
  thresholds?: Partial<AttendanceStatusThresholds> | null,
): AttendanceEffectiveStatus {
  return computeEffectiveStatus(input, thresholds).status;
}
