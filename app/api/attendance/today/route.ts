import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getStatus } from '@/lib/hr/attendance-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  try {
    const status = await getStatus(authUser.id, authUser.organizationId);
    return NextResponse.json(
      { success: true, status },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (err) {
    console.error('[attendance/today] error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load attendance status' },
      { status: 500 },
    );
  }
}
