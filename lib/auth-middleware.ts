import { NextRequest, NextResponse } from 'next/server';
import { validateSession, AuthContext } from './auth';

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

      // Role assignments are ALREADY on the cached session graph
      // (validateSession deep-includes unitAssignments→role), so derive them
      // here instead of firing a fresh per-request DB query. Also dropped the
      // per-request console.log spew (PII + blocking I/O on every call).
      const assignments: any[] = (session.user as any).unitAssignments ?? [];
      const roleIds = assignments
        .map((a) => a.roleId ?? a.role?.id)
        .filter(Boolean);
      const roleName =
        assignments.length > 0 ? assignments[0].role?.name ?? null : null;

      // Attach user and auth context to request
      (req as any).user = session.user;
      (req as any).authContext = {
        userId: session.user.id,
        userEmail: session.user.email,
        roleId: roleIds[0] || null,
        roleIds: roleIds,
        roleName,
      };

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