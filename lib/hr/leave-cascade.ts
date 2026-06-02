/**
 * Half-day leave overflow cascade: Half Day quota → Full Day quota → salary (LOP).
 *
 * Policy (per product spec):
 *   • A Half Day Leave request costs 0.5 days.
 *   • It is charged first against the employee's HALF DAY leave balance.
 *   • When the Half Day balance is exhausted, the 0.5 is charged against the
 *     FULL DAY leave balance instead (0.5 per extra half-day — half a full day).
 *   • When BOTH are exhausted, the day is unpaid → docked from salary (LOP).
 *
 * All amounts are in DAYS (matching LeaveBalance: available = allocated +
 * carriedForward − used − pending). There is no separate "paid leave" type in
 * this org — every type is unpaid/LOP — so the chain terminates at salary.
 *
 * This is a PURE function used in two places so they always agree:
 *   • the Apply dialog (preview hint: "this will draw from Full Day / be unpaid")
 *   • the apply-time charge + the payroll LOP decision.
 */

export type CascadeChargeSource = 'HALF_DAY' | 'FULL_DAY' | 'LOP';

export interface CascadeCharge {
  /** Where the 0.5 day is charged. */
  source: CascadeChargeSource;
  /** Days charged to this source (0..0.5). */
  days: number;
}

export interface HalfDayCascadeResult {
  /** The requested half-day cost (always 0.5 for a half-day request). */
  requestedDays: number;
  /** Ordered charges that sum to requestedDays. May split across sources when
   *  the half balance has a sliver left (e.g. 0.25 in Half, 0.25 to Full). */
  charges: CascadeCharge[];
  /** Convenience totals. */
  fromHalfDay: number;
  fromFullDay: number;
  lop: number;
}

export interface CascadeBalancesInput {
  /** Remaining Half Day leave balance in days (available). */
  halfDayAvailable: number;
  /** Remaining Full Day leave balance in days (available). */
  fullDayAvailable: number;
  /** The half-day request size in days. Defaults to 0.5; exposed for tests
   *  and any future fractional cases. */
  requestedDays?: number;
}

/**
 * Resolve where a half-day request's cost should be charged, walking the
 * cascade Half → Full → LOP. Pure; no IO, no mutation.
 */
export function resolveHalfDayCascade(input: CascadeBalancesInput): HalfDayCascadeResult {
  const requested = Math.max(0, input.requestedDays ?? 0.5);
  const halfAvail = Math.max(0, input.halfDayAvailable);
  const fullAvail = Math.max(0, input.fullDayAvailable);

  const charges: CascadeCharge[] = [];
  let remaining = requested;

  const fromHalf = Math.min(halfAvail, remaining);
  if (fromHalf > 1e-9) {
    charges.push({ source: 'HALF_DAY', days: fromHalf });
    remaining -= fromHalf;
  }

  if (remaining > 1e-9) {
    const fromFull = Math.min(fullAvail, remaining);
    if (fromFull > 1e-9) {
      charges.push({ source: 'FULL_DAY', days: fromFull });
      remaining -= fromFull;
    }
  }

  if (remaining > 1e-9) {
    charges.push({ source: 'LOP', days: remaining });
    remaining = 0;
  }

  const sum = (s: CascadeChargeSource) =>
    charges.filter((c) => c.source === s).reduce((a, c) => a + c.days, 0);

  return {
    requestedDays: requested,
    charges,
    fromHalfDay: sum('HALF_DAY'),
    fromFullDay: sum('FULL_DAY'),
    lop: sum('LOP'),
  };
}

/**
 * Human-readable hint for the Apply dialog preview, given the cascade result.
 * Returns null when the request is fully within the Half Day quota (no hint
 * needed — the normal flow covers it).
 */
export function cascadeHint(result: HalfDayCascadeResult): string | null {
  if (result.fromFullDay <= 0 && result.lop <= 0) return null;
  if (result.lop > 0 && result.fromFullDay <= 0) {
    return 'Half Day quota is used up and no Full Day quota remains — this day will be unpaid (LOP).';
  }
  if (result.lop > 0 && result.fromFullDay > 0) {
    return `Half Day quota is used up — ${result.fromFullDay} day will draw from Full Day quota and the rest will be unpaid (LOP).`;
  }
  return `Half Day quota is used up — this will use ${result.fromFullDay} of your Full Day quota.`;
}
