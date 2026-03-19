import { NextRequest, NextResponse } from 'next/server';
import { checkUserAdminRole, getUserActiveRoles } from '@/lib/auth-helpers';
import { getAuthenticatedUser } from '@/lib/api-helpers';

interface Params {
  userId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { userId } = params;
    
    // Validate the session
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Check if the requesting user is an admin or requesting their own info
    const isRequestingOwnInfo = authUser.id === userId;
    const isRequestingUserAdmin = await checkUserAdminRole(authUser.id);
    
    if (!isRequestingOwnInfo && !isRequestingUserAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get admin status and roles
    const isAdmin = await checkUserAdminRole(userId);
    const activeRoles = await getUserActiveRoles(userId);

    return NextResponse.json({
      success: true,
      data: {
        userId,
        isAdmin,
        activeRoles,
        adminRoles: activeRoles.filter(role => role.isAdmin),
        nonAdminRoles: activeRoles.filter(role => !role.isAdmin),
        totalActiveRoles: activeRoles.length,
      },
    });

  } catch (error) {
    console.error('Get user admin status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}