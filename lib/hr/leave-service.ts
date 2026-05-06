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
import { getAttendanceConfig } from './attendance-config';

export type LeaveDuration = 'FULL_DAY' | 'HALF_DAY_FIRST' | 'HALF_DAY_SECOND';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export class LeaveError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'LeaveError';
  }
}

export interface LeaveRequestRow {
  id: string;
  organizationId: string;
  userId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  duration: LeaveDuration;
  totalDays: number;
  reason: string | null;
  attachmentUrl: string | null;
  status: LeaveRequestStatus;
  appliedAt: string;
  decidedAt: string | null;
  decidedById: string | null;
  decisionNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
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
}): Promise<number> {
  if (input.duration !== 'FULL_DAY') {
    if (input.startDate !== input.endDate) {
      throw new LeaveError(
        'HALF_DAY_RANGE',
        'Half-day leaves must be on a single date.',
      );
    }
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

  // Notice period: startDate must be at least N days from today.
  if (lt.rule.minNoticeDays && lt.rule.minNoticeDays > 0) {
    const today = todayStr();
    const noticeMs = dateOnlyMs(input.startDate) - dateOnlyMs(today);
    const noticeDays = Math.floor(noticeMs / (1000 * 60 * 60 * 24));
    if (noticeDays < lt.rule.minNoticeDays) {
      throw new LeaveError(
        'INSUFFICIENT_NOTICE',
        `${lt.type.name} requires at least ${lt.rule.minNoticeDays} day(s) notice. You gave ${noticeDays}.`,
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

  // Atomic: ensure balance row, optionally check available, increment pending,
  // create the request, write an allocation audit row.
  const created = await prisma.$transaction(async (tx: any) => {
    const balance = await ensureBalance(tx, input.organizationId, input.userId, input.leaveTypeId, year);
    if (lt.rule.isPaid) {
      const avail = balanceAvailable(balance);
      if (avail < totalDays) {
        throw new LeaveError(
          'INSUFFICIENT_BALANCE',
          `Not enough ${lt.type.name} balance: ${avail} available, ${totalDays} requested.`,
        );
      }
    }

    const req = await tx.leaveRequest.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        duration: input.duration,
        totalDays,
        reason: input.reason ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        status: 'PENDING',
      },
    });

    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: { pending: { increment: totalDays } },
    });

    return req;
  });

  return serializeRequest(created);
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
  status?: LeaveRequestStatus;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<LeaveRequestRow[]> {
  const where: any = { organizationId: opts.organizationId };
  if (opts.userId) where.userId = opts.userId;
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
  return {
    id: r.id,
    organizationId: r.organizationId,
    userId: r.userId,
    leaveTypeId: r.leaveTypeId,
    startDate: r.startDate,
    endDate: r.endDate,
    duration: r.duration,
    totalDays: toNumber(r.totalDays),
    reason: r.reason ?? null,
    attachmentUrl: r.attachmentUrl ?? null,
    status: r.status,
    appliedAt: r.appliedAt instanceof Date ? r.appliedAt.toISOString() : String(r.appliedAt),
    decidedAt: r.decidedAt ? (r.decidedAt instanceof Date ? r.decidedAt.toISOString() : String(r.decidedAt)) : null,
    decidedById: r.decidedById ?? null,
    decisionNote: r.decisionNote ?? null,
    cancelledAt: r.cancelledAt ? (r.cancelledAt instanceof Date ? r.cancelledAt.toISOString() : String(r.cancelledAt)) : null,
    cancelReason: r.cancelReason ?? null,
  };
}
