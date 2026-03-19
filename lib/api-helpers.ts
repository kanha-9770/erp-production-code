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
