/**
 * AES-256-GCM encryption for bank account numbers (NFR-4).
 *
 * Key source: env var `REBM_BANK_KEY` (base64, 32 bytes). Falls back to a
 * derived dev key when missing — logs a warning so production deployments
 * notice. Treat the env var like a secret; rotation requires a re-encrypt
 * migration script (out of scope for Phase 2).
 *
 * Format on disk: `<ivBase64>:<tagBase64>:<cipherBase64>`. Three colon-
 * separated chunks so we can change algorithms later by prefixing a version
 * tag without breaking parse logic.
 */

import crypto from "crypto";

const ALGO = "aes-256-gcm";
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const envKey = process.env.REBM_BANK_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, "base64");
    if (buf.length !== KEY_BYTES)
      throw new Error(
        `REBM_BANK_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length})`,
      );
    cachedKey = buf;
    return buf;
  }
  // Dev fallback — deterministic from app secret. NOT for production.
  console.warn(
    "[bank-crypto] REBM_BANK_KEY missing — using derived dev key. Set REBM_BANK_KEY for production deployments.",
  );
  const seed = process.env.NEXTAUTH_SECRET ?? process.env.SESSION_SECRET ?? "rebm-dev-seed";
  cachedKey = crypto.scryptSync(seed, "rebm-bank-salt", KEY_BYTES);
  return cachedKey;
}

export function encryptAccountNumber(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptAccountNumber(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64)
    throw new Error("Malformed encrypted bank-account payload");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

/** Returns the last 4 of an account number for UI display. */
export function maskedLast4(accountNumber: string): string {
  const trimmed = accountNumber.replace(/\s+/g, "");
  return trimmed.slice(-4);
}
