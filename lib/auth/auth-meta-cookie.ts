/**
 * Signed `auth-meta` cookie.
 *
 * The cookie carries route-permission data (isAdmin, allowedRoutes, ...) that
 * middleware trusts to decide page-level access. Before signing, that cookie
 * was JSON the client could edit — setting `isAdmin: true` in DevTools was
 * enough to bypass every gate. This module wraps the JSON in an HMAC-SHA256
 * signature using NEXTAUTH_SECRET so tampering is detected in the middleware
 * before the payload is ever parsed.
 *
 * Edge-runtime compatible (uses Web Crypto, no Node Buffer).
 *
 * Performance notes:
 *   - `crypto.subtle.importKey` is the hot path. We cache the resulting
 *     CryptoKey as a module-level Promise so every request after the first
 *     reuses it. Per-request cost drops to ~50µs sign + ~50µs verify.
 *   - Verification fails fast on length / format mismatch *before* invoking
 *     the HMAC, so tampered/empty cookies don't pay crypto cost.
 *   - `crypto.subtle.verify` is constant-time, so attackers can't time the
 *     signature comparison.
 */

const SECRET = process.env.NEXTAUTH_SECRET || "";
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

// Cached HMAC key. importKey takes ~1–3ms cold; we don't want to pay it on
// every middleware invocation. The Promise is started lazily on first use.
let cachedKey: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  if (
    !SECRET ||
    SECRET === "your-nextauth-secret-key-here" ||
    SECRET.length < 16
  ) {
    // Fail loud instead of silently signing with a placeholder. A weak secret
    // means anyone can forge a cookie, which defeats the whole point.
    throw new Error(
      "NEXTAUTH_SECRET is missing or insecure (< 16 chars or placeholder). " +
        "Generate one with: openssl rand -base64 32"
    );
  }

  cachedKey = crypto.subtle.importKey(
    "raw",
    ENCODER.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return cachedKey;
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface AuthMeta {
  v: number;
  ts: number;
  isAdmin: boolean;
  roleNames: string[];
  deniedRoutes: string[];
  allowedRoutes: string[];
  allowedModuleIds: string[];
  selectedModules?: string[];
}

/**
 * Produce a signed cookie value `<base64url(json)>.<base64url(hmac)>`.
 */
export async function signAuthMeta(meta: AuthMeta): Promise<string> {
  const key = await getKey();
  const json = JSON.stringify(meta);
  const payloadBytes = ENCODER.encode(json);
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, payloadBytes)
  );
  return `${base64urlEncode(payloadBytes)}.${base64urlEncode(sigBytes)}`;
}

/**
 * Verify a cookie value and return the parsed meta, or null if invalid.
 * Returns null on any malformed input, bad signature, or non-object payload —
 * the caller treats null the same way it treated "no cookie" before, so the
 * existing refresh flow kicks in transparently.
 */
export async function verifyAuthMeta(
  cookie: string | undefined | null
): Promise<AuthMeta | null> {
  if (!cookie) return null;

  const dot = cookie.indexOf(".");
  // Need at least one char on each side of the separator.
  if (dot <= 0 || dot >= cookie.length - 1) return null;

  // SHA-256 sig is 32 bytes → 43 chars base64url (no padding). Reject anything
  // wildly off before doing crypto work.
  const sigLen = cookie.length - dot - 1;
  if (sigLen < 40 || sigLen > 64) return null;

  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = base64urlDecode(cookie.slice(0, dot));
    sigBytes = base64urlDecode(cookie.slice(dot + 1));
  } catch {
    return null;
  }

  const key = await getKey();
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes);
  if (!ok) return null;

  try {
    const meta = JSON.parse(DECODER.decode(payloadBytes));
    if (typeof meta !== "object" || meta === null) return null;
    return meta as AuthMeta;
  } catch {
    return null;
  }
}
