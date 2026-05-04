import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getRequestMeta } from '@/lib/api-helpers';
import { canApproveAttendance } from '@/lib/hr/attendance-permissions';
import {
  RegularizationError,
  adminManualPunch,
} from '@/lib/hr/attendance-regularization';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ManualPunchBody {
  userId?: string;
  date?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  reason?: string;
}

function parseIso(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403 },
    );
  }
  const allowed = await canApproveAttendance(
    authUser.id,
    authUser.organizationId,
  );
  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error:
          'You are not authorised to record attendance for other users.',
      },
      { status: 403 },
    );
  }

  let body: ManualPunchBody;
  try {
    body = (await request.json()) as ManualPunchBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (!body.userId) {
    return NextResponse.json(
      { success: false, error: "'userId' is required" },
      { status: 400 },
    );
  }
  if (!body.date || !DATE_RE.test(body.date)) {
    return NextResponse.json(
      { success: false, error: "'date' must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const { ipAddress, userAgent } = getRequestMeta(request);

  try {
    await adminManualPunch({
      organizationId: authUser.organizationId,
      userId: body.userId,
      date: body.date,
      checkInAt: parseIso(body.checkInAt),
      checkOutAt: parseIso(body.checkOutAt),
      reason: body.reason ?? '',
      adminId: authUser.id,
      adminEmail: authUser.email,
      ip: ipAddress === 'unknown' ? null : ipAddress,
      userAgent,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof RegularizationError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error('[admin/manual-punch] failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to write manual punch' },
      { status: 500 },
    );
  }
}
