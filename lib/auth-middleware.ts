import { NextRequest, NextResponse } from 'next/server';
import { validateSession, AuthContext } from './auth';
import { prisma } from './prisma';

// Add try-catch wrapper for better error handling
const safeAsync = (fn: Function) => {
  return async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error('[SafeAsync] Error:', error);
      throw error;
    }
  };
};

export const withAuth = (
  handler: (
    req: NextRequest & { user?: any; authContext?: AuthContext },
    context?: any
  ) => Promise<NextResponse>
) => {
  return safeAsync(async (req: NextRequest, context?: any) => {
    try {
      const token = req.cookies.get('auth-token')?.value;

      if (!token) {
        console.log('[withAuth] No auth token found');
        return NextResponse.json(
          { success: false, error: 'Authentication token required' },
          { status: 401 }
        );
      }

      const session = await validateSession(token);

      if (!session) {
        console.log('[withAuth] Invalid or expired session');
        return NextResponse.json(
          { success: false, error: 'Invalid or expired session' },
          { status: 401 }
        );
      }

      console.log(`[withAuth] Session found for user: ${session.user.email}, ID: ${session.user.id}`);

      // Get user's role assignments
      const userAssignments = await prisma.userUnitAssignment.findMany({
        where: { userId: session.user.id },
        select: { roleId: true, role: { select: { name: true } } },
      });

      console.log(`[withAuth] Found ${userAssignments.length} role assignments for user ${session.user.email}:`, userAssignments);

      const roleIds = userAssignments.map((assignment: any) => assignment.roleId);

      // Attach user and auth context to request
      (req as any).user = session.user;
      (req as any).authContext = {
        userId: session.user.id,
        userEmail: session.user.email,
        roleId: roleIds[0] || null,
        roleIds: roleIds,
        roleName: userAssignments.length > 0 ? userAssignments[0].role?.name || null : null,
      };

      console.log(`[withAuth] Successfully authenticated user: ${session.user.email}`);
      console.log(`[withAuth] Auth context:`, {
        userId: session.user.id,
        userEmail: session.user.email,
        roleIds: roleIds,
        roleName: userAssignments.length > 0 ? userAssignments[0].role?.name || null : null
      });

      // Call the handler with context if provided (for API routes with params)
      if (context) {
        return handler(req, context);
      }
      return handler(req);
    } catch (error) {
      console.error('[withAuth] Authentication error:', error);
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 500 }
      );
    }
  });
};

export class AuthMiddleware {
  /**
   * Check if the user has access to a specific resource
   */
  static async checkPermission(
    req: NextRequest,
    resourceType: string,
    resourceId: string,
    action: string
  ): Promise<{ authorized: boolean; error?: string; user?: any }> {
    try {
      const user = (req as any).user;
      const authContext = (req as any).authContext;

      if (!user || !authContext) {
        console.log('[AuthMiddleware] No user or authContext found on request');
        return { authorized: false, error: 'Not authenticated', user: null };
      }

      console.log(`[AuthMiddleware] Checking access for user: ${authContext.userEmail} (ID: ${authContext.userId})`);
      console.log(`[AuthMiddleware] User role IDs: ${authContext.roleIds}`);

      if (resourceType === 'module') {
        console.log(`[AuthMiddleware] Access granted for user ${authContext.userEmail} on module ${resourceId}`);
        return { authorized: true, user };
      }

      return {
        authorized: false,
        error: `Invalid resource type: ${resourceType}`,
        user: user,
      };
    } catch (error) {
      console.error('[AuthMiddleware] Error checking access:', error);
      return {
        authorized: false,
        error: 'Access check failed',
        user: (req as any).user || null,
      };
    }
  }

  /**
   * Filter modules (no permission checks)
   */
  static filterModulesByPermissions(modules: any[]): any[] {
    console.log('[AuthMiddleware] Filtering modules', {
      modulesCount: modules.length,
    });

    const filteredModules = modules
      .map(module => this.filterModuleRecursively(module))
      .filter(Boolean);

    console.log(`[AuthMiddleware] Filtered ${modules.length} modules down to ${filteredModules.length}`);
    return filteredModules;
  }

  /**
   * Recursively filter a module and its children
   */
  private static filterModuleRecursively(module: any): any | null {
    // Include all modules by default (no permission checks)
    const accessibleChildren = (module.children || [])
      .map((child: any) => this.filterModuleRecursively(child))
      .filter(Boolean);

    return {
      ...module,
      children: accessibleChildren,
      forms: module.forms || [], // Include all forms
    };
  }

  /**
   * Check if user has access to a specific module
   */
  static hasModulePermission(moduleId: string): boolean {
    console.log(`[AuthMiddleware] Checking module access for moduleId: ${moduleId}`);
    return true; // Allow access to all modules
  }

  /**
   * Check if user has access to a specific form
   */
  static hasFormPermission(
    formId: string, moduleId: string, id: string, p0: string, action: 'view' | 'create' | 'edit' | 'delete' = 'view'): boolean {
    return this.hasModulePermission(moduleId); // Inherit module access
  }
}

export type { AuthContext };