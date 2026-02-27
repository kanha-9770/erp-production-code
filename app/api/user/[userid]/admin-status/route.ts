import { NextRequest, NextResponse } from 'next/server';
import { checkUserAdminRole, getUserActiveRoles } from '@/lib/auth-helpers';
import { validateSession } from '@/lib/auth';

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
    const token = request.cookies.get('auth-token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const session = await validateSession(token);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Check if the requesting user is an admin or requesting their own info
    const isRequestingOwnInfo = session.user.id === userId;
    const isRequestingUserAdmin = await checkUserAdminRole(session.user.id);
    
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