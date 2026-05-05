/**
 * POST /api/leaves/allocate — admin grants / adjusts a balance.
 *   Body: { userId, leaveTypeId, year, amount, reason?, bulk? }
 *   - If bulk = true, applies the same allocation to every active user in the
 *     org (userId is ignored). Useful for "yearly grant of 12 casual to all".
 *
 * GET /api/leaves/allocate — admin lists employees + their balances for a year.
 *   Query: ?year=
 *   Returns: { year, employees: [{ id, email, firstName, lastName, balances: [...] }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { adminAllocate, getBalance, LeaveError } from '@/lib/hr/leave-service';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

interface AllocateBody {
  userId?: string;
  leaveTypeId?: string;
  year?: number;
  amount?: number;
  reason?: string;
  bulk?: boolean;
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403, headers: NO_STORE },
    );
  }
  if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
    return NextResponse.json(
      { success: false, error: 'Admin only' },
      { status: 403, headers: NO_STORE },
    );
  }

  let body: AllocateBody;
  try {
    body = (await request.json()) as AllocateBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!body.leaveTypeId) {
    return NextResponse.json(
      { success: false, error: "'leaveTypeId' is required" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
    return NextResponse.json(
      { success: false, error: "'amount' must be a finite number" },
      { status: 400, headers: NO_STORE },
    );
  }
  const year = body.year ?? new Date().getFullYear();

  try {
    if (body.bulk) {
      const users = await prisma.user.findMany({
        where: { organizationId: authUser.organizationId, status: 'ACTIVE' },
        select: { id: true, email: true },
      });
      const results: Array<{ userId: string; email: string | null; ok: boolean; error?: string }> = [];
      for (const u of users) {
        try {
          await adminAllocate({
            organizationId: authUser.organizationId,
            userId: u.id,
            leaveTypeId: body.leaveTypeId,
            year,
            amount: body.amount,
            reason: body.reason,
            createdById: authUser.id,
          });
          results.push({ userId: u.id, email: u.email, ok: true });
        } catch (e: any) {
          results.push({ userId: u.id, email: u.email, ok: false, error: e?.message ?? 'failed' });
        }
      }
      return NextResponse.json(
        { success: true, applied: results.filter((r) => r.ok).length, total: results.length, results },
        { headers: NO_STORE },
      );
    }

    if (!body.userId) {
      return NextResponse.json(
        { success: false, error: "'userId' is required (or set bulk=true)" },
        { status: 400, headers: NO_STORE },
      );
    }
    const balance = await adminAllocate({
      organizationId: authUser.organizationId,
      userId: body.userId,
      leaveTypeId: body.leaveTypeId,
      year,
      amount: body.amount,
      reason: body.reason,
      createdById: authUser.id,
    });
    return NextResponse.json({ success: true, balance }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof LeaveError) {
      return NextResponse.json(
        { success: false, error: e.message, code: e.code },
        { status: e.status, headers: NO_STORE },
      );
    }
    console.error('[POST /api/leaves/allocate]', e);
    return NextResponse.json(
      { success: false, error: 'Failed to allocate' },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403, headers: NO_STORE },
    );
  }
  if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
    return NextResponse.json(
      { success: false, error: 'Admin only' },
      { status: 403, headers: NO_STORE },
    );
  }

  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();

  const users = await prisma.user.findMany({
    where: { organizationId: authUser.organizationId, status: 'ACTIVE' },
    orderBy: [{ first_name: 'asc' }, { email: 'asc' }],
    select: { id: true, email: true, first_name: true, last_name: true, department: true },
  });

  const employees = await Promise.all(
    users.map(async (u) => ({
      id: u.id,
      email: u.email,
      firstName: u.first_name ?? null,
      lastName: u.last_name ?? null,
      department: u.department ?? null,
      balances: await getBalance(authUser.organizationId!, u.id, year),
    })),
  );

  return NextResponse.json({ success: true, year, employees }, { headers: NO_STORE });
}
