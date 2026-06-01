/**
 * Multi-namespace Redis client registry.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MENTAL MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every cache write lives in a *namespace* — `auth`, `hr`, `forms`, etc.
 * A namespace can either:
 *   (a) point at its own dedicated Upstash DB (set `REDIS_URL_<NAME>` in .env), or
 *   (b) share the default Upstash DB (no per-namespace env var = falls back).
 *
 * This lets you START with one Upstash DB (cheap, simple) and LATER split out
 * a hot or sensitive namespace onto its own DB without touching any code —
 * just add the env var.
 *
 * Example (.env):
 *
 *   # Default DB used by every namespace that doesn't have its own
 *   REDIS_URL=rediss://default:...@upstash.io:6379
 *
 *   # Phase B — dedicate a separate DB to auth/session/permissions
 *   # REDIS_URL_AUTH=rediss://...
 *
 *   # Phase C — further isolate HR
 *   # REDIS_URL_HR=rediss://...
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RELIABILITY CONTRACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - A Redis outage MUST NEVER crash a request. All callers go through
 *   `lib/cache.ts` which catches every error and falls through to the DB.
 * - `lazyConnect: true` — never block app boot on Redis.
 * - `maxRetriesPerRequest: 2` and `connectTimeout: 5000` — cap stall time.
 * - `enableOfflineQueue: false` — fail fast instead of queueing commands
 *   during a sustained outage.
 * - One client per namespace, cached on globalThis so Next.js dev hot-reload
 *   doesn't spawn duplicates.
 */

import Redis, { type RedisOptions } from "ioredis";

// ─────────────────────────────────────────────────────────────────────────────
// Namespace registry
// ─────────────────────────────────────────────────────────────────────────────
//
// Add a new namespace here when introducing a new service-area cache. The
// `envVar` is checked FIRST; if unset, we fall back to the default `REDIS_URL`.

export type Namespace =
  | "default"  // shared bucket — use this when a namespace isn't worth defining
  | "auth"     // sessions, user lookups, permission resolution
  | "forms"    // form structure, field metadata, lookup-source data
  | "hr"       // employee + payroll + attendance reference data
  | "lookup"   // form-builder lookup tables (rarely change)
  | "workflow"; // workflow rule definitions

interface NamespaceConfig {
  envVar: string;          // e.g., "REDIS_URL_AUTH"
  fallbackToDefault: true; // every namespace falls back to REDIS_URL
}

const NAMESPACES: Record<Exclude<Namespace, "default">, NamespaceConfig> = {
  auth:     { envVar: "REDIS_URL_AUTH",     fallbackToDefault: true },
  forms:    { envVar: "REDIS_URL_FORMS",    fallbackToDefault: true },
  hr:       { envVar: "REDIS_URL_HR",       fallbackToDefault: true },
  lookup:   { envVar: "REDIS_URL_LOOKUP",   fallbackToDefault: true },
  workflow: { envVar: "REDIS_URL_WORKFLOW", fallbackToDefault: true },
};

// ─────────────────────────────────────────────────────────────────────────────
// Client factory
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __erpRedisClients: Map<string, Redis | null> | undefined;
}

const clientRegistry: Map<string, Redis | null> =
  globalThis.__erpRedisClients ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalThis.__erpRedisClients = clientRegistry;
}

function buildClient(url: string, label: string): Redis {
  const options: RedisOptions = {
    lazyConnect: true,
    // Bound how long a single command waits while the connection is down before
    // it rejects — keeps a sustained outage from hanging requests. Combined with
    // the offline queue below, brief reconnect windows are absorbed silently.
    maxRetriesPerRequest: 3,
    connectTimeout: 10_000,
    enableReadyCheck: true,
    // RIDE OUT brief reconnects. Upstash closes idle TCP connections; with the
    // offline queue ON, the first command after an idle gap is held for the
    // ~tens-of-ms reconnect instead of being rejected with "Connection is
    // closed". maxRetriesPerRequest still caps the wait during a real outage.
    enableOfflineQueue: true,
    // TCP keepalive probes keep the idle socket warm so Upstash is less likely
    // to drop it in the first place.
    keepAlive: 30_000,
    // NEVER permanently give up. A long-running server must always try to
    // recover — returning null here (the old behavior) put the client into a
    // terminal "end" state after 10 failed retries, after which EVERY command
    // failed with "Connection is closed" until the process was restarted.
    retryStrategy(times) {
      return Math.min(times * 200, 5_000);
    },
    // Upstash/managed Redis can return connection-level errors (e.g. READONLY
    // during a failover). Force a reconnect + resend rather than surfacing them.
    reconnectOnError(err) {
      const msg = err.message.toUpperCase();
      if (msg.includes("READONLY") || msg.includes("ECONNRESET")) return 2; // 2 = reconnect AND resend the failed command
      return false;
    },
  };

  const client = new Redis(url, options);

  let loggedError = false;
  client.on("error", (err) => {
    if (!loggedError) {
      console.error(`[redis:${label}] connection error: ${err.message}`);
      loggedError = true;
    }
  });
  client.on("ready", () => {
    loggedError = false;
    console.log(`[redis:${label}] connected`);
  });

  // Heartbeat: PING every 60s to keep the connection warm. Upstash (and most
  // managed Redis) close connections idle for too long at the proxy layer,
  // where TCP keepalive doesn't reset their timer — an application-level PING
  // does. `.unref()` so this timer never keeps the Node process alive on its
  // own. Failures are swallowed; the error/retry handlers above own recovery.
  const heartbeat = setInterval(() => {
    if (client.status === "ready") {
      client.ping().catch(() => {});
    }
  }, 60_000);
  heartbeat.unref?.();
  client.on("end", () => clearInterval(heartbeat));

  return client;
}

function resolveUrl(namespace: Namespace): string | null {
  if (namespace === "default") {
    return process.env.REDIS_URL?.trim() || null;
  }
  const cfg = NAMESPACES[namespace];
  const specific = process.env[cfg.envVar]?.trim();
  if (specific) return specific;
  if (cfg.fallbackToDefault) return process.env.REDIS_URL?.trim() || null;
  return null;
}

/**
 * Returns the Redis client for a namespace, or `null` if no URL is configured.
 *
 * Clients are lazily created on first request and cached for the lifetime of
 * the process. Two namespaces sharing the same URL produce ONE shared client
 * (de-duped by URL) so we don't open extra TCP connections.
 */
export function getRedis(namespace: Namespace = "default"): Redis | null {
  const url = resolveUrl(namespace);
  if (!url) {
    if (process.env.NODE_ENV !== "test" && !clientRegistry.has(namespace)) {
      console.warn(
        `[redis:${namespace}] no URL configured — cache layer disabled for this namespace.`
      );
      clientRegistry.set(namespace, null);
    }
    return null;
  }

  // De-dupe by URL: if multiple namespaces share the default DB, they share
  // one TCP connection. Cheaper and avoids fanning out connection counts.
  if (clientRegistry.has(url)) {
    return clientRegistry.get(url) ?? null;
  }
  const client = buildClient(url, namespace);
  clientRegistry.set(url, client);
  return client;
}

/**
 * Backwards-compatible export: the default-namespace client. Older callers
 * that imported `redis` directly keep working unchanged.
 */
export const redis: Redis | null = getRedis("default");

/**
 * Best-effort PING for a namespace. Use to validate connectivity at boot or
 * from a /health endpoint. Never throws.
 *
 * Implementation note: clients are built with `lazyConnect: true` AND
 * `enableOfflineQueue: false`, which means the first command on a fresh
 * client gets rejected immediately ("Stream isn't writable…") because
 * ioredis hasn't opened the TCP connection yet. We wait for the `ready`
 * event before pinging so the result actually reflects end-to-end
 * connectivity. Capped at 5s so a misconfigured URL doesn't stall a caller.
 *
 * Several namespaces may share the same underlying client (de-dup by URL in
 * `getRedis`), so this function is also called concurrently against the same
 * Redis instance — waiting on the `ready` event handles that race cleanly
 * without us having to coordinate connect() calls.
 */
export async function redisPing(namespace: Namespace = "default"): Promise<boolean> {
  const client = getRedis(namespace);
  if (!client) return false;
  try {
    if (client.status !== "ready") {
      await waitForReady(client, 5_000);
    }
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  }
}

function waitForReady(client: Redis, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (client.status === "ready") {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`redis ready timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    function cleanup() {
      clearTimeout(timer);
      client.off("ready", onReady);
      client.off("error", onError);
    }
    client.once("ready", onReady);
    client.once("error", onError);
    // Kick the connection if it hasn't started. `connect()` on an already-
    // connecting/connected client rejects — we swallow that and let the
    // event handlers above settle the promise.
    if (client.status === "wait" || client.status === "end" || client.status === "close") {
      client.connect().catch(() => {});
    }
  });
}
