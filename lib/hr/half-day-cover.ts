/**
 * "Half-day overflow → paid-leave cover."
 *
 * Org policy: each month forgives up to `monthlyHalfDayQuota` attendance
 * half-days (each forgiven one adds 0.5 day back to pay). When an employee
 * has MORE half-days than the quota, the excess can be covered from their
 * remaining PAID-LEAVE balance — each covered half-day spends 0.5 day of
 * paid leave and restores 0.5 day of pay.
 *
 * This module is the single source of truth for HOW MUCH gets covered. It is
 * a pure function over (excess half-days, available paid-leave balances) so:
 *   • payroll compute can call it to show the covered pay in preview
 *     WITHOUT touching any balance, and
 *   • the Generate step can call the SAME function to know exactly how much
 *     to deduct from each leave type, then write the deductions + audit.
 *
 * Both paths therefore agree by construction.
 *
 * Decisions baked in (per product spec):
 *   • Source = any PAID leave type, drained in `sortOrder` priority order.
 *   • Partial cover: a 1.0-day balance covers two half-days; leftover excess
 *     half-days stay docked.
 *   • Deduction happens only at Generate (see consumeHalfDayCover); compute
 *     is read-only.
 */

/** A paid-leave balance the cover can draw from, in priority order. */
export interface PaidLeaveSource {
  leaveTypeId: string;
  leaveTypeName: string;
  /** sortOrder from LeaveType — lower drains first. */
  sortOrder: number;
  /** Remaining days available = allocated + carriedForward − used − pending. */
  available: number;
}

/** How a single leave type contributed to the cover. */
export interface CoverDraw {
  leaveTypeId: string;
  leaveTypeName: string;
  /** Days drawn from this type (each covered half-day costs 0.5). */
  days: number;
}

export interface HalfDayCoverResult {
  /** Half-days remaining after quota forgiveness, before cover. */
  excessHalfDays: number;
  /** Half-days actually covered by paid leave. */
  coveredHalfDays: number;
  /** Total paid-leave DAYS consumed (coveredHalfDays × 0.5). */
  leaveDaysConsumed: number;
  /** Pay DAYS restored by the cover (== leaveDaysConsumed). */
  payDaysRestored: number;
  /** Per-leave-type breakdown of what to deduct. Empty when nothing covered. */
  draws: CoverDraw[];
  /** Half-days still docked because paid leave ran out. */
  remainingDockedHalfDays: number;
}

/**
 * Compute the cover for one employee-month. Pure: no IO, no mutation.
 *
 * @param excessHalfDays  half-days left after `monthlyHalfDayQuota` forgiveness
 *                        (i.e. breakdown.halfDays − halfDaysForgiven). Fractional
 *                        values are tolerated but normally integers.
 * @param paidSources     this user's PAID leave balances. Only entries with
 *                        available > 0 contribute; ordering is normalized here
 *                        by sortOrder (then name) so callers needn't pre-sort.
 */
export function computeHalfDayCover(
  excessHalfDays: number,
  paidSources: PaidLeaveSource[],
): HalfDayCoverResult {
  const excess = Math.max(0, excessHalfDays);
  const empty: HalfDayCoverResult = {
    excessHalfDays: excess,
    coveredHalfDays: 0,
    leaveDaysConsumed: 0,
    payDaysRestored: 0,
    draws: [],
    remainingDockedHalfDays: excess,
  };
  if (excess === 0 || paidSources.length === 0) return empty;

  // Days of paid leave we still need to spend. Each half-day = 0.5 days.
  let daysNeeded = excess * 0.5;

  // Drain in priority order: lower sortOrder first, name as tiebreak. Copy
  // before sorting so we never mutate the caller's array.
  const sorted = [...paidSources]
    .filter((s) => s.available > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.leaveTypeName.localeCompare(b.leaveTypeName));

  const draws: CoverDraw[] = [];
  let consumed = 0;
  for (const src of sorted) {
    if (daysNeeded <= 1e-9) break;
    const take = Math.min(src.available, daysNeeded);
    if (take <= 1e-9) continue;
    draws.push({ leaveTypeId: src.leaveTypeId, leaveTypeName: src.leaveTypeName, days: take });
    consumed += take;
    daysNeeded -= take;
  }

  const coveredHalfDays = consumed / 0.5; // days → half-day units
  return {
    excessHalfDays: excess,
    coveredHalfDays,
    leaveDaysConsumed: consumed,
    payDaysRestored: consumed,
    draws,
    remainingDockedHalfDays: Math.max(0, excess - coveredHalfDays),
  };
}
