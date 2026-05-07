/**
 * Live payroll engine.
 *
 * Replaces the old read-from-in-memory-cache pattern. Every read endpoint
 * (`/api/payroll`, `/api/payroll/stats`) goes through `getLivePayroll(...)`,
 * which:
 *
 *   1. Returns a TTL-cached result if it's still fresh — keeps the 3 parallel
 *      page-load fetches (records + this-month stats + prev-month stats) from
 *      hitting `calculatePayroll` three times for the same (org, month).
 *   2. Otherwise recomputes from the live data sources (Attendance table,
 *      configured forms, LeaveRequest, Holiday) and writes through to the
 *      `PayrollRecord` table opportunistically.
 *   3. Mirrors the result into the legacy `globalThis.__payrollStore` so
 *      anything still calling `getPayrollRecords` keeps working without a
 *      change.
 *
 * Invalidation: every event that affects the inputs (punch IN/OUT, leave
 * decision, regularization, holiday upsert, setup save) calls
 * `invalidatePayrollCache(orgId, monthOrUndefined)`. Because the recompute
 * is so cheap (single Promise.all of 6 small reads), invalidating is the
 * right move — the next read returns truth without anyone clicking
 * "Generate".
 */

import { calculatePayroll } from './payroll-utils';
import {
  PayrollRecord,
  setPayrollRecords,
  getPayrollRecords,
  clearPayrollRecords,
} from './payroll-store';
import { prisma } from '@/lib/prisma';

const TTL_MS = 5_000; // small enough that "real-time" still feels real-time

interface CacheEntry {
  computedAt: number;
  inFlight: Promise<PayrollRecord[]> | null;
  records: PayrollRecord[] | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __payrollLiveCache: Map<string, CacheEntry> | undefined;
}

const cache: Map<string, CacheEntry> =
  globalThis.__payrollLiveCache ?? new Map<string, CacheEntry>();
if (!globalThis.__payrollLiveCache) globalThis.__payrollLiveCache = cache;

const cacheKey = (organizationId: string, month: string) =>
  `${organizationId}|${month}`;

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return (
    !!entry && entry.records !== null && Date.now() - entry.computedAt < TTL_MS
  );
}

async function persistToDb(
  records: PayrollRecord[],
  month: string,
  processedBy: string | null,
): Promise<void> {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr);
  const monthNum = Number(mStr);
  if (!Number.isInteger(year) || !Number.isInteger(monthNum)) return;

  // We persist in parallel chunks. PayrollRecord is unique on
  // (employeeId, month, year), so upsert is safe to repeat. A failed row
  // logs and continues — never block the read with a write failure.
  const work = records
    .filter((p) => p.employeeId)
    .map((p) =>
      prisma.payrollRecord
        .upsert({
          where: {
            employeeId_month_year: {
              employeeId: p.employeeId,
              month: monthNum,
              year,
            },
          },
          update: {
            presentDays: Math.round(p.breakdown.presentDays),
            leaveDays: p.breakdown.paidLeaveDays + p.breakdown.unpaidLeaveDays,
            halfDays: p.breakdown.halfDays,
            shortLeaves: 0,
            overtimeHours: 0,
            baseSalary: p.baseSalary,
            grossSalary: p.grossSalary,
            deductions:
              p.deductions.pf +
              p.deductions.tax +
              p.deductions.insurance +
              p.deductions.other,
            netSalary: p.netSalary,
            allowances: {
              breakdown: p.breakdown,
              deductionDetail: p.deductions,
            } as any,
            deductionDetail: p.deductions as any,
            status: p.status,
            processedBy: processedBy ?? undefined,
            processedAt: new Date(),
          },
          create: {
            employeeId: p.employeeId,
            month: monthNum,
            year,
            presentDays: Math.round(p.breakdown.presentDays),
            leaveDays: p.breakdown.paidLeaveDays + p.breakdown.unpaidLeaveDays,
            halfDays: p.breakdown.halfDays,
            shortLeaves: 0,
            overtimeHours: 0,
            baseSalary: p.baseSalary,
            grossSalary: p.grossSalary,
            deductions:
              p.deductions.pf +
              p.deductions.tax +
              p.deductions.insurance +
              p.deductions.other,
            netSalary: p.netSalary,
            allowances: {
              breakdown: p.breakdown,
              deductionDetail: p.deductions,
            } as any,
            deductionDetail: p.deductions as any,
            status: p.status,
            processedBy: processedBy ?? undefined,
            processedAt: new Date(),
          },
        })
        .catch((err) => {
          console.warn(
            `[payroll-live] persist failed for ${p.employeeId} ${month}:`,
            err instanceof Error ? err.message : err,
          );
        }),
    );
  await Promise.all(work);
}

interface LiveOptions {
  /** Skip the TTL cache and always recompute. Used by /auto-generate. */
  force?: boolean;
  /** Persist to PayrollRecord after computing. Defaults to false for cheap
   *  GETs; /auto-generate sets this to true. */
  persist?: boolean;
  /** Audit user id stamped on persisted rows when persist=true. */
  processedBy?: string | null;
}

export async function getLivePayroll(
  organizationId: string,
  month: string | undefined,
  opts: LiveOptions = {},
): Promise<PayrollRecord[]> {
  const targetMonth = month || thisMonth();
  const key = cacheKey(organizationId, targetMonth);
  const existing = cache.get(key);

  if (!opts.force && isFresh(existing)) {
    return existing!.records!;
  }

  // Coalesce concurrent requests. Three Promise.all'd page-load fetches
  // arriving simultaneously must not start three computes; they all wait
  // on the first one's promise.
  if (existing?.inFlight && !opts.force) {
    return existing.inFlight;
  }

  const promise = (async () => {
    const records = await calculatePayroll(organizationId, targetMonth);
    cache.set(key, {
      computedAt: Date.now(),
      inFlight: null,
      records,
    });
    // Mirror into the legacy in-memory store so anything still reading
    // through `getPayrollRecords()` sees the live result too.
    setPayrollRecords(organizationId, targetMonth, records);
    if (opts.persist) {
      // Don't await — let the response go out while persistence catches up.
      // A failed persist is a soft warning, never a request error.
      void persistToDb(records, targetMonth, opts.processedBy ?? null);
    }
    return records;
  })();

  cache.set(key, {
    computedAt: existing?.computedAt ?? 0,
    inFlight: promise,
    records: existing?.records ?? null,
  });

  try {
    return await promise;
  } catch (err) {
    // On failure, drop the inFlight marker so the next request retries.
    cache.delete(key);
    throw err;
  }
}

/**
 * Invalidate the live cache for one (org, month) pair, or for ALL months
 * within an org when month is omitted. Call this from any handler that
 * changes the inputs to payroll: punch, leave decision, regularization,
 * holiday change, payroll-setup save.
 */
export function invalidatePayrollCache(
  organizationId: string | null | undefined,
  month?: string,
): void {
  if (!organizationId) return;
  if (month) {
    cache.delete(cacheKey(organizationId, month));
    // Also clear the legacy in-memory mirror so subsequent reads through
    // the old API can't serve a stale cached result.
    clearPayrollRecords(organizationId, month);
    return;
  }
  // Whole-org wipe: punch on a date in month X may also affect adjacent
  // months for things like start-of-month boundaries, and a leave can span
  // months, so it's always safer to drop everything for the org.
  const prefix = `${organizationId}|`;
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
  clearPayrollRecords(organizationId);
}

/**
 * Pull "what's currently live for this org" without forcing a recompute.
 * Used by stats endpoints when they want to honour an explicit cache miss
 * but not eagerly recompute from a TTL miss they can survive.
 */
export function getCachedPayroll(
  organizationId: string,
  month: string,
): PayrollRecord[] | null {
  const entry = cache.get(cacheKey(organizationId, month));
  return entry?.records ?? null;
}

/**
 * Read-through helper used by GET /api/payroll. Behaves like
 * `getLivePayroll` but never persists — keeps the read fast.
 */
export function readLivePayroll(
  organizationId: string,
  month: string | undefined,
): Promise<PayrollRecord[]> {
  return getLivePayroll(organizationId, month, { persist: false });
}

/** Re-export so callers don't need a second import. */
export { getPayrollRecords };
