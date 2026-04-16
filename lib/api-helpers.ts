/**
 * Shared API helpers for Next.js route handlers.
 * Centralises repeated patterns: authentication, audit logging,
 * request-meta extraction, and standard JSON responses.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

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

/**
 * Reads the auth-token cookie, validates the session, and returns the user
 * record (id, email, organizationId) from the database.
 * Returns `null` when the request is unauthenticated or the user is not found.
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return null;

  const session = await validateSession(token);
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, organizationId: true },
  });

  return user ?? null;
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
export async function isUserAdmin(
  userId: string,
  organizationId?: string | null
): Promise<boolean> {
  if (!userId) return false;

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

  if (organization?.ownerId === userId) return true;

  return roles.some(
    (r) =>
      r.is_admin === true ||
      (r.role_name ?? "").toLowerCase().includes("admin")
  );
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
 */
export async function hasFormPermission(
  userId: string,
  organizationId: string | null,
  formId: string,
  permissionName: string,
): Promise<boolean> {
  if (!userId || !formId || !permissionName) return false;
  if (await isUserAdmin(userId, organizationId)) return true;

  const target = permissionName.toUpperCase();

  // Permission row (by name, scoped to `form` resource)
  const permission = await prisma.permission.findFirst({
    where: { name: target },
    select: { id: true },
  });
  if (!permission) return false;

  // Active user-level overrides for this permission + form-level scope
  const userOverrides = await prisma.userPermission.findMany({
    where: {
      userId,
      permissionId: permission.id,
      isActive: true,
      resourceType: null,
      resourceId: null,
      OR: [{ formId }, { formId: null }],
    },
    select: { granted: true },
  });
  if (userOverrides.some((o) => o.granted === false)) return false;
  if (userOverrides.some((o) => o.granted === true)) return true;

  // Role-level rows for any of the user's assigned roles
  const assignments = await prisma.userUnitAssignment.findMany({
    where: { userId },
    select: { roleId: true },
  });
  const roleIds = assignments.map((a) => a.roleId);
  if (roleIds.length === 0) return false;

  const rolePerm = await prisma.rolePermission.findFirst({
    where: {
      roleId: { in: roleIds },
      permissionId: permission.id,
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
