/**
 * Resolves whether the "late check-in counts as half-day" rule applies to a
 * specific employee, given the org's Attendance Configuration.
 *
 * Policy (admin-configurable, mirrors the Route Permissions model):
 *   • Master switch `lateHalfDay` OFF  → rule never applies. Lateness is info
 *     only; the day is judged purely on hours worked.
 *   • Master switch ON                 → rule applies to EVERYONE by default,
 *     minus explicit exceptions:
 *       1. A per-user override always wins:
 *            - in `lateHalfDayIncludedUserIds` → applies (even if their role
 *              is excluded)
 *            - in `lateHalfDayExcludedUserIds` → does NOT apply
 *       2. Otherwise, if ANY of the user's roles is in
 *          `lateHalfDayExcludedRoleIds` → does NOT apply (exclusion wins so a
 *          user in a mix of excluded + normal roles stays lenient).
 *       3. Otherwise → applies.
 *
 * The result is fed straight into `computeEffectiveStatus`'s `lateHalfDay`
 * threshold, so the classifier itself stays role-agnostic — every consumer
 * (Team / My / History badges, and later payroll) just resolves the per-user
 * boolean here and passes it through.
 */

import type { AttendanceConfig } from './attendance-config';

export interface LateHalfDayScope {
  /** Master switch. When false the rule is globally off. */
  lateHalfDay: boolean;
  lateHalfDayExcludedRoleIds: string[];
  lateHalfDayExcludedUserIds: string[];
  lateHalfDayIncludedUserIds: string[];
}

/**
 * Decide whether a late check-in should cost this user a half-day.
 *
 * @param scope     The org's resolved config (the AttendanceConfig satisfies
 *                  this shape directly).
 * @param userId    The user the attendance row belongs to (may be null/empty
 *                  for legacy rows — treated as "no per-user override").
 * @param roleIds   The user's role IDs (from UserUnitAssignment). Empty when
 *                  unknown — then only the master switch + user overrides apply.
 */
export function lateHalfDayAppliesTo(
  scope: LateHalfDayScope,
  userId: string | null | undefined,
  roleIds: readonly string[] | null | undefined,
): boolean {
  // Master switch off → rule never fires.
  if (!scope.lateHalfDay) return false;

  // Per-user override wins over everything else.
  if (userId) {
    if (scope.lateHalfDayIncludedUserIds.includes(userId)) return true;
    if (scope.lateHalfDayExcludedUserIds.includes(userId)) return false;
  }

  // Role-level exclusion: if the user sits in any excluded role, the rule is
  // off for them. Exclusion wins for users spanning multiple roles.
  if (roleIds && roleIds.length > 0 && scope.lateHalfDayExcludedRoleIds.length > 0) {
    for (const rid of roleIds) {
      if (scope.lateHalfDayExcludedRoleIds.includes(rid)) return false;
    }
  }

  // Default under master-ON: rule applies.
  return true;
}

/** Narrow an AttendanceConfig to just the late-half-day scope fields. */
export function lateHalfDayScopeOf(cfg: AttendanceConfig): LateHalfDayScope {
  return {
    lateHalfDay: cfg.lateHalfDay,
    lateHalfDayExcludedRoleIds: cfg.lateHalfDayExcludedRoleIds,
    lateHalfDayExcludedUserIds: cfg.lateHalfDayExcludedUserIds,
    lateHalfDayIncludedUserIds: cfg.lateHalfDayIncludedUserIds,
  };
}
