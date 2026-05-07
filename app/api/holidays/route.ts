/**
 * GET  /api/holidays         — list holidays. Query: ?year=&from=&to=
 *   All authenticated org members can read (the calendar is shared).
 *
 * POST /api/holidays         — admin-only create.
 *   Body: { date, name, isOptional? }
 *   Idempotent on (orgId, date) — POSTing the same date twice updates name.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let where: any = { organizationId: authUser.organizationId };
  if (yearParam && /^\d{4}$/.test(yearParam)) {
    where.date = { gte: `${yearParam}-01-01`, lte: `${yearParam}-12-31` };
  } else if (from || to) {
    where.date = {};
    if (from && DATE_RE.test(from)) where.date.gte = from;
    if (to && DATE_RE.test(to)) where.date.lte = to;
  }

  const rows = await (prisma as any).holiday.findMany({
    where,
    orderBy: { date: 'asc' },
  });

  return NextResponse.json({ success: true, holidays: rows }, { headers: NO_STORE });
}

interface CreateBody {
  date?: string;
  name?: string;
  isOptional?: boolean;
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

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!body.date || !DATE_RE.test(body.date)) {
    return NextResponse.json(
      { success: false, error: "'date' must be YYYY-MM-DD" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json(
      { success: false, error: "'name' is required" },
      { status: 400, headers: NO_STORE },
    );
  }

  const holiday = await (prisma as any).holiday.upsert({
    where: {
      organizationId_date: {
        organizationId: authUser.organizationId,
        date: body.date,
      },
    },
    create: {
      organizationId: authUser.organizationId,
      date: body.date,
      name: body.name.trim().slice(0, 200),
      isOptional: body.isOptional === true,
      createdById: authUser.id,
    },
    update: {
      name: body.name.trim().slice(0, 200),
      isOptional: body.isOptional === true,
    },
  });

  // Adding or toggling a holiday changes the day's payroll classification
  // (a working-day absent flips to a paid holiday, etc.). Invalidate so
  // the next read recomputes for this org.
  invalidatePayrollCache(authUser.organizationId);

  return NextResponse.json({ success: true, holiday }, { headers: NO_STORE });
}
