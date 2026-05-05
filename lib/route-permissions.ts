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
  { pattern: "/settings/trash", requireAdmin: true },

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
 * Calculate the specificity score of a route pattern.
 * Higher score = more specific pattern.
 *
 * Scoring rules:
 *  - Exact path (no wildcards): 1000 + number of segments
 *  - Single wildcard (*):       500  + number of literal segments
 *  - Double wildcard (**):      100  + number of literal segments
 *  - Longer literal paths are always more specific than shorter ones
 *
 * Example:
 *  "/profile/update-profile" → 1002 (exact, 2 segments)
 *  "/profile"                → 1001 (exact, 1 segment)
 *  "/profile/*"              → 502  (single wildcard, 2 parts)
 *  "/profile/**"             → 101  (double wildcard, 1 literal segment)
 *  "/**"                     → 100  (double wildcard, 0 literal segments)
 */
export function patternSpecificity(pattern: string): number {
  const segments = pattern.split("/").filter(Boolean);
  const hasDoubleWild = pattern.includes("**");
  const hasSingleWild = !hasDoubleWild && pattern.includes("*");
  const literalSegments = segments.filter((s) => !s.includes("*")).length;

  if (hasDoubleWild) return 100 + literalSegments;
  if (hasSingleWild) return 500 + literalSegments;
  return 1000 + segments.length; // exact match
}

/**
 * Resolve route access using specificity-based matching.
 *
 * Given a pathname and two arrays of route patterns (allowed & denied),
 * finds the MOST SPECIFIC matching pattern across both lists.
 * The most specific match determines the outcome.
 * If two patterns have the same specificity, deny wins (secure-by-default).
 *
 * Returns:
 *  - true  → allowed (most specific match was in allowedRoutes)
 *  - false → denied  (most specific match was in deniedRoutes)
 *  - null  → no rule matched (caller decides default behavior)
 *
 * Example:
 *  allowed: ["/profile"]              ← specificity 1001
 *  denied:  ["/profile/update-profile"] ← specificity 1002 (wins!)
 *  pathname: "/profile/update-profile"
 *  → result: false (denied, because the more specific pattern says deny)
 */
export function resolveRouteAccess(
  pathname: string,
  allowedRoutes: string[],
  deniedRoutes: string[]
): boolean | null {
  let bestSpecificity = -1;
  let bestResult: boolean | null = null;

  // Check all allowed patterns
  for (const pattern of allowedRoutes) {
    if (patternToRegex(pattern).test(pathname)) {
      const spec = patternSpecificity(pattern);
      if (spec > bestSpecificity) {
        bestSpecificity = spec;
        bestResult = true;
      }
    }
  }

  // Check all denied patterns
  for (const pattern of deniedRoutes) {
    if (patternToRegex(pattern).test(pathname)) {
      const spec = patternSpecificity(pattern);
      // Deny wins on tie (>= instead of >)
      if (spec >= bestSpecificity) {
        bestSpecificity = spec;
        bestResult = false;
      }
    }
  }

  return bestResult;
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
