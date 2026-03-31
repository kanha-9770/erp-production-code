/**
 * Route-Permission Configuration
 *
 * Single source of truth mapping route patterns to permission requirements.
 * Used by middleware (lightweight checks) and server layouts (authoritative checks).
 */

export interface RoutePermissionRule {
  /** Glob-style path pattern, e.g. "/admin/**" or "/settings/roles" */
  pattern: string;
  /** If true, only users with isAdmin role can access */
  requireAdmin?: boolean;
  /** Permission name(s) — user needs at least one of these */
  requiredPermissions?: string[];
  /** Redirect path on denial (defaults to "/unauthorized") */
  redirectTo?: string;
}

export const routePermissions: RoutePermissionRule[] = [
  // Admin routes — require admin role
  { pattern: "/admin/**", requireAdmin: true },
  { pattern: "/builder/**", requireAdmin: true },
  { pattern: "/data-migration/**", requireAdmin: true },

  // Settings routes — admin-only
  { pattern: "/settings/roles", requireAdmin: true },
  { pattern: "/settings/users/**", requireAdmin: true },
  { pattern: "/settings/profiles", requireAdmin: true },

  // Settings routes — require specific permissions
  { pattern: "/settings/audit-log", requiredPermissions: ["VIEW_AUDIT_LOG"] },
  { pattern: "/settings/company", requiredPermissions: ["MANAGE_COMPANY"] },
  { pattern: "/settings/import", requiredPermissions: ["IMPORT_DATA"] },
  { pattern: "/settings/masters", requiredPermissions: ["MANAGE_MASTERS"] },
  { pattern: "/settings/login-history", requiredPermissions: ["VIEW_LOGIN_HISTORY"] },

  // Feature routes
  { pattern: "/payroll", requiredPermissions: ["VIEW_PAYROLL", "MANAGE_PAYROLL"] },
];

/**
 * Convert a glob pattern to a RegExp.
 * Supports:
 *  - `**` matches any path segments (including nested)
 *  - `*`  matches a single path segment
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex special chars (except * and ?)
    .replace(/\*\*/g, "§DOUBLESTAR§")       // placeholder for **
    .replace(/\*/g, "[^/]+")                // * = single segment
    .replace(/§DOUBLESTAR§/g, ".*");        // ** = any segments

  return new RegExp(`^${escaped}$`);
}

/**
 * Match a pathname against the route permission rules.
 * Returns the first matching rule, or null if no rule matches.
 */
export function matchRoute(pathname: string): RoutePermissionRule | null {
  for (const rule of routePermissions) {
    const regex = patternToRegex(rule.pattern);
    if (regex.test(pathname)) {
      return rule;
    }
  }
  return null;
}
