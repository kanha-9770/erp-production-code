/**
 * GET  /api/leave-rules  — list all LeaveType rows with their attached LeaveRule rows.
 *   Visible to any authenticated user (read-only). The Apply Leave form already
 *   reads these via /api/leaves/balance; this endpoint is for the admin Config page.
 *
 * PUT  /api/leave-rules  — admin updates one LeaveRule by id.
 *   Body: {
 *     id, name?, description?, minNoticeDays?, maxConsecutiveDays?,
 *     deductionPercentage?, isPaid?, requiresApproval?, affectsAttendance?,
 *     isActive?
 *   }
 *   Returns the refreshed list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: NO_STORE },
  );
}

async function listLeaveTypes() {
  return prisma.leaveType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      leaveRules: {
        orderBy: { name: 'asc' },
      },
    },
  });
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);

  const leaveTypes = await listLeaveTypes();
  return NextResponse.json(
    { success: true, leaveTypes },
    { headers: NO_STORE },
  );
}

interface PutBody {
  id?: string;
  name?: string;
  description?: string | null;
  minNoticeDays?: number | null;
  maxConsecutiveDays?: number | null;
  deductionPercentage?: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
  affectsAttendance?: boolean;
  isActive?: boolean;
}

function clampInt(n: unknown, min: number, max: number): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

export async function PUT(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);
  if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
    return err('Admin only', 403);
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return err('Invalid JSON body');
  }

  if (!body.id || typeof body.id !== 'string') {
    return err("'id' is required");
  }

  const existing = await prisma.leaveRule.findUnique({ where: { id: body.id } });
  if (!existing) return err('Leave rule not found', 404);

  const data: Record<string, unknown> = {};

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) return err('name cannot be empty');
    data.name = trimmed;
  }
  if (body.description !== undefined) {
    data.description =
      typeof body.description === 'string' ? body.description.trim() || null : null;
  }
  if (body.minNoticeDays !== undefined) {
    data.minNoticeDays =
      body.minNoticeDays === null ? null : clampInt(body.minNoticeDays, 0, 365);
  }
  if (body.maxConsecutiveDays !== undefined) {
    data.maxConsecutiveDays =
      body.maxConsecutiveDays === null
        ? null
        : clampInt(body.maxConsecutiveDays, 0, 365);
  }
  if (body.deductionPercentage !== undefined) {
    const pct = Number(body.deductionPercentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return err('deductionPercentage must be between 0 and 100');
    }
    data.deductionPercentage = pct;
  }
  if (typeof body.isPaid === 'boolean') data.isPaid = body.isPaid;
  if (typeof body.requiresApproval === 'boolean')
    data.requiresApproval = body.requiresApproval;
  if (typeof body.affectsAttendance === 'boolean')
    data.affectsAttendance = body.affectsAttendance;
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

  if (Object.keys(data).length === 0) {
    return err('No fields to update');
  }

  await prisma.leaveRule.update({ where: { id: body.id }, data });

  const leaveTypes = await listLeaveTypes();
  return NextResponse.json(
    { success: true, leaveTypes },
    { headers: NO_STORE },
  );
}
