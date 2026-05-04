/**
 * In-process rate limiter for attendance punches.
 *
 * Goal: catch accidental double-tap, browser-extension retries, and casual
 * scripted abuse. Tracks the last-accepted punch wall time per user keyed
 * `${userId}|${type}`. The map is bounded by a soft TTL (1 hour) so it
 * doesn't grow unbounded over a long-running process.
 *
 * Cross-instance scope: this is per-process. Two web servers behind a
 * load balancer will each rate-limit independently — fine for accidental
 * double-tap (same client tends to hit the same instance) but not a
 * defence against a determined attacker. For that, swap the `store`
 * implementation here for ioredis-backed `INCR` + `EXPIRE`.
 *
 * Idempotent retries (same `Idempotency-Key` on the row) bypass entirely;
 * the caller checks for that BEFORE calling `acquireSlot`.
 */

interface SlotRecord {
  at: number;
}

const MAX_AGE_MS = 60 * 60 * 1000; // 1h
const MAX_ENTRIES = 10_000;

declare global {
  // eslint-disable-next-line no-var
  var __attendancePunchRate:
    | { store: Map<string, SlotRecord>; lastSweepAt: number }
    | undefined;
}

const state =
  globalThis.__attendancePunchRate ??
  ({ store: new Map<string, SlotRecord>(), lastSweepAt: 0 } as {
    store: Map<string, SlotRecord>;
    lastSweepAt: number;
  });
if (!globalThis.__attendancePunchRate) {
  globalThis.__attendancePunchRate = state;
}

function sweepIfStale(now: number) {
  // Sweep at most once a minute. Removes entries older than MAX_AGE_MS.
  if (now - state.lastSweepAt < 60_000) return;
  state.lastSweepAt = now;
  for (const [key, rec] of state.store.entries()) {
    if (now - rec.at > MAX_AGE_MS) state.store.delete(key);
  }
  // Hard cap as a safety net — drop the oldest if we somehow blew past
  // MAX_ENTRIES. Sorted Array.from is O(n log n); we only do it on overflow.
  if (state.store.size > MAX_ENTRIES) {
    const sorted = Array.from(state.store.entries()).sort((a, b) => a[1].at - b[1].at);
    const drop = sorted.length - MAX_ENTRIES;
    for (let i = 0; i < drop; i++) state.store.delete(sorted[i][0]);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  cooldownMs: number;
}

/**
 * Attempt to acquire a punch slot. Returns `allowed: false` if the previous
 * accepted punch for the same (user, type) tuple was within `cooldownMs`.
 * Caller commits the slot via `commitSlot` after the punch actually persists,
 * so a punch that fails for some other reason (e.g. geofence) doesn't burn
 * the cooldown.
 */
export function acquireSlot(
  userId: string,
  type: 'IN' | 'OUT',
  cooldownMs: number,
  now: number = Date.now(),
): RateLimitResult {
  if (cooldownMs <= 0) return { allowed: true, retryAfterMs: 0, cooldownMs };
  sweepIfStale(now);
  const key = `${userId}|${type}`;
  const rec = state.store.get(key);
  if (!rec) return { allowed: true, retryAfterMs: 0, cooldownMs };
  const elapsed = now - rec.at;
  if (elapsed >= cooldownMs) {
    return { allowed: true, retryAfterMs: 0, cooldownMs };
  }
  return { allowed: false, retryAfterMs: cooldownMs - elapsed, cooldownMs };
}

export function commitSlot(
  userId: string,
  type: 'IN' | 'OUT',
  now: number = Date.now(),
): void {
  state.store.set(`${userId}|${type}`, { at: now });
}
