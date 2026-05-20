/**
 * POST /api/attendance/overtime — toggle the caller's overtime opt-in for
 * today's attendance row.
 *
 *   Body: { optIn: boolean }
 *
 * Auth: any signed-in user; the service gates by the row's ownership (it
 * only ever looks at today's row for `authUser.id`).
 *
 * Returns the fresh AttendanceStatus so the widget can refresh without a
 * second round-trip.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import {
  AttendanceError,
  setOvertimeOptIn,
} from '@/lib/hr/attendance-service';
import { fireWorkflow } from '@/lib/workflow/static-triggers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

interface Body {
  optIn?: boolean;
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: NO_STORE },
    );
  }
  if (typeof body.optIn !== 'boolean') {
    return NextResponse.json(
      { success: false, error: "'optIn' must be a boolean" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const status = await setOvertimeOptIn({
      userId: authUser.id,
      organizationId: authUser.organizationId ?? null,
      optIn: body.optIn,
    });
    // Fire-and-forget workflow trigger. Rules built on the "Attendance" module
    // with a condition on `overtimeOptedIn` will pick this up — typical use
    // case is notifying HR/Admin when an employee starts overtime. Enrich
    // recordData with denormalised employee identity so the System
    // Notification's "selected fields" table can render Employee Name /
    // Department without joining back to User.
    if (authUser.organizationId) {
      const profile = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: {
          first_name: true,
          last_name: true,
          email: true,
          department: true,
          employee: {
            select: {
              employeeName: true,
              department: true,
              designation: true,
            },
          },
        },
      });
      const fullName =
        profile?.employee?.employeeName ||
        [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
        profile?.email ||
        authUser.id;
      fireWorkflow({
        moduleName: 'Attendance',
        action: 'Edit',
        organizationId: authUser.organizationId,
        userId: authUser.id,
        recordData: {
          userId: authUser.id,
          employeeName: fullName,
          department: profile?.employee?.department || profile?.department || '',
          designation: profile?.employee?.designation || '',
          date: status.date,
          overtimeOptedIn: body.optIn,
          overtimeStartedAt: status.overtime?.startedAt ?? null,
          checkedIn: status.checkedIn,
        },
      });
    }
    return NextResponse.json({ success: true, status }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof AttendanceError) {
      return NextResponse.json(
        { success: false, error: e.message, code: e.code },
        { status: e.status, headers: NO_STORE },
      );
    }
    console.error('[POST /api/attendance/overtime]', e);
    return NextResponse.json(
      { success: false, error: 'Failed to toggle overtime' },
      { status: 500, headers: NO_STORE },
    );
  }
}
