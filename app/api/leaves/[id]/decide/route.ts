/**
 * POST /api/leaves/[id]/decide — approve or reject a PENDING leave.
 *   Body: { decision: 'APPROVED' | 'REJECTED', note?: string }
 *   Caller must be admin or in the org's attendance-approver role pool.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import {
  decideLeave,
  canApproveLeave,
  getRequest,
  LeaveError,
} from '@/lib/hr/leave-service';
import { buildLeaveRecordData } from '@/lib/hr/leave-workflow';
import { fireWorkflow } from '@/lib/workflow/static-triggers';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

interface DecideBody {
  decision?: string;
  note?: string | null;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const existing = await getRequest(params.id, authUser.organizationId);
  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404, headers: NO_STORE },
    );
  }

  // Self-approval is never allowed — even admins can't approve their own leave.
  if (existing.userId === authUser.id) {
    return NextResponse.json(
      { success: false, error: 'You cannot decide your own leave request.' },
      { status: 403, headers: NO_STORE },
    );
  }

  if (!(await canApproveLeave(authUser.id, authUser.organizationId))) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403, headers: NO_STORE },
    );
  }

  let body: DecideBody;
  try {
    body = (await request.json()) as DecideBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: NO_STORE },
    );
  }

  const decision = body.decision;
  if (decision !== 'APPROVED' && decision !== 'REJECTED') {
    return NextResponse.json(
      { success: false, error: "decision must be 'APPROVED' or 'REJECTED'" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const updated = await decideLeave({
      requestId: params.id,
      decision,
      decidedById: authUser.id,
      note: typeof body.note === 'string' ? body.note.slice(0, 2000) : null,
    });
    // Approving (or rejecting a previously-approved) leave changes
    // payable / unpaid-leave counts for the affected month(s). Invalidate
    // the live payroll cache so the next read recomputes from truth.
    invalidatePayrollCache(authUser.organizationId);
    // Fire any workflow rule the admin built against "Leave" with
    // condition `status = APPROVED` (or REJECTED) so e-mails / in-app
    // notifications go out.
    buildLeaveRecordData(updated).then((recordData) => {
      fireWorkflow({
        moduleName: 'Leave',
        action: 'Edit',
        organizationId: authUser.organizationId!,
        userId: authUser.id,
        recordId: updated.id,
        recordData,
      });
    });
    return NextResponse.json(
      { success: true, request: updated },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (e instanceof LeaveError) {
      return NextResponse.json(
        { success: false, error: e.message, code: e.code },
        { status: e.status, headers: NO_STORE },
      );
    }
    console.error('[POST /api/leaves/[id]/decide]', e);
    return NextResponse.json(
      { success: false, error: 'Failed to decide leave' },
      { status: 500, headers: NO_STORE },
    );
  }
}
