/**
 * Shared API helpers for Next.js route handlers.
 * Centralises repeated patterns: authentication, audit logging,
 * request-meta extraction, and standard JSON responses.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { buildKey, cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string | null;
}

export interface AuditLogParams {
  userId?: string;
  organizationId?: string | null;
  performedBy: string;
  action: string;
  module?: string;
  details?: string;
  ipAddress: string;
  userAgent: string;
  recordId?: string;
  recordName?: string;
}

export interface RequestMeta {
  ipAddress: string;
  userAgent: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

// Request-scoped cache so multiple calls within the same request (handler +
// nested helpers) don't repeat the session lookup. WeakMap keys on the
// request object so entries are garbage-collected with the request.
const authUserCache = new WeakMap<NextRequest, AuthenticatedUser | null>();

/**
 * Reads the auth-token cookie, validates the session, and returns the user
 * record (id, email, organizationId).
 * Returns `null` when the request is unauthenticated or the user is not found.
 *
 * Performance: cached per-request, and reuses the user already loaded by
 * `validateSession` (which does a deep include) instead of re-querying.
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  if (authUserCache.has(request)) {
    return authUserCache.get(request) ?? null;
  }

  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    authUserCache.set(request, null);
    return null;
  }

  const session = await validateSession(token);
  if (!session?.user) {
    authUserCache.set(request, null);
    return null;
  }

  // session.user is already loaded with id/email/organizationId — no second
  // query needed.
  const result: AuthenticatedUser = {
    id: session.user.id,
    email: session.user.email,
    organizationId: session.user.organizationId ?? null,
  };
  authUserCache.set(request, result);
  return result;
}

/**
 * Returns `true` if the user should be treated as an administrator.
 * This is the single source of truth for admin-detection on the server
 * and matches the logic used by /api/auth/me and the client-side hooks:
 *   1. User owns the organization, OR
 *   2. Any of the user's assigned roles has `is_admin = true`, OR
 *   3. Any of the user's assigned role names contains "admin" (case-insensitive)
 *
 * Do NOT rely on a strict `role.name === "ADMIN"` comparison anywhere — it
 * silently misses org owners, roles flagged via `isAdmin`, and roles whose
 * names differ in case/spelling (e.g. "Administrator", "Super Admin").
 */
// `isUserAdmin` is called from ~90 server call sites and previously hit the DB
// (org lookup + role JOIN) on EVERY one — the single largest avoidable Postgres
// load. Admin status changes rarely, so a short two-tier cache removes almost
// all of it. TTLs are deliberately SHORT: a stale `true` keeps elevated access,
// which is the unsafe direction, so we bound staleness to ≤60s. Role-mutation
// paths should call `invalidateAdminCache(userId)` for instant propagation.
//
// Key includes organizationId because the org-owner check is org-scoped — a
// call with org=null must not poison a later call that passes the org.
const isAdminL1 = new Map<string, { value: boolean; cachedAt: number }>();
const IS_ADMIN_L1_TTL_MS = 30_000;
const IS_ADMIN_REDIS_TTL_S = 60;
const isAdminCacheKey = (userId: string, organizationId?: string | null) =>
  `${userId}|${organizationId ?? ""}`;
const isAdminRedisKey = (userId: string, organizationId?: string | null) =>
  buildKey("auth", "is-admin", isAdminCacheKey(userId, organizationId));

export async function isUserAdmin(
  userId: string,
  organizationId?: string | null
): Promise<boolean> {
  if (!userId) return false;
  const k = isAdminCacheKey(userId, organizationId);

  // L1 — in-process
  const l1 = isAdminL1.get(k);
  if (l1 && Date.now() - l1.cachedAt < IS_ADMIN_L1_TTL_MS) return l1.value;

  // L2 — Redis (null on miss OR error → fall through to DB)
  const l2 = await cacheGet<{ value: boolean }>(
    "auth",
    isAdminRedisKey(userId, organizationId)
  );
  if (l2) {
    isAdminL1.set(k, { value: l2.value, cachedAt: Date.now() });
    return l2.value;
  }

  // L3 — Postgres (source of truth)
  const [organization, roles] = await Promise.all([
    organizationId
      ? prisma.organization.findUnique({
          where: { id: organizationId },
          select: { ownerId: true },
        })
      : Promise.resolve(null),
    prisma.$queryRaw<{ role_name: string; is_admin: boolean }[]>`
      SELECT r.name AS role_name, r.is_admin AS is_admin
      FROM user_unit_assignments uua
      JOIN roles r ON r.id = uua.role_id
      WHERE uua.user_id = ${userId}
    `,
  ]);

  const value =
    organization?.ownerId === userId ||
    roles.some(
      (r) =>
        r.is_admin === true ||
        (r.role_name ?? "").toLowerCase().includes("admin")
    );

  isAdminL1.set(k, { value, cachedAt: Date.now() });
  void cacheSet(
    "auth",
    isAdminRedisKey(userId, organizationId),
    { value },
    IS_ADMIN_REDIS_TTL_S
  );
  return value;
}

/**
 * Drops the cached admin flag for a user (both tiers, all org keys seen on this
 * process). Call from any handler that assigns/removes roles or transfers org
 * ownership so a promotion/demotion takes effect immediately instead of waiting
 * out the ≤60s TTL.
 */
export async function invalidateAdminCache(userId: string): Promise<void> {
  for (const key of Array.from(isAdminL1.keys())) {
    if (key.startsWith(`${userId}|`)) isAdminL1.delete(key);
  }
  // Best-effort Redis clear for the common (userId, org) and (userId, null) keys.
  await Promise.allSettled([
    cacheInvalidate("auth", isAdminRedisKey(userId, null)),
  ]);
}

// Permission rows are looked up by name on every `hasFormPermission` call.
// Permission.name is globally unique in the schema, so a two-tier cache is
// safe AND fast:
//
//   L1: in-process Map (sub-microsecond). Keeps a process hot without
//       touching the network. 60s TTL.
//   L2: Redis / Upstash (~5-50ms over the wire). Shared across all Node
//       instances, so a new process starts warm. 5min TTL.
//   L3: Postgres `permissions` table — source of truth.
//
// A freshly-created permission propagates within 60s on the same process and
// 5min across the cluster. A deleted permission only delays "no access",
// which is the safe direction. Write paths that mutate Permission rows
// should call `invalidatePermissionCache(name)` to drop both tiers.
const permissionIdByNameCache = new Map<
  string,
  { id: string | null; cachedAt: number }
>();
const PERMISSION_ID_TTL_MS = 60_000;
const PERMISSION_ID_REDIS_TTL_S = 300;

// Auth-namespace key. Today shares the default Upstash DB; the day you add
// REDIS_URL_AUTH to .env it transparently moves to a dedicated DB.
const permissionIdKey = (name: string) =>
  buildKey("auth", "perm-id", name);

export async function getPermissionIdByName(name: string): Promise<string | null> {
  const target = name.toUpperCase();

  // L1 — in-process
  const l1 = permissionIdByNameCache.get(target);
  if (l1 && Date.now() - l1.cachedAt < PERMISSION_ID_TTL_MS) {
    return l1.id;
  }

  // L2 — Redis (returns null on miss OR on Redis error — both fall through)
  const l2 = await cacheGet<{ id: string | null }>("auth", permissionIdKey(target));
  if (l2) {
    permissionIdByNameCache.set(target, { id: l2.id, cachedAt: Date.now() });
    return l2.id;
  }

  // L3 — Postgres
  const row = await prisma.permission.findFirst({
    where: { name: target },
    select: { id: true },
  });
  const id = row?.id ?? null;

  // Populate both tiers (fire-and-forget L2 write)
  permissionIdByNameCache.set(target, { id, cachedAt: Date.now() });
  void cacheSet("auth", permissionIdKey(target), { id }, PERMISSION_ID_REDIS_TTL_S);

  return id;
}

/**
 * Clears the cached permission-id for a name from both tiers. Call this from
 * any handler that creates, updates, or deletes a Permission row.
 *
 *   await prisma.permission.update({ where: { id }, data: { name: newName } });
 *   await invalidatePermissionCache(oldName);
 *   await invalidatePermissionCache(newName);
 */
export async function invalidatePermissionCache(name: string): Promise<void> {
  const target = name.toUpperCase();
  permissionIdByNameCache.delete(target);
  await cacheInvalidate("auth", permissionIdKey(target));
}

/**
 * Returns `true` if the user has `permissionName` on the given form, merging
 * role-level and user-level rows. Mirrors the form-level check used by the
 * client (`hasPermissionForForm`) so the server behaves consistently.
 *
 *  - Admins always pass.
 *  - An active user-level deny (granted:false) overrides a role grant.
 *  - An active user-level grant, or any role grant on the form (or
 *    module-level row with no formId), returns true.
 *
 * Performance: the permission row is fetched from a 60s in-memory cache, and
 * the (permission lookup) and (role assignments lookup) run in parallel
 * since they're independent.
 */
export async function hasFormPermission(
  userId: string,
  organizationId: string | null,
  formId: string,
  permissionName: string,
): Promise<boolean> {
  if (!userId || !formId || !permissionName) return false;
  if (await isUserAdmin(userId, organizationId)) return true;

  // Permission lookup (cached) and assignments lookup are independent — run in
  // parallel so the slower of the two determines latency, not their sum.
  const [permissionId, assignments] = await Promise.all([
    getPermissionIdByName(permissionName),
    prisma.userUnitAssignment.findMany({
      where: { userId },
      select: { roleId: true },
    }),
  ]);
  if (!permissionId) return false;

  // Active user-level overrides for this permission + form-level scope
  const userOverrides = await prisma.userPermission.findMany({
    where: {
      userId,
      permissionId,
      isActive: true,
      resourceType: null,
      resourceId: null,
      OR: [{ formId }, { formId: null }],
    },
    select: { granted: true },
  });
  if (userOverrides.some((o) => o.granted === false)) return false;
  if (userOverrides.some((o) => o.granted === true)) return true;

  const roleIds = assignments.map((a) => a.roleId);
  if (roleIds.length === 0) return false;

  const rolePerm = await prisma.rolePermission.findFirst({
    where: {
      roleId: { in: roleIds },
      permissionId,
      granted: true,
      sectionId: null,
      formFieldId: null,
      OR: [{ formId }, { formId: null }],
    },
    select: { id: true },
  });
  return !!rolePerm;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request meta
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the client IP address and User-Agent from a request.
 */
export function getRequestMeta(request: NextRequest): RequestMeta {
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return { ipAddress, userAgent };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Writes an audit log entry.  Never throws – failures are logged to console
 * so they never interrupt the main request flow.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  const {
    userId,
    organizationId,
    performedBy,
    action,
    module = "System",
    details,
    ipAddress,
    userAgent,
    recordId,
    recordName,
  } = params;

  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        organizationId: organizationId ?? null,
        performedBy,
        action,
        module,
        details: details ?? null,
        ipAddress,
        userAgent,
        recordId: recordId ?? null,
        recordName: recordName ?? null,
      },
    });
    console.log(`Audit log: ${action} "${recordName ?? recordId ?? ""}" by ${performedBy}`);
  } catch (err) {
    console.error("Audit logging failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard JSON responses
// ─────────────────────────────────────────────────────────────────────────────

/** 200 success response */
export function apiSuccess<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ success: true, data, ...(meta ? { meta } : {}) });
}

/** Error response with configurable status */
export function apiError(message: string, status: number = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** 401 Unauthorized */
export const unauthorized = () => apiError("Not authenticated", 401);

/** 403 Forbidden */
export const forbidden = (msg = "Forbidden") => apiError(msg, 403);

/** 404 Not Found */
export const notFound = (msg = "Not found") => apiError(msg, 404);
