import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface UserWithRoles {
  id: string;
  email: string;
  status: string;
  unitAssignments: Array<{
    id: string;
    unitId: string;
    roleId: string;
    role: {
      id: string;
      name: string;
      isAdmin: boolean;
      isActive: boolean;
    };
    unit: {
      id: string;
      name: string;
      isActive: boolean;
    };
  }>;
}

/**
 * Check if user has admin role from any of their unit assignments
 */
export async function checkUserAdminRole(userId: string): Promise<boolean> {
  try {
    console.log(`[checkUserAdminRole] Checking admin role for userId: ${userId}`);
    
    const userWithRoles = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        unitAssignments: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                isAdmin: true,
                isActive: true,
              },
            },
            unit: {
              select: {
                id: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!userWithRoles) {
      console.log(`[checkUserAdminRole] User not found: ${userId}`);
      return false;
    }

    // Check if user has any active admin role assignments
    const hasAdminRole = userWithRoles.unitAssignments.some(
      (assignment) =>
        assignment.role.isAdmin &&
        assignment.role.isActive &&
        assignment.unit.isActive
    );

    console.log(`[checkUserAdminRole] User ${userId} admin status: ${hasAdminRole}`);
    
    if (hasAdminRole) {
      const adminRoles = userWithRoles.unitAssignments
        .filter(a => a.role.isAdmin && a.role.isActive && a.unit.isActive)
        .map(a => a.role.name);
      console.log(`[checkUserAdminRole] Admin roles: ${adminRoles.join(', ')}`);
    }

    return hasAdminRole;
  } catch (error) {
    console.error('[checkUserAdminRole] Error checking admin role:', error);
    return false;
  }
}

/**
 * Get user's active roles
 */
export async function getUserActiveRoles(userId: string): Promise<Array<{
  roleId: string;
  roleName: string;
  isAdmin: boolean;
  unitId: string;
  unitName: string;
}>> {
  try {
    const userWithRoles = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        unitAssignments: {
          where: {
            role: { isActive: true },
            unit: { isActive: true },
          },
          include: {
            role: true,
            unit: true,
          },
        },
      },
    });

    if (!userWithRoles) {
      return [];
    }

    return userWithRoles.unitAssignments.map((assignment) => ({
      roleId: assignment.role.id,
      roleName: assignment.role.name,
      isAdmin: assignment.role.isAdmin,
      unitId: assignment.unit.id,
      unitName: assignment.unit.name,
    }));
  } catch (error) {
    console.error('[getUserActiveRoles] Error getting user roles:', error);
    return [];
  }
}

/**
 * Route configuration types
 */
export interface RouteConfig {
  publicRoutes: string[];
  protectedRoutes: string[];
  adminRoutes: string[];
  moduleRoutes: string[];
}

/**
 * Default route configuration
 */
export const defaultRouteConfig: RouteConfig = {
  // Routes that don't require authentication
  publicRoutes: [
    '/',
    '/login',
    '/register',
    '/verify-otp',
    '/forgot-password',
    '/reset-password',
    '/unauthorized',
  ],
  
  // Routes that require authentication but not admin role
  protectedRoutes: [
    '/profile',
    '/dashboard',
    '/settings',
  ],
  
  // Routes that require admin role
  adminRoutes: [
    '/admin',
    '/admin/users',
    '/admin/roles',
    '/admin/permissions',
    '/admin/roles-permissions',
    '/admin/organization',
    '/admin/units',
    '/admin/settings',
  ],
  
  // Routes that require module-specific permissions
  moduleRoutes: [
    '/sales',
    '/inventory',
    '/hr',
    '/finance',
    '/reports',
  ],
};

/**
 * Check if path matches any route pattern
 */
export function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => {
    if (route.endsWith('*')) {
      // Wildcard matching
      return pathname.startsWith(route.slice(0, -1));
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  });
}

/**
 * Determine route type for a given pathname
 */
export function getRouteType(pathname: string, config: RouteConfig = defaultRouteConfig): 
  'public' | 'protected' | 'admin' | 'module' | 'unknown' {
  
  if (matchesRoute(pathname, config.publicRoutes)) {
    return 'public';
  }
  
  if (matchesRoute(pathname, config.adminRoutes)) {
    return 'admin';
  }
  
  if (matchesRoute(pathname, config.protectedRoutes)) {
    return 'protected';
  }
  
  if (matchesRoute(pathname, config.moduleRoutes)) {
    return 'module';
  }
  
  return 'unknown';
}