/**
 * Leave Management — service layer.
 *
 * The single point of truth for every balance mutation. API routes and UI
 * MUST go through this module; never write to LeaveRequest or LeaveBalance
 * directly from a route handler — invariants are enforced here.
 *
 * Invariants
 *   pending  = SUM(totalDays) over status=PENDING  requests
 *   used     = SUM(totalDays) over status=APPROVED requests
 *   available = allocated + carriedForward - used - pending
 *
 * Balance is enforced only for paid leaves (LeaveRule.isPaid = true). Unpaid
 * leaves can be applied without a balance — the payroll engine treats them
 * as loss-of-pay regardless.
 *
 * `(prisma as any)` follows the same pattern as lib/hr/attendance-config.ts:
 * the Prisma client may not have the new model types yet if the user hasn't
 * run `npx prisma generate` after this migration, so we widen the cast.
 */

import { prisma } from '@/lib/prisma';
import { getAttendanceConfig, parseHHmm } from './attendance-config';
import { slotForDuration } from './short-leave-slots';

export type LeaveDuration = 'FULL_DAY' | 'HALF_DAY_FIRST' | 'HALF_DAY_SECOND';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export class LeaveError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'LeaveError';
  }
}

export type ShortenStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LeaveRequestRow {
  id: string;
  organizationId: string;
  userId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  duration: LeaveDuration;
  totalDays: number;
  // Short-leave slot window ("HH:MM"). Null for half/full-day leaves.
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  attachmentUrl: string | null;
  isEmergency: boolean;
  status: LeaveRequestStatus;
  appliedAt: string;
  decidedAt: string | null;
  decidedById: string | null;
  decisionNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  // Early-return fields. Null on all of them = no shorten requested yet.
  originalEndDate: string | null;
  shortenRequestedEndDate: string | null;
  shortenRequestedReason: string | null;
  shortenStatus: ShortenStatus | null;
  shortenRequestedAt: string | null;
  shortenDecidedAt: string | null;
  shortenDecidedById: string | null;
  shortenDecisionNote: string | null;
}

export interface LeaveTypeLite {
  id: string;
  name: string;
  code: string;
  category: string;
  color: string | null;
  icon: string | null;
}

export interface BalanceRow {
  leaveType: LeaveTypeLite;
  year: number;
  allocated: number;
  carriedForward: number;
  used: number;
  pending: number;
  available: number;
  isPaid: boolean;
  // Constraints from the active LeaveRule (if any) — surfaced so the apply
  // form can enforce them client-side instead of round-tripping to a 400.
  minNoticeDays: number | null;
  maxConsecutiveDays: number | null;
  requiresApproval: boolean;
}

export interface LeaveRuleLite {
  isPaid: boolean;
  requiresApproval: boolean;
  maxConsecutiveDays: number | null;
  minNoticeDays: number | null;
  affectsAttendance: boolean;
  deductionPercentage: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers — all dates flow as YYYY-MM-DD strings, matching Attendance.date
// and the existing payroll-store conventions.
// ─────────────────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isValidDateStr(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s);
}

function dateOnlyMs(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function* iterateDates(start: string, end: string): Generator<string> {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    yield `${y}-${m}-${d}`;
    cur.setDate(cur.getDate() + 1);
  }
}

function dayOfWeek(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=Sun … 6=Sat
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal lookups
// ─────────────────────────────────────────────────────────────────────────────

async function getLeaveType(leaveTypeId: string): Promise<{
  type: LeaveTypeLite;
  rule: LeaveRuleLite;
} | null> {
  const lt = await (prisma as any).leaveType.findUnique({
    where: { id: leaveTypeId },
    include: { leaveRules: { where: { isActive: true }, take: 1 } },
  });
  if (!lt || !lt.isActive) return null;

  const r = lt.leaveRules?.[0];
  // Sensible defaults if no rule configured for the type.
  const rule: LeaveRuleLite = r
    ? {
        isPaid: !!r.isPaid,
        requiresApproval: r.requiresApproval !== false,
        maxConsecutiveDays: r.maxConsecutiveDays ?? null,
        minNoticeDays: r.minNoticeDays ?? null,
        affectsAttendance: r.affectsAttendance !== false,
        deductionPercentage: r.deductionPercentage != null ? Number(r.deductionPercentage) : 100,
      }
    : {
        isPaid: false,
        requiresApproval: true,
        maxConsecutiveDays: null,
        minNoticeDays: null,
        affectsAttendance: true,
        deductionPercentage: 100,
      };

  return {
    type: {
      id: lt.id,
      name: lt.name,
      code: lt.code,
      category: lt.category,
      color: lt.color ?? null,
      icon: lt.icon ?? null,
    },
    rule,
  };
}

async function getWeeklyOffDays(orgId: string): Promise<Set<number>> {
  const cfg = await getAttendanceConfig(orgId);
  const raw = (cfg as any)?.weeklyOffDays;
  const arr: number[] = Array.isArray(raw) ? raw : [0];
  return new Set(arr.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6));
}

async function getHolidayDates(orgId: string, start: string, end: string): Promise<Set<string>> {
  const rows: { date: string }[] = await (prisma as any).holiday.findMany({
    where: {
      organizationId: orgId,
      date: { gte: start, lte: end },
      isOptional: false,
    },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date));
}

/**
 * Computes the working-day count for a leave request, excluding weekly-offs
 * and holidays. Half-day requests always return 0.5 and must be single-date.
 */
export async function computeTotalDays(input: {
  organizationId: string;
  startDate: string;
  endDate: string;
  duration: LeaveDuration;
  /** LeaveType category. A SHORT_LEAVE is ONE indivisible unit (the org-fixed
   *  window), so it consumes 1 whole short-leave from the quota — never 0.5.
   *  Half-day leaves stay 0.5. */
  category?: string | null;
}): Promise<number> {
  if (input.duration !== 'FULL_DAY') {
    if (input.startDate !== input.endDate) {
      throw new LeaveError(
        'HALF_DAY_RANGE',
        'Half-day leaves must be on a single date.',
      );
    }
    // A short leave is a complete unit fixed by the organization — count it as
    // 1 whole short-leave so the balance reads "0 / 1" after one use, not
    // "0.5 / 1". The actual hours it represents are surfaced separately (the
    // slot window) and used by payroll for any LOP.
    if (input.category === 'SHORT_LEAVE') return 1;
    return 0.5;
  }
  const off = await getWeeklyOffDays(input.organizationId);
  const holidays = await getHolidayDates(input.organizationId, input.startDate, input.endDate);
  let count = 0;
  for (const day of iterateDates(input.startDate, input.endDate)) {
    if (off.has(dayOfWeek(day))) continue;
    if (holidays.has(day)) continue;
    count += 1;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ensureBalance(
  tx: any,
  organizationId: string,
  userId: string,
  leaveTypeId: string,
  year: number,
) {
  const existing = await tx.leaveBalance.findUnique({
    where: {
      userId_leaveTypeId_year: { userId, leaveTypeId, year },
    },
  });
  if (existing) return existing;
  return tx.leaveBalance.create({
    data: { organizationId, userId, leaveTypeId, year, allocated: 0, used: 0, pending: 0, carriedForward: 0 },
  });
}

function toNumber(d: any): number {
  if (d == null) return 0;
  if (typeof d === 'number') return d;
  return Number(d.toString());
}

function balanceAvailable(b: { allocated: any; carriedForward: any; used: any; pending: any }): number {
  return toNumber(b.allocated) + toNumber(b.carriedForward) - toNumber(b.used) - toNumber(b.pending);
}

function yearOf(dateStr: string): number {
  return Number(dateStr.split('-')[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface ApplyLeaveInput {
  organizationId: string;
  userId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  duration: LeaveDuration;
  reason?: string | null;
  attachmentUrl?: string | null;
  /** When true, the leave type's `minNoticeDays` rule is bypassed so the
   *  employee can apply for today. startDate is still forbidden in the past. */
  isEmergency?: boolean;
}

export async function applyLeave(input: ApplyLeaveInput): Promise<LeaveRequestRow> {
  if (!isValidDateStr(input.startDate) || !isValidDateStr(input.endDate)) {
    throw new LeaveError('BAD_DATE', 'Dates must be YYYY-MM-DD strings.');
  }
  if (dateOnlyMs(input.startDate) > dateOnlyMs(input.endDate)) {
    throw new LeaveError('BAD_RANGE', 'startDate must be on or before endDate.');
  }

  const lt = await getLeaveType(input.leaveTypeId);
  if (!lt) throw new LeaveError('UNKNOWN_LEAVE_TYPE', 'Leave type not found or inactive.', 404);

  // Monthly short-leave allowance. The "Monthly allowances → Short leaves /
  // month" knob in Attendance Configuration caps how many short-leave
  // requests an employee can file in a calendar month. Once the cap is hit
  // for the start-date's month, the request is rejected and the employee
  // must fall back to half-day or full-day. Counting PENDING + APPROVED
  // (rejected/cancelled don't consume the quota).
  // Short-leave slot window, derived authoritatively server-side from the org
  // shift + window so the client can't smuggle in an arbitrary period. Stays
  // null for half/full-day leaves.
  let shortLeaveStartTime: string | null = null;
  let shortLeaveEndTime: string | null = null;

  if (lt.type.category === 'SHORT_LEAVE') {
    const cfg = await getAttendanceConfig(input.organizationId);
    // Slots follow the EMPLOYEE'S effective shift — their own inTime/outTime
    // override when set, else the org default — so the short-leave window
    // lines up with the same check-in/out clock attendance uses, not a
    // one-size-fits-all org shift. Inlined (rather than importing
    // attendance-service's getEffectiveShift) to keep leave-service free of
    // that module's heavy dependency graph and avoid a circular import.
    let shiftStart: string | null | undefined = cfg?.defaultShiftStart;
    let shiftEnd: string | null | undefined = cfg?.defaultShiftEnd;
    try {
      const emp = await (prisma as any).employee.findUnique({
        where: { userId: input.userId },
        select: { inTime: true, outTime: true },
      });
      // Both ends must be valid HH:mm; a half-set override falls back entirely
      // to the org default rather than mixing a custom start with a default end.
      if (emp && parseHHmm(emp.inTime) !== null && parseHHmm(emp.outTime) !== null) {
        shiftStart = String(emp.inTime).trim();
        shiftEnd = String(emp.outTime).trim();
      }
    } catch {
      /* employee row/columns missing → keep org default */
    }
    // Resolve the chosen preset slot (HALF_DAY_FIRST = start-anchored,
    // HALF_DAY_SECOND = end-anchored) to concrete clock times.
    const slot = slotForDuration(
      input.duration,
      shiftStart,
      shiftEnd,
      cfg?.shortLeaveHours,
    );
    if (slot) {
      shortLeaveStartTime = slot.startTime;
      shortLeaveEndTime = slot.endTime;
    }
    const quota = Math.max(0, Math.floor(cfg?.monthlyShortLeaveQuota ?? 0));
    const anchor = new Date(`${input.startDate}T00:00:00`);
    const monthStart = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      1,
    );
    const monthEnd = new Date(
      anchor.getFullYear(),
      anchor.getMonth() + 1,
      1,
    );
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const shortTypeIds = (
      await (prisma as any).leaveType.findMany({
        where: { category: 'SHORT_LEAVE', isActive: true },
        select: { id: true },
      })
    ).map((t: { id: string }) => t.id);
    const usedThisMonth = await (prisma as any).leaveRequest.count({
      where: {
        userId: input.userId,
        leaveTypeId: { in: shortTypeIds },
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { gte: ymd(monthStart), lt: ymd(monthEnd) },
      },
    });
    if (usedThisMonth >= quota) {
      throw new LeaveError(
        'SHORT_LEAVE_QUOTA_EXCEEDED',
        quota === 0
          ? 'Short leave is not allowed by your organization. Please apply for a half-day or full-day leave instead.'
          : `Monthly short-leave allowance (${quota}) for ${anchor.toLocaleString('en-IN', { month: 'long' })} is exhausted. Please apply for a half-day or full-day leave instead.`,
      );
    }
  }

  // Past-date guard — applies to every leave, including emergency. An
  // emergency means "I need to start today", not "I forgot to file last week".
  const today = todayStr();
  if (dateOnlyMs(input.startDate) < dateOnlyMs(today)) {
    throw new LeaveError(
      'PAST_DATE',
      'Start date cannot be in the past.',
    );
  }

  // Notice period: startDate must be at least N days from today. Emergency
  // leaves bypass this rule but still cannot be applied for past dates.
  if (!input.isEmergency && lt.rule.minNoticeDays && lt.rule.minNoticeDays > 0) {
    const noticeMs = dateOnlyMs(input.startDate) - dateOnlyMs(today);
    const noticeDays = Math.floor(noticeMs / (1000 * 60 * 60 * 24));
    if (noticeDays < lt.rule.minNoticeDays) {
      throw new LeaveError(
        'INSUFFICIENT_NOTICE',
        `${lt.type.name} requires at least ${lt.rule.minNoticeDays} day(s) notice. You gave ${noticeDays}. Mark the request as Emergency if this is urgent.`,
      );
    }
  }

  // Max consecutive days check (calendar-day span, not working-day count).
  const spanDays =
    Math.floor((dateOnlyMs(input.endDate) - dateOnlyMs(input.startDate)) / (1000 * 60 * 60 * 24)) + 1;
  if (lt.rule.maxConsecutiveDays && spanDays > lt.rule.maxConsecutiveDays) {
    throw new LeaveError(
      'TOO_LONG',
      `${lt.type.name} cannot exceed ${lt.rule.maxConsecutiveDays} consecutive days.`,
    );
  }

  const totalDays = await computeTotalDays({
    organizationId: input.organizationId,
    startDate: input.startDate,
    endDate: input.endDate,
    duration: input.duration,
    category: lt.type.category,
  });
  if (totalDays <= 0) {
    throw new LeaveError(
      'ZERO_DAYS',
      'Selected range contains only weekly-offs / holidays — nothing to deduct.',
    );
  }

  // Overlap check: can't have two non-rejected/cancelled requests on the same dates.
  const overlap = await (prisma as any).leaveRequest.findFirst({
    where: {
      userId: input.userId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
    select: { id: true, startDate: true, endDate: true, status: true },
  });
  if (overlap) {
    throw new LeaveError(
      'OVERLAP',
      `You already have a ${overlap.status.toLowerCase()} leave between ${overlap.startDate} and ${overlap.endDate}.`,
      409,
    );
  }

  const year = yearOf(input.startDate);

  // ── Half Day → Full Day quota cascade (apply-time reroute) ───────────
  // Policy: a Half Day Leave is charged to the Half Day quota first; once
  // that quota is fully used, the extra half-day is charged to the Full Day
  // quota instead (0.5 of a full day per half-day). We implement this by
  // re-booking the request onto the org's Full Day leave type when the Half
  // Day balance is exhausted — so the request and the balance it consumes
  // stay the same type and "My Leaves" reconciles. If Full Day is ALSO
  // exhausted we leave it on Half Day (it records normally; pay treatment is
  // governed by payroll). Only triggers for HALF_DAY-category types.
  let effectiveLeaveTypeId = input.leaveTypeId;
  let reroutedToFullDay = false;
  if (lt.type.category === 'HALF_DAY') {
    const halfAvail = await readAvailableBalance(
      input.organizationId,
      input.userId,
      input.leaveTypeId,
      year,
    );
    if (halfAvail <= 1e-9) {
      const fullType = await (prisma as any).leaveType.findFirst({
        where: { category: 'FULL_DAY', isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true },
      });
      if (fullType) {
        const fullAvail = await readAvailableBalance(
          input.organizationId,
          input.userId,
          fullType.id,
          year,
        );
        if (fullAvail > 1e-9) {
          effectiveLeaveTypeId = fullType.id;
          reroutedToFullDay = true;
        }
      }
    }
  }

  // Short leave is governed ENTIRELY by the monthly quota (1/month, paid,
  // expires monthly) — it does NOT draw from a yearly LeaveBalance. So we skip
  // all balance bookkeeping for it. Half/full-day still consume the balance.
  const consumesBalance = lt.type.category !== 'SHORT_LEAVE';

  // Atomic: (optionally) ensure balance row + increment pending, create the
  // request. Balance is not gated at apply-time — employees can request any
  // amount; any overrun is settled by payroll / approver discretion.
  const created = await prisma.$transaction(async (tx: any) => {
    const req = await tx.leaveRequest.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        leaveTypeId: effectiveLeaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        duration: input.duration,
        totalDays,
        startTime: shortLeaveStartTime,
        endTime: shortLeaveEndTime,
        // Keep an audit breadcrumb when we auto-routed the request so the
        // employee/approver can see why a "half day" landed on Full Day quota.
        reason: reroutedToFullDay
          ? `${input.reason ? input.reason + ' ' : ''}(auto: Half Day quota full → charged to Full Day quota)`
          : input.reason ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        isEmergency: !!input.isEmergency,
        status: 'PENDING',
      },
    });

    if (consumesBalance) {
      const balance = await ensureBalance(
        tx,
        input.organizationId,
        input.userId,
        effectiveLeaveTypeId,
        year,
      );
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { pending: { increment: totalDays } },
      });
    }

    return req;
  });

  return serializeRequest(created);
}

/**
 * Read a user's available days for one leave type/year OUTSIDE a transaction,
 * for the apply-time cascade decision. Returns 0 when no balance row exists.
 */
async function readAvailableBalance(
  organizationId: string,
  userId: string,
  leaveTypeId: string,
  year: number,
): Promise<number> {
  const b = await (prisma as any).leaveBalance.findUnique({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
  });
  if (!b) return 0;
  return balanceAvailable(b);
}

export interface DecideLeaveInput {
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  decidedById: string;
  note?: string | null;
}

export async function decideLeave(input: DecideLeaveInput): Promise<LeaveRequestRow> {
  const updated = await prisma.$transaction(async (tx: any) => {
    const req = await tx.leaveRequest.findUnique({ where: { id: input.requestId } });
    if (!req) throw new LeaveError('NOT_FOUND', 'Leave request not found.', 404);
    if (req.status !== 'PENDING') {
      throw new LeaveError(
        'ALREADY_DECIDED',
        `Request is ${req.status.toLowerCase()}; can only decide PENDING requests.`,
        409,
      );
    }

    const totalDays = toNumber(req.totalDays);
    const year = yearOf(req.startDate);

    // Short leave doesn't touch the yearly balance (monthly-quota governed), so
    // there's no pending hold to release / convert on a decision.
    const lt = await tx.leaveType.findUnique({
      where: { id: req.leaveTypeId },
      select: { category: true },
    });
    const consumesBalance = lt?.category !== 'SHORT_LEAVE';

    if (consumesBalance) {
      const balance = await ensureBalance(tx, req.organizationId, req.userId, req.leaveTypeId, year);
      if (input.decision === 'APPROVED') {
        // pending -= totalDays, used += totalDays
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pending: { decrement: totalDays },
            used: { increment: totalDays },
          },
        });
        await tx.leaveAllocation.create({
          data: {
            organizationId: req.organizationId,
            userId: req.userId,
            leaveTypeId: req.leaveTypeId,
            year,
            delta: -totalDays,
            reason: 'APPROVED',
            referenceId: req.id,
            note: input.note ?? null,
            createdById: input.decidedById,
          },
        });
      } else {
        // REJECTED: just release the pending hold.
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { pending: { decrement: totalDays } },
        });
        await tx.leaveAllocation.create({
          data: {
            organizationId: req.organizationId,
            userId: req.userId,
            leaveTypeId: req.leaveTypeId,
            year,
            delta: 0,
            reason: 'REJECTED',
            referenceId: req.id,
            note: input.note ?? null,
            createdById: input.decidedById,
          },
        });
      }
    }

    return tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        status: input.decision,
        decidedAt: new Date(),
        decidedById: input.decidedById,
        decisionNote: input.note ?? null,
      },
    });
  });

  return serializeRequest(updated);
}

export interface CancelLeaveInput {
  requestId: string;
  cancelledById: string;
  reason?: string | null;
  // Admins can cancel any past/present approved leave — bypasses the
  // "future-only" guard. Defaults to false.
  adminOverride?: boolean;
}

export async function cancelLeave(input: CancelLeaveInput): Promise<LeaveRequestRow> {
  const updated = await prisma.$transaction(async (tx: any) => {
    const req = await tx.leaveRequest.findUnique({ where: { id: input.requestId } });
    if (!req) throw new LeaveError('NOT_FOUND', 'Leave request not found.', 404);
    if (req.status === 'CANCELLED' || req.status === 'REJECTED') {
      throw new LeaveError(
        'NOT_CANCELLABLE',
        `Request is already ${req.status.toLowerCase()}.`,
        409,
      );
    }

    // Approved leaves can only be cancelled if they haven't started yet,
    // unless an admin is doing it.
    if (req.status === 'APPROVED' && !input.adminOverride) {
      if (dateOnlyMs(req.startDate) <= dateOnlyMs(todayStr())) {
        throw new LeaveError(
          'ALREADY_STARTED',
          'Approved leaves can only be cancelled before they start. Contact an admin.',
          409,
        );
      }
    }

    const totalDays = toNumber(req.totalDays);
    const year = yearOf(req.startDate);

    // Short leave doesn't touch the yearly balance, so there's nothing to
    // release/refund on cancel — the monthly quota frees up by itself (this
    // request stops counting toward the month once it's CANCELLED).
    const lt = await tx.leaveType.findUnique({
      where: { id: req.leaveTypeId },
      select: { category: true },
    });
    const consumesBalance = lt?.category !== 'SHORT_LEAVE';

    if (consumesBalance) {
      const balance = await ensureBalance(tx, req.organizationId, req.userId, req.leaveTypeId, year);
      if (req.status === 'PENDING') {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { pending: { decrement: totalDays } },
        });
      } else if (req.status === 'APPROVED') {
        // Refund: used -= totalDays
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { used: { decrement: totalDays } },
        });
      }
      await tx.leaveAllocation.create({
        data: {
          organizationId: req.organizationId,
          userId: req.userId,
          leaveTypeId: req.leaveTypeId,
          year,
          delta: req.status === 'APPROVED' ? totalDays : 0,
          reason: 'CANCELLED',
          referenceId: req.id,
          note: input.reason ?? null,
          createdById: input.cancelledById,
        },
      });
    }

    return tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: input.reason ?? null,
      },
    });
  });

  return serializeRequest(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Early-return ("shorten") flow
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestEarlyReturnInput {
  requestId: string;
  /** Owner — the same userId on the LeaveRequest. */
  userId: string;
  /** New (earlier) end date the employee is requesting. YYYY-MM-DD, must lie
   *  within [startDate, currentEndDate) of the leave. */
  newEndDate: string;
  reason?: string | null;
}

/**
 * Employee-side action: ask to end an APPROVED leave earlier than originally
 * planned. The new end date must be strictly before the current end date and
 * not before the start date. Per leave, only one shorten request can be open
 * at a time (`shortenStatus = PENDING`). Does NOT mutate the balance — that
 * happens only on approval.
 */
export async function requestEarlyReturn(input: RequestEarlyReturnInput): Promise<LeaveRequestRow> {
  if (!isValidDateStr(input.newEndDate)) {
    throw new LeaveError('BAD_DATE', "newEndDate must be YYYY-MM-DD.");
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    const req = await tx.leaveRequest.findUnique({ where: { id: input.requestId } });
    if (!req) throw new LeaveError('NOT_FOUND', 'Leave request not found.', 404);
    if (req.userId !== input.userId) {
      throw new LeaveError('FORBIDDEN', 'You can only shorten your own leave.', 403);
    }
    if (req.status !== 'APPROVED') {
      throw new LeaveError(
        'NOT_APPROVED',
        'Only APPROVED leaves can be shortened. Pending leaves should be cancelled instead.',
        409,
      );
    }
    if (req.shortenStatus === 'PENDING') {
      throw new LeaveError(
        'SHORTEN_PENDING',
        'An early-return request is already pending on this leave.',
        409,
      );
    }

    const startMs = dateOnlyMs(req.startDate);
    const endMs = dateOnlyMs(req.endDate);
    const newMs = dateOnlyMs(input.newEndDate);

    if (newMs < startMs) {
      throw new LeaveError(
        'BAD_END_DATE',
        `New end date (${input.newEndDate}) cannot be before the leave's start (${req.startDate}).`,
      );
    }
    if (newMs >= endMs) {
      throw new LeaveError(
        'NOT_SHORTER',
        `New end date (${input.newEndDate}) must be before the current end (${req.endDate}). Use cancel to drop the leave entirely.`,
      );
    }

    return tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        shortenRequestedEndDate: input.newEndDate,
        shortenRequestedReason: input.reason ?? null,
        shortenStatus: 'PENDING',
        shortenRequestedAt: new Date(),
        // Clear any stale decision metadata from a previous reject so the
        // approver UI doesn't show outdated context.
        shortenDecidedAt: null,
        shortenDecidedById: null,
        shortenDecisionNote: null,
      },
    });
  });

  return serializeRequest(updated);
}

export interface DecideEarlyReturnInput {
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  decidedById: string;
  note?: string | null;
}

/**
 * Approver-side action: accept or reject a pending early-return request.
 *
 * On APPROVED: rewinds `endDate` to the requested date, recomputes `totalDays`
 * for the new range, and refunds the balance by the day delta. The pre-shorten
 * end date is preserved in `originalEndDate` (only on the first approval, so
 * a second shorten doesn't overwrite the original audit trail).
 *
 * On REJECTED: just marks the shorten request as rejected; the leave stays
 * intact at its original dates.
 */
export async function decideEarlyReturn(input: DecideEarlyReturnInput): Promise<LeaveRequestRow> {
  const updated = await prisma.$transaction(async (tx: any) => {
    const req = await tx.leaveRequest.findUnique({ where: { id: input.requestId } });
    if (!req) throw new LeaveError('NOT_FOUND', 'Leave request not found.', 404);
    if (req.shortenStatus !== 'PENDING' || !req.shortenRequestedEndDate) {
      throw new LeaveError(
        'NO_PENDING_SHORTEN',
        'There is no pending early-return request to decide on.',
        409,
      );
    }
    if (req.status !== 'APPROVED') {
      throw new LeaveError(
        'NOT_APPROVED',
        'Leave is no longer APPROVED — cannot shorten.',
        409,
      );
    }

    if (input.decision === 'REJECTED') {
      return tx.leaveRequest.update({
        where: { id: req.id },
        data: {
          shortenStatus: 'REJECTED',
          shortenDecidedAt: new Date(),
          shortenDecidedById: input.decidedById,
          shortenDecisionNote: input.note ?? null,
        },
      });
    }

    // APPROVED — recompute totalDays for the new shorter range, refund the
    // delta, and rewind endDate. Preserve originalEndDate the first time we
    // shorten so the audit trail isn't lost on repeat shortens.
    const newTotalDays = await computeTotalDays({
      organizationId: req.organizationId,
      startDate: req.startDate,
      endDate: req.shortenRequestedEndDate,
      duration: req.duration,
    });
    if (newTotalDays <= 0) {
      throw new LeaveError(
        'ZERO_DAYS',
        'Shortened range contains only weekly-offs / holidays — cancel the leave instead.',
      );
    }

    const oldTotalDays = toNumber(req.totalDays);
    const refundDays = oldTotalDays - newTotalDays;

    if (refundDays > 0) {
      const year = yearOf(req.startDate);
      const balance = await ensureBalance(tx, req.organizationId, req.userId, req.leaveTypeId, year);
      // used -= refundDays — frees up the days again on the balance.
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { used: { decrement: refundDays } },
      });
      await tx.leaveAllocation.create({
        data: {
          organizationId: req.organizationId,
          userId: req.userId,
          leaveTypeId: req.leaveTypeId,
          year,
          delta: refundDays,
          reason: 'SHORTENED',
          referenceId: req.id,
          note: input.note ?? null,
          createdById: input.decidedById,
        },
      });
    }

    return tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        endDate: req.shortenRequestedEndDate,
        totalDays: newTotalDays,
        originalEndDate: req.originalEndDate ?? req.endDate,
        shortenStatus: 'APPROVED',
        shortenDecidedAt: new Date(),
        shortenDecidedById: input.decidedById,
        shortenDecisionNote: input.note ?? null,
      },
    });
  });

  return serializeRequest(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-service early return (no approval) — used when an employee on a
// multi-day full-day leave shows up and checks in. Ending the leave for today
// onward frees the day so attendance can be marked, and refunds the balance.
// ─────────────────────────────────────────────────────────────────────────────

export interface EndLeaveEarlyTodayInput {
  userId: string;
  organizationId: string;
  /** The day the employee is returning (today), YYYY-MM-DD. */
  date: string;
}

export interface EndLeaveEarlyResult {
  ended: boolean; // a covering leave was found and modified
  cancelled: boolean; // the whole leave was cancelled (return on day 1)
  leaveTypeId: string | null;
  newEndDate: string | null;
}

function previousDayStr(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`;
}

/**
 * End an in-progress FULL-DAY leave early so the employee can return and mark
 * attendance on `date`. Self-service: no approver needed.
 *   • Returning on the leave's FIRST day  → cancel the whole leave.
 *   • Returning mid-leave                 → shorten endDate to the day before
 *                                           `date` and refund the freed days.
 * No-op (ended:false) when there's no covering full-day leave. Partial leaves
 * (half-day / short) are NOT touched — those already keep the day workable.
 */
export async function endLeaveEarlyToday(
  input: EndLeaveEarlyTodayInput,
): Promise<EndLeaveEarlyResult> {
  return prisma.$transaction(async (tx: any) => {
    const req = await tx.leaveRequest.findFirst({
      where: {
        userId: input.userId,
        organizationId: input.organizationId,
        status: 'APPROVED',
        duration: 'FULL_DAY',
        startDate: { lte: input.date },
        endDate: { gte: input.date },
      },
      orderBy: { startDate: 'asc' },
    });
    if (!req) {
      return { ended: false, cancelled: false, leaveTypeId: null, newEndDate: null };
    }

    const year = yearOf(req.startDate);
    const balance = await ensureBalance(tx, req.organizationId, req.userId, req.leaveTypeId, year);
    const NOTE = 'Early return — employee checked in';

    // Returning on the first day → cancel the leave entirely and refund all.
    if (req.startDate === input.date) {
      const totalDays = toNumber(req.totalDays);
      if (totalDays > 0) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { used: { decrement: totalDays } },
        });
        await tx.leaveAllocation.create({
          data: {
            organizationId: req.organizationId,
            userId: req.userId,
            leaveTypeId: req.leaveTypeId,
            year,
            delta: totalDays,
            reason: 'CANCELLED',
            referenceId: req.id,
            note: NOTE,
            createdById: req.userId,
          },
        });
      }
      await tx.leaveRequest.update({
        where: { id: req.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: NOTE },
      });
      return { ended: true, cancelled: true, leaveTypeId: req.leaveTypeId, newEndDate: null };
    }

    // Mid-leave → shorten to the day before today and refund the freed days.
    const newEnd = previousDayStr(input.date);
    const newTotalDays = await computeTotalDays({
      organizationId: req.organizationId,
      startDate: req.startDate,
      endDate: newEnd,
      duration: req.duration,
    });
    const refundDays = toNumber(req.totalDays) - newTotalDays;
    if (refundDays > 0) {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { used: { decrement: refundDays } },
      });
      await tx.leaveAllocation.create({
        data: {
          organizationId: req.organizationId,
          userId: req.userId,
          leaveTypeId: req.leaveTypeId,
          year,
          delta: refundDays,
          reason: 'SHORTENED',
          referenceId: req.id,
          note: NOTE,
          createdById: req.userId,
        },
      });
    }
    await tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        endDate: newEnd,
        totalDays: newTotalDays,
        originalEndDate: req.originalEndDate ?? req.endDate,
        // Record the self-service shorten as already-decided so the approvals
        // queue doesn't show a phantom pending request.
        shortenRequestedEndDate: newEnd,
        shortenRequestedReason: NOTE,
        shortenRequestedAt: new Date(),
        shortenStatus: 'APPROVED',
        shortenDecidedAt: new Date(),
        shortenDecidedById: req.userId,
        shortenDecisionNote: 'Self-service early return on check-in',
      },
    });
    return { ended: true, cancelled: false, leaveTypeId: req.leaveTypeId, newEndDate: newEnd };
  });
}

export async function getBalance(
  organizationId: string,
  userId: string,
  year: number,
): Promise<BalanceRow[]> {
  // Load every active leave type so users see types they haven't used yet too.
  const [types, balances] = await Promise.all([
    (prisma as any).leaveType.findMany({
      where: { isActive: true },
      include: { leaveRules: { where: { isActive: true }, take: 1 } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    (prisma as any).leaveBalance.findMany({
      where: { organizationId, userId, year },
    }),
  ]);

  const byType = new Map<string, any>();
  for (const b of balances) byType.set(b.leaveTypeId, b);

  return types.map((lt: any): BalanceRow => {
    const b = byType.get(lt.id);
    const allocated = toNumber(b?.allocated);
    const carriedForward = toNumber(b?.carriedForward);
    const used = toNumber(b?.used);
    const pending = toNumber(b?.pending);
    const rule = lt.leaveRules?.[0];
    return {
      leaveType: {
        id: lt.id,
        name: lt.name,
        code: lt.code,
        category: lt.category,
        color: lt.color ?? null,
        icon: lt.icon ?? null,
      },
      year,
      allocated,
      carriedForward,
      used,
      pending,
      available: allocated + carriedForward - used - pending,
      isPaid: !!rule?.isPaid,
      minNoticeDays:
        rule?.minNoticeDays != null && Number.isFinite(Number(rule.minNoticeDays))
          ? Number(rule.minNoticeDays)
          : null,
      maxConsecutiveDays:
        rule?.maxConsecutiveDays != null && Number.isFinite(Number(rule.maxConsecutiveDays))
          ? Number(rule.maxConsecutiveDays)
          : null,
      requiresApproval: rule ? rule.requiresApproval !== false : true,
    };
  });
}

/** One paid-leave type's remaining balance for a user, used by the payroll
 *  half-day-cover feature. `sortOrder` drives the drain priority. */
export interface PaidLeaveBalanceRow {
  userId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  sortOrder: number;
  available: number;
}

/**
 * Batch-fetch PAID leave balances for many users in one round trip, for a
 * given year. Returns Map<userId, PaidLeaveBalanceRow[]> with only paid types
 * that have available > 0, pre-sorted by sortOrder. Used by the payroll engine
 * to cover half-day overflow from paid leave without an N+1 query per employee.
 *
 * Only types whose active LeaveRule has isPaid=true are included — unpaid types
 * can never fund a cover. Users absent from the map have no paid balance.
 */
export async function getPaidLeaveBalancesForUsers(
  organizationId: string,
  userIds: string[],
  year: number,
): Promise<Map<string, PaidLeaveBalanceRow[]>> {
  const out = new Map<string, PaidLeaveBalanceRow[]>();
  const ids = Array.from(new Set(userIds.filter((u): u is string => !!u)));
  if (ids.length === 0) return out;

  // Active paid leave types (the active rule decides paid vs unpaid).
  const types = await (prisma as any).leaveType.findMany({
    where: { isActive: true },
    include: { leaveRules: { where: { isActive: true }, take: 1 } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  const paidTypes = (types as any[]).filter((t) => !!t.leaveRules?.[0]?.isPaid);
  if (paidTypes.length === 0) return out;
  const paidTypeById = new Map<string, any>(paidTypes.map((t) => [t.id, t]));

  const balances = await (prisma as any).leaveBalance.findMany({
    where: {
      organizationId,
      year,
      userId: { in: ids },
      leaveTypeId: { in: paidTypes.map((t) => t.id) },
    },
  });

  for (const b of balances as any[]) {
    const lt = paidTypeById.get(b.leaveTypeId);
    if (!lt) continue;
    const available = balanceAvailable(b);
    if (available <= 0) continue;
    const row: PaidLeaveBalanceRow = {
      userId: b.userId,
      leaveTypeId: b.leaveTypeId,
      leaveTypeName: lt.name,
      sortOrder: Number.isFinite(Number(lt.sortOrder)) ? Number(lt.sortOrder) : 0,
      available,
    };
    const list = out.get(b.userId);
    if (list) list.push(row);
    else out.set(b.userId, [row]);
  }

  // Keep each user's list in drain priority.
  for (const list of out.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.leaveTypeName.localeCompare(b.leaveTypeName));
  }
  return out;
}

export interface AdminAllocateInput {
  organizationId: string;
  userId: string;
  leaveTypeId: string;
  year: number;
  amount: number; // signed
  reason?: string;
  createdById: string;
}

export async function adminAllocate(input: AdminAllocateInput) {
  if (!Number.isFinite(input.amount)) {
    throw new LeaveError('BAD_AMOUNT', 'amount must be a finite number.');
  }
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new LeaveError('BAD_YEAR', 'year out of range.');
  }
  return prisma.$transaction(async (tx: any) => {
    const balance = await ensureBalance(
      tx,
      input.organizationId,
      input.userId,
      input.leaveTypeId,
      input.year,
    );
    const updated = await tx.leaveBalance.update({
      where: { id: balance.id },
      data: { allocated: { increment: input.amount } },
    });
    await tx.leaveAllocation.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        leaveTypeId: input.leaveTypeId,
        year: input.year,
        delta: input.amount,
        reason: 'ADMIN_ADJUST',
        note: input.reason ?? null,
        createdById: input.createdById,
      },
    });
    return updated;
  });
}

/** One employee's half-day-cover deductions for a payroll month, as produced
 *  by the payroll engine (breakdown.halfDayCover.draws). */
export interface HalfDayCoverConsumption {
  userId: string;
  draws: { leaveTypeId: string; days: number }[];
}

/**
 * Apply the half-day-overflow paid-leave deductions decided by the payroll
 * engine. Called ONLY from the Generate-payroll action — never from preview —
 * because it mutates LeaveBalance.
 *
 * Idempotent per (user, month): every deduction writes a LeaveAllocation with
 * reason 'HALF_DAY_COVER' and referenceId `hdc:<month>`. On a re-generate we
 * detect those existing markers per user and skip them, so balances never
 * double-deduct. `month` is "YYYY-MM"; the year for the balance row is derived
 * from it.
 *
 * Returns a summary for logging/telemetry. Per-user failures are swallowed
 * (logged) so one bad row can't abort the whole payroll generation — mirrors
 * persistPayrollRecords' partial-save philosophy.
 */
export async function consumeHalfDayCoverForMonth(
  organizationId: string,
  month: string,
  createdById: string,
  consumptions: HalfDayCoverConsumption[],
): Promise<{ usersProcessed: number; usersSkipped: number; daysDeducted: number }> {
  const year = Number(month.split('-')[0]);
  const referenceId = `hdc:${month}`;
  let usersProcessed = 0;
  let usersSkipped = 0;
  let daysDeducted = 0;

  if (!Number.isInteger(year)) {
    return { usersProcessed, usersSkipped, daysDeducted };
  }

  for (const c of consumptions) {
    const draws = (c.draws ?? []).filter((d) => d.days > 0 && d.leaveTypeId);
    if (!c.userId || draws.length === 0) continue;
    try {
      await prisma.$transaction(async (tx: any) => {
        // Idempotency guard: if this user already has HALF_DAY_COVER markers
        // for this month, the cover was applied in a prior generate — skip.
        const already = await tx.leaveAllocation.findFirst({
          where: {
            organizationId,
            userId: c.userId,
            year,
            referenceId,
            reason: 'HALF_DAY_COVER',
          },
          select: { id: true },
        });
        if (already) {
          usersSkipped++;
          return;
        }

        for (const d of draws) {
          const balance = await ensureBalance(
            tx,
            organizationId,
            c.userId,
            d.leaveTypeId,
            year,
          );
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: { used: { increment: d.days } },
          });
          await tx.leaveAllocation.create({
            data: {
              organizationId,
              userId: c.userId,
              leaveTypeId: d.leaveTypeId,
              year,
              delta: -d.days,
              reason: 'HALF_DAY_COVER',
              referenceId,
              note: `Auto: covered half-day overflow for ${month}`,
              createdById,
            },
          });
          daysDeducted += d.days;
        }
        usersProcessed++;
      });
    } catch (err) {
      console.warn(
        `[leave] half-day cover deduction failed for user ${c.userId} ${month}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { usersProcessed, usersSkipped, daysDeducted };
}

/**
 * Used by attendance-service (block punch on full-day leave) and by
 * payroll-store (compute LOP from approved leaves). Returns approved
 * requests overlapping the inclusive [startDate, endDate] window.
 *
 * `userId` optional — omit it for org-wide payroll runs.
 */
export async function getApprovedLeavesForRange(
  organizationId: string,
  startDate: string,
  endDate: string,
  userId?: string,
): Promise<LeaveRequestRow[]> {
  const where: any = {
    organizationId,
    status: 'APPROVED',
    startDate: { lte: endDate },
    endDate: { gte: startDate },
  };
  if (userId) where.userId = userId;

  const rows = await (prisma as any).leaveRequest.findMany({
    where,
    orderBy: { startDate: 'asc' },
  });
  return rows.map(serializeRequest);
}

export async function listRequests(opts: {
  organizationId: string;
  userId?: string;
  // Caller-supplied allow-list. When present, results are restricted to
  // these user ids (intersected with `userId` if both are provided).
  // Used by callers that pre-resolve role-hierarchy visibility.
  userIds?: string[];
  status?: LeaveRequestStatus;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<LeaveRequestRow[]> {
  const where: any = { organizationId: opts.organizationId };
  if (opts.userId) {
    where.userId = opts.userId;
  } else if (opts.userIds) {
    // Empty allow-list → return nothing rather than fall through to org-wide.
    where.userId = { in: opts.userIds };
  }
  if (opts.status) where.status = opts.status;
  if (opts.from || opts.to) {
    where.AND = [];
    if (opts.to) where.AND.push({ startDate: { lte: opts.to } });
    if (opts.from) where.AND.push({ endDate: { gte: opts.from } });
  }
  const rows = await (prisma as any).leaveRequest.findMany({
    where,
    orderBy: [{ startDate: 'desc' }, { appliedAt: 'desc' }],
    take: Math.min(Math.max(opts.limit ?? 200, 1), 500),
  });
  return rows.map(serializeRequest);
}

export async function getRequest(
  id: string,
  organizationId: string,
): Promise<LeaveRequestRow | null> {
  const r = await (prisma as any).leaveRequest.findFirst({
    where: { id, organizationId },
  });
  return r ? serializeRequest(r) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approver detection — admin OR member of an attendance approver role.
// Reuses the same role pool as attendance regularizations so admins don't
// have to maintain two approver lists.
// ─────────────────────────────────────────────────────────────────────────────

import { isUserAdmin } from '@/lib/api-helpers';

export async function canApproveLeave(
  approverId: string,
  applicantOrgId: string,
): Promise<boolean> {
  if (!approverId || !applicantOrgId) return false;
  if (await isUserAdmin(approverId, applicantOrgId)) return true;

  const cfg: any = await getAttendanceConfig(applicantOrgId);
  const approverRoleIds: string[] = Array.isArray(cfg?.attendanceApproverRoleIds)
    ? cfg.attendanceApproverRoleIds
    : [];
  if (approverRoleIds.length === 0) return false;

  const assignments = await prisma.userUnitAssignment.findMany({
    where: { userId: approverId, roleId: { in: approverRoleIds } },
    select: { id: true },
    take: 1,
  });
  return assignments.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────

function serializeRequest(r: any): LeaveRequestRow {
  const iso = (v: any) =>
    v ? (v instanceof Date ? v.toISOString() : String(v)) : null;
  return {
    id: r.id,
    organizationId: r.organizationId,
    userId: r.userId,
    leaveTypeId: r.leaveTypeId,
    startDate: r.startDate,
    endDate: r.endDate,
    duration: r.duration,
    totalDays: toNumber(r.totalDays),
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
    reason: r.reason ?? null,
    attachmentUrl: r.attachmentUrl ?? null,
    isEmergency: !!r.isEmergency,
    status: r.status,
    appliedAt: r.appliedAt instanceof Date ? r.appliedAt.toISOString() : String(r.appliedAt),
    decidedAt: iso(r.decidedAt),
    decidedById: r.decidedById ?? null,
    decisionNote: r.decisionNote ?? null,
    cancelledAt: iso(r.cancelledAt),
    cancelReason: r.cancelReason ?? null,
    originalEndDate: r.originalEndDate ?? null,
    shortenRequestedEndDate: r.shortenRequestedEndDate ?? null,
    shortenRequestedReason: r.shortenRequestedReason ?? null,
    shortenStatus: (r.shortenStatus ?? null) as ShortenStatus | null,
    shortenRequestedAt: iso(r.shortenRequestedAt),
    shortenDecidedAt: iso(r.shortenDecidedAt),
    shortenDecidedById: r.shortenDecidedById ?? null,
    shortenDecisionNote: r.shortenDecisionNote ?? null,
  };
}
