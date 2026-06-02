/**
 * Quota-as-paid-allowance: decide how many leave days are PAID by the company
 * (within the allocated quota) vs. LOP (deducted from salary, once the quota
 * is exhausted).
 *
 * Company policy (per spec): each leave type carries an allocated quota that
 * the company grants as PAID leave. Days taken WITHIN that quota do not reduce
 * salary; days taken BEYOND it are loss-of-pay.
 *
 * The split is computed against the year's allocation, accounting for days
 * already consumed earlier in the year so that — e.g. — someone who used all
 * their quota in January gets 0 paid days in February.
 *
 *   paidQuota   = allocated + carriedForward            (total paid days/year)
 *   alreadyPaid = min(usedBeforeThisRequest, paidQuota) (paid slots used up)
 *   remainingPaid = max(0, paidQuota − alreadyPaid)
 *   paidDays = min(daysTaken, remainingPaid)
 *   lopDays  = daysTaken − paidDays
 *
 * Pure: no IO, no mutation. Used by payroll to price leave, and can back the
 * apply-dialog preview so the employee sees paid-vs-unpaid before submitting.
 */

export interface QuotaPaySplitInput {
  /** Days granted for the year by the company (the paid quota). */
  allocated: number;
  /** Carried-over paid days from last year (also paid). Default 0. */
  carriedForward?: number;
  /** Paid-eligible days of THIS type already consumed earlier in the year,
   *  BEFORE the days being priced now. Use the balance's `used` minus the
   *  days in the current request, or 0 if pricing from scratch. */
  usedBefore: number;
  /** Days being priced right now (e.g. 0.5 for a half-day, 3 for a 3-day leave). */
  daysTaken: number;
}

export interface QuotaPaySplit {
  /** Days the company pays (within quota). */
  paidDays: number;
  /** Days deducted from salary (quota exhausted). */
  lopDays: number;
  /** Paid quota still available AFTER this request. */
  remainingPaidAfter: number;
}

export function splitLeavePayByQuota(input: QuotaPaySplitInput): QuotaPaySplit {
  const paidQuota =
    Math.max(0, input.allocated) + Math.max(0, input.carriedForward ?? 0);
  const usedBefore = Math.max(0, input.usedBefore);
  const daysTaken = Math.max(0, input.daysTaken);

  const alreadyPaid = Math.min(usedBefore, paidQuota);
  const remainingPaidBefore = Math.max(0, paidQuota - alreadyPaid);

  const paidDays = Math.min(daysTaken, remainingPaidBefore);
  const lopDays = Math.max(0, daysTaken - paidDays);
  const remainingPaidAfter = Math.max(0, remainingPaidBefore - paidDays);

  return { paidDays, lopDays, remainingPaidAfter };
}
