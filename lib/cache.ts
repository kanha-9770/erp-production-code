/**
 * Namespace-aware cache helpers on top of `lib/redis.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KEY SHAPE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   erp:v{N}:{namespace}:{entity}:{id}[:{variant}]
 *
 *   - `erp:`             app-wide prefix (lets one Upstash DB host several apps)
 *   - `v{N}:`            schema/shape version — bump to invalidate ALL cached
 *                        values when the value format changes
 *   - `{namespace}:`     service area (auth / forms / hr / ...)
 *   - `{entity}:`        resource type (user / permission-id / form / ...)
 *   - `{id}`             primary key
 *   - `:{variant}`       optional (e.g., `:v2`, `:locale-en`)
 *
 *   Examples:
 *     erp:v1:auth:perm-id:VIEW
 *     erp:v1:forms:full:cln3a8x9b0001
 *     erp:v1:hr:employee-summary:cln4z1a2c0009
 *
 * Use `key(namespace, entity, id)` so this shape stays consistent everywhere.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BEST PRACTICES BAKED IN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. Every operation is error-swallowing. A Redis outage NEVER bubbles up.
 * 2. TTL is required on every `cacheSet` call (no infinite keys by default).
 * 3. Big-value guard: values > 256KB log a warning. Upstash free tier maxes
 *    at 1MB per value; large objects waste bandwidth and slow round-trips.
 * 4. `cached()` is fire-and-forget on the write side — the request returns
 *    immediately after computing; cache population happens async.
 * 5. `cachedSWR()` (stale-while-revalidate) for hot keys where freshness
 *    matters less than instant response.
 * 6. `cacheMget()` for batch reads — one round-trip instead of N.
 * 7. Cache-version constant — bump when value shape changes to invalidate
 *    everything without manual key deletion.
 */

import type Redis from "ioredis";
import { getRedis, type Namespace } from "./redis";

// Bump this when the shape of cached values changes app-wide. Every cached
// key carries this prefix so a single bump invalidates the whole cache.
const CACHE_VERSION = "v1";
const APP_PREFIX = "erp";
const KEY_SEP = ":";

const MAX_VALUE_BYTES = 256 * 1024; // 256 KB — warn above this

// ─────────────────────────────────────────────────────────────────────────────
// Key builder — use everywhere, never concatenate keys by hand
// ─────────────────────────────────────────────────────────────────────────────

export function buildKey(
  namespace: Namespace,
  entity: string,
  id: string,
  variant?: string
): string {
  const base = [APP_PREFIX, CACHE_VERSION, namespace, entity, id].join(KEY_SEP);
  return variant ? `${base}${KEY_SEP}${variant}` : base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level operations
// ─────────────────────────────────────────────────────────────────────────────

function logErr(op: string, key: string, err: any) {
  if (process.env.NODE_ENV !== "test") {
    console.error(`[cache:${op}] "${key}" — ${err?.message ?? err}`);
  }
}

export async function cacheGet<T>(
  namespace: Namespace,
  key: string
): Promise<T | null> {
  const client = getRedis(namespace);
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logErr("get", key, err);
    return null;
  }
}

export async function cacheSet<T>(
  namespace: Namespace,
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  if (ttlSeconds <= 0) {
    console.warn(`[cache:set] "${key}" — refusing to set without a TTL`);
    return;
  }
  const client = getRedis(namespace);
  if (!client) return;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_VALUE_BYTES) {
      console.warn(
        `[cache:set] "${key}" is large (${(serialized.length / 1024).toFixed(1)} KB) — consider splitting or omitting from cache`
      );
    }
    await client.setex(key, ttlSeconds, serialized);
  } catch (err) {
    logErr("set", key, err);
  }
}

/**
 * Get-or-compute. Standard pattern:
 *
 *   const form = await cached("forms", buildKey("forms", "full", id), 600, () =>
 *     prisma.form.findUnique({ where: { id } })
 *   );
 *
 * `null` is treated as a valid cached value (useful for "not found"). To
 * disable null-caching, branch on the loader's result.
 */
export async function cached<T>(
  namespace: Namespace,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const hit = await cacheGet<T>(namespace, key);
  if (hit !== null) return hit;
  const value = await loader();
  // Fire-and-forget write — caller doesn't wait for Redis
  void cacheSet(namespace, key, value, ttlSeconds);
  return value;
}

/**
 * Stale-while-revalidate. Returns the cached value immediately if present,
 * even if it's older than `freshSeconds` — and triggers a background refresh.
 * Falls through to the loader synchronously only on a true cache miss.
 *
 * Use for hot, slow-to-compute keys where staleness up to `staleSeconds` old
 * is acceptable in exchange for instant response.
 *
 * Internally stores `{ v, t }` where `t` is the write timestamp. Two TTLs:
 *   - `freshSeconds`: below this, no revalidation
 *   - `staleSeconds`: between fresh and stale, return cached + trigger refresh
 *   - above `staleSeconds`: Redis has already evicted (Redis TTL = staleSeconds)
 */
type SWREnvelope<T> = { v: T; t: number };
const swrInflight = new Map<string, Promise<unknown>>();

export async function cachedSWR<T>(
  namespace: Namespace,
  key: string,
  freshSeconds: number,
  staleSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const env = await cacheGet<SWREnvelope<T>>(namespace, key);
  const now = Math.floor(Date.now() / 1000);

  if (env) {
    const age = now - env.t;
    if (age <= freshSeconds) return env.v;
    // Trigger background refresh (de-duped per key) and serve stale.
    if (!swrInflight.has(key)) {
      const p = (async () => {
        try {
          const fresh = await loader();
          await cacheSet(namespace, key, { v: fresh, t: Math.floor(Date.now() / 1000) }, staleSeconds);
        } catch (err) {
          logErr("swr-refresh", key, err);
        } finally {
          swrInflight.delete(key);
        }
      })();
      swrInflight.set(key, p);
    }
    return env.v;
  }

  // True miss — compute synchronously
  const fresh = await loader();
  void cacheSet(namespace, key, { v: fresh, t: now }, staleSeconds);
  return fresh;
}

/**
 * Batch GET. Returns an array aligned with `keys`; misses are `null`.
 * One round-trip regardless of key count.
 */
export async function cacheMget<T>(
  namespace: Namespace,
  keys: string[]
): Promise<(T | null)[]> {
  if (keys.length === 0) return [];
  const client = getRedis(namespace);
  if (!client) return keys.map(() => null);
  try {
    const raws = await client.mget(...keys);
    return raws.map((r) => (r === null ? null : (JSON.parse(r) as T)));
  } catch (err) {
    logErr("mget", `[${keys.length} keys]`, err);
    return keys.map(() => null);
  }
}

/**
 * Delete one or more keys. Call from any write path that mutates the
 * underlying data behind those keys.
 */
export async function cacheInvalidate(
  namespace: Namespace,
  ...keys: string[]
): Promise<void> {
  if (keys.length === 0) return;
  const client = getRedis(namespace);
  if (!client) return;
  try {
    await client.del(...keys);
  } catch (err) {
    logErr("del", keys.join(","), err);
  }
}

/**
 * Delete every key matching a pattern within a namespace. Uses SCAN under
 * the hood — safer than KEYS on large keyspaces. Prefer explicit
 * `cacheInvalidate(keys)` when you know the keys.
 *
 * Example: `cacheInvalidatePattern("auth", "erp:v1:auth:perm-id:*")`.
 */
export async function cacheInvalidatePattern(
  namespace: Namespace,
  pattern: string
): Promise<void> {
  const client = getRedis(namespace);
  if (!client) return;
  try {
    const stream = client.scanStream({ match: pattern, count: 100 });
    const toDelete: string[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (keys: string[]) => {
        if (keys.length > 0) toDelete.push(...keys);
      });
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    if (toDelete.length > 0) {
      // Delete in chunks of 500 to avoid huge single DEL commands
      for (let i = 0; i < toDelete.length; i += 500) {
        await client.del(...toDelete.slice(i, i + 500));
      }
    }
  } catch (err) {
    logErr("scan-del", pattern, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipelining helper — batch many writes in a single round-trip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a sequence of cache writes in one Redis pipeline. Useful when seeding
 * many keys after a bulk DB read (e.g., loading 50 forms into cache).
 *
 *   await cachePipeline("forms", (pipe) => {
 *     for (const f of forms) pipe.setex(buildKey("forms", "full", f.id), 600, JSON.stringify(f));
 *   });
 */
export async function cachePipeline(
  namespace: Namespace,
  fn: (pipe: ReturnType<Redis["pipeline"]>) => void
): Promise<void> {
  const client = getRedis(namespace);
  if (!client) return;
  try {
    const pipe = client.pipeline();
    fn(pipe);
    await pipe.exec();
  } catch (err) {
    logErr("pipeline", "(batch)", err);
  }
}
