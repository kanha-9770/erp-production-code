/**
 * DELETE /api/holidays/[id] — admin-only delete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { moveToTrash } from '@/lib/trash';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authUser = await getAuthenticatedUser(_request);
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

  const existing = await (prisma as any).holiday.findUnique({ where: { id: params.id } });
  if (!existing || existing.organizationId !== authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404, headers: NO_STORE },
    );
  }

  try {
    await moveToTrash('Holiday', params.id, {
      userId: authUser.id,
      userName: authUser.email,
      organizationId: authUser.organizationId,
    });
    // Removing a holiday flips that date back into a working day, so the
    // payroll classification changes. Drop the cached payroll for the org.
    invalidatePayrollCache(authUser.organizationId);
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('[DELETE /api/holidays/[id]]', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to delete holiday' },
      { status: 500, headers: NO_STORE },
    );
  }
}
