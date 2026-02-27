import { NextRequest, NextResponse } from 'next/server';
import { validateSession, AuthContext } from './auth';
import { DatabaseRoles } from './DatabaseRoles';

export const withAuth = (handler: (req: NextRequest & { user?: any; authContext?: AuthContext }) => Promise<NextResponse>) => {
  return async (req: NextRequest) => {
    const token = req.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const userPermissions = await DatabaseRoles.getUserPermissionsWithResources(session.user.id);
    (req as any).user = session.user;
    (req as any).authContext = {
      userId: session.user.id,
      userEmail: session.user.email,
      roleId: session.user.roleId,
      roleName: session.user.roleName,
      permissions: userPermissions,
    };

    return handler(req);
  };
};