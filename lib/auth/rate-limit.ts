/**
 * Rate limiting + account lockout for auth endpoints.
 *
 * Two layers, composed together at every sensitive endpoint:
 *
 *  1. Per-IP throttle — a fixed-window counter held in process memory. Stops
 *     the obvious attacks (one bot rotating thousands of emails) without
 *     touching the DB. Resets on server restart, which is fine for this layer
 *     because attacks worth blocking generate many requests per second; the
 *     window is short.
 *
 *  2. Per-account lockout — derived from `LoginHistory.status='Failed'` rows
 *     in the last LOCKOUT_WINDOW_MINUTES. After LOCKOUT_THRESHOLD attempts on
 *     the same email/userId, the account is locked for LOCKOUT_DURATION_MIN.
 *     No schema changes required: we already write a row per failure.
 *
 * Usage at the top of an auth handler:
 *
 *     const ipGate = checkIpRate(ipAddress, 'login');
 *     if (!ipGate.allowed) return rateLimitResponse(ipGate);
 *
 *     const acctGate = await checkAccountLockout(email);
 *     if (!acctGate.allowed) return rateLimitResponse(acctGate);
 *
 * On a successful auth, call `clearIpFailures(ipAddress, 'login')` so honest
 * clients aren't penalised by their previous typos.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Tuning knobs — keep these conservative; users will hit them rarely.
// ─────────────────────────────────────────────────────────────────────────────

export const IP_LIMITS: Record<string, { max: number; windowMs: number }> = {
  // Heavy fan-out targets
  login: { max: 10, windowMs: 60_000 },           // 10 / minute
  'verify-otp': { max: 8, windowMs: 60_000 },     // 8 attempts/minute
  'forgot-password': { max: 5, windowMs: 60_000 },// 5 resets/minute
  register: { max: 6, windowMs: 60_000 },         // 6 / minute
  'resend-otp': { max: 3, windowMs: 60_000 },     // 3 / minute
  'reset-password': { max: 6, windowMs: 60_000 }, // 6 / minute
  'change-password': { max: 5, windowMs: 60_000 },// 5 / minute
  default: { max: 30, windowMs: 60_000 },
};

export const LOCKOUT_THRESHOLD = 5;        // failed attempts
export const LOCKOUT_WINDOW_MIN = 15;      // counted within this window
export const LOCKOUT_DURATION_MIN = 15;    // lockout lasts this long

// ─────────────────────────────────────────────────────────────────────────────
// In-memory per-IP counter
// ─────────────────────────────────────────────────────────────────────────────

interface Bucket {
  count: number;
  resetAt: number;
}

// Module-level Map so the counter survives across requests within one Node
// process. Multi-instance deployments need Redis; documented in the README.
const buckets = new Map<string, Bucket>();

// Lazy GC — only sweep when the map gets noisy.
function maybeSweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'ip' | 'account'; retryAfterSec: number; message: string };

/**
 * Checks the per-IP rate limit for a named endpoint and increments the counter.
 * Pass an `ipAddress` of "unknown" if you can't extract one — it'll still
 * work but all unknown-IP traffic shares a single bucket.
 */
export function checkIpRate(ipAddress: string, endpoint: string): RateLimitResult {
  const cfg = IP_LIMITS[endpoint] ?? IP_LIMITS.default;
  const now = Date.now();
  const key = `${endpoint}:${ipAddress || 'unknown'}`;

  maybeSweep(now);

  const cur = buckets.get(key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + cfg.windowMs });
    return { allowed: true };
  }

  cur.count += 1;
  if (cur.count > cfg.max) {
    const retryAfterSec = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
    return {
      allowed: false,
      reason: 'ip',
      retryAfterSec,
      message: `Too many requests. Try again in ${retryAfterSec} second${retryAfterSec === 1 ? '' : 's'}.`,
    };
  }
  return { allowed: true };
}

/** Reset the IP counter for an endpoint — call after a successful auth. */
export function clearIpFailures(ipAddress: string, endpoint: string) {
  buckets.delete(`${endpoint}:${ipAddress || 'unknown'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-account lockout (DB-backed via LoginHistory)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns lockout status for the given email/userId based on recent failed
 * LoginHistory rows. We treat 5+ Failed rows in the last 15 minutes as a
 * lock; the lock applies for 15 minutes from the most-recent failure.
 *
 * Pass either `email` (anonymous attempts before user lookup) or `userId`
 * (after user lookup). Both work because LoginHistory stores both columns.
 */
export async function checkAccountLockout(opts: {
  email?: string;
  userId?: string;
}): Promise<RateLimitResult> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000);
  const where: any = { status: 'Failed', createdAt: { gte: since } };
  if (opts.userId) where.userId = opts.userId;
  else if (opts.email) where.email = opts.email;
  else return { allowed: true };

  const recent = await prisma.loginHistory.findMany({
    where,
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: LOCKOUT_THRESHOLD + 5,
  });

  if (recent.length < LOCKOUT_THRESHOLD) return { allowed: true };

  // Lockout window starts at the most-recent failure + LOCKOUT_DURATION_MIN.
  const last = recent[0].createdAt.getTime();
  const unlocksAt = last + LOCKOUT_DURATION_MIN * 60_000;
  const now = Date.now();
  if (unlocksAt <= now) return { allowed: true };

  const retryAfterSec = Math.ceil((unlocksAt - now) / 1000);
  const mins = Math.ceil(retryAfterSec / 60);
  return {
    allowed: false,
    reason: 'account',
    retryAfterSec,
    message: `Too many failed attempts. This account is temporarily locked. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
  };
}

/**
 * Standard 429 response shape. Includes `Retry-After` header so honest
 * clients (and our own UI countdown) can show a precise wait time.
 */
export function rateLimitResponse(
  result: Extract<RateLimitResult, { allowed: false }>,
) {
  return NextResponse.json(
    {
      error: result.message,
      code: result.reason === 'ip' ? 'RATE_LIMITED' : 'ACCOUNT_LOCKED',
      retryAfter: result.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSec),
        'Cache-Control': 'no-store',
      },
    },
  );
}
