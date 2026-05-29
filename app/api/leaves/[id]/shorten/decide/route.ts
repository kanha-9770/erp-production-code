/**
 * POST /api/leaves/[id]/shorten/decide — approver decides on a pending
 * early-return request.
 *   Body: { decision: 'APPROVED' | 'REJECTED', note?: string }
 *
 * On APPROVED, the leave's endDate is rewound and `used` balance refunded by
 * the day delta. Caller must be admin or in the org's attendance-approver
 * role pool — same gate as /api/leaves/[id]/decide.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import {
  decideEarlyReturn,
  canApproveLeave,
  getRequest,
  LeaveError,
} from '@/lib/hr/leave-service';
import { buildLeaveRecordData } from '@/lib/hr/leave-workflow';
import { fireWorkflow } from '@/lib/workflow/static-triggers';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function err(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, error: message, code },
    { status, headers: NO_STORE },
  );
}

interface DecideBody {
  decision?: string;
  note?: string | null;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) return err('Not authenticated', 401);
  if (!authUser.organizationId) return err('No organization', 403);

  const existing = await getRequest(params.id, authUser.organizationId);
  if (!existing) return err('Not found', 404);

  // Self-approval is never allowed — mirrors /decide and /cancel rules.
  if (existing.userId === authUser.id) {
    return err('You cannot decide your own early-return request.', 403);
  }
  if (!(await canApproveLeave(authUser.id, authUser.organizationId))) {
    return err('Forbidden', 403);
  }

  let body: DecideBody;
  try {
    body = (await request.json()) as DecideBody;
  } catch {
    return err('Invalid JSON body');
  }

  if (body.decision !== 'APPROVED' && body.decision !== 'REJECTED') {
    return err("decision must be 'APPROVED' or 'REJECTED'");
  }

  try {
    const updated = await decideEarlyReturn({
      requestId: params.id,
      decision: body.decision,
      decidedById: authUser.id,
      note: typeof body.note === 'string' ? body.note.slice(0, 2000) : null,
    });
    // Approving a shortening returns days back to the balance and changes
    // the leave's date range, which affects payroll computations for the
    // affected month(s).
    invalidatePayrollCache(authUser.organizationId);
    // Workflow rules can fire on shortenStatus = APPROVED / REJECTED to
    // notify the applicant their early-return was decided.
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
    return NextResponse.json({ success: true, request: updated }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof LeaveError) return err(e.message, e.status, e.code);
    console.error('[POST /api/leaves/[id]/shorten/decide]', e);
    return err('Failed to decide early-return request', 500);
  }
}
