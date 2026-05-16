/**
 * Attendance regularization — the missing escape hatch for "I forgot to
 * check in / out yesterday". Without this, broken/missing punches poison
 * payroll forever because there's no UI for an employee or admin to
 * correct a past day.
 *
 * Flow:
 *   1. User (or admin) creates a PENDING request describing what should
 *      be on a given day. We snapshot the current values at request time.
 *   2. Admin reviews. Approving applies the requested values to the
 *      underlying Attendance row (creating the row if none existed).
 *      Rejecting just records the decision.
 *   3. Every transition is audit-logged AND fires the existing workflow
 *      engine so notifications, emails, and custom Function actions all
 *      run via the same path as a normal punch.
 */

import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/api-helpers';
import { triggerWorkflowsForRecord } from '@/lib/workflow/trigger';
import { getAttendanceConfig } from './attendance-config';
import { formatHHmm, todayKey, getEffectiveShift } from './attendance-service';

export type RegularizationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface CreateRegularizationInput {
  userId: string; // whose attendance we're fixing
  organizationId: string;
  requestedById: string; // self-request: same as userId; admin-on-behalf: differs
  date: string; // YYYY-MM-DD
  requestedCheckInAt: Date | null;
  requestedCheckOutAt: Date | null;
  reason: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface ReviewInput {
  id: string;
  reviewerId: string;
  reviewerEmail: string;
  organizationId: string;
  note?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REASON_LENGTH = 2000;
const MAX_NOTE_LENGTH = 2000;

export class RegularizationError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function ensureValidWindow(input: {
  date: string;
  requestedCheckInAt: Date | null;
  requestedCheckOutAt: Date | null;
}): void {
  if (!DATE_RE.test(input.date)) {
    throw new RegularizationError('INVALID_DATE', "'date' must be YYYY-MM-DD");
  }
  if (!input.requestedCheckInAt && !input.requestedCheckOutAt) {
    throw new RegularizationError(
      'NO_CHANGE_REQUESTED',
      'At least one of check-in or check-out must be set.',
    );
  }
  if (
    input.requestedCheckInAt &&
    input.requestedCheckOutAt &&
    input.requestedCheckOutAt.getTime() <= input.requestedCheckInAt.getTime()
  ) {
    throw new RegularizationError(
      'INVALID_RANGE',
      'Check-out must be after check-in.',
    );
  }

  // Same-day sanity. Both timestamps must fall on `date` in server-local
  // time so we don't accidentally backfill yesterday's punch onto today.
  const checkDay = (d: Date | null) => {
    if (!d) return true;
    return todayKeyOf(d) === input.date;
  };
  if (!checkDay(input.requestedCheckInAt) || !checkDay(input.requestedCheckOutAt)) {
    throw new RegularizationError(
      'DATE_MISMATCH',
      "Requested time stamps must fall on 'date'.",
    );
  }

  // No future-dated requests. The auto-checkout job already handles "today"
  // — regularizations are strictly for fixing the past.
  const today = todayKey();
  if (input.date > today) {
    throw new RegularizationError(
      'FUTURE_DATE',
      'Cannot regularize a future date.',
    );
  }
}

function todayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function safeAudit(
  performedBy: string,
  userId: string,
  organizationId: string | null,
  action: string,
  details: Record<string, unknown>,
  ip: string | null,
  userAgent: string | null,
  recordId: string | null,
): Promise<void> {
  try {
    await logAudit({
      userId,
      organizationId,
      performedBy,
      action,
      module: 'Attendance',
      details: JSON.stringify(details),
      ipAddress: ip ?? 'unknown',
      userAgent: userAgent ?? 'unknown',
      recordId: recordId ?? undefined,
      recordName: details.date
        ? `Regularization ${details.date}`
        : undefined,
    });
  } catch (err) {
    console.error('[regularization] audit log failed:', err);
  }
}

async function fireWorkflow(
  organizationId: string,
  userId: string,
  action: 'Create' | 'Edit',
  recordData: Record<string, unknown>,
  recordId: string,
): Promise<void> {
  const cfg = await getAttendanceConfig(organizationId);
  if (!cfg.workflowModuleName) return;
  void triggerWorkflowsForRecord({
    moduleName: cfg.workflowModuleName,
    action,
    organizationId,
    userId,
    recordId,
    recordData,
  }).catch((err) => {
    console.error('[regularization] workflow trigger failed:', err);
  });
}

export async function createRegularization(
  input: CreateRegularizationInput,
): Promise<{ id: string; date: string }> {
  ensureValidWindow(input);

  const reason = (input.reason ?? '').trim();
  if (reason.length === 0) {
    throw new RegularizationError(
      'REASON_REQUIRED',
      'Please describe why this correction is needed.',
    );
  }
  if (reason.length > MAX_REASON_LENGTH) {
    throw new RegularizationError(
      'REASON_TOO_LONG',
      `Reason must be at most ${MAX_REASON_LENGTH} characters.`,
    );
  }

  // Verify the user belongs to the same org as the request — defensive
  // against a request body that names a userId from a different tenant.
  const targetUser = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, organizationId: true, email: true },
  });
  if (!targetUser) {
    throw new RegularizationError('USER_NOT_FOUND', 'User not found.', 404);
  }
  if (targetUser.organizationId !== input.organizationId) {
    throw new RegularizationError(
      'CROSS_TENANT',
      'Cannot regularize a user outside this organization.',
      403,
    );
  }

  // One pending request per (user, date) keeps the queue tidy and avoids
  // approving stale duplicates after the row has changed.
  const existingPending = await (prisma as any).attendanceRegularization.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      date: input.date,
      status: 'PENDING',
    },
    select: { id: true },
  });
  if (existingPending) {
    throw new RegularizationError(
      'PENDING_EXISTS',
      'A pending regularization already exists for this day. Cancel it first.',
      409,
    );
  }

  const existingRow = await prisma.attendance.findFirst({
    where: { userId: input.userId, date: input.date },
    select: {
      id: true,
      checkInAt: true,
      checkOutAt: true,
    } as any,
  });

  const created = await (prisma as any).attendanceRegularization.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      date: input.date,
      attendanceId: existingRow?.id ?? null,
      currentCheckInAt: (existingRow as any)?.checkInAt ?? null,
      currentCheckOutAt: (existingRow as any)?.checkOutAt ?? null,
      requestedCheckInAt: input.requestedCheckInAt,
      requestedCheckOutAt: input.requestedCheckOutAt,
      reason,
      status: 'PENDING',
      requestedById: input.requestedById,
    },
  });

  await safeAudit(
    targetUser.email ?? 'unknown',
    input.userId,
    input.organizationId,
    'Attendance: Regularization requested',
    {
      regularizationId: created.id,
      date: input.date,
      requestedById: input.requestedById,
      requestedCheckInAt: input.requestedCheckInAt?.toISOString() ?? null,
      requestedCheckOutAt: input.requestedCheckOutAt?.toISOString() ?? null,
    },
    input.ip ?? null,
    input.userAgent ?? null,
    created.id,
  );

  await fireWorkflow(
    input.organizationId,
    input.userId,
    'Create',
    {
      eventType: 'regularizationRequested',
      regularizationId: created.id,
      date: input.date,
      reason,
      requestedCheckInAt: input.requestedCheckInAt?.toISOString() ?? null,
      requestedCheckOutAt: input.requestedCheckOutAt?.toISOString() ?? null,
      employeeUserId: input.userId,
    },
    created.id,
  );

  return { id: created.id, date: input.date };
}

export async function approveRegularization(input: ReviewInput): Promise<void> {
  const row = await (prisma as any).attendanceRegularization.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!row) {
    throw new RegularizationError(
      'NOT_FOUND',
      'Regularization not found.',
      404,
    );
  }
  if (row.status !== 'PENDING') {
    throw new RegularizationError(
      'NOT_PENDING',
      `Already ${String(row.status).toLowerCase()}.`,
      409,
    );
  }

  const note = (input.note ?? '').trim().slice(0, MAX_NOTE_LENGTH) || null;

  // Apply: write the requested values to the Attendance row, creating one
  // if needed. We use updateMany / create with raw values (not the punch
  // service) because we're explicitly amending history — the row's
  // lateMinutes / overtimeMinutes are recomputed below from the new times.
  const requestedIn: Date | null = row.requestedCheckInAt
    ? new Date(row.requestedCheckInAt)
    : null;
  const requestedOut: Date | null = row.requestedCheckOutAt
    ? new Date(row.requestedCheckOutAt)
    : null;

  const cfg = await getAttendanceConfig(input.organizationId);
  // Per-employee shift override: use the row's user's own inTime/outTime if
  // set, otherwise the org default. Mirrors getStatus()/recordPunch() so an
  // admin-approved regularization is classified against the same window the
  // live widget would have used.
  const shift = await getEffectiveShift(row.userId, cfg);
  const expectedInMins = parseTimeToMinutes(shift.start) + cfg.graceMinutes;
  const expectedOutMins = parseTimeToMinutes(shift.end);

  let lateMinutes = 0;
  let earlyOutMinutes = 0;
  let overtimeMinutes = 0;
  if (requestedIn) {
    const inMins = requestedIn.getHours() * 60 + requestedIn.getMinutes();
    lateMinutes = Math.max(0, inMins - expectedInMins);
  }
  if (requestedOut) {
    const outMins = requestedOut.getHours() * 60 + requestedOut.getMinutes();
    earlyOutMinutes = Math.max(0, expectedOutMins - outMins);
  }
  if (requestedIn && requestedOut) {
    const workedMin = Math.max(
      0,
      Math.round((requestedOut.getTime() - requestedIn.getTime()) / 60_000) - cfg.breakMinutes,
    );
    const overtimeThreshold = Math.round(cfg.overtimeAfterHours * 60);
    overtimeMinutes = Math.max(0, workedMin - overtimeThreshold);
  }

  const writeData = {
    checkedIn: !!requestedIn,
    checkedOut: !!requestedOut,
    checkInAt: requestedIn,
    checkOutAt: requestedOut,
    checkInTime: requestedIn ? formatHHmm(requestedIn) : null,
    checkOutTime: requestedOut ? formatHHmm(requestedOut) : null,
    checkInSource: requestedIn ? 'ADMIN' : null,
    checkOutSource: requestedOut ? 'ADMIN' : null,
    lateMinutes,
    earlyOutMinutes,
    overtimeMinutes,
    isAutoCheckedOut: false,
    organizationId: input.organizationId,
    status: requestedOut ? 'PRESENT' : null,
  } as any;

  if (row.attendanceId) {
    await prisma.attendance.update({
      where: { id: row.attendanceId },
      data: writeData,
    });
  } else {
    // Try to find a row that may have been created since the request
    // landed (e.g. user punched the next morning while admin reviewed).
    // If still none, create.
    const existing = await prisma.attendance.findFirst({
      where: { userId: row.userId, date: row.date },
    });
    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: writeData,
      });
    } else {
      await prisma.attendance.create({
        data: {
          userId: row.userId,
          date: row.date,
          ...writeData,
        } as any,
      });
    }
  }

  await (prisma as any).attendanceRegularization.update({
    where: { id: input.id },
    data: {
      status: 'APPROVED',
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
      reviewNote: note,
    },
  });

  await safeAudit(
    input.reviewerEmail,
    row.userId,
    input.organizationId,
    'Attendance: Regularization approved',
    {
      regularizationId: input.id,
      date: row.date,
      reviewedById: input.reviewerId,
      note,
      appliedCheckInAt: requestedIn?.toISOString() ?? null,
      appliedCheckOutAt: requestedOut?.toISOString() ?? null,
    },
    input.ip ?? null,
    input.userAgent ?? null,
    input.id,
  );

  await fireWorkflow(
    input.organizationId,
    row.userId,
    'Edit',
    {
      eventType: 'regularizationApproved',
      regularizationId: input.id,
      date: row.date,
      employeeUserId: row.userId,
      lateMinutes,
      earlyOutMinutes,
      overtimeMinutes,
    },
    input.id,
  );
}

export async function rejectRegularization(input: ReviewInput): Promise<void> {
  const row = await (prisma as any).attendanceRegularization.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!row) {
    throw new RegularizationError('NOT_FOUND', 'Not found.', 404);
  }
  if (row.status !== 'PENDING') {
    throw new RegularizationError(
      'NOT_PENDING',
      `Already ${String(row.status).toLowerCase()}.`,
      409,
    );
  }
  const note = (input.note ?? '').trim().slice(0, MAX_NOTE_LENGTH) || null;
  await (prisma as any).attendanceRegularization.update({
    where: { id: input.id },
    data: {
      status: 'REJECTED',
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
      reviewNote: note,
    },
  });

  await safeAudit(
    input.reviewerEmail,
    row.userId,
    input.organizationId,
    'Attendance: Regularization rejected',
    {
      regularizationId: input.id,
      date: row.date,
      reviewedById: input.reviewerId,
      note,
    },
    input.ip ?? null,
    input.userAgent ?? null,
    input.id,
  );

  await fireWorkflow(
    input.organizationId,
    row.userId,
    'Edit',
    {
      eventType: 'regularizationRejected',
      regularizationId: input.id,
      date: row.date,
      employeeUserId: row.userId,
      reviewNote: note,
    },
    input.id,
  );
}

export async function cancelRegularization(
  id: string,
  cancelerId: string,
  organizationId: string,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  const row = await (prisma as any).attendanceRegularization.findFirst({
    where: { id, organizationId },
  });
  if (!row) {
    throw new RegularizationError('NOT_FOUND', 'Not found.', 404);
  }
  if (row.status !== 'PENDING') {
    throw new RegularizationError(
      'NOT_PENDING',
      'Only pending requests can be cancelled.',
      409,
    );
  }
  if (row.requestedById !== cancelerId) {
    throw new RegularizationError(
      'NOT_REQUESTER',
      'Only the requester can cancel.',
      403,
    );
  }
  await (prisma as any).attendanceRegularization.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      reviewedAt: new Date(),
    },
  });

  const canceler = await prisma.user.findUnique({
    where: { id: cancelerId },
    select: { email: true },
  });
  await safeAudit(
    canceler?.email ?? 'unknown',
    row.userId,
    organizationId,
    'Attendance: Regularization cancelled',
    { regularizationId: id, date: row.date, by: cancelerId },
    ip,
    userAgent,
    id,
  );
}

function parseTimeToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 9 * 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ---- Admin direct-write (skips approval) ----------------------------------

export interface ManualPunchInput {
  organizationId: string;
  userId: string;
  date: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  reason: string;
  adminId: string;
  adminEmail: string;
  ip?: string | null;
  userAgent?: string | null;
}

export async function adminManualPunch(input: ManualPunchInput): Promise<void> {
  ensureValidWindow({
    date: input.date,
    requestedCheckInAt: input.checkInAt,
    requestedCheckOutAt: input.checkOutAt,
  });

  const reason = (input.reason ?? '').trim();
  if (reason.length === 0) {
    throw new RegularizationError(
      'REASON_REQUIRED',
      'Please record why this manual entry is needed.',
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, organizationId: true, email: true },
  });
  if (!targetUser || targetUser.organizationId !== input.organizationId) {
    throw new RegularizationError(
      'CROSS_TENANT',
      'Cannot write attendance for a user outside this organization.',
      403,
    );
  }

  // Re-use the approval write logic by inserting a regularization row that
  // is APPROVED on creation. This keeps the audit trail uniform — every
  // change to a past day shows up in the regularization table.
  const created = await (prisma as any).attendanceRegularization.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      date: input.date,
      requestedCheckInAt: input.checkInAt,
      requestedCheckOutAt: input.checkOutAt,
      reason,
      status: 'PENDING',
      requestedById: input.adminId,
    },
  });

  await approveRegularization({
    id: created.id,
    reviewerId: input.adminId,
    reviewerEmail: input.adminEmail,
    organizationId: input.organizationId,
    note: '(admin manual entry) ' + reason,
    ip: input.ip,
    userAgent: input.userAgent,
  });
}
