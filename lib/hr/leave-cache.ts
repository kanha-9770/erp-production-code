/**
 * Cache keys + invalidation for the LeaveType / LeaveRules graph.
 *
 * Two caches share write paths because LeaveRules nest under LeaveType:
 *   - LEAVE_TYPES_KEY:  result of `prisma.leaveType.findMany({ where: { isActive: true } })`
 *   - LEAVE_RULES_KEY:  result of `prisma.leaveType.findMany({ include: { leaveRules: true } })`
 *
 * Both rebuild from Postgres on the next read after invalidation.
 *
 * Call `invalidateLeaveCaches()` from any handler that mutates LeaveType OR
 * LeaveRule rows. Today's known sites:
 *   - POST /api/payroll/leave-type
 *   - PUT /api/leave-rules  (and any other LeaveRule writer)
 */

import { buildKey, cacheInvalidate } from "@/lib/cache";

export const LEAVE_TYPES_KEY = buildKey("hr", "leave-types", "active");
export const LEAVE_RULES_KEY = buildKey("hr", "leave-rules", "active");

export const LEAVE_TYPES_TTL_S = 600;
export const LEAVE_RULES_TTL_S = 600;

export async function invalidateLeaveCaches() {
  await cacheInvalidate("hr", LEAVE_TYPES_KEY, LEAVE_RULES_KEY);
}
